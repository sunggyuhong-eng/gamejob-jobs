from __future__ import annotations

import json
from pathlib import Path
from urllib.parse import urlparse

REQUIRED = {"id", "company", "title", "url", "categories", "collected_at"}


def validate_file(path: Path) -> list[str]:
    errors: list[str] = []
    data = json.loads(path.read_text(encoding="utf-8"))
    jobs = data.get("jobs", [])
    ids: set[str] = set()
    for index, job in enumerate(jobs):
        missing = REQUIRED - job.keys()
        if missing:
            errors.append(f"jobs[{index}] 필수 필드 누락: {sorted(missing)}")
        if job.get("id") in ids:
            errors.append(f"중복 ID: {job.get('id')}")
        ids.add(job.get("id"))
        if job.get("url") and urlparse(job["url"]).scheme not in {"http", "https"}:
            errors.append(f"잘못된 URL: {job['url']}")
    return errors

