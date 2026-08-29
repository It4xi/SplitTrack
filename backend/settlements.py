from fastapi import APIRouter, HTTPException
from bson import ObjectId

from backend.database import db


router = APIRouter(
    prefix="/api/settlements",
    tags=["Settlements"]
)


def calculate_settlements(balances: dict):
    creditors = []
    debtors = []

    for person, balance in balances.items():
        balance = round(float(balance), 2)

        if balance > 0:
            creditors.append({
                "person": person,
                "amount": balance
            })

        elif balance < 0:
            debtors.append({
                "person": person,
                "amount": abs(balance)
            })

    settlements = []

    i = 0
    j = 0

    while i < len(debtors) and j < len(creditors):
        debtor = debtors[i]
        creditor = creditors[j]

        payment = round(
            min(debtor["amount"], creditor["amount"]),
            2
        )

        settlements.append({
            "from": debtor["person"],
            "to": creditor["person"],
            "amount": payment
        })

        debtor["amount"] = round(
            debtor["amount"] - payment,
            2
        )

        creditor["amount"] = round(
            creditor["amount"] - payment,
            2
        )

        if debtor["amount"] <= 0:
            i += 1

        if creditor["amount"] <= 0:
            j += 1

    return settlements


@router.get("/{room_id}")
def get_settlements(room_id: str):

    if not ObjectId.is_valid(room_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid room ID"
        )

    room = db.rooms.find_one({
        "_id": ObjectId(room_id)
    })

    if room is None:
        raise HTTPException(
            status_code=404,
            detail="Room not found"
        )

    members = room.get("members", [])

    expenses = list(
        db.expenses.find({
            "room_id": room_id
        })
    )

    balances = {
        member: 0.0
        for member in members
    }

    for expense in expenses:
        paid_by = expense.get("paid_by")
        amount = float(expense.get("amount", 0))

        if paid_by in balances:
            balances[paid_by] += amount

        for member, share in expense.get("splits", {}).items():
            if member in balances:
                balances[member] -= float(share)

    settlements = calculate_settlements(balances)

    return {
        "room_id": room_id,
        "settlements": settlements
    }