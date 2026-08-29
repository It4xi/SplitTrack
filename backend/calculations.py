def calculate_equal_split(amount: float, participants: list[str]):
    if not participants: raise ValueError("At least one participant is required")
    cents=int(round(amount*100)); base,extra=divmod(cents,len(participants))
    return {p:(base+(1 if i<extra else 0))/100 for i,p in enumerate(participants)}

def calculate_exact_split(amount: float, splits: dict[str,float]):
    if not splits: raise ValueError("Split amounts are required")
    cleaned={p:round(float(v),2) for p,v in splits.items()}
    if any(v<0 for v in cleaned.values()): raise ValueError("Split amounts cannot be negative")
    total=round(sum(cleaned.values()),2); expected=round(amount,2)
    if abs(total-expected)>0.009: raise ValueError(f"Split amounts must equal the total expense. Expected {expected}, got {total}.")
    return cleaned

def calculate_percentage_split(amount: float, percentages: dict[str,float]):
    if not percentages: raise ValueError("Percentages are required")
    cleaned={p:float(v) for p,v in percentages.items()}
    if any(v<0 or v>100 for v in cleaned.values()): raise ValueError("Percentages must be between 0 and 100")
    total=round(sum(cleaned.values()),2)
    if abs(total-100)>0.009: raise ValueError(f"Percentages must total 100%. Got {total}%.")
    cents=int(round(amount*100)); raw=[]; used=0
    for p,pct in cleaned.items():
        exact=cents*pct/100; floor=int(exact); raw.append((p,floor,exact-floor)); used+=floor
    remaining=cents-used; raw.sort(key=lambda x:x[2],reverse=True); out={}
    for i,(p,floor,_) in enumerate(raw): out[p]=(floor+(1 if i<remaining else 0))/100
    return out
