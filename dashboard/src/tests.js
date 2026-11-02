/**
 * Pre-made tests. Each `run(ctx)` returns { pass, detail }.
 *
 * ctx surface:
 *   burst(n)              → { dist, ok, ms, failures }
 *   setStrategy(s)        → mutate LB strategy
 *   serverAction(n, a)    → enable|disable|drain|undrain
 *   resetLB()             → zero LB counters
 *   resetAll()            → zero LB + truncate blog DB
 *   showDistribution(d)   → update the right-hand bar chart
 *   fetchJSON(path, opts) → fetch + JSON, throws on !ok
 *   fetchRaw(path, opts)  → raw fetch (check .status yourself)
 *   servers               → snapshot at test start
 *   originalStrategy      → value of strategy when test began
 *   pass(msg) / fail(msg) → build the result object
 */

export const TESTS = [
  {
    id: "round-robin",
    name: "Round-robin distribution",
    description:
      "Fire 30 requests through the LB. Each of the 3 healthy backends should get ~10.",
    async run(ctx) {
      await ctx.setStrategy("round-robin");
      const { dist, ok } = await ctx.burst(30);
      ctx.showDistribution(dist);

      const names = Object.keys(dist).filter(
        (n) => n.startsWith("api-") || n.startsWith("blog-"),
      );
      if (names.length < 3) {
        return ctx.fail(
          `expected ≥3 backends, got ${names.length}: ${JSON.stringify(dist)}`,
        );
      }
      if (ok < 30) return ctx.fail(`${30 - ok}/30 requests failed`);

      const counts = names.map((n) => dist[n]);
      const spread = Math.max(...counts) - Math.min(...counts);
      if (spread > 3)
        return ctx.fail(`uneven: ${JSON.stringify(dist)} (spread=${spread})`);

      return ctx.pass(`${JSON.stringify(dist)} — spread=${spread}`);
    },
  },

  {
    id: "disable",
    name: "Manual disable",
    description:
      "Disable one healthy backend, burst 20 requests. It must receive 0. Re-enables after.",
    async run(ctx) {
      const healthy = ctx.servers.filter((s) => s.healthy && s.enabled);
      if (healthy.length < 2)
        return ctx.fail("need ≥2 healthy backends to run this");
      const target = healthy[0].name;

      try {
        await ctx.serverAction(target, "disable");
        const { dist } = await ctx.burst(20);
        ctx.showDistribution(dist);

        if ((dist[target] || 0) > 0) {
          return ctx.fail(
            `${target} received ${dist[target]} req while disabled`,
          );
        }
        return ctx.pass(
          `${target} received 0 (others split ${Object.keys(dist).join(",")})`,
        );
      } finally {
        await ctx.serverAction(target, "enable");
      }
    },
  },

  {
    id: "least-conn",
    name: "Least-connections strategy",
    description:
      "Switch to least-connections, burst 60. Distribution should stay balanced (tie-break keeps it even).",
    async run(ctx) {
      const prev = ctx.originalStrategy;
      try {
        await ctx.setStrategy("least-connections");
        const { dist } = await ctx.burst(60);
        ctx.showDistribution(dist);

        const counts = Object.values(dist);
        const spread = Math.max(...counts) - Math.min(...counts);
        if (spread > 5) return ctx.fail(`imbalanced: ${JSON.stringify(dist)}`);
        return ctx.pass(`${JSON.stringify(dist)} — spread=${spread}`);
      } finally {
        await ctx.setStrategy(prev);
      }
    },
  },

  {
    id: "counter-integrity",
    name: "LB counter integrity",
    description:
      "Reset LB counters, burst 25, verify the sum of per-backend totals equals 25.",
    async run(ctx) {
      await ctx.resetLB();
      const { ok } = await ctx.burst(25);
      if (ok < 25) return ctx.fail(`${25 - ok}/25 requests failed`);

      const r = await ctx.fetchJSON("/admin/health");
      const sum = r.servers.reduce((s, x) => s + x.totalProxied, 0);
      if (sum !== 25)
        return ctx.fail(`LB counted ${sum}/25 — dropped ${25 - sum}`);

      return ctx.pass(
        `LB counter = 25 (${r.servers.map((s) => `${s.name}:${s.totalProxied}`).join(" ")})`,
      );
    },
  },

  {
    id: "load-200",
    name: "Load test — 200 reqs",
    description:
      "Burst 200 through the LB. All must succeed, split should stay roughly even.",
    async run(ctx) {
      const t0 = performance.now();
      const { dist, ok } = await ctx.burst(200);
      const ms = Math.round(performance.now() - t0);
      ctx.showDistribution(dist);

      if (ok < 200) return ctx.fail(`${200 - ok}/200 failed`);
      const counts = Object.values(dist);
      const spread = Math.max(...counts) - Math.min(...counts);
      if (spread > 15)
        return ctx.fail(`uneven under load: ${JSON.stringify(dist)}`);

      const rps = Math.round(200 / (ms / 1000));
      return ctx.pass(`200/200 ok in ${ms}ms (${rps} rps) — spread=${spread}`);
    },
  },

  {
    id: "all-down",
    name: "All-down 503",
    description:
      "Disable every backend, GET through LB must return 503. Restores all after.",
    async run(ctx) {
      const names = ctx.servers.map((s) => s.name);
      if (!names.length) return ctx.fail("no backends registered");

      try {
        for (const n of names) await ctx.serverAction(n, "disable");
        const r = await ctx.fetchRaw("/api/posts?limit=1");
        if (r.status !== 503) return ctx.fail(`expected 503, got ${r.status}`);
        return ctx.pass(`${names.length} backends disabled → 503 as expected`);
      } finally {
        for (const n of names) await ctx.serverAction(n, "enable");
      }
    },
  },

  {
    id: "drain",
    name: "Drain mode",
    description:
      "Drain one backend, burst 20. Drained backend gets 0 new requests but doesn't error. Undrains after.",
    async run(ctx) {
      const target = ctx.servers.find((s) => s.healthy && s.enabled);
      if (!target) return ctx.fail("no healthy backend to drain");

      try {
        await ctx.serverAction(target.name, "drain");
        const { dist, ok } = await ctx.burst(20);
        ctx.showDistribution(dist);

        if ((dist[target.name] || 0) > 0) {
          return ctx.fail(
            `${target.name} still received ${dist[target.name]} while draining`,
          );
        }
        if (ok < 20) return ctx.fail(`${20 - ok}/20 failed during drain`);
        return ctx.pass(`${target.name} drained → 0 new; others served 20/20`);
      } finally {
        await ctx.serverAction(target.name, "undrain");
      }
    },
  },

  {
    id: "crud",
    name: "Blog CRUD roundtrip",
    description:
      "Register → create post → fetch by slug → delete post, all through the LB. Requires the blog backend on the API_PORTS targets.",
    async run(ctx) {
      const uid = Date.now();
      const username = `t${uid}`;
      const email = `${username}@x.com`;

      const reg = await ctx.fetchJSON("/api/auth/register", {
        method: "POST",
        body: { username, email, password: "hunter22" },
      });
      if (!reg.token) return ctx.fail("register returned no token");

      const auth = { Authorization: `Bearer ${reg.token}` };
      const create = await ctx.fetchJSON("/api/posts", {
        method: "POST",
        body: { title: `Test Post ${uid}`, body: "test body" },
        headers: auth,
      });
      if (!create.data?.id) return ctx.fail("post create returned no id");

      const get = await ctx.fetchJSON(`/api/posts/${create.data.slug}`);
      if (get.data?.title !== create.data.title) {
        return ctx.fail(
          `fetch mismatch: expected "${create.data.title}", got "${get.data?.title}"`,
        );
      }

      await ctx.fetchJSON(`/api/posts/${create.data.id}`, {
        method: "DELETE",
        headers: auth,
      });

      return ctx.pass(
        `registered ${username}, created & deleted post ${create.data.id}`,
      );
    },
  },
  {
    id: "dynamic-registration",
    name: "Dynamic add/remove",
    description:
      "Register a fresh port at runtime, verify it appears, then deregister it. Uses a throwaway port that nothing is listening on.",
    async run(ctx) {
      const testPort = 19999;

      // Clean any leftover from a prior aborted run.
      const before = await ctx.fetchJSON("/admin/health");
      if (before.servers.some((s) => s.name === `api-${testPort}`)) {
        await ctx.fetchJSON("/admin/servers/remove", {
          method: "POST",
          body: { port: testPort },
        });
      }

      try {
        const add = await ctx.fetchJSON("/admin/servers/add", {
          method: "POST",
          body: { port: testPort, weight: 2 },
        });
        if (add.name !== `api-${testPort}`) {
          return ctx.fail(`add returned wrong name: ${add.name}`);
        }
        if (add.weight !== 2) {
          return ctx.fail(`weight mismatch: expected 2, got ${add.weight}`);
        }

        const mid = await ctx.fetchJSON("/admin/health");
        const found = mid.servers.find((s) => s.name === `api-${testPort}`);
        if (!found) {
          return ctx.fail(
            `api-${testPort} not present in /admin/health after add`,
          );
        }

        const remove = await ctx.fetchJSON("/admin/servers/remove", {
          method: "POST",
          body: { port: testPort },
        });
        if (remove.removed !== `api-${testPort}`) {
          return ctx.fail(`remove returned wrong name: ${remove.removed}`);
        }

        const after = await ctx.fetchJSON("/admin/health");
        if (after.servers.some((s) => s.name === `api-${testPort}`)) {
          return ctx.fail(`api-${testPort} still present after remove`);
        }

        return ctx.pass(`added + removed api-${testPort} (weight=2) cleanly`);
      } catch (err) {
        // Best-effort cleanup so a failed test doesn't pollute state.
        try {
          await ctx.fetchJSON("/admin/servers/remove", {
            method: "POST",
            body: { port: testPort },
          });
        } catch {}
        throw err;
      }
    },
  },
];
