#!/usr/bin/env python3
from __future__ import annotations

import argparse
import logging
import sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from collector.pipeline import ROOT, run
from collector.report import generate
from collector.validate import validate_file


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["daily", "monthly"], default="daily")
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--skip-report", action="store_true")
    args = parser.parse_args()
    (ROOT / "logs").mkdir(exist_ok=True)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    status = run(args.mode, args.force)
    if not status.get("success"):
        return 1
    errors = validate_file(ROOT / "data" / "latest.json")
    if errors:
        for error in errors:
            logging.error(error)
        return 1
    if args.mode == "monthly" and not args.skip_report:
        generate(status["started_at"][:7])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
