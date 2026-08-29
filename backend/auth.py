import base64
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timezone

from fastapi import HTTPException, Request

AUTH_SECRET = os.getenv("AUTH_SECRET", "splittrack-demo-secret-change-me").encode("utf-8")
ITERATIONS = 120_000


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, ITERATIONS)
    return f"pbkdf2_sha256${ITERATIONS}${base64.urlsafe_b64encode(salt).decode()}${base64.urlsafe_b64encode(digest).decode()}"


def verify_password(password: str, encoded: str) -> bool:
    try:
        scheme, iterations, salt_b64, digest_b64 = encoded.split("$", 3)
        if scheme != "pbkdf2_sha256":
            return False
        salt = base64.urlsafe_b64decode(salt_b64.encode())
        expected = base64.urlsafe_b64decode(digest_b64.encode())
        actual = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, int(iterations))
        return hmac.compare_digest(actual, expected)
    except Exception:
        return False


def issue_token(user_id: str) -> str:
    payload = f"{user_id}.{secrets.token_urlsafe(24)}"
    signature = hmac.new(AUTH_SECRET, payload.encode("utf-8"), hashlib.sha256).hexdigest()
    raw = f"{payload}.{signature}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii").rstrip("=")


def verify_token(token: str) -> str | None:
    try:
        padded = token + "=" * (-len(token) % 4)
        raw = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8")
        payload, signature = raw.rsplit(".", 1)
        expected = hmac.new(AUTH_SECRET, payload.encode("utf-8"), hashlib.sha256).hexdigest()
        if not hmac.compare_digest(signature, expected):
            return None
        user_id, nonce = payload.split(".", 1)
        if not user_id or not nonce:
            return None
        return user_id
    except Exception:
        return None


def get_current_user_id(request: Request) -> str:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = verify_token(header[7:].strip())
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid authentication token")
    return user_id


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
