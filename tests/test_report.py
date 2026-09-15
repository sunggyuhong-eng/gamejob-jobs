from collector.report import _compact_payload, _select_relevant_news


def test_report_payload_removes_large_id_lists():
    compact = _compact_payload({
        "period": "2026-09",
        "statistics": {"total_open": 2, "new_ids": ["a", "b"], "by_company": [{"name": str(i)} for i in range(110)]},
        "job_examples": [{"title": "공고", "url": "https://example.com", "company": "A"}],
    })
    assert "new_ids" not in compact["statistics"]
    assert len(compact["statistics"]["by_company"]) == 100
    assert compact["job_examples"][0]["title"] == "공고"


def test_company_related_news_is_prioritized():
    stats = {"by_company": [{"name": "테스트게임즈", "change": 12}]}
    news = [
        {"title": "일반 게임 행사 개최", "summary": "", "published_at": "2026-09-15", "issue_type": "기타"},
        {"title": "테스트게임즈 신작 출시", "summary": "프로젝트 공개", "published_at": "2026-09-14", "issue_type": "신작 출시"},
    ]
    assert _select_relevant_news(news, stats)[0]["title"] == "테스트게임즈 신작 출시"
