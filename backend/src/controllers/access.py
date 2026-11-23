from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError

from src.config.runtime import connect
from src.utils.security import issue_token, read_token, verify_password

bearer = HTTPBearer(auto_error=False)


def login(payload):
    with connect() as db:
        row = db.execute("""
            SELECT id, username, display_name, role, password_hash FROM accounts WHERE username = %s
        """, (payload.username,)).fetchone()
    if not row or not verify_password(payload.password, row.pop("password_hash")):
        raise HTTPException(401, "账号或口令不正确")
    return {"token": issue_token(row["id"]), "user": row}


def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)):
    if not credentials:
        raise HTTPException(401, "请先登录称重工位")
    try:
        account_id = read_token(credentials.credentials)
    except (InvalidTokenError, ValueError) as exc:
        raise HTTPException(401, "登录已失效，请重新登录") from exc
    with connect() as db:
        user = db.execute("""
            SELECT id, username, display_name, role FROM accounts WHERE id = %s
        """, (account_id,)).fetchone()
    if not user:
        raise HTTPException(401, "找不到登录账号")
    return user


def allow(role):
    def dependency(user=Depends(current_user)):
        if user["role"] != role:
            raise HTTPException(403, "当前岗位没有此操作权限")
        return user
    return dependency
