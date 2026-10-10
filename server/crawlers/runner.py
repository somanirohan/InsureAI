"""
Subprocess entry point to run Scrapy crawl safely without Twisted reactor collisions.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys

# Ensure project root is in path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(CURRENT_DIR, "..", ".."))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from scrapy.crawler import CrawlerProcess
from server.crawlers.policy_spider import PolicySpider


def main():
    parser = argparse.ArgumentParser(description="Run Scrapy Policy Spider")
    parser.add_argument("--input", required=False, help="Path to JSON file containing policies to crawl")
    parser.add_argument("--output", required=True, help="Path to output JSON file")
    parser.add_argument("--max-policies", type=int, default=50, help="Maximum policies to crawl")
    args = parser.parse_args()

    input_file = args.input
    output_file = os.path.abspath(args.output)
    output_dir = os.path.dirname(output_file)
    if output_dir and not os.path.exists(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    if os.path.exists(output_file):
        try:
            os.remove(output_file)
        except OSError:
            pass

    settings = {
        "FEEDS": {output_file: {"format": "json", "overwrite": True}},
        "LOG_LEVEL": "WARNING",
    }

    process = CrawlerProcess(settings=settings)
    process.crawl(PolicySpider, policies_file=input_file)
    process.start()

    if os.path.exists(output_file):
        try:
            with open(output_file, "r", encoding="utf-8") as f:
                data = json.load(f)
            open_count = sum(1 for d in data if d.get("is_reachable"))
            print(f"SCRAPY_RESULT: count={len(data)} reachable={open_count}")
        except Exception as exc:
            print(f"SCRAPY_ERROR: {exc}")
    else:
        print("SCRAPY_RESULT: count=0 reachable=0")


if __name__ == "__main__":
    main()
