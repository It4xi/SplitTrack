from fastapi import APIRouter, HTTPException, Request
from bson import ObjectId

from backend.auth import get_current_user_id
from backend.database import db
from backend.schemas import UserCreate

router = APIRouter(prefix="/api/users", tags=["Users"])


@router.post("/")
def create_user(payload: UserCreate, request: Request):
    # Legacy/simple user creation remains available for authenticated demo use.
    current_id = get_current_user_id(request)
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Name cannot be empty")

    existing = db.users.find_one({"username_lower": name.lower()})
    if existing:
        return {"id": str(existing["_id"]), "name": existing.get("name", name)}

    result = db.users.insert_one({"name": name, "username": name, "username_lower": name.lower()})
    return {"id": str(result.inserted_id), "name": name}


@router.get("/")
def get_users(request: Request, name: str | None = None):
    get_current_user_id(request)
    query = {}
    if name:
        query = {"username_lower": name.strip().lower()}
    return [
        {"id": str(u["_id"]), "name": u.get("name") or u.get("username", "Member"), "username": u.get("username")}
        for u in db.users.find(query).limit(25)
    ]


@router.get("/{user_id}")
def get_user(user_id: str, request: Request):
    get_current_user_id(request)
    if not ObjectId.is_valid(user_id):
        raise HTTPException(400, "Invalid user ID")
    u = db.users.find_one({"_id": ObjectId(user_id)})
    if not u:
        raise HTTPException(404, "User not found")
    return {"id": str(u["_id"]), "name": u.get("name") or u.get("username", "Member")}
