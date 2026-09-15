from collector.models import JobPosting
import json

import collector.pipeline as pipeline
from collector.pipeline import compare, dedupe_jobs


def job(job_id: str, company: str = "A", categories=None):
    return {
        "id": job_id, "company": company, "title": job_id, "url": f"https://example.com/{job_id}",
        "categories": categories or ["프로그래밍"], "career": "경력", "location": "서울", "employment_type": "정규직",
    }


def test_compare_without_baseline():
    result = compare([job("1")], None)
    assert result["has_baseline"] is False
    assert result["baseline_message"] == "기준 데이터 없음"
    assert result["new_count"] is None


def test_compare_new_maintained_closed():
    result = compare([job("2"), job("3")], [job("1"), job("2")])
    assert result["new_ids"] == ["3"]
    assert result["maintained_ids"] == ["2"]
    assert result["closed_ids"] == ["1"]
    assert result["change"] == 0


def test_reposted_job_is_flagged_without_merging_counts():
    old = job("old", company="A")
    old["title"] = "서버 개발자"
    new = job("new", company="A")
    new["title"] = "서버 개발자"
    result = compare([new], [old])
    assert result["reposted"] == [{"current_id": "new", "previous_id": "old"}]


def test_dedupe_job_merges_categories():
    base = dict(company="A", title="T", url="https://example.com/1", original_categories=[], collected_at="now")
    a = JobPosting(id="1", categories=["QA"], **base)
    b = JobPosting(id="1", categories=["프로그래밍"], **base)
    merged = dedupe_jobs([a, b])
    assert len(merged) == 1
    assert merged[0]["categories"] == ["QA", "프로그래밍"]


def test_category_history_contains_major_and_subcategory_counts(tmp_path, monkeypatch):
    monkeypatch.setattr(pipeline, "ROOT", tmp_path)
    daily = tmp_path / "data" / "daily"
    daily.mkdir(parents=True)
    (daily / "2026-09-01.json").write_text(json.dumps({
        "period": "2026-09-01", "is_sample": False,
        "jobs": [
            {"job_major_categories": ["게임제작"], "job_subcategories": ["게임기획"]},
            {"job_major_categories": ["게임제작"], "job_subcategories": ["서버"]},
        ],
    }, ensure_ascii=False), encoding="utf-8")
    pipeline.update_category_history()
    result = json.loads((tmp_path / "data" / "category-history.json").read_text(encoding="utf-8"))
    assert result["periods"][0]["major"]["게임제작"] == 2
    assert result["periods"][0]["sub"]["게임기획"] == 1
