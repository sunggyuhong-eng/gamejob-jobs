from __future__ import annotations

import argparse
import csv
import json
import re
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from collector.normalize import normalize_categories, normalize_company, normalize_subcategories, split_job_categories
from collector.pipeline import ROOT, compare, read_json, update_category_history, write_json
from collector.report import build_methodology


def _deadline(raw: str, period: str) -> tuple[str | None, bool]:
    text = (raw or "").strip()
    always = "채용시" in text or "상시" in text
    if always or not text:
        return None, always
    full = re.search(r"(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})", text)
    if full:
        return f"{int(full.group(1)):04d}-{int(full.group(2)):02d}-{int(full.group(3)):02d}", False
    short = re.search(r"(\d{1,2})[.\-/](\d{1,2})", text)
    if short:
        return f"{period[:4]}-{int(short.group(1)):02d}-{int(short.group(2)):02d}", False
    return None, False


def csv_jobs(path: Path, period: str) -> list[dict]:
    collected_at = f"{period}T09:00:00+09:00"
    jobs: dict[str, dict] = {}
    with path.open(encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            number = (row.get("gi_no") or "").strip()
            if not number:
                continue
            raw_categories = split_job_categories(row.get("job_categories"), row.get("job_function"))
            subcategories = normalize_subcategories(*raw_categories)
            major_categories = normalize_categories(*raw_categories)
            deadline, always_open = _deadline(row.get("deadline_raw") or "", period)
            company_id = (row.get("company_id") or "").strip()
            jobs[f"www.gamejob.co.kr:{number}"] = {
                "id": f"www.gamejob.co.kr:{number}",
                "company": normalize_company(row.get("company_name")),
                "title": (row.get("title") or "").strip(),
                "url": f"https://www.gamejob.co.kr/Recruit/GI_Read/View?GI_No={number}",
                "categories": major_categories,
                "original_categories": subcategories,
                "job_major_categories": major_categories,
                "job_subcategories": subcategories,
                "career": (row.get("career") or "").strip() or None,
                "education": (row.get("education") or "").strip() or None,
                "employment_type": (row.get("employment_type") or "").strip() or None,
                "location": None,
                "posted_at": None,
                "deadline": deadline,
                "always_open": always_open,
                "logo_url": (row.get("company_logo_url") or "").strip().replace("\\", "/") or None,
                "representative_game": (row.get("company_flagship_games") or "").strip() or None,
                "company_url": f"https://www.gamejob.co.kr/Company/Detail?tabcode=1&M={company_id}" if company_id else None,
                "company_type": None,
                "main_business": None,
                "established_year": (row.get("company_founded_year") or "").strip() or None,
                "employee_count": None,
                "company_ceo": (row.get("company_ceo") or "").strip() or None,
                "company_homepage": (row.get("company_homepage") or "").strip() or None,
                "collected_at": collected_at,
                "source": "게임잡 CSV",
                "status": "open",
            }
    return sorted(jobs.values(), key=lambda job: (job["company"], job["title"], job["id"]))


def migrate_jobs(jobs: list[dict]) -> None:
    for job in jobs:
        raw_categories = split_job_categories(*(job.get("original_categories") or job.get("job_subcategories") or []))
        subcategories = normalize_subcategories(*raw_categories)
        major_categories = normalize_categories(*raw_categories)
        job["original_categories"] = raw_categories
        job["job_subcategories"] = subcategories
        job["categories"] = major_categories
        job["job_major_categories"] = major_categories


def migrate_existing_snapshots() -> None:
    paths = [ROOT / "data" / "latest.json"]
    paths += list((ROOT / "data" / "daily").glob("*.json"))
    paths += list((ROOT / "data" / "snapshots").glob("*.json"))
    for path in paths:
        if not path.exists():
            continue
        data = read_json(path, {})
        migrate_jobs(data.get("jobs") or [])
        write_json(path, data)


def main() -> None:
    parser = argparse.ArgumentParser(description="게임잡 CSV를 일별 스냅샷과 비교 데이터로 변환")
    parser.add_argument("csv_path", type=Path)
    parser.add_argument("--period", required=True, help="CSV 기준일 YYYY-MM-DD")
    args = parser.parse_args()

    migrate_existing_snapshots()
    baseline_jobs = csv_jobs(args.csv_path, args.period)
    baseline = {
        "schema_version": 2,
        "period": args.period,
        "collected_at": f"{args.period}T09:00:00+09:00",
        "is_sample": False,
        "imported_from": args.csv_path.name,
        "jobs": baseline_jobs,
    }
    write_json(ROOT / "data" / "daily" / f"{args.period}.json", baseline)

    current = read_json(ROOT / "data" / "latest.json", {})
    current_jobs = current.get("jobs") or []
    current_period = current.get("period") or "현재"
    stats = compare(current_jobs, baseline_jobs)
    stats["baseline_period"] = args.period
    stats["current_period"] = current_period
    comparison = {
        "schema_version": 1,
        "baseline_period": args.period,
        "current_period": current_period,
        "statistics": stats,
    }
    write_json(ROOT / "data" / "comparisons" / f"{args.period}_to_{current_period}.json", comparison)

    report_path = ROOT / "data" / "reports" / "latest.json"
    report = read_json(report_path, {})
    report.update({
        "period": current_period[:7],
        "baseline_period": args.period,
        "current_period": current_period,
        "comparison_label": f"{args.period} → {current_period}",
        "is_sample": False,
        "statistics": stats,
        "job_examples": [
            {key: job.get(key) for key in ("id", "company", "title", "url", "categories", "job_subcategories", "career", "location", "employment_type")}
            for job in current_jobs[:50]
        ],
    })
    report["methodology"] = build_methodology(report)
    write_json(report_path, report)
    write_json(ROOT / "data" / "reports" / f"{current_period[:7]}.json", report)

    history = {
        "is_sample": False,
        "granularity": "daily",
        "months": [
            {"month": args.period, "total_open": len(baseline_jobs), "new_count": None, "closed_count": None},
            {"month": current_period, "total_open": len(current_jobs), "new_count": stats["new_count"], "closed_count": stats["closed_count"]},
        ],
    }
    write_json(ROOT / "data" / "history-summary.json", history)
    update_category_history()
    print(json.dumps({
        "baseline": len(baseline_jobs),
        "current": len(current_jobs),
        "change": stats["change"],
        "new": stats["new_count"],
        "maintained": stats["maintained_count"],
        "closed": stats["closed_count"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
