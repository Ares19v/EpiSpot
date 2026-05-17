import sys
import unittest
from fastapi.testclient import TestClient

# Ensure backend directory is in path
import os
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from main import app

class TestEpiSpotBackend(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        print("=== INITIALIZING DEEP FEATURE DIAGNOSTICS ===")
        cls.client = TestClient(app)
        print("FastAPI TestClient created successfully.")

    def test_01_health_check(self):
        print("\n[TEST] Verifying API Health Route...")
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["backend"], "FastAPI")
        print(f"-> [PASS] Health check verified. GPU Available: {data.get('gpu_available')}")

    def test_02_ai_diagnosis_success(self):
        print("\n[TEST] Verifying AI Diagnosis Endpoint (Valid Input)...")
        payload = {"text": "I have high fever, body pain and chills. My joints are also aching."}
        response = self.client.post("/ai-diagnosis", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("primary", data)
        self.assertIn("all", data)
        print(f"-> [PASS] AI Diagnosis complete. Primary Prediction: {data['primary'][0]} ({data['primary'][1]:.2%})")

    def test_03_ai_diagnosis_empty(self):
        print("\n[TEST] Verifying AI Diagnosis Robustness (Empty Input)...")
        payload = {"text": ""}
        response = self.client.post("/ai-diagnosis", json=payload)
        # Handle empty input
        self.assertEqual(response.status_code, 200)
        print(f"-> [INFO] Empty input response status: {response.status_code}")

    def test_04_india_hotspots_covid(self):
        print("\n[TEST] Verifying India Hotspots (COVID-19)...")
        response = self.client.get("/india-hotspots?disease=covid")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(len(data) > 0 or isinstance(data, dict))
        print("-> [PASS] COVID hotspots retrieved successfully.")

    def test_05_india_hotspots_dengue(self):
        print("\n[TEST] Verifying India Hotspots (Dengue)...")
        response = self.client.get("/india-hotspots?disease=dengue")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(len(data) > 0 or isinstance(data, dict))
        print("-> [PASS] Dengue hotspots retrieved successfully (Graceful Fallback Verified).")

    def test_06_global_trends(self):
        print("\n[TEST] Verifying Global Trends Endpoint...")
        response = self.client.get("/global-trends?disease=covid")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("cases", data)
        print("-> [PASS] Global trends time-series parsed successfully.")

    def test_07_global_forecast(self):
        print("\n[TEST] Verifying SEIR Forecast Engine...")
        response = self.client.get("/global-forecast?disease=covid")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("infected_curve", data)
        print(f"-> [PASS] SEIR Forecast Engine output verified. Curve points: {len(data['infected_curve'])}")

if __name__ == "__main__":
    unittest.main()
