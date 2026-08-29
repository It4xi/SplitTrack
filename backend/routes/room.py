from fastapi import APIRouter, HTTPException
from bson import ObjectId
from backend.database import db
from backend.schemas import RoomCreate
router=APIRouter(prefix="/api/rooms",tags=["Rooms"])
@router.post("/")
def create_room(payload:RoomCreate):
    name=payload.name.strip();
    if not name: raise HTTPException(400,"Room name cannot be empty")
    if not ObjectId.is_valid(payload.created_by): raise HTTPException(400,"Invalid creator ID")
    if not db.users.find_one({"_id":ObjectId(payload.created_by)}): raise HTTPException(404,"Creator user not found")
    room={"name":name,"created_by":payload.created_by,"members":[payload.created_by]}; r=db.rooms.insert_one(room);
    return {"id":str(r.inserted_id),**room}
@router.get("/")
def get_rooms(): return [{"id":str(r["_id"]),"name":r.get("name","Room"),"created_by":r.get("created_by"),"members":r.get("members",[])} for r in db.rooms.find()]
