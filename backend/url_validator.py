"""URL validation & SSRF protection.

Blocks private IP ranges, localhost, cloud metadata endpoints, and enforces
http(s)-only schemes. Used before any outbound fetch or worker navigation.
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse, urlunparse

ALLOWED_SCHEMES = {"http", "https"}

# Cloud metadata + known-internal hosts
BLOCKED_HOSTNAMES = {
    "metadata.google.internal",
    "metadata",
    "localhost",
    "0.0.0.0",
    "ip6-localhost",
    "ip6-loopback",
}

MAX_URL_LENGTH = 2048


class URLValidationError(ValueError):
    """Raised when a URL fails validation/SSRF checks."""


def _is_blocked_ip(ip: ipaddress._BaseAddress) -> bool:
    return (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_multicast
        or ip.is_reserved
        or ip.is_unspecified
    )


def normalize_url(url: str) -> str:
    """Add scheme if missing and strip whitespace."""
    url = (url or "").strip()
    if not url:
        raise URLValidationError("URL is empty")
    if len(url) > MAX_URL_LENGTH:
        raise URLValidationError("URL too long")
    if "://" not in url:
        url = "https://" + url
    return url


def validate_url(url: str) -> str:
    """Validate a URL for public fetch. Returns normalized URL or raises."""
    url = normalize_url(url)
    parsed = urlparse(url)

    if parsed.scheme not in ALLOWED_SCHEMES:
        raise URLValidationError(f"Scheme '{parsed.scheme}' is not allowed")

    host = (parsed.hostname or "").lower()
    if not host:
        raise URLValidationError("URL has no hostname")

    if host in BLOCKED_HOSTNAMES:
        raise URLValidationError("Hostname is blocked")

    # Block AWS/GCP/Azure metadata IP
    if host in {"169.254.169.254", "fd00:ec2::254"}:
        raise URLValidationError("Cloud metadata endpoint is blocked")

    # If hostname is already an IP, check directly
    try:
        ip = ipaddress.ip_address(host)
        if _is_blocked_ip(ip):
            raise URLValidationError("IP address is in a blocked range")
    except ValueError:
        # Not an IP — resolve DNS and check every address
        try:
            infos = socket.getaddrinfo(host, None)
        except socket.gaierror as exc:
            raise URLValidationError(f"DNS lookup failed: {exc}") from exc
        for info in infos:
            addr = info[4][0]
            # Strip IPv6 zone id
            addr = addr.split("%", 1)[0]
            try:
                ip = ipaddress.ip_address(addr)
            except ValueError:
                continue
            if _is_blocked_ip(ip):
                raise URLValidationError(
                    "Resolved IP address is in a blocked range"
                )

    # Rebuild cleaned URL (drop fragments for server fetch)
    cleaned = urlunparse(
        (parsed.scheme, parsed.netloc, parsed.path or "/", parsed.params, parsed.query, "")
    )
    return cleaned
