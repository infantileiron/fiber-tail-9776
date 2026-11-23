import os
from pathlib import Path

import psycopg
from psycopg.rows import dict_row
from redis import Redis

JWT_SECRET = os.environ.get("JWT_SECRET", "fiber-local-demo-token-key-use-a-private-secret-outside-demo")
WAKE_KEY = "fiber:inspection:ready"
HEARTBEAT = Path(os.environ.get("WORKER_HEARTBEAT", "/artifacts/worker.heartbeat"))


def connect():
    return psycopg.connect(row_factory=dict_row, connect_timeout=3)


queue = Redis.from_url(
    os.environ.get("REDIS_URL", "redis://localhost:6379/0"),
    socket_connect_timeout=2,
    socket_timeout=3,
)
