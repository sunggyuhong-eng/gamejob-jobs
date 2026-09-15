from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from collector.adapters.base import Adapter
from collector.models import NewsItem
from collector.normalize import normalize_date, stable_id

ISSUES = {
    "신작 출시": ["출시", "론칭", "신작", "사전예약"],
    "투자·인수합병": ["투자", "인수", "합병", "m&a", "지분"],
    "실적 발표": ["실적", "매출", "영업이익", "적자", "흑자"],
    "구조조정·권고사직": ["구조조정", "권고사직", "감원", "희망퇴직"],
    "조직 개편": ["조직개편", "조직 개편", "대표 선임", "대표 교체"],
    "채용 확대": ["채용 확대", "공채", "인재 영입"],
    "채용 축소": ["채용 축소", "채용 중단"],
    "프로젝트 중단": ["개발 중단", "프로젝트 중단", "개발 취소"],
    "사업 철수": ["철수", "서비스 종료", "사업 종료"],
    "해외 진출": ["해외 진출", "글로벌 출시", "글로벌 서비스"],
    "정책·규제": ["규제", "법안", "정책"],
}


def classify_issue(text: str) -> str:
    lower = text.lower()
    return next((issue for issue, words in ISSUES.items() if any(word in lower for word in words)), "기타")


class GameJobNewsAdapter(Adapter):
    """월간 리포트용 게임잡 업계뉴스 메타데이터 수집기."""

    name = "게임잡 업계뉴스"
    url = "https://www.gamejob.co.kr/Community/news?Comm_Stat=0"
    max_pages = 80
    lookback_days = 45

    def collect(self) -> list[NewsItem]:
        cutoff = (datetime.now().date() - timedelta(days=self.lookback_days)).isoformat()
        items: dict[str, NewsItem] = {}
        for page in range(1, self.max_pages + 1):
            separator = "&" if "?" in self.url else "?"
            page_url = self.url if page == 1 else f"{self.url}{separator}NowPage={page}"
            response = self.client.get(page_url)
            soup = BeautifulSoup(response.text, "html.parser")
            page_dates: list[str] = []
            for link in soup.select("a[href*='/Community/news/detail']"):
                href = link.get("href", "")
                if not re.search(r"[?&]idx=\d+", href):
                    continue
                container = link.find_parent("li") or link
                context = re.sub(r"\s+", " ", container.get_text(" ", strip=True)).strip()
                date_match = re.search(r"20\d{2}[./-]\d{1,2}[./-]\d{1,2}", context)
                published_at = normalize_date(date_match.group(0)) if date_match else None
                if not published_at:  # 날짜 없는 주간 BEST 제외
                    continue
                page_dates.append(published_at)
                if published_at < cutoff:
                    continue
                title_node = link.select_one("strong, .title, .tit")
                title = re.sub(r"\s+", " ", (title_node or link).get_text(" ", strip=True)).strip()
                if len(title) < 8:
                    continue
                url = urljoin(str(response.url), href)
                item_id = stable_id(url, title)
                summary = context.replace(title, "", 1)
                summary = re.sub(r"20\d{2}[./-]\d{1,2}[./-]\d{1,2}\s*$", "", summary).strip(" -|·")[:220] or None
                items[item_id] = NewsItem(
                    id=item_id,
                    source=self.name,
                    title=title,
                    url=url,
                    published_at=published_at,
                    summary=summary,
                    issue_type=classify_issue(f"{title} {summary or ''}"),
                    related_sources=[{"source": self.name, "url": url}],
                    collected_at=datetime.now(timezone.utc).isoformat(),
                )
            if page_dates and min(page_dates) < cutoff:
                break
        if not items:
            raise RuntimeError("게임잡 업계뉴스에서 날짜가 확인되는 기사를 찾지 못했습니다.")
        return sorted(items.values(), key=lambda item: (item.published_at or "", item.id), reverse=True)
