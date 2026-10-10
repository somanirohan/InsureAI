"""
Scrapy Crawler Integration Service for InsureAI.
Coordinates Scrapy spider runs across authentic Indian insurer websites,
extracts policy highlights, verifies brochure accessibility, and updates the MongoDB catalog.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import sys
import tempfile
from datetime import datetime
from typing import Any, Dict, List, Optional

try:
    from db import get_async_db
except ImportError:
    from server.db import get_async_db

logger = logging.getLogger("insureai.scrapy.service")


class ScrapyCrawlerService:
    """
    Orchestration service executing the Scrapy spider and syncing scraped catalog data.
    """

    def __init__(self):
        self._python_bin = sys.executable

    async def crawl_policies(
        self,
        policies: Optional[List[Dict[str, Any]]] = None,
        max_policies: int = 50,
    ) -> Dict[str, Any]:
        """
        Execute Scrapy spider asynchronously in an isolated process to prevent Twisted
        reactor lifecycle conflicts with FastAPI asyncio event loop.
        """
        start_time = datetime.utcnow()
        temp_input = None
        temp_output = None

        try:
            with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f_out:
                temp_output = f_out.name

            cmd = [self._python_bin, "-m", "server.crawlers.runner", "--output", temp_output, "--max-policies", str(max_policies)]

            if policies:
                with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False, encoding="utf-8") as f_in:
                    temp_input = f_in.name
                    json.dump(policies[:max_policies], f_in, indent=2)
                cmd.extend(["--input", temp_input])

            logger.info("Triggering Scrapy spider process: %s", " ".join(cmd))
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=45.0)

            stdout_str = stdout.decode("utf-8", errors="ignore")
            stderr_str = stderr.decode("utf-8", errors="ignore")
            logger.info("Scrapy crawl completed (code %d): %s", proc.returncode, stdout_str.strip())
            if stderr_str:
                logger.debug("Scrapy stderr: %s", stderr_str[:300])

            scraped_items: List[Dict[str, Any]] = []
            if os.path.exists(temp_output) and os.path.getsize(temp_output) > 0:
                with open(temp_output, "r", encoding="utf-8") as f:
                    scraped_items = json.load(f)

            # Sync results back to MongoDB catalog_policies collection
            updated_count = await self.sync_results_to_database(scraped_items)

            reachable_count = sum(1 for it in scraped_items if it.get("is_reachable"))
            duration = round((datetime.utcnow() - start_time).total_seconds(), 2)

            return {
                "success": True,
                "engine": "Scrapy 2.19",
                "policies_crawled": len(scraped_items),
                "reachable_count": reachable_count,
                "unreachable_count": len(scraped_items) - reachable_count,
                "db_synced_count": updated_count,
                "duration_seconds": duration,
                "results": scraped_items,
                "timestamp": datetime.utcnow().isoformat(),
            }

        except asyncio.TimeoutError:
            logger.error("Scrapy crawl process timed out after 45 seconds.")
            return {
                "success": False,
                "error": "Crawler timed out after 45 seconds",
                "engine": "Scrapy 2.19",
                "policies_crawled": 0,
            }
        except Exception as exc:
            logger.exception("Error executing Scrapy crawl: %s", exc)
            return {
                "success": False,
                "error": str(exc),
                "engine": "Scrapy 2.19",
                "policies_crawled": 0,
            }
        finally:
            for p in [temp_input, temp_output]:
                if p and os.path.exists(p):
                    try:
                        os.remove(p)
                    except OSError:
                        pass

    async def sync_results_to_database(self, items: List[Dict[str, Any]]) -> int:
        """
        Update MongoDB catalog_policies with verified brochure URLs, reachability status,
        and extracted page highlights.
        """
        if not items:
            return 0

        updated = 0
        try:
            db = get_async_db()
            now = datetime.utcnow()
            for it in items:
                pid = it.get("product_id")
                if not pid:
                    continue

                update_data = {
                    "last_crawled_at": now,
                    "crawler_engine": "Scrapy 2.19",
                    "brochure_reachable": bool(it.get("is_reachable")),
                    "brochure_status_code": it.get("status_code"),
                }

                # If Scrapy discovered a direct PDF brochure link, update official_brochure_url
                if it.get("brochure_pdf_url"):
                    update_data["official_brochure_url"] = it["brochure_pdf_url"]
                    update_data["is_direct_pdf"] = True
                elif it.get("final_url") and it.get("is_reachable"):
                    update_data["verified_online_url"] = it["final_url"]

                if it.get("extracted_highlights"):
                    update_data["scraped_highlights"] = it["extracted_highlights"]

                res = await db.catalog_policies.update_one(
                    {"product_id": pid},
                    {"$set": update_data},
                )
                if res.modified_count > 0:
                    updated += 1

            logger.info("Successfully synced %d Scrapy results into MongoDB catalog_policies.", updated)
        except Exception as exc:
            logger.warning("Could not sync Scrapy results to MongoDB: %s", exc)

        return updated


scrapy_crawler_service = ScrapyCrawlerService()
