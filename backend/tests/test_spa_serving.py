import os
import unittest
from fastapi.testclient import TestClient

from app.main import create_app


class TestSpaServing(unittest.TestCase):
    def setUp(self) -> None:
        self.app = create_app()
        self.client = TestClient(self.app)

    def test_health_endpoint_not_intercepted(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_root_serves_html(self) -> None:
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/html", response.headers.get("content-type", ""))
        self.assertIn("<html", response.text.lower())

    def test_spa_route_fallback_serves_index_html(self) -> None:
        # Any SPA route like /machines or /demonstration should return index.html
        response = self.client.get("/fleet-command-center")
        self.assertEqual(response.status_code, 200)
        self.assertIn("text/html", response.headers.get("content-type", ""))
        self.assertIn("<html", response.text.lower())

    def test_unknown_api_route_returns_404_not_html(self) -> None:
        response = self.client.get("/api/v1/non_existent_endpoint")
        self.assertEqual(response.status_code, 404)
        self.assertIn("application/json", response.headers.get("content-type", ""))
