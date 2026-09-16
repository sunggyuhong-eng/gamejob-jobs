from __future__ import annotations

import hashlib
import re
from datetime import date, datetime
from pathlib import Path
from urllib.parse import parse_qs, urlparse, urlunparse

import yaml
from dateutil import parser as date_parser

ROOT = Path(__file__).resolve().parents[1]


def load_yaml(name: str) -> dict:
    with (ROOT / "config" / name).open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def normalize_company(name: str | None) -> str:
    value = re.sub(r"\s+", " ", (name or "").strip())
    aliases = load_yaml("company_aliases.yml").get("aliases", {})
    value = aliases.get(value, value)
    # 법인 표기 차이로 같은 회사가 증감 상·하위에 동시에 잡히지 않도록 한다.
    value = re.sub(r"^(?:\(주\)|㈜|주식회사)\s*", "", value)
    value = re.sub(r"\s*(?:\(주\)|㈜)$", "", value)
    value = re.sub(r"\s+", " ", value).strip()
    return aliases.get(value, value or "회사명 미확인")


def split_multi_value(value: str | None) -> list[str]:
    """쉼표로 함께 표기된 고용형태 등을 개별 값으로 정규화한다."""
    return split_job_categories(value)


def split_job_categories(*values: str | None) -> list[str]:
    """게임잡이 제공한 직무명을 보존하며 목록 구분자만 정리한다."""
    result: list[str] = []
    for value in values:
        for item in re.split(r"[;,]", value or ""):
            clean = re.sub(r"\s+", " ", item).strip()
            if clean and clean not in result:
                result.append(clean)
    return result


def normalize_categories(*source_categories: str | None) -> list[str]:
    """게임잡 원문 소분류를 설정 파일의 대분류로 매핑한다.

    제목 키워드로 별도 직무를 추측하지 않으므로 원문에 없는 직무가 생기지 않는다.
    """
    values = split_job_categories(*source_categories)
    mapping = load_yaml("job_categories.yml").get("major_categories", {})
    reverse = {minor: major for major, minors in mapping.items() for minor in minors}
    major_names = set(mapping)
    found: list[str] = []
    for value in values:
        major = value if value in major_names else reverse.get(value)
        if major and major not in found:
            found.append(major)
    return found or ["기타"]


def normalize_subcategories(*source_categories: str | None) -> list[str]:
    """추적값에 함께 섞여 온 대분류명은 빼고 실제 소분류만 반환한다."""
    values = split_job_categories(*source_categories)
    major_names = set(load_yaml("job_categories.yml").get("major_categories", {}))
    return [value for value in values if value not in major_names]


def normalize_date(value: str | None) -> str | None:
    if not value or not value.strip():
        return None
    clean = value.strip().replace("년", "-").replace("월", "-").replace("일", "")
    try:
        parsed = date_parser.parse(clean, fuzzy=True, default=datetime(date.today().year, 1, 1))
        return parsed.date().isoformat()
    except (ValueError, OverflowError):
        return None


def career_bucket(value: str | None) -> str:
    text = (value or "").lower()
    if not text:
        return "미확인"
    if "신입" in text and "경력" in text:
        return "신입·경력"
    if "신입" in text:
        return "신입"
    numbers = [int(x) for x in re.findall(r"\d+", text)]
    years = numbers[0] if numbers else None
    if years is None:
        return "경력(연차 미확인)" if "경력" in text else "미확인"
    if years <= 2:
        return "경력 1~2년"
    if years <= 5:
        return "경력 3~5년"
    if years <= 10:
        return "경력 6~10년"
    return "경력 11년 이상"


def canonical_url(url: str) -> str:
    parsed = urlparse(url)
    keep = {}
    for key in ("GI_No", "No", "id", "idx"):
        values = parse_qs(parsed.query).get(key)
        if values:
            keep[key] = values[0]
    query = "&".join(f"{k}={v}" for k, v in sorted(keep.items()))
    return urlunparse((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path.rstrip("/"), "", query, ""))


def stable_id(url: str, fallback: str = "") -> str:
    parsed = urlparse(url)
    params = parse_qs(parsed.query)
    for key in ("GI_No", "No", "id", "idx"):
        if params.get(key):
            return f"{parsed.netloc}:{params[key][0]}"
    return hashlib.sha256((canonical_url(url) or fallback).encode()).hexdigest()[:20]
