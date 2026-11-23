-- 采购按供货方、按月结算扣重。
-- 结算单锁定前的行可整单重算；锁定后不再改动，晚到验收或换版差额进入下期。

-- 迁移脚本每次启动都会执行，角色约束只在缺少 purchaser 时重建，避免反复加排他锁。
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'accounts_role_check'
          AND conrelid = 'accounts'::regclass
          AND pg_get_constraintdef(oid) LIKE '%purchaser%'
    ) THEN
        ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_role_check;
        ALTER TABLE accounts ADD CONSTRAINT accounts_role_check
            CHECK (role IN ('reviewer', 'analyst', 'observer', 'purchaser'));
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS settlements (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    supplier text NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    status text NOT NULL CHECK (status IN ('draft', 'locked')),
    idempotency_key text NOT NULL UNIQUE,
    note text NOT NULL DEFAULT '',
    created_by bigint NOT NULL REFERENCES accounts(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    locked_by bigint REFERENCES accounts(id),
    locked_at timestamptz,
    UNIQUE (supplier, period_start),
    CHECK (period_end >= period_start),
    CHECK (
        (status = 'draft' AND locked_by IS NULL AND locked_at IS NULL) OR
        (status = 'locked' AND locked_by IS NOT NULL AND locked_at IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS settlements_supplier_period ON settlements (supplier, period_start DESC);

-- 同一结算单每批最多一行：base 首次扣重，late 晚到批次补扣，revision 换版差额（正数补扣、负数冲回）。
CREATE TABLE IF NOT EXISTS settlement_lines (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    settlement_id bigint NOT NULL REFERENCES settlements(id),
    lot_id bigint NOT NULL REFERENCES lots(id),
    inspection_id bigint NOT NULL REFERENCES inspections(id),
    kind text NOT NULL CHECK (kind IN ('base', 'revision', 'late')),
    inspection_version integer NOT NULL,
    inspection_checksum text NOT NULL,
    inspection_published_at timestamptz,
    parameters jsonb NOT NULL,
    shipment_kg integer NOT NULL CHECK (shipment_kg > 0),
    exceed_share_pct numeric(11,6) NOT NULL,
    deduction_kg numeric(14,3) NOT NULL,
    prior_inspection_version integer,
    prior_deduction_kg numeric(14,3) NOT NULL DEFAULT 0,
    note text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (settlement_id, lot_id)
);
CREATE INDEX IF NOT EXISTS settlement_lines_lot ON settlement_lines (lot_id);
CREATE INDEX IF NOT EXISTS settlement_lines_inspection ON settlement_lines (inspection_id);

CREATE TABLE IF NOT EXISTS settlement_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    settlement_id bigint NOT NULL REFERENCES settlements(id),
    action text NOT NULL,
    actor_id bigint REFERENCES accounts(id),
    detail text NOT NULL DEFAULT '',
    occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS settlement_events_by_statement ON settlement_events (settlement_id, id DESC);
