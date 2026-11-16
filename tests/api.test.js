import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import pg from "pg";

const database = process.env.TEST_DATABASE_URL;
// This suite creates records only in an explicitly selected test database.
if (database && !new URL(database).pathname.endsWith("_test"))
  throw Error(
    "TEST_DATABASE_URL must end with a database name ending in _test",
  );

test("PostgreSQL-backed API integration", { skip: !database }, async (t) => {
  const port = process.env.TEST_PORT || "3179",
    base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, ["server/index.js"], {
    env: {
      ...process.env,
      DATABASE_URL: database,
      PORT: port,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let logs = "";
  server.stdout.on("data", (chunk) => (logs += chunk));
  server.stderr.on("data", (chunk) => (logs += chunk));
  const pool = new pg.Pool({ connectionString: database });
  t.after(async () => {
    server.kill();
    await pool.end();
  });
  let ready = false;
  for (let i = 0; i < 80; i++) {
    try {
      const r = await fetch(base + "/api/health");
      if (r.ok) {
        ready = true;
        break;
      }
    } catch {}
    if (server.exitCode !== null) break;
    await delay(100);
  }
  assert.ok(ready, "API failed to start: " + logs);
  const suffix = randomUUID(),
    password = "Test-only-password-482!";
  const ownerEmail = `owner-${suffix}@example.test`,
    otherEmail = `other-${suffix}@example.test`;
  async function request(
    path,
    { cookie, body, method = body ? "POST" : "GET", headers = {} } = {},
  ) {
    const response = await fetch(base + "/api" + path, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return {
      status: response.status,
      data: await response.json(),
      cookie: response.headers.get("set-cookie")?.split(";")[0],
      headers: response.headers,
    };
  }
  let owner, other, manager, staff, product, employee, store;
  await t.test("health confirms database availability", async () =>
    assert.deepEqual((await request("/health")).data, { status: "ok" }),
  );
  await t.test("workspace requires a session", async () =>
    assert.equal((await request("/workspace")).status, 401),
  );
  await t.test(
    "malformed signup is rejected without a server error",
    async () => {
      assert.equal(
        (
          await request("/auth/signup", {
            body: { name: 42, business: "Test", email: ownerEmail, password },
          })
        ).status,
        400,
      );
    },
  );
  await t.test(
    "signup starts with an empty workspace and an HttpOnly cookie",
    async () => {
      owner = await request("/auth/signup", {
        body: {
          name: "Test owner",
          business: "Clothing test",
          email: ownerEmail,
          password,
        },
      });
      assert.equal(owner.status, 200);
      assert.equal(owner.data.role, "Owner");
      assert.match(owner.headers.get("set-cookie"), /HttpOnly/i);
      assert.match(owner.headers.get("set-cookie"), /SameSite=Strict/i);
      assert.equal(
        (await request("/workspace", { cookie: owner.cookie })).data.inventory
          .length,
        0,
      );
      other = await request("/auth/signup", {
        body: {
          name: "Other owner",
          business: "Other business",
          email: otherEmail,
          password,
        },
      });
      assert.equal(other.status, 200);
    },
  );
  await t.test(
    "duplicate email does not leave an orphan business",
    async () => {
      const before = (await pool.query("SELECT count(*) FROM businesses"))
        .rows[0].count;
      assert.equal(
        (
          await request("/auth/signup", {
            body: {
              name: "Duplicate",
              business: "Orphan?",
              email: ownerEmail,
              password,
            },
          })
        ).status,
        409,
      );
      assert.equal(
        (await pool.query("SELECT count(*) FROM businesses")).rows[0].count,
        before,
      );
    },
  );
  await t.test("wrong password is rejected", async () =>
    assert.equal(
      (
        await request("/auth/login", {
          body: { email: ownerEmail, password: "incorrect-password" },
        })
      ).status,
      401,
    ),
  );
  await t.test(
    "owner creates store, inventory and employee records",
    async () => {
      store = await request("/records/stores", {
        cookie: owner.cookie,
        body: {
          name: "Test store",
          address: "Test address",
          manager: "Test manager",
          revenue: 1000,
          expenses: 400,
          status: "Active",
        },
      });
      assert.equal(store.status, 200);
      product = await request("/records/inventory", {
        cookie: owner.cookie,
        body: {
          name: "Tee",
          sku: "T-1",
          stock: 8,
          minimum: 10,
          price: 20,
          cost: 5,
          location: "Test store",
        },
      });
      assert.equal(product.status, 200);
      employee = await request("/records/employees", {
        cookie: owner.cookie,
        body: {
          name: "Test employee",
          email: "employee@example.test",
          role: "Staff",
          location: "Test store",
          salary: 500,
          due: "2026-01-31",
          status: "Active",
        },
      });
      assert.equal(employee.status, 200);
    },
  );
  await t.test(
    "invalid numbers and impossible dates are rejected",
    async () => {
      assert.equal(
        (
          await request("/records/inventory", {
            cookie: owner.cookie,
            body: { name: "Bad", stock: -1 },
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request("/records/inventory", {
            cookie: owner.cookie,
            body: { name: "Bad", stock: 1.5 },
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request("/records/employees", {
            cookie: owner.cookie,
            body: { name: "Bad", due: "2026-02-30" },
          })
        ).status,
        400,
      );
    },
  );
  await t.test(
    "businesses cannot read, overwrite or delete each other’s records",
    async () => {
      assert.equal(
        (await request("/workspace", { cookie: other.cookie })).data.inventory
          .length,
        0,
      );
      for (const method of ["PUT", "DELETE"])
        assert.equal(
          (
            await request("/records/inventory/" + product.data.id, {
              cookie: other.cookie,
              method,
              ...(method === "PUT" ? { body: { name: "Stolen" } } : {}),
            })
          ).status,
          404,
        );
      assert.equal(
        (await request("/workspace", { cookie: owner.cookie })).data
          .inventory[0].name,
        "Tee",
      );
    },
  );
  await t.test("SQL-looking text is stored as data", async () => {
    const name = "Tee'); DROP TABLE records; --";
    assert.equal(
      (
        await request("/records/inventory/" + product.data.id, {
          cookie: owner.cookie,
          method: "PUT",
          body: { name },
        })
      ).status,
      200,
    );
    assert.equal(
      (await request("/workspace", { cookie: owner.cookie })).data.inventory[0]
        .name,
      name,
    );
  });
  await t.test(
    "owner can create Manager and Staff login accounts",
    async () => {
      for (const role of ["Manager", "Staff"]) {
        const email = `${role.toLowerCase()}-${suffix}@example.test`;
        assert.equal(
          (
            await request("/accounts", {
              cookie: owner.cookie,
              body: { name: role, email, password, role },
            })
          ).status,
          200,
        );
        const result = await request("/auth/login", {
          body: { email, password },
        });
        assert.equal(result.status, 200);
        if (role === "Manager") manager = result;
        else staff = result;
      }
    },
  );
  await t.test(
    "staff is read-only and cannot manage accounts or payroll",
    async () => {
      for (const [path, body] of [
        ["/records/inventory", { name: "Forbidden" }],
        ["/payroll/" + employee.data.id, {}],
        ["/accounts", {}],
      ])
        assert.equal(
          (await request(path, { cookie: staff.cookie, body })).status,
          403,
        );
    },
  );
  await t.test(
    "manager can edit inventory but cannot access franchises",
    async () => {
      assert.equal(
        (
          await request("/records/inventory/" + product.data.id, {
            cookie: manager.cookie,
            method: "PUT",
            body: { stock: 12 },
          })
        ).status,
        200,
      );
      assert.equal(
        (
          await request("/records/franchises", {
            cookie: manager.cookie,
            body: { name: "Forbidden" },
          })
        ).status,
        403,
      );
      assert.equal(
        (
          await request("/payroll/" + employee.data.id, {
            cookie: manager.cookie,
            body: {},
          })
        ).status,
        403,
      );
    },
  );
  await t.test(
    "salary fields stay private in reads AND mutation responses",
    async () => {
      for (const cookie of [manager.cookie, staff.cookie]) {
        const row = (await request("/workspace", { cookie })).data.employees[0];
        assert.ok(!("salary" in row));
        assert.ok(!("due" in row));
      }
      const changed = await request("/records/employees/" + employee.data.id, {
        cookie: manager.cookie,
        method: "PUT",
        body: { name: "Updated employee", salary: 9999, due: "2026-12-01" },
      });
      assert.equal(changed.status, 200);
      assert.ok(!("salary" in changed.data));
      assert.ok(!("due" in changed.data));
      const actual = (await request("/workspace", { cookie: owner.cookie }))
        .data.employees[0];
      assert.equal(actual.salary, 500);
      assert.equal(actual.due, "2026-01-31");
    },
  );
  await t.test(
    "payroll saves a payment and clamps the due date in one transaction",
    async () => {
      assert.equal(
        (
          await request("/payroll/" + employee.data.id, {
            cookie: owner.cookie,
            body: {},
          })
        ).status,
        200,
      );
      const actual = (await request("/workspace", { cookie: owner.cookie }))
        .data.employees[0];
      assert.equal(actual.due, "2026-02-28");
      const payments = await pool.query(
        "SELECT amount FROM payments WHERE employee_id=$1",
        [employee.data.id],
      );
      assert.equal(payments.rowCount, 1);
      assert.equal(Number(payments.rows[0].amount), 500);
    },
  );
  await t.test(
    "failed record edits leave no activity or data changes",
    async () => {
      const before = (await request("/workspace", { cookie: owner.cookie }))
        .data;
      assert.equal(
        (
          await request("/records/inventory/" + product.data.id, {
            cookie: owner.cookie,
            method: "PUT",
            body: { stock: -50 },
          })
        ).status,
        400,
      );
      const after = (await request("/workspace", { cookie: owner.cookie }))
        .data;
      assert.equal(after.inventory[0].stock, 12);
      assert.equal(after.activity.length, before.activity.length);
    },
  );
  await t.test(
    "unknown record types, invalid UUIDs and cross-origin writes fail",
    async () => {
      assert.equal(
        (
          await request("/records/toString", {
            cookie: owner.cookie,
            body: { name: "Bad" },
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await request("/records/inventory/not-a-uuid", {
            cookie: owner.cookie,
            method: "DELETE",
          })
        ).status,
        400,
      );
      assert.equal(
        (
          await request("/records/inventory", {
            cookie: owner.cookie,
            body: { name: "Bad" },
            headers: { Origin: "https://untrusted.example" },
          })
        ).status,
        403,
      );
      assert.equal(
        (await request("/does-not-exist", { cookie: owner.cookie })).status,
        404,
      );
    },
  );
  await t.test("owner can delete a record", async () => {
    assert.equal(
      (
        await request("/records/inventory/" + product.data.id, {
          cookie: owner.cookie,
          method: "DELETE",
        })
      ).status,
      200,
    );
    assert.equal(
      (await request("/workspace", { cookie: owner.cookie })).data.inventory
        .length,
      0,
    );
  });
  await t.test(
    "passwords and session tokens are not stored as plaintext",
    async () => {
      const account = (
        await pool.query("SELECT id,password FROM accounts WHERE email=$1", [
          ownerEmail,
        ])
      ).rows[0];
      assert.notEqual(account.password, password);
      assert.match(account.password, /^[a-f0-9]+:[a-f0-9]+$/);
      const token = (
        await pool.query("SELECT token FROM sessions WHERE account_id=$1", [
          account.id,
        ])
      ).rows[0].token;
      assert.notEqual(token, owner.cookie.split("=")[1]);
    },
  );
  await t.test("logout invalidates the session", async () => {
    assert.equal(
      (await request("/auth/logout", { cookie: owner.cookie, method: "POST" }))
        .status,
      200,
    );
    assert.equal(
      (await request("/workspace", { cookie: owner.cookie })).status,
      401,
    );
  });
  await t.test("authentication requests are rate-limited", async () => {
    let status;
    for (let i = 0; i < 31; i++) {
      status = (
        await request("/auth/login", {
          body: { email: "missing@example.test", password: 42 },
        })
      ).status;
      if (status === 429) break;
    }
    assert.equal(status, 429);
  });
});
