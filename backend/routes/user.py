from fastapi import APIRouter
from backend.database import db

router = APIRouter(
    prefix="/api/users",
    tags=["Users"]
)


@router.post("/")
def create_user(name: str):
    user = {
        "name": name
    }

    result = db.users.insert_one(user)

    return {
        "id": str(result.inserted_id),
        "name": name
    }


@router.get("/")
def get_users():
    users = []

    for user in db.users.find():
        users.append({
            "id": str(user["_id"]),
            "name": user["name"]
        })

    return users