import logging
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from scripts.seed_demo import seed
from src.config.runtime import connect
from src.middlewares.http import install
from src.routes.api import router

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_):
    with connect() as db:
        db.execute((Path(__file__).resolve().parents[1] / "migrations/001_initial.sql").read_text())
    if os.getenv("SEED_DEMO", "true").lower() == "true":
        try:
            seed()
        except Exception:
            log.exception("Demo seed unavailable; API remains online")
    yield


app = FastAPI(title="棉渡再生 · 来料杂质验收", lifespan=lifespan)
install(app)
app.include_router(router)
