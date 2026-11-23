from src.services import settlements


def list_settlements(supplier=None):
    return settlements.list_view(supplier or None)


def preview(supplier, period):
    return settlements.preview(supplier, period)


def create(payload, actor):
    return settlements.create(payload, actor)


def settlement_detail(settlement_id):
    return settlements.detail(settlement_id)


def refresh(settlement_id, actor):
    return settlements.refresh(settlement_id, actor)


def lock(settlement_id, actor):
    return settlements.lock(settlement_id, actor)


def lot_deductions(lot_id):
    return settlements.lot_deductions(lot_id)
