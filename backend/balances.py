from fastapi import APIRouter, HTTPException
from bson import ObjectId
from backend.database import db
router=APIRouter(prefix="/api/balances",tags=["Balances"])
def calculate_balances(expenses: list[dict],members:list[str]):
    b={m:0.0 for m in members}
    for e in expenses:
        p=e.get("paid_by"); a=float(e.get("amount",0));
        if p in b: b[p]+=a
        for m,s in e.get("splits",{}).items():
            if m in b: b[m]-=float(s)
    return {m:round(v,2) for m,v in b.items()}
@router.get("/{room_id}")
def get_balances(room_id:str):
    if not ObjectId.is_valid(room_id): raise HTTPException(400,"Invalid room ID")
    r=db.rooms.find_one({"_id":ObjectId(room_id)});
    if not r: raise HTTPException(404,"Room not found")
    return {"room_id":room_id,"balances":calculate_balances(list(db.expenses.find({"room_id":room_id})),r.get("members",[]))}
