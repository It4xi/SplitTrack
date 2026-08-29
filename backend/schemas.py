from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=40)


class AuthRegister(BaseModel):
    username: str = Field(min_length=2, max_length=40)
    password: str = Field(min_length=4, max_length=100)


class AuthLogin(BaseModel):
    username: str = Field(min_length=2, max_length=40)
    password: str = Field(min_length=1, max_length=100)


class RoomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    created_by: Optional[str] = None


class MemberAdd(BaseModel):
    user_id: str


class MemberRename(BaseModel):
    new_name: str = Field(min_length=1, max_length=40)


class ExpenseCreate(BaseModel):
    room_id: str
    title: str = Field(min_length=1, max_length=80)
    amount: float = Field(gt=0)
    category: str = Field(min_length=1, max_length=40)
    paid_by: str
    participants: List[str] = Field(min_length=1)
    split_type: str = "equal"
    exact_splits: Optional[Dict[str, float]] = None
    percentage_splits: Optional[Dict[str, float]] = None
