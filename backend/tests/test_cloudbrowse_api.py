"""CloudBrowse backend API tests.

Tests: health endpoint, Reader Mode (SSRF, validation, success, sanitization),
Live Mode graceful 503s, and rate limiting.
"""
import os
import re
import time

import pytest
import requests
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent.parent / ".env")

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "").rstrip("/")
if not BASE_URL:
    # Fallback to frontend/.env if backend not exporting it
    fe_env = Path(__file__).parent.parent.parent / "frontend" / ".env"
    for line in fe_env.read_text().splitlines():
        if line.startswith("REACT_APP_BACKEND_URL="):
            BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
            break

API = f"{BASE_URL}/api"


@pytest.fixture(scope="session")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Health ----------
class TestHealth:
    def test_health_ok_worker_not_configured(self, client):
        r = client.get(f"{API}/health", timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        worker = data.get("worker") or {}
        assert worker.get("configured") is False
        assert worker.get("ok") is False

    def test_root(self, client):
        r = client.get(f"{API}/", timeout=10)
        assert r.status_code == 200
        assert r.json().get("ok") is True


# ---------- Reader Mode validation / SSRF ----------
class TestReaderValidation:
    def test_empty_url(self, client):
        r = client.post(f"{API}/reader/open", json={"url": ""}, timeout=15)
        assert r.status_code == 400
        assert "empty" in r.json().get("detail", "").lower()

    def test_localhost_blocked(self, client):
        r = client.post(
            f"{API}/reader/open", json={"url": "http://localhost/admin"}, timeout=15
        )
        assert r.status_code == 400
        assert "block" in r.json().get("detail", "").lower()

    def test_cloud_metadata_blocked(self, client):
        r = client.post(
            f"{API}/reader/open", json={"url": "http://169.254.169.254/"}, timeout=15
        )
        assert r.status_code == 400
        assert "metadata" in r.json().get("detail", "").lower() or \
               "block" in r.json().get("detail", "").lower()

    def test_ftp_scheme_blocked(self, client):
        r = client.post(
            f"{API}/reader/open", json={"url": "ftp://example.com"}, timeout=15
        )
        assert r.status_code == 400
        assert "scheme" in r.json().get("detail", "").lower() or \
               "not allowed" in r.json().get("detail", "").lower()

    def test_private_ip_blocked(self, client):
        r = client.post(
            f"{API}/reader/open", json={"url": "http://10.0.0.1/"}, timeout=15
        )
        assert r.status_code == 400


# ---------- Reader Mode success ----------
class TestReaderSuccess:
    def test_open_wikipedia_safari(self, client):
        r = client.post(
            f"{API}/reader/open",
            json={"url": "https://en.wikipedia.org/wiki/Safari_(web_browser)"},
            timeout=45,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["title"]
        assert "Safari" in data["title"]
        assert data["site_name"]
        assert data["content_html"]
        assert data["text_length"] > 500

    def test_auto_add_https_scheme(self, client):
        r = client.post(
            f"{API}/reader/open",
            json={"url": "en.wikipedia.org/wiki/Main_Page"},
            timeout=45,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["final_url"].startswith("https://")
        assert data["title"]

    def test_non_html_pdf_returns_422(self, client):
        # A small, reliably hosted PDF
        r = client.post(
            f"{API}/reader/open",
            json={"url": "https://css4.pub/2015/usenix/example.pdf"},
            timeout=30,
        )
        # Should be 422 with content-type error
        assert r.status_code == 422, f"Got {r.status_code}: {r.text}"
        assert "content-type" in r.json().get("detail", "").lower()

    def test_reader_html_is_sanitized(self, client):
        r = client.post(
            f"{API}/reader/open",
            json={"url": "https://en.wikipedia.org/wiki/HTML"},
            timeout=45,
        )
        assert r.status_code == 200, r.text
        html = r.json()["content_html"]
        # No script/iframe/style/on* attrs
        assert "<script" not in html.lower()
        assert "<iframe" not in html.lower()
        assert "<style" not in html.lower()
        assert not re.search(r"\son[a-z]+\s*=", html, re.IGNORECASE)


# ---------- Live Mode graceful 503 ----------
class TestLiveMode:
    def test_live_start_503_when_no_worker(self, client):
        r = client.post(
            f"{API}/live/start",
            json={"url": "https://en.wikipedia.org/wiki/Safari_(web_browser)"},
            timeout=15,
        )
        assert r.status_code == 503, r.text
        detail = r.json().get("detail", "").lower()
        assert "unavailable" in detail or "worker" in detail

    def test_live_start_ssrf_runs_before_worker_check(self, client):
        r = client.post(
            f"{API}/live/start", json={"url": "http://localhost"}, timeout=15
        )
        # SSRF check must happen before worker availability
        assert r.status_code == 400, r.text

    def test_live_frame_503_when_no_worker(self, client):
        r = client.get(f"{API}/live/fake-session-id/frame", timeout=15)
        assert r.status_code == 503


# ---------- Rate limiting ----------
class TestRateLimit:
    def test_reader_rate_limit_429(self, client):
        # Reader limiter: 30 calls/min. Fire quick bad URLs to avoid slow fetches.
        got_429 = False
        for _i in range(40):
            r = client.post(
                f"{API}/reader/open", json={"url": "ftp://example.com"}, timeout=10
            )
            if r.status_code == 429:
                got_429 = True
                break
        # Rate limiter should kick in after 30; allow small buffer
        assert got_429, "Rate limit (429) was not triggered after 40 requests"
        # Give limiter a breather for subsequent tests
        time.sleep(1)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
