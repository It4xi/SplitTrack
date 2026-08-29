def calculate_equal_split(amount: float, participants: list[str]):
    if not participants:
        raise ValueError("At least one participant is required")

    share = round(amount / len(participants), 2)

    return {
        participant: share
        for participant in participants
    }


def calculate_exact_split(
    amount: float,
    splits: dict[str, float]
):
    if not splits:
        raise ValueError("Split amounts are required")

    cleaned_splits = {
        person: round(float(value), 2)
        for person, value in splits.items()
    }

    total = round(sum(cleaned_splits.values()), 2)

    if total != round(amount, 2):
        raise ValueError(
            f"Split amounts must equal the total expense. "
            f"Expected {amount}, got {total}."
        )

    return cleaned_splits


def calculate_percentage_split(
    amount: float,
    percentages: dict[str, float]
):
    if not percentages:
        raise ValueError("Percentages are required")

    cleaned_percentages = {
        person: float(value)
        for person, value in percentages.items()
    }

    total_percentage = round(
        sum(cleaned_percentages.values()), 2
    )

    if total_percentage != 100:
        raise ValueError(
            f"Percentages must total 100%. "
            f"Got {total_percentage}%."
        )

    splits = {
        person: round(
            amount * (percentage / 100),
            2
        )
        for person, percentage in cleaned_percentages.items()
    }

    return splits