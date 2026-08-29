from fastapi import APIRouter, HTTPException
from bson import ObjectId
from backend.database import db
from backend.schemas import ExpenseCreate
from backend.calculations import calculate_equal_split, calculate_exact_split, calculate_percentage_split
router=APIRouter(prefix="/api/expenses",tags=["Expenses"])
def room(rid):
    if not ObjectId.is_valid(rid): raise HTTPException(400,"Invalid room ID")
    r=db.rooms.find_one({"_id":ObjectId(rid)})
    if not r: raise HTTPException(404,"Room not found")
    return r
def response(d,i): return {"id":str(i),"room_id":d["room_id"],"title":d["title"],"amount":d["amount"],"category":d["category"],"paid_by":d["paid_by"],"participants":d["participants"],"split_type":d["split_type"],"splits":d.get("splits",{})}
def splits_for(e,members):
    ps=list(dict.fromkeys(e.participants))
    if e.paid_by not in members: raise HTTPException(400,"Payer is not a member of this room")
    for p in ps:
        if p not in members: raise HTTPException(400,f"Participant '{p}' is not a member of this room")
    try:
        if e.split_type=="equal": return calculate_equal_split(e.amount,ps)
        if e.split_type=="exact":
            if not e.exact_splits: raise HTTPException(400,"exact_splits are required for exact split")
            return calculate_exact_split(e.amount,{p:e.exact_splits.get(p,0) for p in ps})
        if e.split_type=="percentage":
            if not e.percentage_splits: raise HTTPException(400,"percentage_splits are required for percentage split")
            return calculate_percentage_split(e.amount,{p:e.percentage_splits.get(p,0) for p in ps})
    except ValueError as ex: raise HTTPException(400,str(ex))
    raise HTTPException(400,"Invalid split type")
@router.post("/")
def create_expense(e:ExpenseCreate):
    r=room(e.room_id); title=e.title.strip(); cat=e.category.strip();
    if not title: raise HTTPException(400,"Title cannot be empty")
    if not cat: raise HTTPException(400,"Category cannot be empty")
    d={"room_id":e.room_id,"title":title,"amount":round(float(e.amount),2),"category":cat,"paid_by":e.paid_by,"participants":list(dict.fromkeys(e.participants)),"split_type":e.split_type,"splits":splits_for(e,r.get("members",[]))}; i=db.expenses.insert_one(d).inserted_id; return response(d,i)
@router.get("/{room_id}")
def get_expenses(room_id:str): room(room_id); return [response(e,e["_id"]) for e in db.expenses.find({"room_id":room_id})]
@router.put("/{expense_id}")
def update_expense(expense_id:str,e:ExpenseCreate):
    if not ObjectId.is_valid(expense_id): raise HTTPException(400,"Invalid expense ID")
    old=db.expenses.find_one({"_id":ObjectId(expense_id)})
    if not old: raise HTTPException(404,"Expense not found")
    if e.room_id!=old.get("room_id"): raise HTTPException(400,"Expense belongs to a different room")
    r=room(e.room_id); d={"room_id":e.room_id,"title":e.title.strip(),"amount":round(float(e.amount),2),"category":e.category.strip(),"paid_by":e.paid_by,"participants":list(dict.fromkeys(e.participants)),"split_type":e.split_type,"splits":splits_for(e,r.get("members",[]))}; db.expenses.update_one({"_id":ObjectId(expense_id)},{"$set":d}); return response(d,ObjectId(expense_id))
@router.delete("/{expense_id}")
def delete_expense(expense_id:str):
    if not ObjectId.is_valid(expense_id): raise HTTPException(400,"Invalid expense ID")
    r=db.expenses.delete_one({"_id":ObjectId(expense_id)})
    if not r.deleted_count: raise HTTPException(404,"Expense not found")
    return {"message":"Expense deleted successfully","expense_id":expense_id}
