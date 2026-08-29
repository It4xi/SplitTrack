from fastapi import APIRouter, HTTPException, Request
from bson import ObjectId

from backend.auth import get_current_user_id
from backend.database import db

router = APIRouter(prefix="/api/balances", tags=["Balances"])


def calculate_balances(expenses: list[dict], members: list[str]):
    balances = {m: 0.0 for m in members}
    for e in expenses:
        payer = e.get("paid_by")
        amount = float(e.get("amount", 0))
        if payer in balances:
            balances[payer] += amount
        for member, share in e.get("splits", {}).items():
            if member in balances:
                balances[member] -= float(share)
    return {m: round(v, 2) for m, v in balances.items()}


@router.get("/{room_id}")
def get_balances(room_id: str, request: Request):
    user_id = get_current_user_id(request)
    if not ObjectId.is_valid(room_id):
        raise HTTPException(400, "Invalid room ID")
    room = db.rooms.find_one({"_id": ObjectId(room_id)})
    if not room:
        raise HTTPException(404, "Room not found")
    if user_id not in room.get("members", []):
        raise HTTPException(403, "You are not a member of this room")
    return {
        "room_id": room_id,
        "balances": calculate_balances(list(db.expenses.find({"room_id": room_id})), room.get("members", [])),
    }
