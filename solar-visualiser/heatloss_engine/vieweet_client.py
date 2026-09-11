"""Small dependency-free client for the Vieweet Partner API."""

from __future__ import annotations

import json
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


@dataclass(frozen=True)
class Environment:
    api_base_url: str
    auth_domain: str


ENVIRONMENTS = {
    "staging": Environment(
        api_base_url="https://api-v2.staging.vieweet.com",
        auth_domain="https://virtualviewapp-staging.eu.auth0.com",
    ),
    "production": Environment(
        api_base_url="https://api-v2.vieweet.com",
        auth_domain="https://virtualviewapp.eu.auth0.com",
    ),
}


class VieweetAPIError(RuntimeError):
    def __init__(self, message: str, *, status: int | None = None):
        super().__init__(message)
        self.status = status


class VieweetClient:
    """M2M client with in-process token reuse, throttling, retry, and JSON cache."""

    def __init__(
        self,
        *,
        client_id: str | None,
        client_secret: str | None,
        api_key: str | None = None,
        environment: str = "production",
        cache_dir: Path | None = None,
        refresh: bool = False,
        min_request_interval: float = 0.65,
        timeout: float = 30.0,
    ) -> None:
        try:
            self.environment = ENVIRONMENTS[environment]
        except KeyError as error:
            raise ValueError(f"Unknown Vieweet environment: {environment}") from error
        self.environment_name = environment
        self.client_id = client_id
        self.client_secret = client_secret
        self.api_key = api_key
        self.cache_dir = cache_dir
        self.refresh = refresh
        self.min_request_interval = min_request_interval
        self.timeout = timeout
        self._access_token: str | None = None
        self._token_expires_at = 0.0
        self._last_request_at = 0.0

    @classmethod
    def from_environment(cls, **kwargs: Any) -> "VieweetClient":
        return cls(
            client_id=os.environ.get("VIEWEET_CLIENT_ID"),
            client_secret=os.environ.get("VIEWEET_CLIENT_SECRET"),
            api_key=os.environ.get("VIEWEET_API_KEY"),
            **kwargs,
        )

    def _wait_for_rate_limit(self) -> None:
        elapsed = time.monotonic() - self._last_request_at
        if elapsed < self.min_request_interval:
            time.sleep(self.min_request_interval - elapsed)

    def _redact(self, value: str) -> str:
        for secret in (self.client_id, self.client_secret, self.api_key, self._access_token):
            if secret:
                value = value.replace(secret, "[redacted]")
        return value

    def _request_json(
        self,
        method: str,
        url: str,
        *,
        body: dict[str, Any] | None = None,
        headers: dict[str, str] | None = None,
        retries: int = 3,
    ) -> dict[str, Any]:
        encoded = json.dumps(body).encode("utf-8") if body is not None else None
        request_headers = {"Accept": "application/json", **(headers or {})}
        if encoded is not None:
            request_headers["Content-Type"] = "application/json"

        for attempt in range(retries + 1):
            self._wait_for_rate_limit()
            request = Request(url, data=encoded, headers=request_headers, method=method)
            try:
                with urlopen(request, timeout=self.timeout) as response:
                    self._last_request_at = time.monotonic()
                    payload = json.loads(response.read().decode("utf-8"))
                    if not isinstance(payload, dict):
                        raise VieweetAPIError(f"Expected an object response from {url}")
                    return payload
            except HTTPError as error:
                self._last_request_at = time.monotonic()
                detail = self._redact(error.read().decode("utf-8", errors="replace")[:500])
                retryable = error.code == 429 or 500 <= error.code < 600
                if retryable and attempt < retries:
                    retry_after = error.headers.get("Retry-After")
                    delay = float(retry_after) if retry_after else min(2**attempt, 8)
                    time.sleep(delay)
                    continue
                raise VieweetAPIError(
                    f"Vieweet returned HTTP {error.code} for {url}: {detail}",
                    status=error.code,
                ) from error
            except (URLError, TimeoutError) as error:
                self._last_request_at = time.monotonic()
                if attempt < retries:
                    time.sleep(min(2**attempt, 8))
                    continue
                raise VieweetAPIError(f"Could not reach Vieweet at {url}: {error}") from error

        raise AssertionError("unreachable")

    def _get_access_token(self) -> str:
        now = time.time()
        if self._access_token and now < self._token_expires_at:
            return self._access_token
        if not self.client_id or not self.client_secret:
            raise VieweetAPIError(
                "Set VIEWEET_CLIENT_ID and VIEWEET_CLIENT_SECRET before making a live request"
            )
        response = self._request_json(
            "POST",
            f"{self.environment.auth_domain}/oauth/token",
            body={
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "audience": "https://api.vieweet.com",
                "grant_type": "client_credentials",
            },
        )
        try:
            self._access_token = str(response["access_token"])
        except KeyError as error:
            raise VieweetAPIError("Auth0 response did not contain an access token") from error
        expires_in = float(response.get("expires_in", 86_400))
        self._token_expires_at = now + max(0, expires_in - 60)
        return self._access_token

    def _cache_path(self, tour_code: str, section: str) -> Path | None:
        if self.cache_dir is None:
            return None
        safe_code = "".join(character for character in tour_code if character.isalnum() or character in "-_")
        return self.cache_dir / self.environment_name / safe_code / f"{section}.json"

    def _get_section(self, tour_code: str, section: str) -> dict[str, Any]:
        cache_path = self._cache_path(tour_code, section)
        if cache_path and cache_path.exists() and not self.refresh:
            payload = json.loads(cache_path.read_text(encoding="utf-8"))
            if not isinstance(payload, dict):
                raise VieweetAPIError(f"Invalid cached response: {cache_path}")
            return payload

        if self.api_key:
            auth_headers = {"X-API-Key": self.api_key}
        else:
            token = self._get_access_token()
            auth_headers = {"Authorization": f"Bearer {token}"}
        payload = self._request_json(
            "GET",
            f"{self.environment.api_base_url}/partner/dollhouses/{tour_code}/{section}",
            headers=auth_headers,
        )
        if cache_path:
            cache_path.parent.mkdir(parents=True, exist_ok=True)
            cache_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
        return payload

    def get_measurements(self, tour_code: str) -> dict[str, Any]:
        return self._get_section(tour_code, "measurements")

    def get_geometry(self, tour_code: str) -> dict[str, Any]:
        return self._get_section(tour_code, "geometry")
