from fastapi import APIRouter, HTTPException
from bson import ObjectId

from backend.database import db


router = APIRouter(
    prefix="/api/balances",
    tags=["Balances"]
)


def calculate_balances(
    expenses: list[dict],
    members: list[str]
):
    balances = {
        member: 0.0
        for member in members
    }

    for expense in expenses:
        paid_by = expense.get("paid_by")
        amount = float(expense.get("amount", 0))

        # Person who paid gets credit
        if paid_by in balances:
            balances[paid_by] += amount

        # Each person is charged their share
        splits = expense.get("splits", {})

        for member, share in splits.items():
            if member in balances:
                balances[member] -= float(share)

    return {
        member: round(balance, 2)
        for member, balance in balances.items()
    }


@router.get("/{room_id}")
def get_balances(room_id: str):

    # Validate room ID
    if not ObjectId.is_valid(room_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid room ID"
        )

    # Find room
    room = db.rooms.find_one({
        "_id": ObjectId(room_id)
    })

    if room is None:
        raise HTTPException(
            status_code=404,
            detail="Room not found"
        )

    members = room.get("members", [])

    # Get room expenses
    expenses = list(
        db.expenses.find({
            "room_id": room_id
        })
    )

    # Calculate balances
    balances = calculate_balances(
        expenses,
        members
    )

    return {
        "room_id": room_id,
        "balances": balances
    }