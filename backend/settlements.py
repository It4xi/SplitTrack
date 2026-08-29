from fastapi import APIRouter, HTTPException, Request
from bson import ObjectId

from backend.auth import get_current_user_id
from backend.database import db

router = APIRouter(prefix="/api/settlements", tags=["Settlements"])


def calculate_settlements(balances):
    creditors = [{"person": p, "amount": round(float(v), 2)} for p, v in balances.items() if v > 0.009]
    debtors = [{"person": p, "amount": round(abs(float(v)), 2)} for p, v in balances.items() if v < -0.009]
    creditors.sort(key=lambda x: x["amount"], reverse=True)
    debtors.sort(key=lambda x: x["amount"], reverse=True)
    out = []
    i = j = 0
    while i < len(debtors) and j < len(creditors):
        payment = round(min(debtors[i]["amount"], creditors[j]["amount"]), 2)
        if payment > 0:
            out.append({"from": debtors[i]["person"], "to": creditors[j]["person"], "amount": payment})
        debtors[i]["amount"] = round(debtors[i]["amount"] - payment, 2)
        creditors[j]["amount"] = round(creditors[j]["amount"] - payment, 2)
        if debtors[i]["amount"] <= 0.009:
            i += 1
        if creditors[j]["amount"] <= 0.009:
            j += 1
    return out


@router.get("/{room_id}")
def get_settlements(room_id: str, request: Request):
    user_id = get_current_user_id(request)
    if not ObjectId.is_valid(room_id):
        raise HTTPException(400, "Invalid room ID")
    room = db.rooms.find_one({"_id": ObjectId(room_id)})
    if not room:
        raise HTTPException(404, "Room not found")
    if user_id not in room.get("members", []):
        raise HTTPException(403, "You are not a member of this room")

    members = room.get("members", [])
    balances = {m: 0.0 for m in members}
    for expense in db.expenses.find({"room_id": room_id}):
        payer = expense.get("paid_by")
        amount = float(expense.get("amount", 0))
        if payer in balances:
            balances[payer] += amount
        for member, share in expense.get("splits", {}).items():
            if member in balances:
                balances[member] -= float(share)

    return {"room_id": room_id, "settlements": calculate_settlements(balances)}
