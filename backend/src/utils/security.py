import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

import jwt

from src.config.runtime import JWT_SECRET


def _derive(password, salt):
    return hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1).hex()


def hash_password(password):
    salt = secrets.token_bytes(16)
    return f"{salt.hex()}:{_derive(password, salt)}"


def verify_password(password, stored):
    salt, expected = stored.split(":")
    return hmac.compare_digest(expected, _derive(password, bytes.fromhex(salt)))


def issue_token(account_id):
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": str(account_id), "iat": now, "exp": now + timedelta(hours=8), "iss": "fiber-tail"},
        JWT_SECRET,
        algorithm="HS256",
    )


def read_token(token):
    claims = jwt.decode(token, JWT_SECRET, algorithms=["HS256"], issuer="fiber-tail", options={"require": ["exp", "sub"]})
    return int(claims["sub"])
