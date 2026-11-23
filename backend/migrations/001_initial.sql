CREATE TABLE IF NOT EXISTS accounts (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    username text NOT NULL UNIQUE,
    display_name text NOT NULL,
    password_hash text NOT NULL,
    role text NOT NULL CHECK (role IN ('reviewer', 'analyst', 'observer'))
);

CREATE TABLE IF NOT EXISTS lots (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code text NOT NULL UNIQUE,
    supplier text NOT NULL,
    material text NOT NULL,
    received_on date NOT NULL,
    shipment_kg integer NOT NULL CHECK (shipment_kg > 0),
    created_by bigint NOT NULL REFERENCES accounts(id)
);

CREATE TABLE IF NOT EXISTS samples (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    lot_id bigint NOT NULL REFERENCES lots(id),
    code text NOT NULL,
    location text NOT NULL,
    dry_g integer NOT NULL CHECK (dry_g > 0),
    impurity_g integer NOT NULL CHECK (impurity_g BETWEEN 0 AND dry_g),
    recorded_by bigint NOT NULL REFERENCES accounts(id),
    recorded_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (lot_id, code)
);

CREATE TABLE IF NOT EXISTS inspections (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    lot_id bigint NOT NULL REFERENCES lots(id),
    version integer NOT NULL CHECK (version > 0),
    parameters jsonb NOT NULL,
    snapshot jsonb NOT NULL,
    checksum text NOT NULL,
    status text NOT NULL CHECK (status IN ('queued', 'succeeded', 'failed')),
    result jsonb,
    error text,
    requested_by bigint NOT NULL REFERENCES accounts(id),
    requested_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    UNIQUE (lot_id, version),
    CHECK (
        (status = 'queued' AND result IS NULL AND error IS NULL AND completed_at IS NULL) OR
        (status = 'succeeded' AND result IS NOT NULL AND error IS NULL AND completed_at IS NOT NULL) OR
        (status = 'failed' AND result IS NULL AND error IS NOT NULL AND completed_at IS NOT NULL)
    )
);
CREATE INDEX IF NOT EXISTS inspections_queue ON inspections (id) WHERE status = 'queued';

CREATE TABLE IF NOT EXISTS decisions (
    inspection_id bigint PRIMARY KEY REFERENCES inspections(id),
    outcome text NOT NULL CHECK (outcome IN ('accept', 'retest', 'reject')),
    rationale text NOT NULL,
    reviewer_id bigint NOT NULL REFERENCES accounts(id),
    published_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_events (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    lot_id bigint NOT NULL REFERENCES lots(id),
    actor_id bigint REFERENCES accounts(id),
    action text NOT NULL,
    reference text NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_by_lot ON audit_events(lot_id, id DESC);
