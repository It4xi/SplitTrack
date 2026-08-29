from fastapi import APIRouter, HTTPException
from bson import ObjectId

from backend.database import db


router = APIRouter(
    prefix="/api/rooms",
    tags=["Room Members"]
)


@router.post("/{room_id}/members")
def add_member(room_id: str, name: str):
    if not ObjectId.is_valid(room_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid room ID"
        )

    room = db.rooms.find_one({
        "_id": ObjectId(room_id)
    })

    if not room:
        raise HTTPException(
            status_code=404,
            detail="Room not found"
        )

    name = name.strip()

    if not name:
        raise HTTPException(
            status_code=400,
            detail="Member name cannot be empty"
        )

    if name in room.get("members", []):
        raise HTTPException(
            status_code=400,
            detail="Member already exists in this room"
        )

    db.rooms.update_one(
        {"_id": ObjectId(room_id)},
        {"$push": {"members": name}}
    )

    return {
        "message": "Member added successfully",
        "room_id": room_id,
        "member": name
    }


@router.get("/{room_id}/members")
def get_members(room_id: str):
    if not ObjectId.is_valid(room_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid room ID"
        )

    room = db.rooms.find_one({
        "_id": ObjectId(room_id)
    })

    if not room:
        raise HTTPException(
            status_code=404,
            detail="Room not found"
        )

    return {
        "room_id": room_id,
        "members": room.get("members", [])
    }


@router.delete("/{room_id}/members/{member_name}")
def remove_member(room_id: str, member_name: str):
    if not ObjectId.is_valid(room_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid room ID"
        )

    room = db.rooms.find_one({
        "_id": ObjectId(room_id)
    })

    if not room:
        raise HTTPException(
            status_code=404,
            detail="Room not found"
        )

    members = room.get("members", [])

    if member_name not in members:
        raise HTTPException(
            status_code=404,
            detail="Member not found in this room"
        )

    if member_name == room.get("created_by"):
        raise HTTPException(
            status_code=400,
            detail="Room creator cannot be removed"
        )

    db.rooms.update_one(
        {"_id": ObjectId(room_id)},
        {"$pull": {"members": member_name}}
    )

    return {
        "message": "Member removed successfully",
        "room_id": room_id,
        "member": member_name
    }


@router.put("/{room_id}/members/{member_name}")
def rename_member(room_id: str, member_name: str, new_name: str):
    if not ObjectId.is_valid(room_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid room ID"
        )

    room = db.rooms.find_one({
        "_id": ObjectId(room_id)
    })

    if not room:
        raise HTTPException(
            status_code=404,
            detail="Room not found"
        )

    member_name = member_name.strip()
    new_name = new_name.strip()

    if not member_name or not new_name:
        raise HTTPException(
            status_code=400,
            detail="Names cannot be empty"
        )

    members = room.get("members", [])

    if member_name not in members:
        raise HTTPException(
            status_code=404,
            detail="Member not found in this room"
        )

    if new_name in members and new_name != member_name:
        raise HTTPException(
            status_code=400,
            detail="A member with that name already exists"
        )

    # Rename the room creator too, if applicable
    update_result = db.rooms.update_one(
        {"_id": ObjectId(room_id)},
        {
            "$set": {
                "members": [
                    new_name if member == member_name else member
                    for member in members
                ],
                "created_by": (
                    new_name
                    if room.get("created_by") == member_name
                    else room.get("created_by")
                )
            }
        }
    )

    if update_result.modified_count == 0:
        raise HTTPException(
            status_code=400,
            detail="Member name was not changed"
        )

    return {
        "message": "Member renamed successfully",
        "room_id": room_id,
        "old_name": member_name,
        "new_name": new_name
    }