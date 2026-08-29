from fastapi import APIRouter, HTTPException
from bson import ObjectId

from backend.database import db
from backend.schemas import ExpenseCreate
from backend.calculations import (
    calculate_equal_split,
    calculate_exact_split,
    calculate_percentage_split
)


router = APIRouter(
    prefix="/api/expenses",
    tags=["Expenses"]
)


@router.post("/")
def create_expense(expense: ExpenseCreate):

    # -----------------------------
    # Validate room ID
    # -----------------------------
    if not ObjectId.is_valid(expense.room_id):
        raise HTTPException(
            status_code=400,
            detail="Invalid room ID"
        )

    # -----------------------------
    # Find room
    # -----------------------------
    room = db.rooms.find_one({
        "_id": ObjectId(expense.room_id)
    })

    if room is None:
        raise HTTPException(
            status_code=404,
            detail="Room not found"
        )

    members = room.get("members", [])

    # -----------------------------
    # Validate payer
    # -----------------------------
    if expense.paid_by not in members:
        raise HTTPException(
            status_code=400,
            detail="Payer is not a member of this room"
        )

    # -----------------------------
    # Validate amount
    # -----------------------------
    if expense.amount <= 0:
        raise HTTPException(
            status_code=400,
            detail="Amount must be greater than zero"
        )

    # -----------------------------
    # Validate title
    # -----------------------------
    title = expense.title.strip()

    if not title:
        raise HTTPException(
            status_code=400,
            detail="Title cannot be empty"
        )

    # -----------------------------
    # Validate category
    # -----------------------------
    category = expense.category.strip()

    if not category:
        raise HTTPException(
            status_code=400,
            detail="Category cannot be empty"
        )

    # -----------------------------
    # Validate participants
    # -----------------------------
    if not expense.participants:
        raise HTTPException(
            status_code=400,
            detail="At least one participant is required"
        )

    participants = list(dict.fromkeys(expense.participants))

    for participant in participants:
        if participant not in members:
            raise HTTPException(
                status_code=400,
                detail=f"Participant '{participant}' is not a member of this room"
            )

    # -----------------------------
    # Validate split type
    # -----------------------------
    allowed_split_types = [
        "equal",
        "exact",
        "percentage"
    ]

    if expense.split_type not in allowed_split_types:
        raise HTTPException(
            status_code=400,
            detail="Invalid split type"
        )

    # -----------------------------
    # Calculate split
    # -----------------------------
    try:

        if expense.split_type == "equal":

            splits = calculate_equal_split(
                expense.amount,
                participants
            )

        elif expense.split_type == "exact":

            if not expense.exact_splits:
                raise HTTPException(
                    status_code=400,
                    detail="exact_splits are required for exact split"
                )

            exact_splits = {
                participant: expense.exact_splits.get(
                    participant,
                    0
                )
                for participant in participants
            }

            splits = calculate_exact_split(
                expense.amount,
                exact_splits
            )

        else:

            if not expense.percentage_splits:
                raise HTTPException(
                    status_code=400,
                    detail="percentage_splits are required for percentage split"
                )

            percentage_splits = {
                participant: expense.percentage_splits.get(
                    participant,
                    0
                )
                for participant in participants
            }

            splits = calculate_percentage_split(
                expense.amount,
                percentage_splits
            )

    except ValueError as e:

        raise HTTPException(
            status_code=400,
            detail=str(e)
        )

    # -----------------------------
    # Create expense document
    # -----------------------------
    expense_document = {
        "room_id": expense.room_id,
        "title": title,
        "amount": round(float(expense.amount), 2),
        "category": category,
        "paid_by": expense.paid_by,
        "participants": participants,
        "split_type": expense.split_type,
        "splits": splits
    }

    # -----------------------------
    # Save to MongoDB
    # -----------------------------
    result = db.expenses.insert_one(
        expense_document
    )

    # -----------------------------
    # Return JSON-safe response
    # -----------------------------
    return {
        "id": str(result.inserted_id),
        "room_id": expense_document["room_id"],
        "title": expense_document["title"],
        "amount": expense_document["amount"],
        "category": expense_document["category"],
        "paid_by": expense_document["paid_by"],
        "participants": expense_document["participants"],
        "split_type": expense_document["split_type"],
        "splits": expense_document["splits"]
    }


@router.get("/{room_id}")
def get_expenses(room_id: str):

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

    expenses = []

    for expense in db.expenses.find({
        "room_id": room_id
    }):
        expenses.append({
            "id": str(expense["_id"]),
            "room_id": expense.get("room_id"),
            "title": expense.get("title"),
            "amount": expense.get("amount"),
            "category": expense.get("category"),
            "paid_by": expense.get("paid_by"),
            "participants": expense.get("participants", []),
            "split_type": expense.get("split_type", "equal"),
            "splits": expense.get("splits", {})
        })

    return expenses