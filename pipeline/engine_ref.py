"""Reference runway engine — the judges' formula, verbatim. The TypeScript engine must match it."""

# 2026 EI: 55% of insurable earnings up to $729/week (canada.ca, Jan 1 2026). 729 * 52 / 12
EI_WEEKLY_MAX = 729.0
EI_MONTHLY_CAP = EI_WEEKLY_MAX * 52 / 12
EI_RATE = 0.55


def runway(B, one_off_costs, spending_after_shock, income_after_shock):
    """Returns months (rounded to 1 decimal) or None for "no shortfall (120+)"."""
    buffer_left = B - one_off_costs
    gap = spending_after_shock - income_after_shock
    if buffer_left <= 0:
        return 0
    elif gap <= 0:
        return None
    else:
        return round(min(buffer_left / gap, 120), 1)


def realistic_jobloss_income(non_pension_income, pension_income):
    """Realistic job loss: EI replaces 55% of earnings up to the weekly max; pension keeps paying."""
    return min(EI_RATE * non_pension_income, EI_MONTHLY_CAP) + pension_income
