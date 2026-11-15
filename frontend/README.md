# ORVEX Frontend — Energy Intelligence Dashboard (Stage 4B)

A production-minded, responsive industrial energy-monitoring dashboard for legacy mining equipment. Built with React 19, TypeScript, Vite, and Tailwind CSS, the client consumes read-only REST APIs from the ORVEX FastAPI backend to deliver explainable equipment tracking, conservative energy analytics, and wastage episode identification.

---

## Key Features

1. **Fleet Overview Dashboard:**
   - **Header:** ORVEX branding, equipment intelligence subtitle, real-time backend connection status indicator (`ONLINE` / `OFFLINE` reflecting actual `/health` queries), and last successful data refresh time.
   - **Summary KPI Cards:** Real metrics for registered equipment, telemetry freshness breakdown (`fresh`, `stale`, `missing`), actual energy consumption (trapezoidal integration sum), estimated wasted energy, and detected wastage episode counts.
   - **Energy Visualization:** Responsive, gap-aware SVG time-series chart plotting active power (kW) against timestamps. Samples separated by dropouts $> 30\,\text{s}$ are rendered as disconnected segments to avoid fabricating false data across outages.
   - **Monitored Fleet Panel:** Lists registered assets with their operating state, latest active power, nameplate rated power, telemetry freshness badge, and timestamp. A stopped machine is cleanly distinguished from a disconnected sensor.
   - **Detected Wastage Episodes Panel:** Shows persisted deterministic detections with primary reason, duration, estimated wasted energy, confidence, status, and detection timestamp. Preserves `null` wasted energy for start/stop cycling candidates (labeled as `Not estimated`).

2. **Machine Detail View:**
   - **Equipment Parameters:** Machine UUID, site ID, identifier, equipment type, and rated power.
   - **Live Telemetry Snapshot:** Instantaneous active power, load percentage, winding/bearing temperature, power factor, and sample timestamp.
   - **Energy Summary & State Durations:** Trapezoidal actual consumption, estimated potential wastage, data coverage ratio, data quality rating (`GOOD`, `PARTIAL`, `INSUFFICIENT_DATA`), and duration breakdown for normal operating, idle, low load, and abnormal power.
   - **Power Profile Trend:** Machine-specific active power curve with nameplate rated power benchmark guideline.
   - **Paginated Raw Telemetry Log:** Bounded table with previous/next controls displaying individual telemetry measurements.

3. **Time-Range Filtering:**
   - Global selection between `Last hour` (1h), `Last 24 hours` (24h), and `Last 7 days` (7d).
   - Dynamically re-queries backend endpoints using ISO 8601 UTC timestamp bounds (`start_time`, `end_time`).

---

## Prerequisites

- **Node.js**: v20.x or higher
- **npm**: v10.x or higher
- **ORVEX Backend**: Running on `http://127.0.0.1:8000` (see `../backend/README.md`)

---

## Getting Started

### 1. Installation

Navigate to the `frontend/` directory and install dependencies:

```powershell
cd frontend
npm install
```

*(Note: `.npmrc` is configured with `legacy-peer-deps=true` to ensure clean dependency resolution across packages).*

### 2. Environment Configuration

Copy the example environment file:

```powershell
cp .env.example .env
```

Default configuration:

```ini
# Base URL for the FastAPI backend service
VITE_API_BASE_URL=http://127.0.0.1:8000
```

### 3. Development Server

Start the local Vite development server:

```powershell
npm run dev
```

The application will be accessible at:
```text
http://localhost:5173
```

### 4. Running Unit Tests

Execute the Vitest test suite covering API client behavior, formatting helpers, and UI component rendering:

```powershell
npm test
```

Watch mode:

```powershell
npm run test:watch
```

### 5. Production Build

Compile TypeScript and build the production bundle:

```powershell
npm run build
```

Preview the production build locally:

```powershell
npm run preview
```

---

## Backend Connection & CORS

The client queries the FastAPI backend running on port 8000:
- `GET /health`: Health status ping
- `GET /api/v1/machines`: Equipment directory and status
- `GET /api/v1/machines/{id}/summary`: Equipment parameters, latest readings, and telemetry freshness
- `GET /api/v1/machines/{id}/telemetry`: Time-series telemetry records
- `GET /api/v1/machines/{id}/energy-summary`: Conservative energy analytics and durations
- `GET /api/v1/machines/{id}/wastage-events`: Machine-scoped wastage events
- `GET /api/v1/wastage-events`: Global wastage events registry

FastAPI in `backend/app/main.py` is configured with `CORSMiddleware` to permit local development access from `http://localhost:5173`.

---

## Project Structure

```text
frontend/
├── .env.example              # Environment variables template
├── .npmrc                    # npm legacy peer deps configuration
├── index.html                # Entry HTML document
├── package.json              # Scripts and dependencies
├── tsconfig.json             # TypeScript configuration
├── vite.config.ts            # Vite & Tailwind & Vitest configuration
└── src/
    ├── api/
    │   ├── client.ts         # Centralized typed fetch client, error handling, timeout
    │   ├── endpoints.ts      # Strongly-typed API endpoint methods
    │   └── types.ts          # TypeScript interfaces matching backend Pydantic models
    ├── components/
    │   ├── common/
    │   │   ├── ErrorAlert.tsx          # Accessible alert banner with retry
    │   │   ├── Header.tsx              # App header with live backend status indicator
    │   │   ├── LoadingSkeleton.tsx     # Loading placeholders for cards, tables, charts
    │   │   ├── StatusBadge.tsx         # Freshness, operating state, and quality badges
    │   │   └── TimeRangeSelector.tsx   # 1h, 24h, 7d selection buttons
    │   ├── dashboard/
    │   │   ├── MachineTable.tsx        # Fleet status panel
    │   │   ├── PowerChart.tsx          # Gap-aware active power time-series visualization
    │   │   ├── SummaryMetrics.tsx      # 5 operational and energy KPI cards
    │   │   └── WastageEventsTable.tsx  # Wastage episode registry
    │   └── machine/
    │       ├── MachineEnergySummaryCard.tsx # Energy consumption, wastage, durations
    │       ├── MachineHeader.tsx            # Machine breadcrumbs and back navigation
    │       ├── MachineSpecsCard.tsx         # Asset specifications and live readings
    │       └── MachineTelemetryTable.tsx    # Paginated raw telemetry records
    ├── hooks/
    │   ├── useDashboardData.ts # Fleet data loader with error and refresh state
    │   ├── useHealth.ts        # Periodic health check polling
    │   └── useMachineDetail.ts # Machine-specific data and telemetry pagination
    ├── pages/
    │   ├── DashboardView.tsx   # Primary fleet dashboard view
    │   └── MachineDetailView.tsx # Selected machine detail view
    ├── test/
    │   ├── api.test.ts         # API client and endpoint tests
    │   ├── components.test.tsx # Common UI component tests
    │   ├── dashboard.test.tsx  # Dashboard and machine view component tests
    │   ├── formatters.test.ts  # Precision, units, and null formatting tests
    │   └── setup.ts            # Testing library jest-dom setup
    ├── utils/
    │   ├── formatters.ts       # Numerical and temporal formatting helpers
    │   └── timeRanges.ts       # ISO 8601 time window calculations
    ├── App.tsx                 # Root component and router switcher
    ├── index.css               # Industrial theme styles and Tailwind v4 import
    └── main.tsx                # React DOM entrypoint
```
