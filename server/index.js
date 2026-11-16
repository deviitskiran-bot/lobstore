import express from "express";
import pg from "pg";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  randomUUID,
  createHash,
} from "node:crypto";
import { nextPayDate, isCalendarDate } from "../shared/dates.js";
const app = express(),
  pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
if (!process.env.DATABASE_URL)
  throw new Error("Set DATABASE_URL before starting Lobstore.");
app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use((req, res, next) => {
  if (
    req.method !== "GET" &&
    req.headers.origin &&
    req.headers.origin !== `${req.protocol}://${req.headers.host}` &&
    !["http://127.0.0.1:5173", "http://localhost:5173"].includes(
      req.headers.origin,
    )
  )
    return res.status(403).json({ error: "Origin not allowed" });
  next();
});
await pool.query(
  `CREATE TABLE IF NOT EXISTS businesses(id uuid PRIMARY KEY,name text NOT NULL); CREATE TABLE IF NOT EXISTS accounts(id uuid PRIMARY KEY,business_id uuid REFERENCES businesses(id),name text NOT NULL,email text UNIQUE NOT NULL,password text NOT NULL,role text NOT NULL CHECK(role IN ('Owner','Manager','Staff'))); CREATE TABLE IF NOT EXISTS sessions(token text PRIMARY KEY,account_id uuid REFERENCES accounts(id),expires timestamptz NOT NULL); CREATE TABLE IF NOT EXISTS records(id uuid PRIMARY KEY,business_id uuid REFERENCES businesses(id),kind text NOT NULL,data jsonb NOT NULL); CREATE TABLE IF NOT EXISTS activity(id uuid PRIMARY KEY,business_id uuid REFERENCES businesses(id),text text NOT NULL,created_at timestamptz DEFAULT now()); CREATE TABLE IF NOT EXISTS payments(id uuid PRIMARY KEY,business_id uuid REFERENCES businesses(id),employee_id uuid,amount numeric NOT NULL,paid_at timestamptz DEFAULT now());`,
);
const wrap = (fn) => (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next),
  hash = (t) => createHash("sha256").update(t).digest("hex");
const safe = (a) => ({ id: a.id, name: a.name, email: a.email, role: a.role });
async function session(res, a) {
  const token = randomBytes(32).toString("hex");
  await pool.query(
    "INSERT INTO sessions VALUES($1,$2,now()+interval '7 days')",
    [hash(token), a.id],
  );
  res.cookie("lob_session", token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 604800000,
    path: "/",
  });
  res.json(safe(a));
}
app.get(
  "/api/health",
  wrap(async (req, res) => {
    await pool.query("SELECT 1");
    res.json({ status: "ok" });
  }),
);
const attempts = new Map();
app.use("/api/auth", (req, res, next) => {
  const key = req.ip,
    now = Date.now();
  for (const [ip, attempt] of attempts)
    if (now - attempt.time >= 900000) attempts.delete(ip);
  const entry = attempts.get(key);
  if (entry && now - entry.time < 900000 && entry.count >= 30)
    return res
      .status(429)
      .json({ error: "Too many attempts. Try again in 15 minutes." });
  attempts.set(key, {
    time: entry && now - entry.time < 900000 ? entry.time : now,
    count: entry && now - entry.time < 900000 ? entry.count + 1 : 1,
  });
  next();
});
app.post(
  "/api/auth/signup",
  wrap(async (req, res) => {
    const { name, email, password, business } = req.body;
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 200 ||
      typeof business !== "string" ||
      !business.trim() ||
      business.length > 200 ||
      typeof email !== "string" ||
      email.length > 254 ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      typeof password !== "string" ||
      password.length < 10 ||
      password.length > 256
    )
      return res.status(400).json({
        error:
          "Provide a name, business, valid email and a password of 10–256 characters.",
      });
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const bid = randomUUID(),
        id = randomUUID(),
        salt = randomBytes(16).toString("hex");
      await c.query("INSERT INTO businesses VALUES($1,$2)", [
        bid,
        business.trim(),
      ]);
      const result = await c.query(
        "INSERT INTO accounts VALUES($1,$2,$3,$4,$5,$6) RETURNING *",
        [
          id,
          bid,
          name.trim(),
          email.toLowerCase().trim(),
          salt + ":" + scryptSync(password, salt, 64).toString("hex"),
          "Owner",
        ],
      );
      await c.query("COMMIT");
      await session(res, result.rows[0]);
    } catch (e) {
      await c.query("ROLLBACK");
      if (e.code === "23505")
        return res
          .status(409)
          .json({ error: "An account already exists for this email." });
      throw e;
    } finally {
      c.release();
    }
  }),
);
app.post(
  "/api/auth/login",
  wrap(async (req, res) => {
    const { email, password } = req.body;
    if (typeof password !== "string" || password.length > 256)
      return res.status(400).json({ error: "Invalid credentials" });
    const a = (
      await pool.query("SELECT * FROM accounts WHERE email=$1", [
        String(email).toLowerCase().trim(),
      ])
    ).rows[0];
    const [salt, stored] = (
      a?.password ||
      "invalid:" + scryptSync("dummy", "invalid", 64).toString("hex")
    ).split(":");
    const valid = timingSafeEqual(
      Buffer.from(stored, "hex"),
      scryptSync(password, salt, 64),
    );
    if (!a || !valid)
      return res.status(401).json({ error: "Email or password is incorrect." });
    await session(res, a);
  }),
);
app.use(
  "/api",
  wrap(async (req, res, next) => {
    const token = req.headers.cookie
      ?.split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("lob_session="))
      ?.slice(12);
    if (!token) return res.status(401).json({ error: "Please sign in." });
    req.user = (
      await pool.query(
        "SELECT a.* FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token=$1 AND s.expires>now()",
        [hash(token)],
      )
    ).rows[0];
    if (!req.user)
      return res
        .status(401)
        .json({ error: "Session expired. Please sign in." });
    next();
  }),
);
app.get("/api/me", (req, res) => res.json(safe(req.user)));
app.use("/api", (req, res, next) => {
  if (
    req.method === "GET" ||
    req.method === "HEAD" ||
    (!req.headers["transfer-encoding"] &&
      !Number(req.headers["content-length"] || 0)) ||
    req.is("application/json")
  )
    return next();
  res.status(415).json({ error: "Send application/json." });
});
app.post(
  "/api/auth/logout",
  wrap(async (req, res) => {
    await pool.query("DELETE FROM sessions WHERE account_id=$1", [req.user.id]);
    res.clearCookie("lob_session", { path: "/" }).json({ ok: true });
  }),
);
const owner = (req, res, next) =>
  req.user.role === "Owner"
    ? next()
    : res.status(403).json({ error: "Owner access required." });
app.get(
  "/api/workspace",
  wrap(async (req, res) => {
    const result = {
      inventory: [],
      employees: [],
      stores: [],
      franchises: [],
      activity: [],
    };
    const rows = (
      await pool.query("SELECT * FROM records WHERE business_id=$1", [
        req.user.business_id,
      ])
    ).rows;
    for (const r of rows) {
      if (r.kind === "franchises" && req.user.role !== "Owner") continue;
      const d = { ...r.data, id: r.id };
      if (r.kind === "employees" && req.user.role !== "Owner") {
        delete d.salary;
        delete d.due;
      }
      result[r.kind].push(d);
    }
    result.activity = (
      await pool.query(
        "SELECT id,text,created_at FROM activity WHERE business_id=$1 ORDER BY created_at DESC LIMIT 100",
        [req.user.business_id],
      )
    ).rows.map((a) => ({
      ...a,
      time: new Date(a.created_at).toLocaleString(),
    }));
    res.json(result);
  }),
);
const schemas = {
  inventory: [
    "name",
    "sku",
    "category",
    "stock",
    "minimum",
    "price",
    "cost",
    "location",
  ],
  employees: ["name", "email", "role", "location", "salary", "due", "status"],
  stores: ["name", "address", "manager", "revenue", "expenses", "status"],
  franchises: ["name", "address", "manager", "revenue", "expenses", "status"],
};
const nums = [
  "stock",
  "minimum",
  "price",
  "cost",
  "salary",
  "revenue",
  "expenses",
];
app.use("/api/records/:kind", (req, res, next) => {
  if (!Object.hasOwn(schemas, req.params.kind))
    return res.status(404).json({ error: "Unknown record type" });
  if (
    req.user.role === "Staff" ||
    (req.params.kind === "franchises" && req.user.role !== "Owner")
  )
    return res
      .status(403)
      .json({ error: "You do not have permission to change these records." });
  next();
});
async function mutate(req, res) {
  const kind = req.params.kind,
    id = req.params.id || randomUUID(),
    c = await pool.connect();
  try {
    await c.query("BEGIN");
    let data = {};
    if (req.params.id) {
      const r = (
        await c.query(
          "SELECT data FROM records WHERE id=$1 AND business_id=$2 AND kind=$3 FOR UPDATE",
          [id, req.user.business_id, kind],
        )
      ).rows[0];
      if (!r) {
        await c.query("ROLLBACK");
        return res.status(404).json({ error: "Record not found" });
      }
      data = r.data;
    }
    if (req.method !== "DELETE") {
      for (const k of schemas[kind]) {
        if (
          kind === "employees" &&
          req.user.role !== "Owner" &&
          ["salary", "due"].includes(k)
        )
          continue;
        const value = req.body[k];
        if (value === undefined) continue;
        if (nums.includes(k)) {
          if (
            typeof value !== "number" ||
            !Number.isFinite(value) ||
            value < 0 ||
            (["stock", "minimum"].includes(k) && !Number.isInteger(value))
          )
            throw Error("Invalid numeric field: " + k);
        } else if (typeof value !== "string" || value.length > 500)
          throw Error("Invalid field: " + k);
        data[k] = value;
      }
      if (!data.name?.trim()) throw Error("Name is required");
      if (kind === "employees") {
        if (data.role && !["Manager", "Staff"].includes(data.role))
          throw Error("Invalid employee role");
        if (data.due && !isCalendarDate(data.due))
          throw Error("Invalid pay date");
      }
      await c.query(
        "INSERT INTO records VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data",
        [id, req.user.business_id, kind, data],
      );
    } else
      await c.query("DELETE FROM records WHERE id=$1 AND business_id=$2", [
        id,
        req.user.business_id,
      ]);
    await c.query(
      "INSERT INTO activity(id,business_id,text) VALUES($1,$2,$3)",
      [
        randomUUID(),
        req.user.business_id,
        `${req.user.name} ${req.method === "DELETE" ? "deleted" : req.params.id ? "updated" : "added"} ${data.name || kind}`,
      ],
    );
    await c.query("COMMIT");
    if (kind === "employees" && req.user.role !== "Owner") {
      delete data.salary;
      delete data.due;
    }
    res.json({ id, ...data });
  } catch (e) {
    await c.query("ROLLBACK");
    if (e.message.startsWith("Invalid") || e.message === "Name is required")
      return res.status(400).json({ error: e.message });
    throw e;
  } finally {
    c.release();
  }
}
app.post("/api/records/:kind", wrap(mutate));
app.put("/api/records/:kind/:id", wrap(mutate));
app.delete("/api/records/:kind/:id", wrap(mutate));
app.post(
  "/api/payroll/:id",
  owner,
  wrap(async (req, res) => {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      const r = (
        await c.query(
          "SELECT data FROM records WHERE id=$1 AND business_id=$2 AND kind='employees' FOR UPDATE",
          [req.params.id, req.user.business_id],
        )
      ).rows[0];
      if (!r || !r.data.salary || !r.data.due) {
        await c.query("ROLLBACK");
        return res
          .status(400)
          .json({ error: "Set a salary and due date first." });
      }
      const d = r.data,
        next = nextPayDate(d.due);
      await c.query(
        "INSERT INTO payments(id,business_id,employee_id,amount) VALUES($1,$2,$3,$4)",
        [randomUUID(), req.user.business_id, req.params.id, d.salary],
      );
      await c.query("UPDATE records SET data=$1 WHERE id=$2", [
        { ...d, due: next },
        req.params.id,
      ]);
      await c.query(
        "INSERT INTO activity(id,business_id,text) VALUES($1,$2,$3)",
        [
          randomUUID(),
          req.user.business_id,
          `Salary payment recorded for ${d.name}`,
        ],
      );
      await c.query("COMMIT");
      res.json({ ok: true });
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }),
);
app.get(
  "/api/accounts",
  owner,
  wrap(async (req, res) =>
    res.json(
      (
        await pool.query(
          "SELECT id,name,email,role FROM accounts WHERE business_id=$1",
          [req.user.business_id],
        )
      ).rows,
    ),
  ),
);
app.post(
  "/api/accounts",
  owner,
  wrap(async (req, res) => {
    const { name, email, password, role } = req.body;
    if (
      typeof name !== "string" ||
      !name.trim() ||
      name.length > 200 ||
      typeof email !== "string" ||
      email.length > 254 ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      typeof password !== "string" ||
      password.length < 10 ||
      password.length > 256 ||
      !["Manager", "Staff"].includes(role)
    )
      return res.status(400).json({
        error:
          "Provide a name, valid email, role and password of at least 10 characters.",
      });
    const salt = randomBytes(16).toString("hex");
    try {
      const r = await pool.query(
        "INSERT INTO accounts VALUES($1,$2,$3,$4,$5,$6) RETURNING id,name,email,role",
        [
          randomUUID(),
          req.user.business_id,
          name.trim(),
          email.toLowerCase().trim(),
          salt + ":" + scryptSync(password, salt, 64).toString("hex"),
          role,
        ],
      );
      res.json(r.rows[0]);
    } catch (e) {
      if (e.code === "23505")
        return res.status(409).json({ error: "Email already registered" });
      throw e;
    }
  }),
);
app.put(
  "/api/accounts/:id",
  owner,
  wrap(async (req, res) => {
    if (req.params.id === req.user.id)
      return res
        .status(400)
        .json({ error: "You cannot change your own role." });
    if (!["Owner", "Manager", "Staff"].includes(req.body.role))
      return res.status(400).json({ error: "Invalid role" });
    const r = await pool.query(
      "UPDATE accounts SET role=$1 WHERE id=$2 AND business_id=$3 RETURNING id",
      [req.body.role, req.params.id, req.user.business_id],
    );
    if (!r.rowCount)
      return res.status(404).json({ error: "Account not found" });
    res.json({ ok: true });
  }),
);
app.use("/api", (req, res) =>
  res.status(404).json({ error: "API route not found" }),
);
app.use(express.static(new URL("../dist", import.meta.url).pathname));
app.get("*", (req, res) =>
  res.sendFile(
    new URL("../dist/index.html", import.meta.url).pathname.replace(
      /^\/(\w:)/,
      "$1",
    ),
  ),
);
app.use((err, req, res, next) => {
  const status =
    err.type === "entity.too.large"
      ? 413
      : err.type === "entity.parse.failed"
        ? 400
        : err.code === "22P02"
          ? 400
          : 500;
  if (status !== 500)
    return res.status(status).json({
      error: status === 413 ? "Request too large" : "Invalid request",
    });
  console.error("Request failed:", err.code || err.name);
  res.status(500).json({
    error:
      "The request could not be completed. Check the server configuration.",
  });
});
app.listen(process.env.PORT || 3001, "127.0.0.1", () =>
  console.log(
    "Lobstore API ready at http://127.0.0.1:" + (process.env.PORT || 3001),
  ),
);
