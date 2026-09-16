from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from collector.pipeline import ROOT, compare, read_json, stable_job_id, update_category_history, write_json
from collector.normalize import normalize_categories, normalize_company, normalize_subcategories
from collector.report import build_methodology


def main() -> None:
    parser = argparse.ArgumentParser(description="두 월간 JSON을 공식 비교 데이터로 적용")
    parser.add_argument("baseline", type=Path, help="이전 월 JSON")
    parser.add_argument("current", type=Path, help="현재 월 JSON")
    args = parser.parse_args()

    baseline = read_json(args.baseline, {})
    current = read_json(args.current, {})
    for name, payload in (("이전 월", baseline), ("현재 월", current)):
        if not payload.get("period") or not isinstance(payload.get("jobs"), list):
            raise ValueError(f"{name} JSON에 period 또는 jobs 배열이 없습니다.")

    baseline_period = baseline["period"][:7]
    current_period = current["period"][:7]
    baseline["period"] = baseline_period
    current["period"] = current_period
    for payload in (baseline, current):
        for job in payload["jobs"]:
            job["id"] = stable_job_id(job)
            job["company"] = normalize_company(job.get("company"))
            raw_categories = job.get("job_subcategories") or job.get("original_categories") or job.get("categories") or []
            subcategories = normalize_subcategories(*raw_categories)
            major_categories = normalize_categories(*(subcategories or raw_categories))
            job["original_categories"] = list(raw_categories)
            job["job_subcategories"] = subcategories
            job["job_major_categories"] = major_categories
            job["categories"] = major_categories

    snapshots = ROOT / "data" / "snapshots"
    snapshots.mkdir(parents=True, exist_ok=True)
    for path in snapshots.glob("*.json"):
        path.unlink()
    write_json(snapshots / f"{baseline_period}.json", baseline)
    write_json(snapshots / f"{current_period}.json", current)

    for directory in (ROOT / "data" / "daily", ROOT / "data" / "comparisons"):
        directory.mkdir(parents=True, exist_ok=True)
        for path in directory.glob("*.json"):
            path.unlink()

    write_json(ROOT / "data" / "latest.json", current)
    stats = compare(current["jobs"], baseline["jobs"])
    stats["baseline_period"] = baseline_period
    stats["current_period"] = current_period
    comparison = {
        "schema_version": 1,
        "baseline_period": baseline_period,
        "current_period": current_period,
        "is_sample": bool(baseline.get("is_sample") or current.get("is_sample")),
        "statistics": stats,
    }
    write_json(ROOT / "data" / "comparisons" / f"{baseline_period}_to_{current_period}.json", comparison)

    is_sample = comparison["is_sample"]
    history = {
        "is_sample": is_sample,
        "granularity": "monthly",
        "months": [
            {"month": baseline_period, "total_open": len(baseline["jobs"]), "new_count": None, "closed_count": None},
            {"month": current_period, "total_open": len(current["jobs"]), "new_count": stats["new_count"], "closed_count": stats["closed_count"]},
        ],
    }
    write_json(ROOT / "data" / "history-summary.json", history)
    update_category_history()

    saved_news = read_json(ROOT / "data" / "news" / f"{current_period}.json", {})
    report_news = saved_news.get("items", []) if isinstance(saved_news, dict) else []
    if not isinstance(report_news, list):
        report_news = []

    report = {
        "period": current_period,
        "baseline_period": baseline_period,
        "current_period": current_period,
        "comparison_label": f"{baseline_period} → {current_period}",
        "is_sample": is_sample,
        "status": "pending_api_key",
        "report_schema_version": 3,
        "generated_at": None,
        "error": "월간 비교 데이터가 적용되었습니다. GPT 분석은 OPENAI_API_KEY 등록 후 수동 생성됩니다.",
        "analysis": None,
        "markdown": None,
        "pdf_path": None,
        "statistics": stats,
        "job_examples": [
            {key: job.get(key) for key in ("id", "company", "title", "url", "categories", "job_subcategories", "career", "location", "employment_type")}
            for job in current["jobs"]
        ],
        "news": report_news,
    }
    report["methodology"] = build_methodology(report)
    write_json(ROOT / "data" / "reports" / f"{current_period}.json", report)
    write_json(ROOT / "data" / "reports" / "latest.json", report)

    markdown = ROOT / "reports" / f"{current_period}.md"
    pdf = ROOT / "reports" / f"{current_period}-game-hiring-summary.pdf"
    if markdown.exists():
        markdown.unlink()
    if pdf.exists():
        pdf.unlink()

    finished_at = datetime.now().astimezone().isoformat()
    write_json(ROOT / "data" / "collection-status.json", {
        "started_at": finished_at,
        "finished_at": finished_at,
        "success": True,
        "is_sample": is_sample,
        "message": f"예시 비교 기준: {baseline_period} → {current_period}",
        "sources": [{"name": "사용자 제공 월간 JSON", "status": "success", "count": len(current["jobs"])}],
    })

    print({
        "baseline": len(baseline["jobs"]),
        "current": len(current["jobs"]),
        "change": stats["change"],
        "new": stats["new_count"],
        "maintained": stats["maintained_count"],
        "closed": stats["closed_count"],
    })


if __name__ == "__main__":
    main()
