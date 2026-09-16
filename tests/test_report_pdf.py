from pathlib import Path

from pypdf import PdfReader

from collector.report_pdf import build_report_pdf


def test_pdf_summary_is_generated(tmp_path: Path):
    report = {
        "period": "2026-09", "baseline_period": "2026-08", "current_period": "2026-09",
        "comparison_label": "2026-08 → 2026-09", "generated_at": "2026-09-16T00:00:00Z",
        "statistics": {
            "previous_total": 1497, "total_open": 1554, "change": 57,
            "new_count": 493, "maintained_count": 1061, "closed_count": 436,
            "by_category": [{"name": "게임제작", "previous": 1182, "current": 1210, "change": 28}],
            "by_company": [{"name": "스마일게이트", "previous": 54, "current": 77, "change": 23}],
        },
        "analysis": {"outlook": "채용은 완만하게 증가했다.", "highlights": ["게임제작 수요가 유지됐다."], "company_insights": [], "news_signals": [], "watchlist": [], "limitations": []},
    }
    output = tmp_path / "summary.pdf"
    build_report_pdf(report, output)
    reader = PdfReader(output)
    assert output.stat().st_size > 10_000
    assert len(reader.pages) >= 4
