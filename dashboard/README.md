# LB Control Center

Terminal-styled dashboard for the upgraded load balancer. Live per-backend
stats, manual enable/disable/drain, runtime strategy switch, burst & sustained
traffic generators, and a client-side X-Instance tally that proves round-robin.

## Run

```bash
cd dashboard
cp .env.example .env
npm install
npm run dev
```
