from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

from bs4 import BeautifulSoup

from collector.adapters.base import Adapter
from collector.models import JobPosting
from collector.normalize import normalize_categories, normalize_company, normalize_subcategories, split_job_categories, stable_id

LOG = logging.getLogger(__name__)


class GameJobAdapter(Adapter):
    """게임잡 공개 목록 어댑터. 이용 허가가 확인된 경우에만 활성화한다."""

    name = "게임잡"
    list_url = "https://www.gamejob.co.kr/Recruit/joblist?menucode=searchdetail"
    page_url = "https://www.gamejob.co.kr/Recruit/_GI_Job_List/"
    max_pages = 200
    profile_cache_path = Path(__file__).resolve().parents[2] / "data" / "company-profiles.json"

    def collect(self, enrich_companies: bool = False) -> list[JobPosting]:
        jobs: list[JobPosting] = []
        by_id: dict[str, JobPosting] = {}
        for page in range(1, self.max_pages + 1):
            if page == 1:
                response = self.client.get(self.list_url)
            else:
                response = self.client.post(
                    self.page_url,
                    data={
                        "condition[menucode]": "searchdetail",
                        "page": str(page),
                        "direct": "0",
                        "order": "1",
                        "pagesize": "40",
                        "tabcode": "1",
                    },
                    headers={
                        "Referer": self.list_url,
                        "X-Requested-With": "XMLHttpRequest",
                    },
                )
            soup = BeautifulSoup(response.text, "html.parser")
            rows = soup.select("table.tblList tbody tr")
            if not rows:
                if page == 1:
                    raise RuntimeError("게임잡 목록 선택자와 일치하는 공고가 없습니다. collector/adapters/gamejob.py를 점검하세요.")
                break
            LOG.info("게임잡 목록 %s페이지: %s개 행", page, len(rows))
            new_on_page = 0
            for row in rows:
                link = row.select_one(".tit a[href*='GI_No']")
                if not link or not link.get("href"):
                    continue
                url = urljoin(str(response.url), link["href"])
                job_id = stable_id(url, row.get_text(" ", strip=True))
                onclick = link.get("onclick", "")
                tracked = re.findall(r"IsNullOrWhiteSpace\('([^']*)'\)", onclick)
                original = split_job_categories(tracked[0] if tracked else None)
                subcategories = normalize_subcategories(*original)
                categories = normalize_categories(*original)
                if job_id in by_id:
                    current = by_id[job_id]
                    current.categories = sorted(set(current.categories + categories))
                    current.original_categories = sorted(set(current.original_categories + original))
                    current.job_major_categories = sorted(set(current.job_major_categories + categories))
                    current.job_subcategories = sorted(set(current.job_subcategories + subcategories))
                    continue
                company_link = row.select_one(".company a[href*='/Company/Detail']")
                company_node = row.select_one(".company strong")
                title_node = row.select_one(".tit a strong") or link
                logo_node = row.select_one(".company img")
                info = [x.get_text(" ", strip=True) for x in row.select(".tit .info span")]
                deadline_text = self._text(row, "span.date")
                job = JobPosting(
                    id=job_id,
                    company=normalize_company(company_node.get_text(" ", strip=True) if company_node else None),
                    title=title_node.get_text(" ", strip=True),
                    url=url,
                    categories=categories,
                    original_categories=original,
                    job_major_categories=categories,
                    job_subcategories=subcategories,
                    career=info[0] if info else None,
                    employment_type=info[-1] if info else None,
                    location=info[2] if len(info) > 2 else None,
                    posted_at=self._listing_date(self._text(row, ".modifyDate")),
                    deadline=self._deadline(deadline_text),
                    always_open=bool(deadline_text and ("상시" in deadline_text or "채용시" in deadline_text)),
                    logo_url=urljoin(str(response.url), logo_node.get("src")) if logo_node and logo_node.get("src") else None,
                    company_url=urljoin(str(response.url), company_link.get("href")) if company_link and company_link.get("href") else None,
                    collected_at=datetime.now(timezone.utc).isoformat(),
                )
                jobs.append(job)
                by_id[job_id] = job
                new_on_page += 1
            if new_on_page == 0:
                break
        # 일별 수집에서도 이미 확보한 기업정보 캐시는 항상 다시 적용한다.
        # 월간 수집일 때만 캐시에 없는 기업 상세 페이지를 추가로 조회한다.
        self._apply_company_profiles(jobs, fetch_missing=enrich_companies)
        return jobs

    @staticmethod
    def _text(node, selector: str) -> str | None:
        found = node.select_one(selector)
        return found.get_text(" ", strip=True) if found else None

    @staticmethod
    def _listing_date(value: str | None) -> str | None:
        match = re.search(r"(\d{1,2})/(\d{1,2})", value or "")
        if not match:
            return None
        now = datetime.now()
        return f"{now.year}-{int(match.group(1)):02d}-{int(match.group(2)):02d}"

    @staticmethod
    def _deadline(value: str | None) -> str | None:
        if not value or "상시" in value or "채용시" in value:
            return None
        return GameJobAdapter._listing_date(value)

    def _apply_company_profiles(self, jobs: list[JobPosting], fetch_missing: bool = False) -> None:
        profiles = self._load_profile_cache()
        total = len({job.company_url for job in jobs if job.company_url})
        fetched = 0
        attempted: set[str] = set()
        for job in jobs:
            if not job.company_url:
                continue
            if fetch_missing and not profiles.get(job.company_url) and job.company_url not in attempted:
                attempted.add(job.company_url)
                try:
                    profiles[job.company_url] = self._company_profile(job.company_url)
                    fetched += 1
                    self._save_profile_cache(profiles)
                    if fetched % 25 == 0:
                        LOG.info("새 기업정보 수집: %s개 (전체 대상 %s개)", fetched, total)
                except Exception as exc:
                    LOG.warning("기업정보 수집 실패: %s (%s)", job.company_url, exc)
            profile = profiles.get(job.company_url, {})
            for field in ("logo_url", "representative_game", "company_type", "main_business", "established_year", "employee_count"):
                value = profile.get(field)
                # 상세 조회가 일부 실패해도 목록/CSV에서 이미 얻은 값을 지우지 않는다.
                if value:
                    if field == "logo_url":
                        value = value.replace("\\", "/")
                    setattr(job, field, value)

        LOG.info("기업정보 적용: %s개 대상, 신규 수집 %s개", total, fetched)

    def _enrich_company_profiles(self, jobs: list[JobPosting]) -> None:
        """기존 호출부와 테스트를 위한 호환 래퍼."""
        self._apply_company_profiles(jobs, fetch_missing=True)

    def _load_profile_cache(self) -> dict[str, dict[str, str | None]]:
        if not self.profile_cache_path.exists():
            return {}
        try:
            data = json.loads(self.profile_cache_path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except (OSError, json.JSONDecodeError) as exc:
            LOG.warning("기업정보 캐시 읽기 실패: %s", exc)
            return {}

    def _save_profile_cache(self, profiles: dict[str, dict[str, str | None]]) -> None:
        self.profile_cache_path.parent.mkdir(parents=True, exist_ok=True)
        temp_path = self.profile_cache_path.with_suffix(".tmp")
        temp_path.write_text(json.dumps(profiles, ensure_ascii=False, indent=2), encoding="utf-8")
        temp_path.replace(self.profile_cache_path)

    def _company_profile(self, url: str) -> dict[str, str | None]:
        response = self.client.get(url)
        soup = BeautifulSoup(response.text, "html.parser")
        logo = soup.select_one(".corpHeader .corpLogo img")
        values: dict[str, str | None] = {
            "logo_url": urljoin(str(response.url), logo.get("src")).replace("\\", "/") if logo and logo.get("src") else None,
        }
        fields = {"대표게임": "representative_game", "기업형태": "company_type", "주요사업": "main_business", "설립년도": "established_year", "사원수": "employee_count"}
        for term in soup.select(".corpInfo dt"):
            field = fields.get(term.get_text(" ", strip=True))
            sibling = term.find_next_sibling("dd")
            if field and sibling:
                values[field] = sibling.get_text(" ", strip=True) or None
        return values
