import logging
from uuid import uuid4

from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

log = logging.getLogger(__name__)


def install(app):
    @app.middleware("http")
    async def secure_response(request, call_next):
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Cache-Control"] = "no-store"
        return response

    @app.middleware("http")
    async def request_context(request, call_next):
        reference = uuid4().hex[:12]
        try:
            response = await call_next(request)
        except Exception:
            log.exception("Request %s failed", reference)
            response = JSONResponse({"detail": f"服务暂时异常，请重试（编号 {reference}）"}, status_code=503)
        response.headers["X-Request-ID"] = reference
        return response

    @app.exception_handler(RequestValidationError)
    async def invalid_payload(_, exc):
        errors = []
        for error in exc.errors():
            field = ".".join(map(str, error["loc"][1:])) or "表单"
            message = error["msg"].removeprefix("Value error, ") if error["type"] == "value_error" else "格式或数值超出范围"
            errors.append(f"{field}：{message}")
        return JSONResponse({"detail": "；".join(errors)}, status_code=422)
