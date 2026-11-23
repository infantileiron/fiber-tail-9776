import json

from fastapi import HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import Response

from src.config.runtime import connect
from src.constants.domain import Role, RunStatus
from src.models.inspections import get_inspection, list_inspections
from src.models.ledger import get_lot, list_samples


def lot_workspace(lot_id, user):
    with connect() as db:
        lot = get_lot(db, lot_id)
        readings = list_samples(db, lot_id)
        runs = list_inspections(db, lot_id, user["role"] == Role.OBSERVER)
    return {"lot": lot, "samples": readings, "inspections": runs}


def audit_trail(lot_id):
    with connect() as db:
        get_lot(db, lot_id)
        return db.execute("""
            SELECT e.action, e.reference, e.occurred_at, a.display_name AS actor
            FROM audit_events e LEFT JOIN accounts a ON a.id = e.actor_id
            WHERE lot_id = %s ORDER BY e.id DESC LIMIT 100
        """, (lot_id,)).fetchall()


def inspection_detail(run_id, user):
    with connect() as db:
        published_only = user["role"] == Role.OBSERVER
        report = get_inspection(db, run_id, published_only)
        if published_only:
            # A comparison may refer to an unpublished parameter version.
            result = report["result"]
            if result.get("comparison"):
                visible = db.execute("""
                    SELECT 1 FROM decisions d JOIN inspections i ON i.id = d.inspection_id
                    WHERE i.lot_id = %s AND i.version = %s
                """, (report["lot_id"], result["comparison"]["previous_version"])).fetchone()
                if not visible:
                    result["comparison"] = None
        return report


def download_inspection(run_id, user):
    report = inspection_detail(run_id, user)
    if report["status"] != RunStatus.SUCCEEDED:
        raise HTTPException(409, "验收单尚未产生可导出的结果")
    code, version = report["lot_code"], report["version"]
    return Response(
        json.dumps(jsonable_encoder(report), ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{code}-V{version:02}.json"'},
    )
