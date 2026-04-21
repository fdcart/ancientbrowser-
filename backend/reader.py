"""Reader Mode extraction.

Fetches a URL server-side, runs readability extraction, sanitizes the HTML,
and returns a compact, iOS-12-friendly article payload.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional
from urllib.parse import urljoin, urlparse

import bleach
import httpx
from bs4 import BeautifulSoup
from readability import Document

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (compatible; CloudBrowseBot/1.0; "
    "+https://cloudbrowse.example/bot) "
    "Chrome/124.0.0.0 Safari/537.36"
)

MAX_BYTES = 5 * 1024 * 1024  # 5 MB page cap
FETCH_TIMEOUT = 15.0  # seconds

ALLOWED_TAGS = [
    "a", "abbr", "b", "blockquote", "br", "caption", "cite", "code",
    "dd", "del", "div", "dl", "dt", "em", "figcaption", "figure",
    "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "ins", "kbd",
    "li", "mark", "ol", "p", "pre", "q", "s", "small", "span", "strong",
    "sub", "sup", "table", "tbody", "td", "tfoot", "th", "thead", "tr",
    "u", "ul", "time",
]

ALLOWED_ATTRS = {
    "*": ["class", "id", "title", "lang", "dir"],
    "a": ["href", "rel", "target"],
    "img": ["src", "alt", "width", "height"],
    "time": ["datetime"],
}

ALLOWED_PROTOCOLS = ["http", "https", "mailto"]


@dataclass
class ReaderArticle:
    url: str
    final_url: str
    title: str
    byline: Optional[str]
    content_html: str
    text_length: int
    site_name: Optional[str]


class ReaderError(Exception):
    pass


def _absolutize(html: str, base_url: str) -> str:
    soup = BeautifulSoup(html, "lxml")
    for tag, attr in (("a", "href"), ("img", "src")):
        for el in soup.find_all(tag):
            val = el.get(attr)
            if not val:
                continue
            try:
                el[attr] = urljoin(base_url, val)
            except Exception:  # noqa: BLE001
                pass
    # Strip srcset (heavy, iOS12-inconsistent)
    for img in soup.find_all("img"):
        for bad in ("srcset", "data-src", "data-srcset", "loading"):
            if img.has_attr(bad):
                del img[bad]
        if img.has_attr("src"):
            img["loading"] = "lazy"
    # Open external links in new tab with safe rel
    for a in soup.find_all("a"):
        href = a.get("href", "")
        if href.startswith("http"):
            a["target"] = "_blank"
            a["rel"] = "noopener noreferrer"
    return str(soup)


def _sanitize(html: str) -> str:
    return bleach.clean(
        html,
        tags=ALLOWED_TAGS,
        attributes=ALLOWED_ATTRS,
        protocols=ALLOWED_PROTOCOLS,
        strip=True,
        strip_comments=True,
    )


def _extract_meta(raw_html: str) -> dict:
    soup = BeautifulSoup(raw_html, "lxml")
    meta = {"site_name": None, "byline": None}

    og_site = soup.find("meta", property="og:site_name")
    if og_site and og_site.get("content"):
        meta["site_name"] = og_site["content"].strip()

    for sel in [
        ("meta", {"name": "author"}),
        ("meta", {"property": "article:author"}),
    ]:
        tag = soup.find(*sel)
        if tag and tag.get("content"):
            meta["byline"] = tag["content"].strip()
            break

    return meta


def fetch_and_extract(url: str) -> ReaderArticle:
    """Fetch URL and run readability. Raises ReaderError on failure."""
    headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
    }
    try:
        with httpx.Client(
            follow_redirects=True,
            timeout=FETCH_TIMEOUT,
            headers=headers,
            http2=False,
        ) as client:
            resp = client.get(url)
    except httpx.HTTPError as exc:
        raise ReaderError(f"Failed to fetch page: {exc}") from exc

    if resp.status_code >= 400:
        raise ReaderError(f"Upstream returned HTTP {resp.status_code}")

    ctype = resp.headers.get("content-type", "").lower()
    if "html" not in ctype and "xml" not in ctype:
        raise ReaderError(f"Unsupported content-type: {ctype or 'unknown'}")

    raw = resp.content[:MAX_BYTES]
    try:
        encoding = resp.encoding or "utf-8"
        html_text = raw.decode(encoding, errors="replace")
    except (LookupError, UnicodeDecodeError):
        html_text = raw.decode("utf-8", errors="replace")

    final_url = str(resp.url)

    try:
        doc = Document(html_text)
        title = (doc.short_title() or doc.title() or "").strip()
        summary_html = doc.summary(html_partial=True)
    except Exception as exc:  # noqa: BLE001
        raise ReaderError(f"Readability failed: {exc}") from exc

    if not summary_html or len(BeautifulSoup(summary_html, "lxml").get_text(strip=True)) < 120:
        raise ReaderError("Article content is too short or empty")

    absolutized = _absolutize(summary_html, final_url)
    clean = _sanitize(absolutized)

    text_len = len(BeautifulSoup(clean, "lxml").get_text(" ", strip=True))
    meta = _extract_meta(html_text)

    parsed = urlparse(final_url)
    site_name = meta.get("site_name") or parsed.netloc

    return ReaderArticle(
        url=url,
        final_url=final_url,
        title=title or parsed.netloc,
        byline=meta.get("byline"),
        content_html=clean,
        text_length=text_len,
        site_name=site_name,
    )
