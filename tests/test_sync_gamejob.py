from scripts.sync_gamejob import build_dashboard, opening_id, opening_key


def test_opening_key_normalizes_project_and_title():
    assert opening_key(" MAZE ", "Software   Engineer ") == opening_key("maze", "software engineer")


def test_opening_id_is_stable_for_same_opening():
    assert opening_id("MAZE", "Dev PM") == opening_id(" maze ", "dev  pm")


def test_build_dashboard_uses_to_sheet_as_opening_master():
    sheet_data = {
        "openings": [
            {"row": 2, "project": "MAZE", "title": "Software Engineer", "targetTo": 3, "reason": "신규 채용"},
            {"row": 3, "project": "ZERO", "title": "Client Engineer", "targetTo": 2, "reason": "대체 채용"},
        ],
        "candidates": [
            {"id": "row-1", "row": 1, "name": "지원자A", "stage": "코딩테스트", "project": "MAZE", "openingTitle": "Software Engineer"},
            {"id": "row-2", "row": 2, "name": "지원자B", "stage": "면접", "project": "ZERO", "openingTitle": "종료된 공고"},
        ],
        "hiredCounts": {opening_key("MAZE", "Software Engineer"): 1},
    }

    dashboard, unmatched = build_dashboard(sheet_data)

    assert len(dashboard["openings"]) == 2
    maze = next(item for item in dashboard["openings"] if item["project"] == "MAZE")
    assert maze["source"] == "sheet"
    assert maze["targetTo"] == 3
    assert maze["reason"] == "신규 채용"
    assert maze["hiredCount"] == 1
    assert maze["candidates"][0]["name"] == "지원자A"
    assert unmatched == 1


def test_build_dashboard_keeps_opening_without_active_candidates():
    sheet_data = {
        "openings": [{"project": "OTPS", "title": "시스템 기획자", "targetTo": 1, "reason": "증원"}],
        "candidates": [],
        "hiredCounts": {},
    }

    dashboard, unmatched = build_dashboard(sheet_data)

    assert dashboard["openings"][0]["title"] == "시스템 기획자"
    assert dashboard["openings"][0]["candidates"] == []
    assert dashboard["candidateCount"] == 0
    assert unmatched == 0


def test_new_badge_only_marks_openings_added_since_previous_sync():
    existing_id = opening_id("MAZE", "Dev PM")
    sheet_data = {
        "openings": [
            {"project": "MAZE", "title": "Dev PM", "targetTo": 1, "reason": "증원"},
            {"project": "ZERO", "title": "Client Engineer", "targetTo": 1, "reason": "신규"},
        ],
        "candidates": [],
        "hiredCounts": {},
    }

    dashboard, _ = build_dashboard(sheet_data, {existing_id})

    flags = {item["title"]: item["isNew"] for item in dashboard["openings"]}
    assert flags == {"Dev PM": False, "Client Engineer": True}

    next_dashboard, _ = build_dashboard(sheet_data, {item["id"] for item in dashboard["openings"]})
    assert all(item["isNew"] is False for item in next_dashboard["openings"])
