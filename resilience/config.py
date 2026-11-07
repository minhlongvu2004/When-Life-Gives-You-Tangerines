"""Project-wide constants and data path resolution."""
import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent


def _resolve_data_dir() -> Path:
    env = os.environ.get("TANGERINE_DATA")
    if env:
        return Path(env)
    local = REPO_ROOT / "data"
    if local.exists():
        return local
    return REPO_ROOT.parent / "Datasets" / "Datasets" / "Tangerine" / "data"


DATA_DIR = _resolve_data_dir()
CACHE_DIR = REPO_ROOT / "cache"

# Employment Insurance (2026): 55% of insurable earnings, capped at $729/week.
EI_RATE = 0.55
EI_MAX_WEEKLY = 729.0
EI_SOURCE = (
    "https://www.canada.ca/en/employment-social-development/programs/ei/ei-list/"
    "ei-employers/premium-reduction-program/2026-maximum-insurable-earnings.html"
)
EI_MONTHLY_CAP = EI_MAX_WEEKLY * 52 / 12

SIM_YEAR = 2026          # simulation starts the year after the data ends
MAX_RUNWAY = 120         # months, per the track README
SHRINK_K = 3             # seasonal-factor shrinkage toward the population
