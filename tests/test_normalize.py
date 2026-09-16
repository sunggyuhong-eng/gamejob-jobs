from collector.normalize import canonical_url, career_bucket, normalize_categories, normalize_company, normalize_date, split_job_categories, split_multi_value, stable_id


def test_job_can_have_multiple_categories():
    assert normalize_categories("게임개발(클라이언트)", "QA·테스터") == ["게임제작", "게임운영·QA"]


def test_legacy_major_field_containing_subcategory_maps_to_real_major():
    assert normalize_categories("게임기획") == ["게임제작"]
    assert normalize_categories("전략기획") == ["사업기획"]


def test_source_subcategories_are_preserved():
    assert split_job_categories("게임개발(모바일); 게임AI 개발") == ["게임개발(모바일)", "게임AI 개발"]


def test_unknown_job_is_other():
    assert normalize_categories("알 수 없는 역할") == ["기타"]


def test_company_alias():
    assert normalize_company("(주)넥슨코리아") == "넥슨코리아"
    assert normalize_company("㈜콩스튜디오코리아") == "콩스튜디오코리아"
    assert normalize_company("(주)크래프톤") == normalize_company("크래프톤")


def test_multi_values_are_split():
    assert split_multi_value("정규직, 계약직") == ["정규직", "계약직"]


def test_date_and_url_normalization():
    assert normalize_date("2026.09.01") == "2026-09-01"
    assert canonical_url("HTTPS://Example.com/job/?utm_source=x&id=7#x") == "https://example.com/job?id=7"
    assert stable_id("https://example.com/job?GI_No=123").endswith(":123")


def test_career_bucket():
    assert career_bucket("경력 3~7년") == "경력 3~5년"
    assert career_bucket("신입·경력") == "신입·경력"
