from fastapi import APIRouter, HTTPException
from bson import ObjectId
from backend.database import db
from backend.schemas import UserCreate
router=APIRouter(prefix="/api/users",tags=["Users"])
@router.post("/")
def create_user(payload:UserCreate):
    name=payload.name.strip();
    if not name: raise HTTPException(400,"Name cannot be empty")
    r=db.users.insert_one({"name":name}); return {"id":str(r.inserted_id),"name":name}
@router.get("/")
def get_users(): return [{"id":str(u["_id"]),"name":u.get("name","Member")} for u in db.users.find()]
@router.get("/{user_id}")
def get_user(user_id:str):
    if not ObjectId.is_valid(user_id): raise HTTPException(400,"Invalid user ID")
    u=db.users.find_one({"_id":ObjectId(user_id)});
    if not u: raise HTTPException(404,"User not found")
    return {"id":str(u["_id"]),"name":u.get("name","Member")}
