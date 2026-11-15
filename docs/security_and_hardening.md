# ORVEX Security Architecture & Hardening Guide

## 1. Security Overview

ORVEX is engineered for industrial IoT operational technology (OT) environments where sensor telemetry, condition monitoring, and energy-intelligence insights must remain reliable, tamper-resistant, and confidential.

This document details the layered security controls implemented in **Stage 8B**, configuration recommendations, and explicit operational limitations.

---

## 2. Hardening Measures Implemented

### 2.1 Non-Root Container Execution
All production containers execute under dedicated, unprivileged system accounts:
- **Backend Container (`backend/Dockerfile`)**: Executes as non-root user `orvex` (`UID 10001`, `GID 10001`).
- **Frontend Container (`frontend/Dockerfile`)**: Uses `nginxinc/nginx-unprivileged:alpine` running on non-privileged port `8080`.

### 2.2 Network Isolation (Purdue Model Alignment)
- In `docker-compose.prod.yml`, the PostgreSQL/TimescaleDB container publishes **no host ports**. It communicates strictly within the isolated internal bridge network `orvex-prod-network`.
- The FastAPI backend does not bind to external interfaces in production; all external requests terminate at the Nginx reverse proxy.

### 2.3 HTTP Security Headers
Every HTTP response emitted by ORVEX (both through Nginx and FastAPI middleware) contains strict defensive headers:
- `X-Content-Type-Options: nosniff`: Prevents MIME-sniffing attacks.
- `X-Frame-Options: DENY`: Prevents clickjacking and UI redressing.
- `X-XSS-Protection: 1; mode=block`: Activates browser XSS filtering.
- `Referrer-Policy: strict-origin-when-cross-origin`: Restricts referrer data leakage.
- `Content-Security-Policy`: Restricts scripts, objects, and framing to trusted origins (`'self'`).
- `Strict-Transport-Security` (HSTS): Enabled automatically when running over HTTPS.

### 2.4 Ingestion Rate Limiting & Denial-of-Service Defense
- **Max Request Body Limiter (`ContentLengthLimitMiddleware`)**: Enforces a strict 2MB ceiling (`MAX_REQUEST_BODY_BYTES=2097152`). Payloads exceeding this threshold are immediately rejected with `HTTP 413 Payload Too Large` before deserialization.
- **Client IP Rate Limiter (`RateLimitMiddleware`)**: Implements an in-memory sliding-window limiter (default `120 requests/minute` per IP). Exceeded requests receive `HTTP 429 Too Many Requests`. Infrastructure health checks (`/health`, `/api/v1/system/*`) are exempted to guarantee orchestrator uptime.

### 2.5 Strict Cross-Origin Resource Sharing (CORS)
- Wildcard `*` origins are completely disabled.
- Trusted origins are explicitly configured via the `CORS_ORIGINS` environment variable (e.g. `http://localhost:8080,http://127.0.0.1:8080`).

### 2.6 Credential Redaction & Safe Error Handling
- **Database Sanitization**: All database URLs emitted via logs or the system status endpoint (`/api/v1/system/status`) have sensitive passwords replaced with `***` using `app.core.config.redact_url()`.
- **Exception Shielding**: In production mode (`ENVIRONMENT=production`), unhandled server errors emit generic `500 Internal Server Error` JSON payloads without exposing Python tracebacks, module paths, or SQL queries.

### 2.7 MQTT Broker Authentication & Granular Topic ACLs
- The production Mosquitto broker includes template configurations for authentication and topic isolation:
  - `docker/mosquitto.prod.conf`: Disables anonymous access (`allow_anonymous false`) and points to password and ACL files.
  - `docker/acl_file.example`: Enforces least-privilege topic rules:
    - Edge sensors / hardware adapters: Write-only access to `orvex/v1/machines/+/telemetry`.
    - Backend gateway: Read-write access to ingestion topics and command queues.
    - Auditors / operators: Read-only access to event topics.

---

## 3. Explicit Security Limitations & OT Scope Statement

> [!CAUTION]
> **API Authentication Scope Limitation**:
> ORVEX currently does **NOT** enforce user authentication (e.g., JWT, OAuth2, session cookies, or API keys) on its REST API endpoints. All endpoints exposed via the backend/reverse proxy are accessible to any client that has network reachability.

### Operational Context & Rationale
ORVEX is designed as a specialized industrial edge monitoring platform deployed in **Level 2 / Level 3 (Supervisory / Control)** segments of the Purdue Enterprise Reference Architecture:
- It is intended to run on a closed, dedicated Operational Technology (OT) VLAN or isolated local mining plant network.
- It is **NOT** designed to be directly exposed to the public Internet without an upstream security boundary.

### Mandatory Production Deployment Requirements
If ORVEX must be accessed outside the local plant subnet:
1. **Never port-forward port 8000 or 8080 to the public Internet.**
2. **Deploy an Upstream Authentication Gateway**: Place an authenticating reverse proxy (e.g., Cloudflare Access, Pomerium, Traefik ForwardAuth, or Nginx with OAuth2-Proxy) in front of the platform.
3. **Use Zero-Trust Overlays**: Require operators to connect via WireGuard, Tailscale, or an enterprise site-to-site VPN.
4. **TLS Termination**: In production, terminate TLS on the ingress proxy using trusted enterprise or Let's Encrypt certificates.

### Security Roadmap (Stage 9+)
- Role-Based Access Control (RBAC): Admin, Energy Analyst, Maintenance Technician, Read-Only Operator.
- OAuth2 / OpenID Connect (OIDC) integration for single sign-on (SSO).
- Mutual TLS (mTLS) certificate-based authentication for physical hardware gateways.

