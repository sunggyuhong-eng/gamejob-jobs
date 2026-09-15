import json

from collector.validate import validate_file


def test_duplicate_id_detected(tmp_path):
    job = {"id":"x","company":"A","title":"T","url":"https://example.com/x","categories":["기타"],"collected_at":"now"}
    path = tmp_path / "data.json"
    path.write_text(json.dumps({"jobs":[job, job]}), encoding="utf-8")
    assert any("중복 ID" in x for x in validate_file(path))

