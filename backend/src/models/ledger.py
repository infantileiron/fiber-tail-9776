from fastapi import HTTPException


def get_lot(db, lot_id, lock=False):
    query = "SELECT * FROM lots WHERE id = %s"
    if lock:
        query += " FOR UPDATE"
    lot = db.execute(query, (lot_id,)).fetchone()
    if lot is None:
        raise HTTPException(404, "找不到该供货批次")
    return lot


def list_lots(db):
    return db.execute("""
        SELECT l.*, s.sample_count, s.total_dry_g, d.outcome, d.published_version
        FROM lots l
        CROSS JOIN LATERAL (
            SELECT count(*) AS sample_count, COALESCE(sum(dry_g), 0) AS total_dry_g
            FROM samples WHERE lot_id = l.id
        ) s
        LEFT JOIN LATERAL (
            SELECT d.outcome, i.version AS published_version FROM inspections i
            JOIN decisions d ON d.inspection_id = i.id WHERE i.lot_id = l.id
            ORDER BY i.version DESC LIMIT 1
        ) d ON true
        ORDER BY l.received_on DESC, l.code
    """).fetchall()


def list_samples(db, lot_id):
    return db.execute("""
        SELECT s.code, s.location, s.dry_g, s.impurity_g, s.recorded_at, a.display_name AS recorder
        FROM samples s JOIN accounts a ON a.id = s.recorded_by
        WHERE lot_id = %s ORDER BY s.code
    """, (lot_id,)).fetchall()


def sample_snapshot(db, lot_id):
    return db.execute("""
        SELECT code, location, dry_g, impurity_g FROM samples WHERE lot_id = %s ORDER BY code
    """, (lot_id,)).fetchall()


def write_event(db, lot_id, actor_id, action, reference):
    db.execute("""
        INSERT INTO audit_events (lot_id, actor_id, action, reference) VALUES (%s, %s, %s, %s)
    """, (lot_id, actor_id, action, reference))
