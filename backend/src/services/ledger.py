from fastapi import HTTPException
from psycopg.errors import UniqueViolation

from src.config.runtime import connect
from src.constants.domain import MAX_SAMPLES
from src.models.ledger import get_lot, write_event


def add_lot(payload, actor):
    try:
        with connect() as db:
            record = db.execute("""
                INSERT INTO lots (code, supplier, material, received_on, shipment_kg, created_by)
                VALUES (%(code)s, %(supplier)s, %(material)s, %(received_on)s, %(shipment_kg)s, %(actor)s)
                RETURNING *
            """, payload.model_dump() | {"actor": actor}).fetchone()
            write_event(db, record["id"], actor, "lot_created", record["code"])
            return record
    except UniqueViolation as exc:
        raise HTTPException(409, "这个供货批号已录入") from exc


def add_sample(lot_id, payload, actor):
    try:
        with connect() as db:
            get_lot(db, lot_id, lock=True)
            count = db.execute("SELECT count(*) AS n FROM samples WHERE lot_id = %s", (lot_id,)).fetchone()["n"]
            if count >= MAX_SAMPLES:
                raise HTTPException(409, f"每批最多登记 {MAX_SAMPLES} 份干样")
            row = db.execute("""
                INSERT INTO samples (lot_id, code, location, dry_g, impurity_g, recorded_by)
                VALUES (%(lot)s, %(code)s, %(location)s, %(dry_g)s, %(impurity_g)s, %(actor)s) RETURNING *
            """, payload.model_dump() | {"lot": lot_id, "actor": actor}).fetchone()
            write_event(db, lot_id, actor, "sample_recorded", row["code"])
            return row
    except UniqueViolation as exc:
        raise HTTPException(409, "同一批次内的样号必须唯一") from exc
