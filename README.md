# Load Balancer Demo

A hands-on project showing how a load balancer distributes HTTP traffic across multiple backend servers that share one database.

**Stack:** React (Vite) · Node.js (load balancer + 3 API nodes) · MySQL

## Table of Contents

- [What This Demonstrates](#what-this-demonstrates)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Running the Project](#running-the-project)
- [API Reference](#api-reference)
- [Verification Tests](#verification-tests)
- [Scaling Up](#scaling-up)
- [Troubleshooting](#troubleshooting)
- [Design Notes](#design-notes)
- [Ideas for Extending](#ideas-for-extending)
- [License](#license)

---

## What This Demonstrates

| Feature               | Description                                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Round-robin balancing | Requests cycle `api-8001` → `api-8002` → `api-8003` → `api-8001`…                                 |
| Health checks         | The LB polls each backend's `/health` every 5 s, removes dead ones, and re-adds them on recovery  |
| Manual control        | Enable or disable a backend at runtime through the admin API, no restart needed                   |
| Shared database       | All backends write to the same MySQL table; the `served_by` column shows who handled each request |
| Request accounting    | Three independent counters (LB, backend, DB) must agree after any load test                       |
| Load testing          | Fire 1000 concurrent requests and watch them split roughly 33/33/34                               |

---

## Architecture

```
          Browser (React)              http://localhost:5173
                │
                │  POST /submit
                ▼
    ┌─────────────────────────┐
    │      Load Balancer      │        http://localhost:8000
    │  round-robin + health   │
    └─────────────────────────┘
        │         │         │
        ▼         ▼         ▼
   api-8001   api-8002   api-8003      identical Node.js servers
        │         │         │
        └─────────┼─────────┘
                  ▼
          ┌──────────────┐
          │    MySQL     │             lb_demo.submissions
          └──────────────┘
```

> **Key rule:** the frontend only talks to port `8000`. It never sees the backends. The load balancer is the only entry point.

---

## Project Structure

```
lb-demo/
├── package.json          Root scripts (npm run api / balance)
├── .gitignore
├── README.md
├── db/
│   └── schema.sql        Database + submissions table
├── backend/
│   ├── package.json      Depends on mysql2
│   └── server.js         API node (runs 3x on 8001/8002/8003)
├── balancer/
│   └── server.js         Load balancer (port 8000)
├── scripts/
│   └── run-api.js        Spawns N backends from one terminal
└── frontend/
    ├── package.json      React + Vite
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        └── App.jsx
```

---

## Prerequisites

| Requirement | Version                                | Check with        |
| ----------- | -------------------------------------- | ----------------- |
| Node.js     | 18 or higher                           | `node --version`  |
| MySQL       | 8 or higher, running on port 3306      | `mysql --version` |
| Shell       | Git Bash, WSL, or macOS/Linux terminal | —                 |

> **Windows:** the test commands use `$(...)`, `xargs`, and `curl`. Use **Git Bash or WSL**, not CMD or PowerShell.

---

## Setup

### Step 1. Create the database

**Option A: command line**

```bash
mysql -u root -p < db/schema.sql
```

**Option B: MySQL Workbench.** Paste and run:

```sql
CREATE DATABASE IF NOT EXISTS lb_demo CHARACTER SET utf8mb4;
USE lb_demo;

CREATE TABLE IF NOT EXISTS submissions (
  id         BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  email      VARCHAR(200) NOT NULL,
  message    TEXT         NOT NULL,
  served_by  VARCHAR(50)  NOT NULL,
  created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_served_by (served_by)
);
```

**Check it worked:**

```sql
SHOW TABLES FROM lb_demo;   -- should list "submissions"
```

### Step 2. Install dependencies

Run from the project root:

```bash
npm install                          # root (cross-env)
cd backend  && npm install && cd ..  # backend (mysql2)
cd frontend && npm install && cd ..  # frontend (React + Vite)
```

### Step 3. Set the database password (if needed)

If your MySQL `root` user has a password, pass it as an environment variable when starting the backends (see [Running the Project](#running-the-project)):

```bash
DB_PASSWORD=yourpassword npm run api -- 8001 8002 8003
```

Alternatively, hardcode it in the `mysql.createPool({ ... })` block in `backend/server.js`. That's fine for a local demo, never for production.

---

## Running the Project

Open **three terminals** at the project root. Start them in this order.

### Terminal 1: backends

```bash
npm run api -- 8001 8002 8003
```

Expected output:

```
[launcher] Starting api-8001 on port 8001
[launcher] Starting api-8002 on port 8002
[launcher] Starting api-8003 on port 8003
[api-8001] listening on http://localhost:8001 (pid 12345)
[api-8002] listening on http://localhost:8002 (pid 12346)
[api-8003] listening on http://localhost:8003 (pid 12347)
```

### Terminal 2: load balancer

```bash
npm run balance
```

Expected output:

```
LB listening on http://localhost:8000
API_PORTS = 8001,8002,8003
  api-8001 → http://localhost:8001
  api-8002 → http://localhost:8002
  api-8003 → http://localhost:8003
Health check every 5000ms
```

### Terminal 3: frontend (optional)

```bash
cd frontend && npm run dev
```

Open <http://localhost:5173>. The form submits to `localhost:8000` (the LB).

### Quick sanity check

```bash
curl http://localhost:8000/admin/health
```

You should see all three servers listed as healthy.

---

## API Reference

### Admin endpoints (balancer, port 8000)

| Method | Path                           | Purpose                                                    |
| ------ | ------------------------------ | ---------------------------------------------------------- |
| `GET`  | `/admin/health`                | Snapshot: enabled, healthy, and `totalProxied` per backend |
| `GET`  | `/admin/servers`               | Full server registry                                       |
| `POST` | `/admin/servers/:name/disable` | Take a backend out of rotation                             |
| `POST` | `/admin/servers/:name/enable`  | Put it back in rotation                                    |
| `GET`  | `/health`                      | The LB's own health check                                  |

Example:

```bash
curl -X POST http://localhost:8000/admin/servers/api-8002/disable
```

The backend keeps running; the LB just skips it.

### Backend endpoints (ports 8001 / 8002 / 8003)

| Method | Path           | Purpose                                             |
| ------ | -------------- | --------------------------------------------------- |
| `GET`  | `/health`      | Used by the LB (not counted as real traffic)        |
| `GET`  | `/submissions` | Last 50 submissions from MySQL                      |
| `GET`  | `/stats`       | Row counts by `served_by` plus this node's counters |
| `GET`  | `/self-stats`  | This node's in-memory counters only                 |
| `POST` | `/submit`      | Insert a submission (requires `name` and `email`)   |

All of these are also reachable **through the LB**. Call `localhost:8000/...` and the LB picks a backend.

---

## Verification Tests

Run these in order. Each one builds on the previous.

### Test 1: Round-robin

```bash
for i in $(seq 1 9); do
  curl -s -X POST http://localhost:8000/submit \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"u$i\",\"email\":\"u$i@x.com\",\"message\":\"test\"}" \
    | grep -o '"servedBy":"[^"]*"'
done
```

**Expected:** 3x `api-8001`, 3x `api-8002`, 3x `api-8003`.

**LB log (Terminal 2):**

```
[lb] POST /submit → api-8001 (total for api-8001: 1)
[lb] POST /submit → api-8002 (total for api-8002: 1)
[lb] POST /submit → api-8003 (total for api-8003: 1)
```

**Backend log (Terminal 1):**

```
[api-8001] #1 POST /submit | x-target=api-8001 x-forwarded-for=::1 x-forwarded-by=balance.local
```

### Test 2: Manual disable and enable

```bash
# Disable
curl -X POST http://localhost:8000/admin/servers/api-8002/disable
```

Send another 10 requests (re-run Test 1). **Expected:** `api-8002` never appears.

```bash
# Re-enable
curl -X POST http://localhost:8000/admin/servers/api-8002/enable
```

### Test 3: Auto-heal

1. In Terminal 1, press `Ctrl+C`. This kills **all three** backends.
2. Restart one of them:

   ```bash
   npm run api -- 8002
   ```

3. Watch Terminal 2:

   ```
   [health] api-8002 DOWN (ECONNREFUSED)
   ...
   [health] api-8002 UP
   ```

**Expected:** the LB re-adds the backend within 5 s, no LB restart needed.

### Test 4: Three-counter consistency

Compare the LB, each backend, and the database:

```bash
# LB's view
curl -s http://localhost:8000/admin/health | jq '.servers[] | {name, totalProxied}'

# Each backend's own view
curl -s http://localhost:8001/self-stats | jq .total
curl -s http://localhost:8002/self-stats | jq .total
curl -s http://localhost:8003/self-stats | jq .total
```

```sql
-- Database view (ground truth)
SELECT served_by, COUNT(*) FROM lb_demo.submissions GROUP BY served_by;
```

**Expected:** for each backend, all three numbers match. If they don't, requests are being lost somewhere.

### Test 5: Load test (1000 requests)

Pick one:

**Sequential (slow, ~60 s)**

```bash
for i in $(seq 1 1000); do
  curl -s -X POST http://localhost:8000/submit \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"u$i\",\"email\":\"u$i@x.com\",\"message\":\"load\"}" \
    -o /dev/null -w "%{http_code}\n"
done | sort | uniq -c
```

**Parallel (fast, real concurrency)**

```bash
seq 1 1000 | xargs -P 20 -I {} \
  curl -s -X POST http://localhost:8000/submit \
    -H "Content-Type: application/json" \
    -d '{"name":"p{}","email":"p{}@x.com","message":"par"}' \
    -o /dev/null -w "%{http_code}\n" | sort | uniq -c
```

**With latency stats (autocannon)**

```bash
npx autocannon -c 50 -a 1000 -m POST \
  -H "Content-Type: application/json" \
  -b '{"name":"autocannon","email":"ac@x.com","message":"bench"}' \
  http://localhost:8000/submit
```

**Expected:** `1000 201` for the first two. Then re-run **Test 4**; all counters should agree and the split should be roughly 33/33/34.

> **Tip:** reset between runs with `TRUNCATE lb_demo.submissions;`

---

## Scaling Up

Add more backends by passing more ports:

```bash
# Terminal 1: five backends
npm run api -- 8001 8002 8003 8004 8005

# Terminal 2: tell the LB about all five
npm run balance:5
```

> **Important:** the port list in the balancer and the args to `npm run api` must match. That's the only coordination required.

`balance:5` uses `cross-env`, so it works on Windows, Git Bash, and Unix shells.

---

## Troubleshooting

| Symptom                     | Cause                                                  | Fix                                                                         |
| --------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| `mysql: command not found`  | MySQL not on PATH                                      | Install MySQL, or add `C:\Program Files\MySQL\MySQL Server 8.0\bin` to PATH |
| `ER_ACCESS_DENIED_ERROR`    | Wrong DB password                                      | Start with `DB_PASSWORD=...` or edit `backend/server.js`                    |
| `503 No healthy backends`   | All backends are down or disabled                      | Check `curl localhost:8000/admin/health`                                    |
| `502 Bad Gateway`           | A backend died and the health check hasn't noticed yet | Wait up to 5 s and retry                                                    |
| CORS errors in browser      | Frontend is calling a backend directly                 | Make sure the frontend's API URL is the LB (`localhost:8000`)               |
| `EADDRINUSE` / port in use  | Another process owns 8000–8003                         | Kill it or change ports                                                     |
| Duplicate rows after reruns | Each run inserts new rows                              | Expected. Use `TRUNCATE lb_demo.submissions;`                               |

---

## Design Notes

**Why the LB is a separate process**

- A browser can't receive HTTP requests, so it can't be a load balancer.
- Backend code runs after the request has already arrived, which is too late to balance it.
- So the LB must be its own program sitting in front of the backends.

**Why the LB can see request data**
When the LB terminates TLS (the standard setup), it decrypts the request, routes on path and headers, then forwards it to the backend. Encrypting the body hides the payload, but headers (cookies, auth tokens, paths) remain visible to the LB.

**Why the frontend must only call the LB**
A request sent directly to a backend bypasses health checks, logging, rate limiting, and failover. In production, backends sit on a private network and only the LB has a public IP.

**Why backends must be stateless**
Sessions and user state belong in Redis or the database, not in a backend's memory. If one backend dies, the next request must be servable by any other.

**Why three counters (LB / node / DB)**

| Counter | Measures                                |
| ------- | --------------------------------------- |
| LB      | Requests it _sent_ to each backend      |
| Node    | Requests that _arrived_ at each backend |
| DB      | Requests that were _persisted_          |

If all three agree, the request path has end-to-end integrity. If any two disagree, something is dropping requests.

---

## Ideas for Extending

1. **Least-connections:** route to the backend with the fewest active requests, which handles uneven load better.
2. **Draining:** on disable, stop new requests but let in-flight ones finish (30 s grace window).
3. **Sticky sessions:** pin a client to a backend via cookie.
4. **Weighted round-robin:** give a bigger machine 2x the traffic.
5. **Live dashboard:** poll `/admin/health` every second from React and render per-backend bars.
6. **Metrics export:** expose `/metrics` in Prometheus format and add Grafana.
7. **TLS termination:** serve the LB over `https.createServer()` with backends on a private network.

---

## License

MIT. It's a learning project.
