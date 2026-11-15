"""
scripts/verify_deployment.py
Automated Deployment, Health, and Security Verification Script for ORVEX.

Validates:
1. Service Health: GET /health returns 200 OK.
2. Container Readiness Probe: GET /api/v1/system/readiness returns 200 OK with healthy DB.
3. Container Liveness Probe: GET /api/v1/system/liveness returns 200 OK.
4. Comprehensive System Status: GET /api/v1/system/status returns structured observability metrics.
5. Sensitive Credential Redaction: Asserts database URL contains '***' and no plaintext passwords.
6. HTTP Security Headers: Asserts presence of nosniff, DENY frame options, CSP, and Referrer-Policy.
7. Payload Size Enforcement: Asserts POST with payload > 2MB is rejected with HTTP 413.
8. Safe Error Handling: Asserts 404 / 422 return structured JSON without leaking stack traces.
"""

import sys
import os
import requests
import json

BASE_URL = os.environ.get("ORVEX_BASE_URL", "http://127.0.0.1:8000")


def run_verification():
    print("=" * 65)
    print("      ORVEX Production & Deployment Verification Suite        ")
    print("=" * 65)
    print(f"Target URL: {BASE_URL}")

    session = requests.Session()
    tests_passed = 0
    total_tests = 8

    # 1. Health endpoint
    print("\n[1/8] Verifying Health Endpoint (GET /health)...")
    try:
        r = session.get(f"{BASE_URL}/health", timeout=5)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert data.get("status") == "ok", f"Expected status 'ok', got {data}"
        print(f"  [PASS] Status code: {r.status_code}, Response: {data}")
        tests_passed += 1
    except Exception as e:
        print(f"  [FAIL] Health check failed: {e}")
        return False

    # 2. Readiness probe
    print("\n[2/8] Verifying Readiness Probe (GET /api/v1/system/readiness)...")
    try:
        r = session.get(f"{BASE_URL}/api/v1/system/readiness", timeout=5)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert data.get("status") == "ready", f"Readiness status mismatch: {data}"
        assert data.get("database") == "connected", f"Database not connected: {data}"
        print(f"  [PASS] Status code: {r.status_code}, Readiness: {data['status']}, Database: {data['database']}")
        tests_passed += 1
    except Exception as e:
        print(f"  [FAIL] Readiness check failed: {e}")
        return False

    # 3. Liveness probe
    print("\n[3/8] Verifying Liveness Probe (GET /api/v1/system/liveness)...")
    try:
        r = session.get(f"{BASE_URL}/api/v1/system/liveness", timeout=5)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert data.get("status") in ["live", "alive"], f"Liveness mismatch: {data}"
        print(f"  [PASS] Status code: {r.status_code}, Liveness: {data['status']}")
        tests_passed += 1
    except Exception as e:
        print(f"  [FAIL] Liveness check failed: {e}")
        return False

    # 4. System status & metrics
    print("\n[4/8] Verifying System Status & Metrics (GET /api/v1/system/status)...")
    try:
        r = session.get(f"{BASE_URL}/api/v1/system/status", timeout=5)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        data = r.json()
        assert "uptime_seconds" in data, "Missing uptime_seconds"
        assert "database" in data and data["database"]["status"] == "healthy", "Database not healthy"
        assert "mqtt_gateway" in data, "Missing mqtt_gateway info"
        assert "security_posture" in data or "security" in data, "Missing security info"
        print(f"  [PASS] Service: {data.get('service')}, Uptime: {data.get('uptime_seconds')}s, DB Latency: {data['database'].get('latency_ms')}ms")
        tests_passed += 1
    except Exception as e:
        print(f"  [FAIL] System status check failed: {e}")
        return False

    # 5. Sensitive credential redaction
    print("\n[5/8] Verifying Sensitive Credential Redaction...")
    try:
        db_url = data.get("database", {}).get("url_redacted", data.get("database", {}).get("url", ""))
        assert "***" in db_url, f"Database URL does not appear redacted: {db_url}"
        assert "orvex_dev_222" not in db_url and "replace-with-a-local-secret" not in db_url, "Plaintext password exposed in database URL!"
        print(f"  [PASS] Database URL properly sanitized: {db_url}")
        tests_passed += 1
    except Exception as e:
        print(f"  [FAIL] Credential redaction check failed: {e}")
        return False

    # 6. HTTP Security Headers
    print("\n[6/8] Verifying HTTP Security Headers...")
    try:
        r = session.get(f"{BASE_URL}/health", timeout=5)
        headers = r.headers
        expected_headers = {
            "x-content-type-options": "nosniff",
            "x-frame-options": "DENY",
            "x-xss-protection": "1; mode=block",
            "referrer-policy": "strict-origin-when-cross-origin",
        }
        for h, expected_val in expected_headers.items():
            actual = headers.get(h)
            assert actual == expected_val, f"Header {h} expected '{expected_val}', got '{actual}'"

        assert "content-security-policy" in headers, "Missing Content-Security-Policy header"
        print("  [PASS] All expected HTTP security headers present and enforced:")
        for h in expected_headers:
            print(f"    - {h}: {headers.get(h)}")
        print(f"    - content-security-policy: {headers.get('content-security-policy')}")
        tests_passed += 1
    except Exception as e:
        print(f"  [FAIL] Security headers check failed: {e}")
        return False

    # 7. Payload Size Limit Enforcement (HTTP 413)
    print("\n[7/8] Verifying Max Payload Size Enforcement (HTTP 413)...")
    try:
        # Create oversized payload (> 2MB)
        oversized_data = "X" * (2 * 1024 * 1024 + 1024)
        r = session.post(
            f"{BASE_URL}/api/v1/telemetry",
            data=oversized_data,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        assert r.status_code == 413, f"Expected 413 for oversized body, got {r.status_code}"
        print(f"  [PASS] Oversized request (2MB+) correctly rejected with HTTP {r.status_code}")
        tests_passed += 1
    except Exception as e:
        print(f"  [FAIL] Payload size enforcement check failed: {e}")
        return False

    # 8. Safe Error Handling
    print("\n[8/8] Verifying Safe Error Handling (No stack traces exposed)...")
    try:
        r = session.get(f"{BASE_URL}/api/v1/non-existent-endpoint-xyz", timeout=5)
        assert r.status_code == 404, f"Expected 404, got {r.status_code}"
        assert r.headers.get("content-type", "").startswith("application/json"), "Expected JSON error response"
        err_body = r.text
        assert "Traceback" not in err_body and "File \"" not in err_body, "Stack trace leaked in error response!"
        print(f"  [PASS] Error handled safely as structured JSON without trace leakage: {r.json()}")
        tests_passed += 1
    except Exception as e:
        print(f"  [FAIL] Safe error handling check failed: {e}")
        return False

    print("\n" + "=" * 65)
    print(f"  DEPLOYMENT VERIFICATION SUMMARY: {tests_passed}/{total_tests} TESTS PASSED")
    print("=" * 65)
    return tests_passed == total_tests


if __name__ == "__main__":
    success = run_verification()
    sys.exit(0 if success else 1)
