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
    assert result["by_company"] == [{"name": "A", "current": 1, "previous": None, "change": None}]
    assert result["by_category"] == [{"name": "프로그래밍", "current": 1, "previous": None, "change": None}]
    assert result["company_category"] == []


def test_compare_new_maintained_closed():
    result = compare([job("2"), job("3")], [job("1"), job("2")])
    assert result["new_ids"] == ["3"]
    assert result["maintained_ids"] == ["2"]
    assert result["closed_ids"] == ["1"]
    assert result["change"] == 0


def test_compare_uses_gamejob_number_across_different_id_formats():
    old = job("283677")
    old["url"] = "https://www.gamejob.co.kr/List_GI/GIR_Read.asp?GI_No=283677"
    new = job("www.gamejob.co.kr:283677")
    new["url"] = "https://www.gamejob.co.kr/Recruit/GI_Read/View?GI_No=283677"
    result = compare([new], [old])
    assert result["new_count"] == 0
    assert result["maintained_count"] == 1
    assert result["closed_count"] == 0


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
    snapshots = tmp_path / "data" / "snapshots"
    snapshots.mkdir(parents=True)
    (snapshots / "2026-09.json").write_text(json.dumps({
        "period": "2026-09", "is_sample": False,
        "jobs": [
            {"job_major_categories": ["게임제작"], "job_subcategories": ["게임기획"]},
            {"job_major_categories": ["게임제작"], "job_subcategories": ["서버"]},
        ],
    }, ensure_ascii=False), encoding="utf-8")
    pipeline.update_category_history()
    result = json.loads((tmp_path / "data" / "category-history.json").read_text(encoding="utf-8"))
    assert result["granularity"] == "monthly"
    assert result["periods"][0]["major"]["게임제작"] == 2
    assert result["periods"][0]["sub"]["게임기획"] == 1
    assert result["periods"][0]["sub_by_major"]["게임제작"]["게임기획"] == 1


def test_category_history_separates_unique_major_jobs_from_overlapping_sub_tags(tmp_path, monkeypatch):
    monkeypatch.setattr(pipeline, "ROOT", tmp_path)
    snapshots = tmp_path / "data" / "snapshots"
    snapshots.mkdir(parents=True)
    (snapshots / "2026-09.json").write_text(json.dumps({
        "period": "2026-09", "is_sample": False,
        "jobs": [
            {"job_major_categories": ["사운드·영상제작"], "job_subcategories": ["사운드 제작", "영상제작·편집"]},
            {"job_major_categories": ["사운드·영상제작"], "job_subcategories": ["영상제작·편집"]},
        ],
    }, ensure_ascii=False), encoding="utf-8")
    pipeline.update_category_history()
    result = json.loads((tmp_path / "data" / "category-history.json").read_text(encoding="utf-8"))
    period = result["periods"][0]
    assert period["major"]["사운드·영상제작"] == 2
    assert sum(period["sub_by_major"]["사운드·영상제작"].values()) == 3


def test_employment_type_combinations_are_counted_by_each_type():
    current = [job("1"), job("2")]
    previous = [job("1")]
    current[0]["employment_type"] = "정규직, 계약직"
    current[1]["employment_type"] = "정규직"
    previous[0]["employment_type"] = "정규직"
    rows = {row["name"]: row for row in compare(current, previous)["by_employment_type"]}
    assert rows["정규직"]["current"] == 2
    assert rows["정규직"]["change"] == 1
    assert rows["계약직"]["current"] == 1


def test_missing_baseline_locations_do_not_create_fake_growth():
    current = [job("1")]
    previous = [job("1")]
    current[0]["location"] = "서울 > 강남구"
    previous[0]["location"] = "미확인"
    assert compare(current, previous)["by_location"][0]["previous"] is None
