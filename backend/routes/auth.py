from fastapi import APIRouter, HTTPException, Request

from backend.auth import get_current_user_id, hash_password, issue_token, now_iso, verify_password
from backend.database import db
from backend.schemas import AuthLogin, AuthRegister
from bson import ObjectId

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


def user_response(user):
    return {"id": str(user["_id"]), "username": user.get("username") or user.get("name", "User"), "name": user.get("name") or user.get("username", "User")}


@router.post("/register")
def register(payload: AuthRegister):
    username = payload.username.strip()
    if len(username) < 2:
        raise HTTPException(400, "Username must be at least 2 characters")
    existing = db.users.find_one({"username_lower": username.lower()})
    if existing:
        raise HTTPException(409, "Username already exists")

    user = {
        "username": username,
        "username_lower": username.lower(),
        "name": username,
        "password_hash": hash_password(payload.password),
        "created_at": now_iso(),
    }
    result = db.users.insert_one(user)
    user["_id"] = result.inserted_id
    return {"token": issue_token(str(result.inserted_id)), "user": user_response(user)}


@router.post("/login")
def login(payload: AuthLogin):
    username = payload.username.strip()
    user = db.users.find_one({"username_lower": username.lower()})
    if not user or not user.get("password_hash") or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(401, "Invalid username or password")
    return {"token": issue_token(str(user["_id"])), "user": user_response(user)}


@router.get("/me")
def me(request: Request):
    user_id = get_current_user_id(request)
    if not ObjectId.is_valid(user_id):
        raise HTTPException(401, "Invalid authentication token")
    user = db.users.find_one({"_id": ObjectId(user_id)})
    if not user:
        raise HTTPException(401, "User account not found")
    return user_response(user)


@router.post("/logout")
def logout(request: Request):
    get_current_user_id(request)
    return {"message": "Logged out"}
