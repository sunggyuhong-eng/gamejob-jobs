from __future__ import annotations

import hashlib
import json
import os
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import httpx


def normalized(value: object) -> str:
    return " ".join(str(value or "").strip().lower().split())


def opening_key(project: object, title: object) -> str:
    return f"{normalized(project)}\x1f{normalized(title)}"


def opening_id(project: object, title: object) -> str:
    digest = hashlib.sha256(opening_key(project, title).encode("utf-8")).hexdigest()[:16]
    return f"sheet-{digest}"


def build_dashboard(sheet_data: dict, previous_opening_ids: set[str] | None = None) -> tuple[dict, int]:
    candidates_by_opening: dict[str, list[dict]] = defaultdict(list)
    for candidate in sheet_data.get("candidates", []):
        key = opening_key(candidate.get("project"), candidate.get("openingTitle"))
        if key.strip("\x1f"):
            candidates_by_opening[key].append(candidate)

    hired_counts = sheet_data.get("hiredCounts") if isinstance(sheet_data.get("hiredCounts"), dict) else {}
    openings = []
    current_keys: set[str] = set()
    seen_ids: set[str] = set()

    for source in sheet_data.get("openings", []):
        project = str(source.get("project") or "").strip()
        title = str(source.get("title") or "").strip()
        if not project or not title:
            continue
        key = opening_key(project, title)
        item_id = opening_id(project, title)
        if item_id in seen_ids:
            continue
        seen_ids.add(item_id)
        current_keys.add(key)
        candidates = candidates_by_opening.get(key, [])
        openings.append({
            "id": item_id,
            "title": title,
            "url": "",
            "postedAt": "",
            "deadline": "",
            "source": "sheet",
            "isNew": previous_opening_ids is not None and item_id not in previous_opening_ids,
            "status": "진행중",
            "project": project,
            "targetTo": max(0, int(float(source.get("targetTo") or 0))),
            "hiredCount": int(hired_counts.get(key, 0) or 0),
            "reason": str(source.get("reason") or "").strip(),
            "candidates": candidates,
        })

    openings.sort(key=lambda item: (normalized(item["project"]), normalized(item["title"])))
    dashboard = {
        "openings": openings,
        "candidateCount": sum(len(opening["candidates"]) for opening in openings),
        "syncedAt": datetime.now(timezone.utc).isoformat(),
    }
    unmatched = sum(len(items) for key, items in candidates_by_opening.items() if key not in current_keys)
    return dashboard, unmatched


def load_previous_opening_ids() -> set[str] | None:
    path = os.getenv("PREVIOUS_DASHBOARD_PATH", "").strip()
    if not path:
        return None
    try:
        previous = json.loads(Path(path).read_text(encoding="utf-8"))
        openings = previous.get("openings") if isinstance(previous, dict) else None
        if not isinstance(openings, list):
            return None
        return {str(item.get("id")) for item in openings if isinstance(item, dict) and item.get("id")}
    except (OSError, json.JSONDecodeError):
        return None


def main() -> int:
    endpoint, token = os.getenv("SHEET_API_URL", ""), os.getenv("SHEET_API_TOKEN", "")
    if not endpoint or not token:
        raise RuntimeError("SHEET_API_URL 또는 SHEET_API_TOKEN Secret이 없습니다.")

    response = httpx.post(
        endpoint,
        content=json.dumps({"action": "dashboard", "token": token}, ensure_ascii=False).encode(),
        headers={"Content-Type": "text/plain;charset=utf-8"},
        timeout=httpx.Timeout(connect=30, read=60, write=30, pool=30),
        follow_redirects=True,
    )
    response.raise_for_status()
    sheet_data = response.json()
    if (
        not sheet_data.get("ok")
        or not isinstance(sheet_data.get("openings"), list)
        or not isinstance(sheet_data.get("candidates"), list)
    ):
        raise RuntimeError(sheet_data.get("error") or "연동용 사본의 공고 또는 지원자 데이터를 가져오지 못했습니다.")

    dashboard, unmatched = build_dashboard(sheet_data, load_previous_opening_ids())
    # 읽기 전용 즉시 불러오기에 사용합니다. 이 URL은 기존 배포 JSON과 마찬가지로 공개됩니다.
    dashboard["sheetApiUrl"] = endpoint
    if not dashboard["openings"]:
        raise RuntimeError("Dashboard_TO 탭에 표시할 공고가 없어 기존 배포 상태를 유지합니다.")

    output = Path(__file__).resolve().parents[1] / "public" / "data" / "dashboard.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(dashboard, ensure_ascii=False, indent=2), encoding="utf-8")
    print(
        f"Dashboard_TO 공고 {len(dashboard['openings'])}건과 진행 지원자 "
        f"{dashboard['candidateCount']}명을 연결했습니다. 공고 불일치 지원자 {unmatched}명"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
