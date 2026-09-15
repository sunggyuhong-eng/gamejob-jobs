from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any


@dataclass
class JobPosting:
    id: str
    company: str
    title: str
    url: str
    categories: list[str] = field(default_factory=list)
    original_categories: list[str] = field(default_factory=list)
    job_major_categories: list[str] = field(default_factory=list)
    job_subcategories: list[str] = field(default_factory=list)
    career: str | None = None
    education: str | None = None
    employment_type: str | None = None
    location: str | None = None
    posted_at: str | None = None
    deadline: str | None = None
    always_open: bool = False
    logo_url: str | None = None
    representative_game: str | None = None
    company_url: str | None = None
    company_type: str | None = None
    main_business: str | None = None
    established_year: str | None = None
    employee_count: str | None = None
    company_ceo: str | None = None
    company_homepage: str | None = None
    collected_at: str = ""
    source: str = "게임잡"
    status: str = "open"

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class NewsItem:
    id: str
    source: str
    title: str
    url: str
    published_at: str | None = None
    summary: str | None = None
    companies: list[str] = field(default_factory=list)
    games: list[str] = field(default_factory=list)
    keywords: list[str] = field(default_factory=list)
    issue_type: str = "기타"
    related_sources: list[dict[str, str]] = field(default_factory=list)
    collected_at: str = ""

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)
