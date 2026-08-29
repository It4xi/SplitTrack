from pydantic import BaseModel
from typing import List, Dict, Optional


class ExpenseCreate(BaseModel):
    room_id: str
    title: str
    amount: float
    category: str
    paid_by: str
    participants: List[str]
    split_type: str = "equal"

    # Used for exact split
    exact_splits: Optional[Dict[str, float]] = None

    # Used for percentage split
    percentage_splits: Optional[Dict[str, float]] = None