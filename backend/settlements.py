from fastapi import APIRouter, HTTPException
from bson import ObjectId
from backend.database import db
router=APIRouter(prefix="/api/settlements",tags=["Settlements"])
def calculate_settlements(balances):
    c=[{"person":p,"amount":round(float(v),2)} for p,v in balances.items() if v>0.009]; d=[{"person":p,"amount":round(abs(float(v)),2)} for p,v in balances.items() if v<-0.009]; c.sort(key=lambda x:x["amount"],reverse=True); d.sort(key=lambda x:x["amount"],reverse=True); out=[]; i=j=0
    while i<len(d) and j<len(c):
        pay=round(min(d[i]["amount"],c[j]["amount"]),2);
        if pay>0: out.append({"from":d[i]["person"],"to":c[j]["person"],"amount":pay})
        d[i]["amount"]=round(d[i]["amount"]-pay,2); c[j]["amount"]=round(c[j]["amount"]-pay,2);
        if d[i]["amount"]<=0.009:i+=1
        if c[j]["amount"]<=0.009:j+=1
    return out
@router.get("/{room_id}")
def get_settlements(room_id:str):
    if not ObjectId.is_valid(room_id): raise HTTPException(400,"Invalid room ID")
    r=db.rooms.find_one({"_id":ObjectId(room_id)});
    if not r: raise HTTPException(404,"Room not found")
    members=r.get("members",[]); b={m:0.0 for m in members}
    for e in db.expenses.find({"room_id":room_id}):
        p=e.get("paid_by"); a=float(e.get("amount",0));
        if p in b:b[p]+=a
        for m,s in e.get("splits",{}).items():
            if m in b:b[m]-=float(s)
    return {"room_id":room_id,"settlements":calculate_settlements(b)}
