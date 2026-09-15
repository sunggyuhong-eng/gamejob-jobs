from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from collector.pipeline import ROOT, read_json, update_category_history, write_json


PROFILE_FIELDS = ("logo_url", "representative_game", "company_type", "main_business", "established_year", "employee_count")


def apply_profiles(path: Path, profiles: dict[str, dict]) -> int:
    data = read_json(path, {})
    applied = 0
    for job in data.get("jobs") or []:
        profile = profiles.get(job.get("company_url") or "", {})
        changed = False
        for field in PROFILE_FIELDS:
            value = profile.get(field)
            if value:
                if field == "logo_url":
                    value = value.replace("\\", "/")
                job[field] = value
                changed = True
        applied += int(changed)
    write_json(path, data)
    return applied


def main() -> None:
    profiles = json.loads((ROOT / "data" / "company-profiles.json").read_text(encoding="utf-8"))
    paths = [ROOT / "data" / "latest.json", *(ROOT / "data" / "daily").glob("*.json"), *(ROOT / "data" / "snapshots").glob("*.json")]
    total = sum(apply_profiles(path, profiles) for path in paths if path.exists())
    update_category_history()
    print(f"기업정보 적용 공고 레코드: {total:,}건")


if __name__ == "__main__":
    main()
