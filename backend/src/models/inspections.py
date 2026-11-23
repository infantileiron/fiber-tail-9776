from fastapi import HTTPException

RUN_DETAILS = """
    SELECT i.*, l.code AS lot_code, l.supplier, l.material,
           requester.display_name AS requester, d.outcome, d.rationale, d.published_at,
           reviewer.display_name AS reviewer
    FROM inspections i JOIN lots l ON l.id = i.lot_id
    JOIN accounts requester ON requester.id = i.requested_by
    LEFT JOIN decisions d ON d.inspection_id = i.id
    LEFT JOIN accounts reviewer ON reviewer.id = d.reviewer_id
"""


def get_inspection(db, run_id, published_only=False):
    query = RUN_DETAILS + " WHERE i.id = %s"
    if published_only:
        query += " AND d.inspection_id IS NOT NULL"
    row = db.execute(query, (run_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "找不到可查看的验收单")
    return row


def list_inspections(db, lot_id, published_only):
    return db.execute("""
        SELECT i.id, i.version, i.status, i.parameters, i.requested_at, i.completed_at,
               i.result->>'recommendation' AS recommendation, d.outcome, d.published_at
        FROM inspections i LEFT JOIN decisions d ON d.inspection_id = i.id
        WHERE i.lot_id = %s AND (NOT %s OR d.inspection_id IS NOT NULL)
        ORDER BY i.version DESC
    """, (lot_id, published_only)).fetchall()
