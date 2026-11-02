# Blog Backend — MVC + Express, built for horizontal scaling

A real-shaped blog API: JWT auth, MySQL pooling, pagination, search, batching,
graceful shutdown — and every design choice assumes _"there will be a load
balancer in front of this tomorrow."_

## Stack

| Layer      | Tech                             |
| ---------- | -------------------------------- |
| Runtime    | Node.js 18+                      |
| HTTP       | Express 4                        |
| DB         | MySQL 8 (mysql2 pool)            |
| Auth       | JWT (stateless — no sessions)    |
| Validation | Zod                              |
| Security   | Helmet, CORS, express-rate-limit |
| Logging    | Morgan (with per-request ID)     |

## MVC layout
