from fastapi import APIRouter
from backend.database import db

router = APIRouter(
    prefix="/api/rooms",
    tags=["Rooms"]
)


@router.post("/")
def create_room(name: str, created_by: str):
    room = {
        "name": name,
        "created_by": created_by,
        "members": [created_by]
    }

    result = db.rooms.insert_one(room)

    return {
        "id": str(result.inserted_id),
        "name": room["name"],
        "created_by": room["created_by"],
        "members": room["members"]
    }


@router.get("/")
def get_rooms():
    rooms = []

    for room in db.rooms.find():
        rooms.append({
            "id": str(room["_id"]),
            "name": room["name"],
            "created_by": room["created_by"],
            "members": room.get("members", [])
        })

    return rooms