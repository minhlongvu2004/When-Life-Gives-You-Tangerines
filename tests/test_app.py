import pytest
from streamlit.testing.v1 import AppTest

from resilience.config import DATA_DIR

pytestmark = pytest.mark.skipif(not (DATA_DIR / "monthly_summary.csv").exists(), reason="no data")


@pytest.fixture
def at():
    app = AppTest.from_file("../app.py", default_timeout=300)
    app.run()
    return app


def test_app_loads(at):
    assert not at.exception
    assert len(at.tabs) == 3


def test_preset_runs(at):
    at.button(key="preset_2").click().run()
    assert not at.exception
    labels = [m.label for m in at.metric]
    assert any("Official runway" in l for l in labels)
    assert at.checkbox(key="job_loss").value is True
    assert at.slider(key="bills_pct").value == 0.15


def test_unknown_account(at):
    at.number_input(key="account_id").set_value(999999999).run()
    assert not at.exception
    assert "not found" in at.warning[0].value


def test_dollar_signs_escaped_in_markdown(at):
    """Streamlit renders $...$ as LaTeX, so every $ in markdown text must be escaped."""
    import re
    at.button(key="preset_2").click().run()
    texts = [e.value for kind in ("markdown", "success", "caption") for e in getattr(at, kind)]
    bad = [t for t in texts if re.search(r"(?<![\\])[$]", t)]
    assert not bad, bad[:3]
