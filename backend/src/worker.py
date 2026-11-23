import logging
import sys
import time

from psycopg import Error as DatabaseError
from redis.exceptions import RedisError

from src.config.runtime import HEARTBEAT, WAKE_KEY, connect, queue
from src.services.inspections import process_next

log = logging.getLogger(__name__)


def serve():
    logging.basicConfig(level=logging.INFO)
    HEARTBEAT.parent.mkdir(parents=True, exist_ok=True)
    HEARTBEAT.unlink(missing_ok=True)
    while True:
        try:
            with connect() as db:
                processed = process_next(db)
            HEARTBEAT.touch()
            if not processed:
                try:
                    queue.blpop(WAKE_KEY, timeout=1)
                except RedisError:
                    time.sleep(1)
        except DatabaseError:
            log.warning("Waiting for the PostgreSQL inspection queue", exc_info=True)
            time.sleep(2)


def check_health():
    return HEARTBEAT.exists() and time.time() - HEARTBEAT.stat().st_mtime < 12


if __name__ == "__main__":
    if sys.argv[1:] == ["health"]:
        sys.exit(0 if check_health() else 1)
    serve()
