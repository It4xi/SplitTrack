from fastapi import APIRouter, HTTPException, Request
from bson import ObjectId

from backend.auth import get_current_user_id
from backend.database import db
from backend.schemas import RoomCreate

router = APIRouter(prefix="/api/rooms", tags=["Rooms"])


def require_member(room, user_id: str):
    if user_id not in room.get("members", []):
        raise HTTPException(403, "You are not a member of this room")


@router.post("/")
def create_room(payload: RoomCreate, request: Request):
    user_id = get_current_user_id(request)
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Room name cannot be empty")

    room = {
        "name": name,
        "created_by": user_id,
        "members": [user_id],
    }
    result = db.rooms.insert_one(room)
    return {"id": str(result.inserted_id), **room}


@router.get("/")
def get_rooms(request: Request):
    user_id = get_current_user_id(request)
    return [
        {
            "id": str(r["_id"]),
            "name": r.get("name", "Room"),
            "created_by": r.get("created_by"),
            "members": r.get("members", []),
        }
        for r in db.rooms.find({"members": user_id})
    ]


@router.get("/{room_id}")
def get_room(room_id: str, request: Request):
    user_id = get_current_user_id(request)
    if not ObjectId.is_valid(room_id):
        raise HTTPException(400, "Invalid room ID")
    room = db.rooms.find_one({"_id": ObjectId(room_id)})
    if not room:
        raise HTTPException(404, "Room not found")
    require_member(room, user_id)
    return {
        "id": str(room["_id"]),
        "name": room.get("name", "Room"),
        "created_by": room.get("created_by"),
        "members": room.get("members", []),
    }
