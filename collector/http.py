from __future__ import annotations

import logging
import os
import time
import urllib.robotparser
from dataclasses import dataclass, field
from urllib.parse import urlparse

import httpx

LOG = logging.getLogger(__name__)


@dataclass
class RespectfulClient:
    user_agent: str = "GameHiringRadar/1.0 (+public-research; contact via repository issues)"
    delay_seconds: float = 2.0
    timeout: float = 20.0
    _last_request: dict[str, float] = field(default_factory=dict)
    _robots: dict[str, urllib.robotparser.RobotFileParser] = field(default_factory=dict)
    _client: httpx.Client | None = field(default=None, init=False, repr=False)

    def _fetch_robots_text(self, url: str) -> str:
        """일반 수집 요청과 같은 HTTP 엔진으로 robots.txt를 최대 3회 확인한다."""
        last_error: Exception | None = None
        for attempt in range(1, 4):
            try:
                with httpx.Client(
                    headers={"User-Agent": self.user_agent},
                    timeout=min(self.timeout, 12.0),
                    follow_redirects=True,
                    trust_env=False,
                ) as client:
                    response = client.get(url)
                if response.status_code == 404:
                    return "User-agent: *\nAllow: /"
                response.raise_for_status()
                return response.text
            except (httpx.HTTPError, OSError) as exc:
                last_error = exc
                LOG.warning("robots.txt 확인 %s/3회 실패: %s (%s)", attempt, url, exc)
                if attempt < 3:
                    time.sleep(float(attempt))
        raise RuntimeError(f"robots.txt 확인 재시도 실패: {last_error}")

    @staticmethod
    def _approved_when_robots_unavailable(host: str) -> bool:
        allowed = {
            value.strip().lower()
            for value in os.getenv("ROBOTS_UNAVAILABLE_ALLOWED_HOSTS", "").split(",")
            if value.strip()
        }
        return host.lower() in allowed

    def _robot_parser(self, url: str) -> urllib.robotparser.RobotFileParser:
        parsed = urlparse(url)
        origin = f"{parsed.scheme}://{parsed.netloc}"
        if origin not in self._robots:
            parser = urllib.robotparser.RobotFileParser(f"{origin}/robots.txt")
            try:
                body = self._fetch_robots_text(parser.url)
                parser.parse(body.splitlines())
            except Exception as exc:
                if self._approved_when_robots_unavailable(parsed.netloc):
                    LOG.warning(
                        "robots.txt를 확인할 수 없어 승인된 도메인 예외 정책을 적용합니다: %s (%s)",
                        origin,
                        exc,
                    )
                    parser.parse(["User-agent: *", "Allow: /"])
                else:
                    LOG.warning("robots.txt 확인 실패로 안전하게 차단합니다: %s (%s)", origin, exc)
                    parser = urllib.robotparser.RobotFileParser()
                    parser.parse(["User-agent: *", "Disallow: /"])
            self._robots[origin] = parser
        return self._robots[origin]

    def allowed(self, url: str) -> bool:
        return self._robot_parser(url).can_fetch(self.user_agent, url)

    def _request(self, method: str, url: str, **kwargs) -> httpx.Response:
        parser = self._robot_parser(url)
        if not parser.can_fetch(self.user_agent, url):
            raise PermissionError(f"robots.txt에서 수집을 허용하지 않는 URL: {url}")
        host = urlparse(url).netloc
        robots_delay = parser.crawl_delay(self.user_agent) or parser.crawl_delay("*") or 0
        effective_delay = max(self.delay_seconds, float(robots_delay))
        elapsed = time.monotonic() - self._last_request.get(host, 0)
        if elapsed < effective_delay:
            time.sleep(effective_delay - elapsed)
        proxy = next((value for key in ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy") if (value := os.getenv(key)) and urlparse(value).scheme in {"http", "https"}), None)
        verify: bool | str = os.getenv("SSL_CERT_FILE") or True
        if self._client is None:
            self._client = httpx.Client(
                headers={"User-Agent": self.user_agent},
                timeout=self.timeout,
                follow_redirects=True,
                proxy=proxy,
                trust_env=False,
                verify=verify,
            )
        response = self._client.request(method, url, **kwargs)
        self._last_request[host] = time.monotonic()
        response.raise_for_status()
        return response

    def get(self, url: str, **kwargs) -> httpx.Response:
        return self._request("GET", url, **kwargs)

    def post(self, url: str, **kwargs) -> httpx.Response:
        return self._request("POST", url, **kwargs)

    def close(self) -> None:
        if self._client is not None:
            self._client.close()
            self._client = None
