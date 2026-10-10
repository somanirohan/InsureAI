"""
InsureAI Policy Brochure and Catalog Scrapy Spider.
Crawls Indian health insurer product catalog pages, checks brochure accessibility,
discovers direct PDF download links, and extracts product features live.
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import datetime
from typing import Any, AsyncIterator, Dict, Iterable, List, Optional
from urllib.parse import urljoin

import scrapy
from scrapy.http import Response

logger = logging.getLogger("insureai.scrapy.spider")


class PolicySpider(scrapy.Spider):
    name = "policy_spider"

    custom_settings = {
        "USER_AGENT": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        ),
        "ROBOTSTXT_OBEY": False,
        "DOWNLOAD_TIMEOUT": 15,
        "CONCURRENT_REQUESTS": 10,
        "CONCURRENT_REQUESTS_PER_DOMAIN": 3,
        "DOWNLOAD_DELAY": 0.2,
        "COOKIES_ENABLED": True,
        "HTTPERROR_ALLOW_ALL": True,
        "RETRY_TIMES": 2,
        "DEFAULT_REQUEST_HEADERS": {
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/pdf,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Sec-Ch-Ua": '"Not-A.Brand";v="99", "Chromium";v="124"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"Windows"',
            "Upgrade-Insecure-Requests": "1",
        },
    }

    def __init__(self, policies_file: Optional[str] = None, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.policies_to_crawl: List[Dict[str, Any]] = []

        if policies_file and os.path.exists(policies_file):
            try:
                with open(policies_file, "r", encoding="utf-8") as f:
                    self.policies_to_crawl = json.load(f)
            except Exception as exc:
                logger.error("Error reading policies_file %s: %s", policies_file, exc)

        if not self.policies_to_crawl:
            # Fallback to importing from server catalog
            try:
                from server.services.policy_crawler import CURATED_INDIAN_POLICIES
                self.policies_to_crawl = CURATED_INDIAN_POLICIES
            except Exception:
                try:
                    from services.policy_crawler import CURATED_INDIAN_POLICIES
                    self.policies_to_crawl = CURATED_INDIAN_POLICIES
                except Exception as exc:
                    logger.warning("Could not load CURATED_INDIAN_POLICIES fallback: %s", exc)

    async def start(self) -> AsyncIterator[scrapy.Request]:
        """Scrapy 2.13+ entry point."""
        for req in self._generate_requests():
            yield req

    def start_requests(self) -> Iterable[scrapy.Request]:
        """Scrapy <2.13 compatibility entry point."""
        for req in self._generate_requests():
            yield req

    def _generate_requests(self) -> List[scrapy.Request]:
        requests = []
        for idx, policy in enumerate(self.policies_to_crawl):
            url = policy.get("official_brochure_url") or policy.get("quote_source_link")
            if not url or not url.startswith("http"):
                continue

            meta = {
                "idx": idx + 1,
                "product_id": policy.get("product_id"),
                "product_name": policy.get("product_name"),
                "insurer_name": policy.get("insurer_name"),
                "original_url": url,
                "claim_settlement_ratio": policy.get("claim_settlement_ratio", 95.0),
            }

            req = scrapy.Request(
                url=url,
                callback=self.parse,
                errback=self.handle_error,
                meta=meta,
                dont_filter=True,
            )
            requests.append(req)
        return requests

    def parse(self, response: Response):
        meta = response.meta
        status = response.status
        is_reachable = (200 <= status < 400)
        content_type = response.headers.get(b"Content-Type", b"").decode("utf-8", errors="ignore").lower()

        is_pdf = "application/pdf" in content_type or response.url.lower().endswith(".pdf")
        page_title = ""
        brochure_pdf = response.url if is_pdf else None
        extracted_highlights: List[str] = []

        if not is_pdf and is_reachable:
            # Extract HTML details
            page_title = response.css("title::text").get(default="").strip()

            # Search for embedded brochure links
            pdf_links = response.css('a[href*=".pdf"]::attr(href)').getall()
            if pdf_links:
                for pl in pdf_links:
                    full_link = urljoin(response.url, pl)
                    if any(kw in pl.lower() for kw in ["brochure", "prospectus", "policy", "wordings"]):
                        brochure_pdf = full_link
                        break
                if not brochure_pdf:
                    brochure_pdf = urljoin(response.url, pdf_links[0])

            # Extract key list items or benefit bullets
            bullets = response.css("ul li::text, ol li::text").getall()
            for b in bullets:
                clean_b = b.strip()
                if 20 <= len(clean_b) <= 180 and not any(skip in clean_b.lower() for skip in ["cookie", "javascript", "login", "menu"]):
                    extracted_highlights.append(clean_b)
                if len(extracted_highlights) >= 6:
                    break

        item = {
            "product_id": meta.get("product_id"),
            "product_name": meta.get("product_name"),
            "insurer_name": meta.get("insurer_name"),
            "claim_settlement_ratio": meta.get("claim_settlement_ratio"),
            "requested_url": meta.get("original_url"),
            "final_url": response.url,
            "status_code": status,
            "is_reachable": is_reachable,
            "content_type": content_type,
            "is_pdf": is_pdf,
            "page_title": page_title[:150] if page_title else None,
            "brochure_pdf_url": brochure_pdf,
            "extracted_highlights": extracted_highlights,
            "scraped_at": datetime.utcnow().isoformat(),
            "error": None if is_reachable else f"HTTP {status}",
        }
        yield item

    def handle_error(self, failure):
        meta = failure.request.meta
        item = {
            "product_id": meta.get("product_id"),
            "product_name": meta.get("product_name"),
            "insurer_name": meta.get("insurer_name"),
            "claim_settlement_ratio": meta.get("claim_settlement_ratio"),
            "requested_url": meta.get("original_url"),
            "final_url": meta.get("original_url"),
            "status_code": None,
            "is_reachable": False,
            "content_type": None,
            "is_pdf": False,
            "page_title": None,
            "brochure_pdf_url": None,
            "extracted_highlights": [],
            "scraped_at": datetime.utcnow().isoformat(),
            "error": str(failure.value)[:150],
        }
        yield item


if __name__ == "__main__":
    from scrapy.crawler import CrawlerProcess

    output_path = os.path.abspath("scratch/scrapy_standalone_run.json")
    if os.path.exists(output_path):
        os.remove(output_path)

    process = CrawlerProcess(
        settings={
            "FEEDS": {output_path: {"format": "json", "overwrite": True}},
            "LOG_LEVEL": "INFO",
        }
    )
    process.crawl(PolicySpider)
    process.start()
    print("Standalone Scrapy crawl finished. Results in:", output_path)
