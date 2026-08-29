from fastapi import APIRouter, HTTPException, Request
from bson import ObjectId

from backend.auth import get_current_user_id
from backend.database import db
from backend.schemas import MemberAdd, MemberRename

router = APIRouter(prefix="/api/rooms", tags=["Room Members"])


def room(room_id: str, user_id: str):
    if not ObjectId.is_valid(room_id):
        raise HTTPException(400, "Invalid room ID")
    r = db.rooms.find_one({"_id": ObjectId(room_id)})
    if not r:
        raise HTTPException(404, "Room not found")
    if user_id not in r.get("members", []):
        raise HTTPException(403, "You are not a member of this room")
    return r


def member_records(r):
    out = []
    for uid in r.get("members", []):
        if ObjectId.is_valid(uid):
            u = db.users.find_one({"_id": ObjectId(uid)})
            if u:
                out.append({"id": uid, "name": u.get("name") or u.get("username", "Member")})
    return out


@router.post("/{room_id}/members")
def add_member(room_id: str, payload: MemberAdd, request: Request):
    current_id = get_current_user_id(request)
    r = room(room_id, current_id)
    if not ObjectId.is_valid(payload.user_id):
        raise HTTPException(400, "Invalid user ID")
    if not db.users.find_one({"_id": ObjectId(payload.user_id)}):
        raise HTTPException(404, "User not found")
    if payload.user_id in r.get("members", []):
        raise HTTPException(400, "Member already exists in this room")
    db.rooms.update_one({"_id": r["_id"]}, {"$push": {"members": payload.user_id}})
    return {"message": "Member added successfully", "room_id": room_id, "member": payload.user_id}


@router.get("/{room_id}/members")
def get_members(room_id: str, request: Request):
    r = room(room_id, get_current_user_id(request))
    return {"room_id": room_id, "members": member_records(r)}


@router.delete("/{room_id}/members/{member_id}")
def remove_member(room_id: str, member_id: str, request: Request):
    current_id = get_current_user_id(request)
    r = room(room_id, current_id)
    if member_id not in r.get("members", []):
        raise HTTPException(404, "Member not found in this room")
    if member_id == r.get("created_by"):
        raise HTTPException(400, "Room creator cannot be removed")
    db.rooms.update_one({"_id": r["_id"]}, {"$pull": {"members": member_id}})
    return {"message": "Member removed successfully", "room_id": room_id, "member": member_id}


@router.put("/{room_id}/members/{member_id}")
def rename_member(room_id: str, member_id: str, payload: MemberRename, request: Request):
    current_id = get_current_user_id(request)
    r = room(room_id, current_id)
    if member_id not in r.get("members", []):
        raise HTTPException(404, "Member not found in this room")
    if not ObjectId.is_valid(member_id):
        raise HTTPException(400, "Invalid user ID")
    name = payload.new_name.strip()
    if not name:
        raise HTTPException(400, "Name cannot be empty")
    result = db.users.update_one({"_id": ObjectId(member_id)}, {"$set": {"name": name}})
    if result.matched_count == 0:
        raise HTTPException(404, "User not found")
    return {"message": "Member renamed successfully", "room_id": room_id, "member": member_id, "new_name": name}
