from fastapi import HTTPException

SETTLEMENT_HEAD = """
    SELECT s.*, creator.display_name AS created_by_name,
           locker.display_name AS locked_by_name
    FROM settlements s
    JOIN accounts creator ON creator.id = s.created_by
    LEFT JOIN accounts locker ON locker.id = s.locked_by
"""

LINE_DETAILS = """
    SELECT sl.*, l.code AS lot_code, l.received_on, l.material, l.supplier AS lot_supplier
    FROM settlement_lines sl JOIN lots l ON l.id = sl.lot_id
"""


def get_settlement(db, settlement_id, lock=False):
    query = SETTLEMENT_HEAD + " WHERE s.id = %s"
    if lock:
        query += " FOR UPDATE OF s"
    row = db.execute(query, (settlement_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "找不到该结算单")
    return row


def find_by_key(db, key):
    return db.execute(SETTLEMENT_HEAD + " WHERE s.idempotency_key = %s", (key,)).fetchone()


def find_period(db, supplier, period_start):
    return db.execute(SETTLEMENT_HEAD + " WHERE s.supplier = %s AND s.period_start = %s",
                      (supplier, period_start)).fetchone()


def list_settlements(db, supplier=None):
    return db.execute("""
        SELECT s.*, creator.display_name AS created_by_name,
               locker.display_name AS locked_by_name,
               COALESCE(sum(sl.deduction_kg), 0) AS total_deduction_kg,
               count(sl.id) AS line_count
        FROM settlements s
        JOIN accounts creator ON creator.id = s.created_by
        LEFT JOIN accounts locker ON locker.id = s.locked_by
        LEFT JOIN settlement_lines sl ON sl.settlement_id = s.id
        WHERE (%s::text IS NULL OR s.supplier = %s)
        GROUP BY s.id, creator.display_name, locker.display_name
        ORDER BY s.period_start DESC, s.supplier, s.id DESC
    """, (supplier, supplier)).fetchall()


def lines_for(db, settlement_id):
    return db.execute(LINE_DETAILS + " WHERE sl.settlement_id = %s ORDER BY sl.id",
                      (settlement_id,)).fetchall()


def events_for(db, settlement_id):
    return db.execute("""
        SELECT e.action, e.detail, e.occurred_at, a.display_name AS actor
        FROM settlement_events e LEFT JOIN accounts a ON a.id = e.actor_id
        WHERE e.settlement_id = %s ORDER BY e.id DESC LIMIT 100
    """, (settlement_id,)).fetchall()


def latest_published(db, lot_ids):
    if not lot_ids:
        return {}
    rows = db.execute("""
        SELECT DISTINCT ON (i.lot_id)
               i.id, i.lot_id, i.version, i.checksum, i.parameters, i.result,
               d.outcome, d.published_at
        FROM inspections i JOIN decisions d ON d.inspection_id = i.id
        WHERE i.lot_id = ANY(%s)
        ORDER BY i.lot_id, i.version DESC
    """, (list(lot_ids),)).fetchall()
    return {row["lot_id"]: row for row in rows}


def locked_totals(db, lot_ids):
    if not lot_ids:
        return {}
    rows = db.execute("""
        SELECT sl.lot_id, sum(sl.deduction_kg) AS amount, count(*) AS line_count
        FROM settlement_lines sl JOIN settlements s ON s.id = sl.settlement_id
        WHERE s.status = 'locked' AND sl.lot_id = ANY(%s)
        GROUP BY sl.lot_id
    """, (list(lot_ids),)).fetchall()
    return {row["lot_id"]: row for row in rows}


def last_locked_lines(db, lot_ids):
    if not lot_ids:
        return {}
    rows = db.execute("""
        SELECT DISTINCT ON (sl.lot_id)
               sl.lot_id, sl.inspection_id, sl.inspection_version, sl.settlement_id
        FROM settlement_lines sl JOIN settlements s ON s.id = sl.settlement_id
        WHERE s.status = 'locked' AND sl.lot_id = ANY(%s)
        ORDER BY sl.lot_id, s.period_start DESC, s.id DESC, sl.id DESC
    """, (list(lot_ids),)).fetchall()
    return {row["lot_id"]: row for row in rows}


def current_period_lots(db, supplier, start, end):
    return db.execute("""
        SELECT * FROM lots
        WHERE supplier = %s AND received_on BETWEEN %s AND %s
        ORDER BY code
    """, (supplier, start, end)).fetchall()


def lock_supplier(db, supplier):
    """Serialize settlement work per supplier so two periods cannot double-deduct a batch."""
    db.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (f"settlement:{supplier}",))


def prior_settled_lots(db, supplier, start):
    """Earlier batches a later statement must revisit.

    That is any earlier batch whose period is already locked (``locked_covered``),
    plus any accepted batch no open draft has claimed yet. A batch covered by a
    still-open draft stays with that draft, so two open statements cannot both
    claim the same batch in either locking order.
    """
    return db.execute("""
        SELECT DISTINCT l.*, EXISTS (
                   SELECT 1 FROM settlements s2
                   WHERE s2.supplier = %s AND s2.status = 'locked'
                     AND l.received_on BETWEEN s2.period_start AND s2.period_end
               ) AS locked_covered
        FROM lots l
        WHERE l.supplier = %s AND l.received_on < %s AND (
            EXISTS (
                SELECT 1 FROM settlement_lines sl JOIN settlements s ON s.id = sl.settlement_id
                WHERE sl.lot_id = l.id AND s.status = 'locked'
            ) OR EXISTS (
                SELECT 1 FROM settlements s2
                WHERE s2.supplier = %s AND s2.status = 'locked'
                  AND l.received_on BETWEEN s2.period_start AND s2.period_end
            ) OR (
                EXISTS (
                    SELECT 1 FROM inspections i JOIN decisions d ON d.inspection_id = i.id
                    WHERE i.lot_id = l.id
                ) AND NOT EXISTS (
                    SELECT 1 FROM settlements s3
                    WHERE s3.supplier = %s AND s3.status = 'draft'
                      AND l.received_on BETWEEN s3.period_start AND s3.period_end
                )
            )
        )
        ORDER BY l.code
    """, (supplier, supplier, start, supplier, supplier)).fetchall()


def pending_lots(db, supplier, start, end):
    return db.execute("""
        SELECT l.id AS lot_id, l.code AS lot_code, l.shipment_kg,
               s.sample_count,
               EXISTS (
                   SELECT 1 FROM inspections i JOIN decisions d ON d.inspection_id = i.id
                   WHERE i.lot_id = l.id
               ) AS accepted
        FROM lots l
        CROSS JOIN LATERAL (
            SELECT count(*) AS sample_count FROM samples WHERE lot_id = l.id
        ) s
        WHERE l.supplier = %s AND l.received_on BETWEEN %s AND %s
        ORDER BY l.code
    """, (supplier, start, end)).fetchall()


def supplier_exists(db, supplier):
    return db.execute("SELECT 1 FROM lots WHERE supplier = %s LIMIT 1", (supplier,)).fetchone() is not None
