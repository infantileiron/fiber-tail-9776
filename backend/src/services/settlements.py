from calendar import monthrange
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from fastapi import HTTPException
from psycopg.errors import UniqueViolation
from psycopg.types.json import Jsonb

from src.config.runtime import connect
from src.constants.domain import DeductionKind, SettlementStatus
from src.models.settlements import (
    current_period_lots,
    events_for,
    find_by_key,
    find_period,
    get_settlement,
    last_locked_lines,
    latest_published,
    lines_for,
    list_settlements,
    lock_supplier,
    locked_totals,
    pending_lots,
    prior_settled_lots,
    supplier_exists,
)

AMOUNT = Decimal("0.001")
SHARE = Decimal("0.000001")


def period_bounds(period):
    year, month = (int(part) for part in period.split("-"))
    return date(year, month, 1), date(year, month, monthrange(year, month)[1])


def deduction_kg(share_pct, shipment_kg):
    """本期扣重 = 已发布验收的超标重量份额 × 磅单净重，取整到克。"""
    return (Decimal(str(share_pct)) * Decimal(shipment_kg) / 100).quantize(AMOUNT, rounding=ROUND_HALF_UP)


def _line(lot, inspection, kind, amount, prior_version=None, prior_amount=Decimal(0), note=""):
    return {
        "lot_id": lot["id"],
        "lot_code": lot["code"],
        "received_on": lot["received_on"],
        "material": lot["material"],
        "inspection_id": inspection["id"],
        "kind": kind,
        "inspection_version": inspection["version"],
        "inspection_checksum": inspection["checksum"],
        "inspection_published_at": inspection["published_at"],
        "parameters": inspection["parameters"],
        "shipment_kg": lot["shipment_kg"],
        "exceed_share_pct": Decimal(str(inspection["result"]["exceed_share_pct"])).quantize(SHARE, rounding=ROUND_HALF_UP),
        "deduction_kg": amount,
        "prior_inspection_version": prior_version,
        "prior_deduction_kg": prior_amount,
        "note": note,
    }


def _origin_line(lot, inspection, carried):
    """A batch not yet deducted: first deduction, or a late one after its period was locked."""
    amount = deduction_kg(inspection["result"]["exceed_share_pct"], lot["shipment_kg"])
    if carried:
        return _line(lot, inspection, DeductionKind.LATE, amount, note="上期未扣重，本期补扣")
    return _line(lot, inspection, DeductionKind.BASE, amount)


def plan(db, supplier, start, end):
    """Return the statement lines for one supplier period plus the batches still unaccepted.

    Batches accepted in the period become ``base`` lines. Earlier batches are revisited
    only when they were accepted or already deducted: an acceptance published after
    their own period was locked becomes ``late``; a newer published version becomes a
    ``revision`` delta against the locked total (positive tops up, negative reverses).
    Locking always recomputes this plan under a per-supplier advisory lock, so two open
    statements can never claim the same batch.
    """
    current = current_period_lots(db, supplier, start, end)
    prior = prior_settled_lots(db, supplier, start)
    current_ids = {lot["id"] for lot in current}
    lot_ids = list(current_ids | {lot["id"] for lot in prior})
    published = latest_published(db, lot_ids)
    settled = last_locked_lines(db, lot_ids)
    cumulative = locked_totals(db, lot_ids)

    lines, pending = [], []
    for lot in current + prior:
        inspection = published.get(lot["id"])
        prior_line = settled.get(lot["id"])
        if prior_line is not None:
            # 已扣过重：只有换到另一版验收才产生差额
            if inspection is None or prior_line["inspection_id"] == inspection["id"]:
                continue
            previous_amount = Decimal(str(cumulative.get(lot["id"], {}).get("amount", 0)))
            target = deduction_kg(inspection["result"]["exceed_share_pct"], lot["shipment_kg"])
            delta = (target - previous_amount).quantize(AMOUNT, rounding=ROUND_HALF_UP)
            if delta == 0:
                continue  # 换版但扣重未变，不留空行
            lines.append(_line(
                lot, inspection, DeductionKind.REVISION, delta,
                prior_version=prior_line["inspection_version"], prior_amount=previous_amount,
                note=("换版后补扣" if delta > 0 else "换版后冲回") +
                     f"：V{prior_line['inspection_version']:02} → V{inspection['version']:02}",
            ))
            continue
        if inspection is None:
            if lot["id"] in current_ids:
                pending.append({"lot_id": lot["id"], "lot_code": lot["code"],
                                "shipment_kg": lot["shipment_kg"]})
            continue  # 旧批仍未验收：旧账原样留查，等待以后补扣
        lines.append(_origin_line(lot, inspection, carried=bool(lot.get("locked_covered"))))
    return lines, pending


def _replace_lines(db, settlement_id, lines):
    db.execute("DELETE FROM settlement_lines WHERE settlement_id = %s", (settlement_id,))
    for line in lines:
        db.execute("""
            INSERT INTO settlement_lines (
                settlement_id, lot_id, inspection_id, kind, inspection_version, inspection_checksum,
                inspection_published_at, parameters, shipment_kg, exceed_share_pct, deduction_kg,
                prior_inspection_version, prior_deduction_kg, note)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """, (settlement_id, line["lot_id"], line["inspection_id"], line["kind"],
              line["inspection_version"], line["inspection_checksum"], line["inspection_published_at"],
              Jsonb(line["parameters"]), line["shipment_kg"], line["exceed_share_pct"],
              line["deduction_kg"], line["prior_inspection_version"], line["prior_deduction_kg"],
              line["note"]))


def _event(db, settlement_id, action, actor, detail=""):
    db.execute("""
        INSERT INTO settlement_events (settlement_id, action, actor_id, detail)
        VALUES (%s, %s, %s, %s)
    """, (settlement_id, action, actor, detail))


def _totals(lines):
    def total(kind):
        return sum((line["deduction_kg"] for line in lines if line["kind"] == kind), Decimal(0))
    return {
        "line_count": len(lines),
        "deduction_kg": sum((line["deduction_kg"] for line in lines), Decimal(0)),
        "base_kg": total(DeductionKind.BASE),
        "revision_kg": total(DeductionKind.REVISION),
        "late_kg": total(DeductionKind.LATE),
    }


def _pending(db, settlement, lines):
    """Batches received in the period but not on this statement; they settle next period."""
    on_sheet = {line["lot_id"] for line in lines}
    rows = [row for row in pending_lots(db, settlement["supplier"], settlement["period_start"], settlement["period_end"])
            if row["lot_id"] not in on_sheet]
    cumulative = locked_totals(db, [row["lot_id"] for row in rows])
    return [{
        "lot_id": row["lot_id"], "lot_code": row["lot_code"], "shipment_kg": row["shipment_kg"],
        "sample_count": row["sample_count"], "accepted": row["accepted"],
        "settled_elsewhere": row["lot_id"] in cumulative,
        "locked_deducted_kg": cumulative.get(row["lot_id"], {}).get("amount", Decimal(0)),
    } for row in rows]


def _signature(lines):
    return sorted((line["lot_id"], line["kind"], line["inspection_id"], Decimal(str(line["deduction_kg"])))
                  for line in lines)


def _detail(db, settlement_id):
    settlement = get_settlement(db, settlement_id)
    lines = lines_for(db, settlement_id)
    fresh = None
    stale = False
    if settlement["status"] == SettlementStatus.DRAFT:
        # 草稿行可能已被更新验收或其他结算单影响；此处只标记过期，不改数据。
        fresh, _ = plan(db, settlement["supplier"], settlement["period_start"], settlement["period_end"])
        stale = _signature(fresh) != _signature(lines)
    cumulative = locked_totals(db, [line["lot_id"] for line in lines])
    draft = settlement["status"] == SettlementStatus.DRAFT
    for line in lines:
        # 已锁定各期合计；草稿行尚未入账，故加上本行以便核对锁定后的累计。
        banked = cumulative.get(line["lot_id"], {}).get("amount", Decimal(0))
        line["cumulative_deducted_kg"] = banked + (line["deduction_kg"] if draft else Decimal(0))
    result = {
        "settlement": settlement,
        "lines": lines,
        "pending_lots": _pending(db, settlement, fresh if stale else lines),
        "totals": _totals(lines),
        "events": events_for(db, settlement_id),
        "stale": stale,
        "created": False,
    }
    if stale:
        # 供界面提示重算会得到什么；必须重算后才能锁定。
        result["fresh_totals"] = _totals(fresh)
        result["fresh_line_count"] = len(fresh)
    return result


def detail(settlement_id):
    with connect() as db:
        return _detail(db, settlement_id)


def preview(supplier, period):
    start, end = period_bounds(period)
    with connect() as db:
        if not supplier_exists(db, supplier):
            raise HTTPException(404, "找不到该供货方的到货批次")
        existing = find_period(db, supplier, start)
        if existing:
            return {"existing_id": existing["id"], "supplier": supplier,
                    "period_start": start, "period_end": end}
        lines, pending = plan(db, supplier, start, end)
    return {
        "supplier": supplier, "period_start": start, "period_end": end,
        "lines": [{key: line[key] for key in (
            "lot_id", "lot_code", "kind", "inspection_version", "shipment_kg",
            "exceed_share_pct", "deduction_kg", "note")} for line in lines],
        "pending_lots": pending,
        "totals": _totals(lines),
    }


def create(payload, actor):
    """Create or return the one statement for a supplier period.

    Retries — same idempotency key, or the same supplier and month — return the
    existing sheet untouched, so a client retry can never deduct a batch twice.
    """
    start, end = period_bounds(payload.period)
    try:
        with connect() as db:
            lock_supplier(db, payload.supplier)
            keyed = find_by_key(db, payload.idempotency_key)
            if keyed:
                if keyed["supplier"] != payload.supplier or keyed["period_start"] != start:
                    raise HTTPException(409, "这个幂等键已用于其他结算单，请重新建单")
                return _detail(db, keyed["id"])  # 同一幂等键重试：返回原单，不重复扣重
            existing = find_period(db, payload.supplier, start)
            if existing:
                return _detail(db, existing["id"])
            if not supplier_exists(db, payload.supplier):
                raise HTTPException(404, "找不到该供货方的到货批次")
            row = db.execute("""
                INSERT INTO settlements (supplier, period_start, period_end, status, idempotency_key, note, created_by)
                VALUES (%s, %s, %s, 'draft', %s, %s, %s) RETURNING id
            """, (payload.supplier, start, end, payload.idempotency_key, payload.note, actor)).fetchone()
            lines, pending = plan(db, payload.supplier, start, end)
            _replace_lines(db, row["id"], lines)
            _event(db, row["id"], "settlement_created", actor, f"{len(lines)} 笔 · 待验收 {len(pending)} 批")
            created = _detail(db, row["id"])
            created["created"] = True
            return created
    except UniqueViolation as exc:
        # The supplier advisory lock makes this path near-unreachable; if it does
        # fire, only return a sheet that matches both the key and the period.
        with connect() as db:
            keyed = find_by_key(db, payload.idempotency_key)
            if keyed and keyed["supplier"] == payload.supplier and keyed["period_start"] == start:
                return _detail(db, keyed["id"])
            existing = find_period(db, payload.supplier, start)
            if existing:
                return _detail(db, existing["id"])
        raise HTTPException(409, "该供货方本月已有结算单") from exc


def refresh(settlement_id, actor):
    with connect() as db:
        supplier = get_settlement(db, settlement_id)["supplier"]
        lock_supplier(db, supplier)  # 先取供货方咨询锁，与建单保持同一加锁顺序
        settlement = get_settlement(db, settlement_id, lock=True)
        if settlement["status"] == SettlementStatus.LOCKED:
            raise HTTPException(409, "结算单已锁定，晚到验收和换版差额进入下期，旧账不再改动")
        lines, pending = plan(db, settlement["supplier"], settlement["period_start"], settlement["period_end"])
        _replace_lines(db, settlement_id, lines)
        _event(db, settlement_id, "settlement_refreshed", actor, f"{len(lines)} 笔 · 待验收 {len(pending)} 批")
        return _detail(db, settlement_id)


def lock(settlement_id, actor):
    with connect() as db:
        supplier = get_settlement(db, settlement_id)["supplier"]
        lock_supplier(db, supplier)  # 与建单、重算同一加锁顺序，避免并发锁定重复扣重
        settlement = get_settlement(db, settlement_id, lock=True)
        if settlement["status"] == SettlementStatus.LOCKED:
            return _detail(db, settlement_id)  # 重试锁定返回原单，不重复扣重
        lines, pending = plan(db, settlement["supplier"], settlement["period_start"], settlement["period_end"])
        if _signature(lines) != _signature(lines_for(db, settlement_id)):
            raise HTTPException(409, "草稿与最新验收或其他结算单不一致，请先重算草稿再锁定")
        if not lines:
            raise HTTPException(409, "本期没有已发布验收且可扣重的批次，无法锁定")
        total = sum((line["deduction_kg"] for line in lines), Decimal(0))
        _replace_lines(db, settlement_id, lines)
        db.execute("""
            UPDATE settlements SET status = 'locked', locked_by = %s, locked_at = now() WHERE id = %s
        """, (actor, settlement_id))
        _event(db, settlement_id, "settlement_locked", actor,
               f"{len(lines)} 笔 · 扣重 {total} kg · 待验收 {len(pending)} 批转下期")
        return _detail(db, settlement_id)


def list_view(supplier=None):
    with connect() as db:
        return list_settlements(db, supplier)


def lot_deductions(lot_id):
    with connect() as db:
        lot = db.execute("SELECT * FROM lots WHERE id = %s", (lot_id,)).fetchone()
        if lot is None:
            raise HTTPException(404, "找不到该供货批次")
        lines = db.execute("""
            SELECT sl.*, s.supplier, s.period_start, s.period_end, s.status AS settlement_status
            FROM settlement_lines sl JOIN settlements s ON s.id = sl.settlement_id
            WHERE sl.lot_id = %s
            ORDER BY s.period_start, sl.id
        """, (lot_id,)).fetchall()
        locked = sum((line["deduction_kg"] for line in lines
                      if line["settlement_status"] == SettlementStatus.LOCKED), Decimal(0))
    return {"lot": lot, "lines": lines, "locked_deducted_kg": locked}
