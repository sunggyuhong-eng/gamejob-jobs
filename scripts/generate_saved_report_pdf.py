#!/usr/bin/env python3
from __future__ import annotations

import json
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from collector.pipeline import ROOT, read_json, write_json
from collector.report_pdf import build_report_pdf


def main() -> int:
    latest_path = ROOT / "data" / "reports" / "latest.json"
    report = read_json(latest_path, {})
    period = report.get("period")
    has_commentary = bool(report.get("analysis") or report.get("markdown"))
    if not period or report.get("status") != "complete" or not has_commentary:
        print("완성된 저장 리포트가 없어 PDF 생성을 건너뜁니다.")
        return 0

    pdf_name = f"{period}-game-hiring-summary.pdf"
    build_report_pdf(report, ROOT / "reports" / pdf_name)
    report["pdf_path"] = f"reports/{pdf_name}"
    write_json(ROOT / "data" / "reports" / f"{period}.json", report)
    write_json(latest_path, report)
    print(json.dumps({"period": period, "pdf": report["pdf_path"]}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
