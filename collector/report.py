from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone

try:
    import httpx
except ModuleNotFoundError:  # 데이터 재계산만 할 때는 API 클라이언트가 필요 없다.
    httpx = None

from collector.pipeline import ROOT, read_json, write_json

SYSTEM = (ROOT / "config" / "report_prompt.md").read_text(encoding="utf-8").strip()

REPORT_SCHEMA = {
    "type": "object",
    "properties": {
        "outlook": {"type": "string"},
        "market_comment": {"type": "string"},
        "highlights": {"type": "array", "items": {"type": "string"}},
        "job_insights": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "direction": {"type": "string", "enum": ["강세", "약세", "보합"]},
                    "comment": {"type": "string"},
                },
                "required": ["name", "direction", "comment"],
                "additionalProperties": False,
            },
        },
        "company_insights": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "direction": {"type": "string", "enum": ["증가", "감소", "보합"]},
                    "comment": {"type": "string"},
                    "evidence_level": {"type": "string", "enum": ["직접 근거", "관련 가능성", "근거 부족"]},
                    "job_ids": {"type": "array", "items": {"type": "string"}},
                    "news_urls": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["name", "direction", "comment", "evidence_level", "job_ids", "news_urls"],
                "additionalProperties": False,
            },
        },
        "news_signals": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "company": {"type": "string"},
                    "headline": {"type": "string"},
                    "comment": {"type": "string"},
                    "evidence_level": {"type": "string", "enum": ["직접 근거", "관련 가능성", "근거 부족"]},
                    "news_urls": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["company", "headline", "comment", "evidence_level", "news_urls"],
                "additionalProperties": False,
            },
        },
        "watchlist": {"type": "array", "items": {"type": "string"}},
        "limitations": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["outlook", "market_comment", "highlights", "job_insights", "company_insights", "news_signals", "watchlist", "limitations"],
    "additionalProperties": False,
}


def generate(month: str) -> dict:
    report_path = ROOT / "data" / "reports" / f"{month}.json"
    payload = read_json(report_path)
    if not payload:
        raise FileNotFoundError(f"분석 데이터 없음: {report_path}")
    _hydrate_saved_news(payload, month)
    analysis_input = _compact_payload(payload)
    payload["methodology"] = build_methodology(payload, analysis_input)
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        payload.update({"status": "pending_api_key", "error": "OPENAI_API_KEY가 없어 GPT 리포트를 생성하지 않았습니다.", "analysis": None, "markdown": None})
        write_json(report_path, payload)
        write_json(ROOT / "data" / "reports" / "latest.json", payload)
        raise RuntimeError("OPENAI_API_KEY가 없습니다. GitHub Actions Secret을 확인하세요.")
    model = os.getenv("OPENAI_MODEL", "gpt-5.5")
    if httpx is None:
        raise RuntimeError("OpenAI API 호출에 필요한 httpx가 설치되지 않았습니다.")
    request_body = {
            "model": model,
            "reasoning": {"effort": "low"},
            "instructions": SYSTEM,
            "input": json.dumps(analysis_input, ensure_ascii=False),
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "game_hiring_market_report",
                    "strict": True,
                    "schema": REPORT_SCHEMA,
                }
            },
    }
    result: dict | None = None
    for attempt, token_limit in enumerate((25_000, 40_000), start=1):
        request_body["max_output_tokens"] = token_limit
        response = httpx.post(
            "https://api.openai.com/v1/responses",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=request_body,
            timeout=900,
        )
        if not response.is_success:
            try:
                message = response.json().get("error", {}).get("message") or response.text
            except ValueError:
                message = response.text
            request_id = response.headers.get("x-request-id") or "없음"
            raise RuntimeError(f"OpenAI API 오류 {response.status_code}: {message} (request_id: {request_id})")
        result = response.json()
        if result.get("status") != "incomplete":
            break
        reason = (result.get("incomplete_details") or {}).get("reason") or "알 수 없음"
        if reason == "max_output_tokens" and attempt == 1:
            print("GPT 출력 한도에 도달해 더 큰 한도로 한 번 재시도합니다.")
            continue
        raise RuntimeError(f"GPT 리포트 출력이 완료되기 전에 중단되었습니다: {reason}")
    if result is None:
        raise RuntimeError("OpenAI API 응답을 받지 못했습니다.")
    response_text = _response_text(result).strip()
    if not response_text:
        raise RuntimeError("GPT가 비어 있는 리포트를 반환했습니다.")
    try:
        analysis = json.loads(response_text)
    except json.JSONDecodeError as exc:
        raise RuntimeError("GPT가 올바른 구조의 리포트를 반환하지 않았습니다.") from exc
    analysis = _sanitize_analysis(analysis, payload)
    markdown = _analysis_markdown(analysis, payload)
    payload.update({
        "status": "complete",
        "provider": "openai",
        "model": model,
        "report_schema_version": 3,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "analysis": analysis,
        "markdown": markdown,
        "error": None,
    })
    write_json(report_path, payload)
    write_json(ROOT / "data" / "reports" / "latest.json", payload)
    reports = ROOT / "reports"
    reports.mkdir(exist_ok=True)
    (reports / f"{month}.md").write_text(markdown, encoding="utf-8")
    return payload


def _sanitize_analysis(analysis: dict, payload: dict) -> dict:
    if not isinstance(analysis, dict):
        raise RuntimeError("GPT 리포트 구조가 객체가 아닙니다.")

    def clean(value: object) -> str:
        text = str(value or "").strip()
        text = re.sub("null", "비교 데이터 없음", text, flags=re.IGNORECASE)
        text = re.sub(r"\[([^\]]+)]\([^)]+\)", r"\1", text)
        return text

    allowed_jobs = {str(job.get("id")) for job in payload.get("job_examples") or [] if job.get("id")}
    allowed_news = {str(item.get("url")) for item in payload.get("news") or [] if item.get("url")}
    allowed_companies = {str(row.get("name")) for row in (payload.get("statistics") or {}).get("by_company") or [] if row.get("name")}

    sanitized = {
        "outlook": clean(analysis.get("outlook")),
        "market_comment": clean(analysis.get("market_comment")),
        "highlights": [clean(x) for x in (analysis.get("highlights") or [])[:4] if clean(x)],
        "job_insights": [],
        "company_insights": [],
        "news_signals": [],
        "watchlist": [clean(x) for x in (analysis.get("watchlist") or [])[:4] if clean(x)],
        "limitations": [clean(x) for x in (analysis.get("limitations") or [])[:4] if clean(x)],
    }
    for item in (analysis.get("job_insights") or [])[:6]:
        if not isinstance(item, dict) or not clean(item.get("name")):
            continue
        sanitized["job_insights"].append({
            "name": clean(item.get("name")),
            "direction": item.get("direction") if item.get("direction") in {"강세", "약세", "보합"} else "보합",
            "comment": clean(item.get("comment")),
        })
    for item in (analysis.get("company_insights") or [])[:6]:
        if not isinstance(item, dict) or clean(item.get("name")) not in allowed_companies:
            continue
        sanitized["company_insights"].append({
            "name": clean(item.get("name")),
            "direction": item.get("direction") if item.get("direction") in {"증가", "감소", "보합"} else "보합",
            "comment": clean(item.get("comment")),
            "evidence_level": item.get("evidence_level") if item.get("evidence_level") in {"직접 근거", "관련 가능성", "근거 부족"} else "근거 부족",
            "job_ids": [str(x) for x in (item.get("job_ids") or []) if str(x) in allowed_jobs][:2],
            "news_urls": [str(x) for x in (item.get("news_urls") or []) if str(x) in allowed_news][:2],
        })
    for item in (analysis.get("news_signals") or [])[:5]:
        if not isinstance(item, dict):
            continue
        urls = [str(x) for x in (item.get("news_urls") or []) if str(x) in allowed_news][:2]
        sanitized["news_signals"].append({
            "company": clean(item.get("company")),
            "headline": clean(item.get("headline")),
            "comment": clean(item.get("comment")),
            "evidence_level": item.get("evidence_level") if item.get("evidence_level") in {"직접 근거", "관련 가능성", "근거 부족"} else "근거 부족",
            "news_urls": urls,
        })
    return sanitized


def _analysis_markdown(analysis: dict, payload: dict) -> str:
    jobs = {str(job.get("id")): job for job in payload.get("job_examples") or []}
    news = {str(item.get("url")): item for item in payload.get("news") or []}

    def esc(value: object) -> str:
        return str(value or "").replace("[", "\\[").replace("]", "\\]")

    lines = [f"# {esc(analysis.get('outlook'))}", "", esc(analysis.get("market_comment")), "", "## 핵심 포인트"]
    lines += [f"- {esc(item)}" for item in analysis.get("highlights") or []]
    lines += ["", "## 직무 강세·약세"]
    lines += [f"- **{esc(item['name'])} · {item['direction']}** — {esc(item['comment'])}" for item in analysis.get("job_insights") or []]
    lines += ["", "## 회사별 채용 모멘텀"]
    for item in analysis.get("company_insights") or []:
        lines.append(f"### {esc(item['name'])} · {item['direction']}")
        lines.append(f"{esc(item['comment'])} *(뉴스 근거: {item['evidence_level']})*")
        for job_id in item.get("job_ids") or []:
            job = jobs.get(job_id) or {}
            if job.get("url"):
                lines.append(f"- [{esc(job.get('title') or '공고 원문')}]({job['url']})")
        for url in item.get("news_urls") or []:
            article = news.get(url) or {}
            lines.append(f"- [{esc(article.get('title') or '뉴스 원문')}]({url})")
    lines += ["", "## 뉴스와 채용 시그널"]
    for item in analysis.get("news_signals") or []:
        lines.append(f"- **{esc(item['company'])} · {item['evidence_level']}** — {esc(item['headline'])}: {esc(item['comment'])}")
        for url in item.get("news_urls") or []:
            article = news.get(url) or {}
            lines.append(f"  - [{esc(article.get('title') or '뉴스 원문')}]({url})")
    lines += ["", "## 다음 기간 Watchlist"]
    lines += [f"- {esc(item)}" for item in analysis.get("watchlist") or []]
    lines += ["", "## 데이터 한계"]
    lines += [f"- {esc(item)}" for item in analysis.get("limitations") or []]
    return "\n".join(lines).strip() + "\n"


def _hydrate_saved_news(payload: dict, month: str) -> list[dict]:
    """월간 비교 재적용 과정에서 비어 버린 뉴스는 저장된 뉴스 스냅샷으로 복구한다."""
    if payload.get("news"):
        return payload["news"]
    saved = read_json(ROOT / "data" / "news" / f"{month}.json", {})
    items = saved.get("items") if isinstance(saved, dict) else None
    payload["news"] = items if isinstance(items, list) else []
    return payload["news"]


def _response_text(result: dict) -> str:
    if result.get("output_text"):
        return str(result["output_text"])
    texts: list[str] = []
    for item in result.get("output") or []:
        for content in item.get("content") or []:
            if content.get("type") == "output_text" and content.get("text"):
                texts.append(str(content["text"]))
    return "".join(texts)


def build_methodology(payload: dict, analysis_input: dict | None = None) -> dict:
    analysis_input = analysis_input or _compact_payload(payload)
    stats = payload.get("statistics") or {}
    selected_news = analysis_input.get("news") or []
    dates = sorted(x.get("published_at") for x in selected_news if x.get("published_at"))
    return {
        "prompt_version": "2026-09-17-structured-brief-v4",
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
        "input_description": "전체 공고와 전체 뉴스의 메타데이터·원문 링크, 회사·직무·경력·지역·고용형태 전체 집계",
    }


def _compact_payload(payload: dict) -> dict:
    """고유번호 목록만 제거하고 모든 집계·공고·뉴스 근거를 모델에 전달한다."""
    stats = dict(payload.get("statistics") or {})
    for key in ("new_ids", "maintained_ids", "closed_ids"):
        stats.pop(key, None)
    return {
        "period": payload.get("period"),
        "statistics": stats,
        "job_examples": payload.get("job_examples") or [],
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

    selected = sorted(news, key=score, reverse=True)
    return [
        {key: item.get(key) for key in ("source", "title", "url", "published_at", "summary", "issue_type")}
        for item in selected
    ]
