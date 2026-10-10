"""
Tests for Scrapy Crawler Service and Brochure Resolution.
"""

import pytest
from httpx import AsyncClient, ASGITransport
from server.main import app
from server.crawlers.policy_spider import PolicySpider
from server.services.policy_crawler import CURATED_INDIAN_POLICIES, policy_crawler_service


def test_scrapy_spider_structure():
    """Verify PolicySpider generates requests for authentic catalog policies."""
    spider = PolicySpider()
    reqs = list(spider._generate_requests())
    assert len(reqs) == len(CURATED_INDIAN_POLICIES)
    assert all(r.url.startswith("http") for r in reqs)


@pytest.mark.asyncio
async def test_brochure_endpoint_redirect():
    """Test GET /api/recommendations/brochure/{product_id} resolves properly."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/recommendations/brochure/hdfc-optima-secure", follow_redirects=False)
        assert res.status_code == 307
        assert "hdfcergo.com" in res.headers.get("location", "")

        # Test Star Health CloudFront brochure redirect
        res_star = await ac.get("/api/recommendations/brochure/star-comprehensive", follow_redirects=False)
        assert res_star.status_code == 307
        assert "cloudfront.net" in res_star.headers.get("location", "")


@pytest.mark.asyncio
async def test_crawler_status_metrics():
    """Verify crawler status endpoint reflects Scrapy engine."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        res = await ac.get("/api/recommendations/crawler-status")
        assert res.status_code == 200
        data = res.json()
        assert data["metrics"]["crawler_engine"] == "Scrapy 2.19"
        assert data["metrics"]["crawler_capacity"] == 50
