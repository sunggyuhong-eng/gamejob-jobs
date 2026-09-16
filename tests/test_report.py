import json

import httpx
import pytest

import collector.report as report_module
from collector.report import _compact_payload, _hydrate_saved_news, _response_text, _sanitize_analysis, _select_relevant_news


def structured_result(**overrides):
    analysis = {
        "outlook": "채용은 완만하게 증가했다.",
        "market_comment": "신규 공고가 종료 공고보다 많았다.",
        "highlights": ["게임제작 수요가 중심이다."],
        "job_insights": [{"name": "게임제작", "direction": "강세", "comment": "제작 수요가 증가했다."}],
        "company_insights": [],
        "news_signals": [],
        "watchlist": ["다음 기간 유지 여부를 확인한다."],
        "limitations": ["두 기간 비교다."],
    }
    analysis.update(overrides)
    return {"output": [{"content": [{"type": "output_text", "text": json.dumps(analysis, ensure_ascii=False)}]}]}


def test_report_payload_removes_large_id_lists():
    jobs = [{"title": f"공고 {i}", "url": f"https://example.com/{i}", "company": "A"} for i in range(155)]
    compact = _compact_payload({
        "period": "2026-09",
        "statistics": {"total_open": 2, "new_ids": ["a", "b"], "by_company": [{"name": str(i)} for i in range(110)]},
        "job_examples": jobs,
    })
    assert "new_ids" not in compact["statistics"]
    assert len(compact["statistics"]["by_company"]) == 110
    assert len(compact["job_examples"]) == 155


def test_company_related_news_is_prioritized():
    stats = {"by_company": [{"name": "테스트게임즈", "change": 12}]}
    news = [
        {"title": "일반 게임 행사 개최", "summary": "", "published_at": "2026-09-15", "issue_type": "기타"},
        {"title": "테스트게임즈 신작 출시", "summary": "프로젝트 공개", "published_at": "2026-09-14", "issue_type": "신작 출시"},
    ]
    assert _select_relevant_news(news, stats)[0]["title"] == "테스트게임즈 신작 출시"


def test_all_news_are_preserved_after_prioritizing():
    stats = {"by_company": []}
    news = [{"title": f"뉴스 {i}", "published_at": "2026-09-15", "issue_type": "기타"} for i in range(135)]
    assert len(_select_relevant_news(news, stats)) == 135


def test_empty_report_news_are_restored_from_saved_month(tmp_path, monkeypatch):
    monkeypatch.setattr(report_module, "ROOT", tmp_path)
    news_path = tmp_path / "data" / "news" / "2026-09.json"
    news_path.parent.mkdir(parents=True)
    news_path.write_text(json.dumps({"period": "2026-09", "items": [{"title": "저장된 뉴스"}]}), encoding="utf-8")
    payload = {"period": "2026-09", "news": []}
    assert _hydrate_saved_news(payload, "2026-09") == [{"title": "저장된 뉴스"}]
    assert payload["news"][0]["title"] == "저장된 뉴스"


def test_missing_api_key_fails_instead_of_green_success(tmp_path, monkeypatch):
    monkeypatch.setattr(report_module, "ROOT", tmp_path)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    path = tmp_path / "data" / "reports" / "2026-09.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"period": "2026-09", "statistics": {}, "job_examples": [], "news": []}), encoding="utf-8")
    with pytest.raises(RuntimeError, match="OPENAI_API_KEY"):
        report_module.generate("2026-09")
    saved = json.loads(path.read_text(encoding="utf-8"))
    assert saved["status"] == "pending_api_key"


def test_responses_api_output_text_is_extracted():
    result = {"output": [{"type": "message", "content": [{"type": "output_text", "text": "# 월간 리포트"}]}]}
    assert _response_text(result) == "# 월간 리포트"


def test_generate_uses_openai_responses_api(tmp_path, monkeypatch):
    monkeypatch.setattr(report_module, "ROOT", tmp_path)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("OPENAI_MODEL", "gpt-test")
    path = tmp_path / "data" / "reports" / "2026-09.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"period": "2026-09", "statistics": {}, "job_examples": [], "news": []}), encoding="utf-8")
    captured = {}

    def fake_post(url, **kwargs):
        captured.update({"url": url, **kwargs})
        return httpx.Response(200, json=structured_result())

    monkeypatch.setattr(report_module.httpx, "post", fake_post)
    result = report_module.generate("2026-09")
    assert captured["url"] == "https://api.openai.com/v1/responses"
    assert captured["json"]["model"] == "gpt-test"
    assert captured["json"]["max_output_tokens"] == 25_000
    assert captured["json"]["reasoning"] == {"effort": "low"}
    assert captured["json"]["text"]["format"]["type"] == "json_schema"
    assert captured["json"]["text"]["format"]["strict"] is True
    assert captured["headers"]["Authorization"] == "Bearer test-key"
    assert result["provider"] == "openai"
    assert result["report_schema_version"] == 3
    assert result["generated_at"]
    assert result["analysis"]["outlook"] == "채용은 완만하게 증가했다."
    assert "# 채용은 완만하게 증가했다." in result["markdown"]


def test_structured_analysis_removes_null_and_unknown_links():
    payload = {
        "statistics": {"by_company": [{"name": "테스트게임즈"}]},
        "job_examples": [{"id": "job-1", "url": "https://example.com/job"}],
        "news": [{"url": "https://example.com/news"}],
    }
    analysis = structured_result(
        outlook="previous가 null입니다.",
        company_insights=[{
            "name": "테스트게임즈", "direction": "증가", "comment": "[깨진 링크](https://bad.example)를 확인했다.",
            "evidence_level": "관련 가능성", "job_ids": ["job-1", "unknown"],
            "news_urls": ["https://example.com/news", "https://bad.example"],
        }],
    )["output"][0]["content"][0]["text"]
    cleaned = _sanitize_analysis(json.loads(analysis), payload)
    assert "null" not in cleaned["outlook"]
    assert cleaned["company_insights"][0]["comment"] == "깨진 링크를 확인했다."
    assert cleaned["company_insights"][0]["job_ids"] == ["job-1"]
    assert cleaned["company_insights"][0]["news_urls"] == ["https://example.com/news"]


def test_incomplete_response_is_not_saved_as_complete(tmp_path, monkeypatch):
    monkeypatch.setattr(report_module, "ROOT", tmp_path)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    path = tmp_path / "data" / "reports" / "2026-09.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"period": "2026-09", "statistics": {}, "job_examples": [], "news": []}), encoding="utf-8")

    def fake_post(url, **kwargs):
        return httpx.Response(200, json={"status": "incomplete", "incomplete_details": {"reason": "max_output_tokens"}, "output": []})

    monkeypatch.setattr(report_module.httpx, "post", fake_post)
    with pytest.raises(RuntimeError, match="max_output_tokens"):
        report_module.generate("2026-09")


def test_max_output_tokens_retries_once_with_larger_limit(tmp_path, monkeypatch):
    monkeypatch.setattr(report_module, "ROOT", tmp_path)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    path = tmp_path / "data" / "reports" / "2026-09.json"
    path.parent.mkdir(parents=True)
    path.write_text(json.dumps({"period": "2026-09", "statistics": {}, "job_examples": [], "news": []}), encoding="utf-8")
    limits = []

    def fake_post(url, **kwargs):
        limits.append(kwargs["json"]["max_output_tokens"])
        if len(limits) == 1:
            return httpx.Response(200, json={"status": "incomplete", "incomplete_details": {"reason": "max_output_tokens"}, "output": []})
        return httpx.Response(200, json=structured_result())

    monkeypatch.setattr(report_module.httpx, "post", fake_post)
    result = report_module.generate("2026-09")
    assert limits == [25_000, 40_000]
    assert result["status"] == "complete"
