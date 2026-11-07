import pytest

from resilience.config import DATA_DIR


def pytest_collection_modifyitems(config, items):
    if (DATA_DIR / "monthly_summary.csv").exists():
        return
    skip = pytest.mark.skip(reason=f"Tangerine data not found at {DATA_DIR}")
    for item in items:
        if "tables" in item.fixturenames or "profiles" in item.fixturenames:
            item.add_marker(skip)


@pytest.fixture(scope="session")
def tables():
    from resilience.data import load_tables
    return load_tables()


@pytest.fixture(scope="session")
def profiles():
    from resilience.data import get_profiles
    return get_profiles()
