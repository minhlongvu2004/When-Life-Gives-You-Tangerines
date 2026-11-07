"""Shock definitions and the track's example twist cards."""
from dataclasses import dataclass


@dataclass(frozen=True)
class Shock:
    job_loss: bool = False
    ei_rate: float = 0.55
    ei_months: int = 6
    bills_pct: float = 0.0
    extra_monthly: float = 0.0
    one_off: float = 0.0
    one_off_months_of_spending: float = 0.0
    start_month: int = 11

    def one_off_total(self, S: float) -> float:
        return self.one_off + self.one_off_months_of_spending * S


TWIST_PRESETS: dict[str, Shock] = {
    "Laid off (EI 55%, 6 months)": Shock(job_loss=True, ei_rate=0.55, ei_months=6),
    "Furnace dies (1 month of spending)": Shock(one_off_months_of_spending=1.0),
    "Job loss + bills +15%": Shock(job_loss=True, ei_rate=0.55, ei_months=6, bills_pct=0.15),
}
