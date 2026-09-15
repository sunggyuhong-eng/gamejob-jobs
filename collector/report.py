from __future__ import annotations

import json
import os
import re

from anthropic import Anthropic

from collector.pipeline import ROOT, read_json, write_json

SYSTEM = (ROOT / "config" / "report_prompt.md").read_text(encoding="utf-8").strip()


def generate(month: str) -> dict:
    report_path = ROOT / "data" / "reports" / f"{month}.json"
    payload = read_json(report_path)
    if not payload:
        raise FileNotFoundError(f"분석 데이터 없음: {report_path}")
    analysis_input = _compact_payload(payload)
    payload["methodology"] = build_methodology(payload, analysis_input)
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        payload.update({"status": "pending_api_key", "error": "ANTHROPIC_API_KEY가 없어 Claude 리포트를 생성하지 않았습니다.", "markdown": None})
        write_json(report_path, payload)
        write_json(ROOT / "data" / "reports" / "latest.json", payload)
        return payload
    model = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-5")
    response = Anthropic(api_key=api_key).messages.create(
        model=model,
        max_tokens=6000,
        system=SYSTEM,
        messages=[{"role": "user", "content": json.dumps(analysis_input, ensure_ascii=False)}],
    )
    markdown = "".join(block.text for block in response.content if getattr(block, "type", None) == "text").strip()
    if not markdown:
        raise RuntimeError("Claude가 비어 있는 리포트를 반환했습니다.")
    payload.update({"status": "complete", "provider": "anthropic", "model": model, "markdown": markdown, "error": None})
    write_json(report_path, payload)
    write_json(ROOT / "data" / "reports" / "latest.json", payload)
    reports = ROOT / "reports"
    reports.mkdir(exist_ok=True)
    (reports / f"{month}.md").write_text(markdown, encoding="utf-8")
    return payload


def build_methodology(payload: dict, analysis_input: dict | None = None) -> dict:
    analysis_input = analysis_input or _compact_payload(payload)
    stats = payload.get("statistics") or {}
    selected_news = analysis_input.get("news") or []
    dates = sorted(x.get("published_at") for x in selected_news if x.get("published_at"))
    return {
        "prompt_version": "2026-09-15-v1",
        "system_prompt": SYSTEM,
        "evidence": {
            "baseline_period": payload.get("baseline_period"),
            "current_period": payload.get("current_period") or payload.get("period"),
            "previous_open_jobs": stats.get("previous_total"),
            "current_open_jobs": stats.get("total_open"),
            "job_examples_sent": len(analysis_input.get("job_examples") or []),
            "news_candidates": len(payload.get("news") or []),
            "news_sent_to_model": len(selected_news),
            "news_date_from": dates[0] if dates else None,
            "news_date_to": dates[-1] if dates else None,
        },
        "rules": [
            "공고 고유번호로 신규·유지·종료를 판정",
            "게임잡 원문 소분류를 설정 파일의 대분류로 매핑",
            "채용 변화가 큰 회사 및 프로젝트·경영 이슈 뉴스를 우선 선택",
            "직접 근거·관련 가능성·근거 부족을 구분하고 인과를 단정하지 않음",
        ],
        "input_description": "집계 통계(회사·직무·경력·지역·고용형태), 원문 링크가 있는 대표 공고 최대 50건, 관련도 순 게임잡 뉴스 최대 120건",
    }


def _compact_payload(payload: dict) -> dict:
    """모델 입력에 필요한 집계·출처만 남겨 토큰과 개인정보 노출을 줄인다."""
    stats = dict(payload.get("statistics") or {})
    for key in ("new_ids", "maintained_ids", "closed_ids"):
        stats.pop(key, None)
    for key in ("by_company", "by_category", "by_career", "by_location", "by_employment_type", "company_category"):
        if isinstance(stats.get(key), list):
            stats[key] = stats[key][:100]
    return {
        "period": payload.get("period"),
        "statistics": stats,
        "job_examples": (payload.get("job_examples") or [])[:50],
        "news": _select_relevant_news(payload.get("news") or [], stats),
        "interpretation_rule": {
            "confirmed": "기사에 채용 확대·축소가 직접 명시되고 데이터 변화도 일치",
            "possible": "회사·프로젝트와 시점은 일치하지만 인과관계는 확인되지 않음",
            "unknown": "연결 근거가 부족하여 추가 확인 필요",
        },
    }


def _select_relevant_news(news: list[dict], stats: dict) -> list[dict]:
    """채용 변화가 큰 회사와 주요 경영·프로젝트 이슈를 우선해 모델 입력을 제한한다."""
    company_changes = sorted(
        stats.get("by_company") or [],
        key=lambda row: abs(row.get("change") or 0),
        reverse=True,
    )[:80]
    company_names = [row.get("name", "") for row in company_changes if row.get("name")]
    company_variants = {
        re.sub(r"\s+", "", re.sub(r"\(주\)|㈜|주식회사", "", name)).lower()
        for name in company_names
    }
    important_issues = {
        "신작 출시", "투자·인수합병", "실적 발표", "구조조정·권고사직", "조직 개편",
        "채용 확대", "채용 축소", "프로젝트 중단", "사업 철수", "해외 진출", "정책·규제",
    }

    def score(item: dict) -> tuple[int, str]:
        text = f"{item.get('title', '')} {item.get('summary', '')}".lower()
        compact_text = re.sub(r"\s+", "", text)
        company_score = sum(5 for name in company_variants if len(name) >= 2 and name in compact_text)
        issue_score = 3 if item.get("issue_type") in important_issues else 0
        return company_score + issue_score, item.get("published_at") or ""

    selected = sorted(news, key=score, reverse=True)[:120]
    return [
        {key: item.get(key) for key in ("source", "title", "url", "published_at", "summary", "issue_type")}
        for item in selected
    ]
