"use strict";
// Network Hub - product-based network marketing platform.
// Zero npm dependencies: Node's built-in http + node:sqlite + crypto.

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, "network.db");
const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");

// ---------------------------------------------------------------- schema
db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  sponsor_id INTEGER REFERENCES users(id),
  ref_code TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_sponsor ON users(sponsor_id);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS products(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price REAL NOT NULL,
  bv REAL NOT NULL,
  image_url TEXT DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending',
  total REAL NOT NULL,
  total_bv REAL NOT NULL,
  address TEXT NOT NULL,
  phone TEXT NOT NULL,
  payment_method TEXT NOT NULL,
  payment_ref TEXT NOT NULL,
  admin_note TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  confirmed_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE TABLE IF NOT EXISTS order_items(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  bv REAL NOT NULL,
  qty INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  amount REAL NOT NULL,
  order_id INTEGER,
  level INTEGER,
  from_user_id INTEGER,
  note TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ledger_user ON ledger(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_commission ON ledger(user_id, order_id, level) WHERE type='commission';
CREATE TABLE IF NOT EXISTS withdrawals(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  amount REAL NOT NULL,
  fee REAL NOT NULL DEFAULT 0,
  net REAL NOT NULL,
  method TEXT NOT NULL,
  account TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT DEFAULT '',
  created_at INTEGER NOT NULL,
  processed_at INTEGER
);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

// ---------------------------------------------------------------- helpers
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (m) => new HttpError(400, m);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const now = () => Date.now();

function tx(fn) {
  db.exec("BEGIN IMMEDIATE");
  try { const r = fn(); db.exec("COMMIT"); return r; }
  catch (e) { db.exec("ROLLBACK"); throw e; }
}

const DEFAULTS = {
  company_name: "Your Company",
  tagline: "Quality products. Fair, transparent rewards.",
  currency: "PKR",
  levels: [10, 5, 3, 2, 1],            // % of order BV paid to sponsor line, level 1..n
  min_withdrawal: 500,
  withdrawal_fee_pct: 0,
  min_monthly_bv: 0,                    // 0 = no monthly activity requirement
  open_signup: true,                    // allow joining without a sponsor code
  payment_methods: ["JazzCash", "Easypaisa", "Bank Transfer"],
  payment_instructions: "Send the exact order total to the account shown here, then enter the transaction ID at checkout. (Edit this text in Admin > Settings.)",
  ranks: [
    { name: "Member", bv: 0 }, { name: "Bronze", bv: 10000 }, { name: "Silver", bv: 50000 },
    { name: "Gold", bv: 200000 }, { name: "Diamond", bv: 1000000 },
  ],
};
function getSettings() {
  const s = { ...DEFAULTS };
  for (const r of all("SELECT key, value FROM settings")) {
    try { s[r.key] = JSON.parse(r.value); } catch { /* ignore */ }
  }
  return s;
}
function setSetting(k, v) {
  run("INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", k, JSON.stringify(v));
}

function hashPw(pw) {
  const salt = crypto.randomBytes(16).toString("hex");
  return salt + ":" + crypto.scryptSync(pw, salt, 64).toString("hex");
}
function checkPw(pw, stored) {
  const [salt, h] = String(stored).split(":");
  const t = crypto.scryptSync(pw, salt, 64);
  const hb = Buffer.from(h, "hex");
  return hb.length === t.length && crypto.timingSafeEqual(t, hb);
}
const sha = (s) => crypto.createHash("sha256").update(s).digest("hex");

function newRefCode() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (;;) {
    let c = "";
    for (const b of crypto.randomBytes(8)) c += A[b % A.length];
    if (!one("SELECT 1 FROM users WHERE ref_code=?", c)) return c;
  }
}

// first-run admin (the company root account)
if (!one("SELECT id FROM users WHERE role='admin'")) {
  const username = (process.env.ADMIN_USERNAME || "admin").toLowerCase();
  const generated = !process.env.ADMIN_PASSWORD;
  const pw = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString("base64url");
  run(
    "INSERT INTO users(username,email,name,password_hash,role,ref_code,created_at) VALUES(?,?,?,?,?,?,?)",
    username, `${username}@company.local`, "Company", hashPw(pw), "admin", newRefCode(), now()
  );
  console.log("=================================================");
  console.log(" FIRST RUN: admin account created");
  console.log(" username:", username);
  if (generated) console.log(" password:", pw, " (save it now, it is shown once)");
  console.log("=================================================");
}

// ---------------------------------------------------------------- tiny web framework
const routes = [];
function route(method, pattern, ...handlers) {
  const keys = [];
  const rx = new RegExp("^" + pattern.replace(/:([a-z]+)/g, (_, k) => { keys.push(k); return "([^/]+)"; }) + "$");
  routes.push({ method, rx, keys, handlers });
}
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".jsx": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".ico": "image/x-icon", ".json": "application/json", ".txt": "text/plain",
};
function send(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > 200_000) { reject(new HttpError(413, "Payload too large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { reject(bad("Invalid JSON")); }
    });
    req.on("error", reject);
  });
}
function parseCookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
const hits = new Map();
function tooMany(key, max, ms) {
  const t = now();
  const arr = (hits.get(key) || []).filter((x) => t - x < ms);
  arr.push(t); hits.set(key, arr);
  return arr.length > max;
}
setInterval(() => hits.clear(), 3600e3).unref();
const ipOf = (req) => String(req.headers["x-forwarded-for"] || req.socket.remoteAddress || "").split(",")[0].trim();

function serveStatic(req, res, pathname) {
  let rel = pathname === "/" ? "/index.html" : pathname;
  const file = path.normalize(path.join(__dirname, "public", rel));
  if (!file.startsWith(path.join(__dirname, "public"))) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "same-origin");
  const url = new URL(req.url, "http://x");
  const pathname = decodeURIComponent(url.pathname);

  if (!pathname.startsWith("/api/")) {
    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
    return serveStatic(req, res, pathname);
  }

  try {
    req.query = Object.fromEntries(url.searchParams);
    req.ip = ipOf(req);
    // session
    const sid = parseCookies(req).sid;
    if (sid) {
      const u = one("SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?", sha(sid), now());
      if (u && u.status === "active") req.user = u;
    }
    if (req.method !== "GET") {
      if (!String(req.headers["content-type"] || "").includes("application/json")) throw new HttpError(415, "JSON required");
      req.body = await readBody(req);
    } else req.body = {};

    for (const r of routes) {
      if (r.method !== req.method) continue;
      const m = r.rx.exec(pathname);
      if (!m) continue;
      req.params = {};
      r.keys.forEach((k, i) => (req.params[k] = decodeURIComponent(m[i + 1])));
      for (const h of r.handlers) { h(req, res); if (res.writableEnded) break; }
      return;
    }
    throw new HttpError(404, "Not found");
  } catch (e) {
    if (e instanceof HttpError) return send(res, e.status, { error: e.message });
    console.error(e);
    send(res, 500, { error: "Server error" });
  }
});

const needUser = (req) => { if (!req.user) throw new HttpError(401, "Please log in"); };
const needAdmin = (req) => { needUser(req); if (req.user.role !== "admin") throw new HttpError(403, "Admin only"); };
const needMember = (req) => { needUser(req); if (req.user.role === "admin") throw new HttpError(403, "Use the member account for this"); };

// ---------------------------------------------------------------- domain logic
const COUNTED = "('confirmed','delivered')";
const MAX_DEPTH = 15;

function publicUser(u) {
  return { id: u.id, name: u.name, username: u.username, email: u.email, phone: u.phone, role: u.role, ref_code: u.ref_code };
}
function startSession(res, req, userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  const maxAge = 30 * 24 * 3600;
  run("INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)", sha(token), userId, now() + maxAge * 1000);
  const secure = String(req.headers["x-forwarded-proto"] || "").includes("https") ? "; Secure" : "";
  res.setHeader("Set-Cookie", `sid=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`);
}
const balanceOf = (id) => round2(one("SELECT COALESCE(SUM(amount),0) v FROM ledger WHERE user_id=?", id).v);

const DOWNLINE_CTE = `WITH RECURSIVE d(id, depth) AS (
  SELECT id, 1 FROM users WHERE sponsor_id = ?
  UNION ALL
  SELECT u.id, d.depth + 1 FROM users u JOIN d ON u.sponsor_id = d.id WHERE d.depth < ${MAX_DEPTH}
)`;

function monthStart(t = now()) { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), 1).getTime(); }
function monthlyBv(userId) {
  return one(`SELECT COALESCE(SUM(total_bv),0) v FROM orders WHERE user_id=? AND status IN ${COUNTED} AND created_at>=?`, userId, monthStart()).v;
}

function creditCommissions(order) {
  const s = getSettings();
  let cur = one("SELECT sponsor_id FROM users WHERE id=?", order.user_id).sponsor_id;
  for (let i = 0; i < s.levels.length && cur; i++) {
    const up = one("SELECT id, role, status, sponsor_id FROM users WHERE id=?", cur);
    if (!up) break;
    if (up.role !== "admin" && up.status === "active") {
      const qualified = !(s.min_monthly_bv > 0) || monthlyBv(up.id) >= s.min_monthly_bv;
      const amt = round2((order.total_bv * Number(s.levels[i])) / 100);
      if (qualified && amt > 0) {
        run("INSERT INTO ledger(user_id,type,amount,order_id,level,from_user_id,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
          up.id, "commission", amt, order.id, i + 1, order.user_id, `Level ${i + 1} commission on order #${order.id}`, now());
      }
    }
    cur = up.sponsor_id;
  }
}

function rankInfo(teamBv, ranks) {
  const sorted = [...ranks].sort((a, b) => a.bv - b.bv);
  let cur = sorted[0], next = null;
  for (const r of sorted) { if (teamBv >= r.bv) cur = r; else { next = r; break; } }
  return { current: cur.name, next: next ? next.name : null, next_bv: next ? next.bv : null };
}

// ---------------------------------------------------------------- public routes
route("GET", "/api/public", (req, res) => {
  const s = getSettings();
  const products = all("SELECT id,name,description,price,bv,image_url FROM products WHERE active=1 ORDER BY id DESC");
  send(res, 200, {
    settings: {
      company_name: s.company_name, tagline: s.tagline, currency: s.currency, levels: s.levels, ranks: s.ranks,
      min_withdrawal: s.min_withdrawal, withdrawal_fee_pct: s.withdrawal_fee_pct, min_monthly_bv: s.min_monthly_bv,
      open_signup: s.open_signup, payment_methods: s.payment_methods, payment_instructions: s.payment_instructions,
    },
    products,
  });
});

route("GET", "/api/sponsor/:code", (req, res) => {
  const u = one("SELECT name, role FROM users WHERE ref_code=? AND status='active'", req.params.code.toUpperCase());
  if (!u) throw new HttpError(404, "Sponsor code not found");
  send(res, 200, { name: u.role === "admin" ? getSettings().company_name : u.name });
});

route("POST", "/api/register", (req, res) => {
  if (tooMany("reg:" + req.ip, 10, 3600e3)) throw new HttpError(429, "Too many attempts, try later");
  const b = req.body;
  const name = String(b.name || "").trim();
  const username = String(b.username || "").trim().toLowerCase();
  const email = String(b.email || "").trim().toLowerCase();
  const phone = String(b.phone || "").trim().slice(0, 20);
  const password = String(b.password || "");
  const ref = String(b.ref || "").trim().toUpperCase();
  if (name.length < 2 || name.length > 60) throw bad("Enter your full name");
  if (!/^[a-z0-9_]{3,20}$/.test(username)) throw bad("Username: 3-20 letters, numbers or underscore");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw bad("Enter a valid email");
  if (password.length < 8) throw bad("Password must be at least 8 characters");
  const s = getSettings();
  let sponsor;
  if (ref) {
    sponsor = one("SELECT * FROM users WHERE ref_code=? AND status='active'", ref);
    if (!sponsor) throw bad("Sponsor code is not valid");
  } else {
    if (!s.open_signup) throw bad("A sponsor code is required to join");
    sponsor = one("SELECT * FROM users WHERE role='admin' ORDER BY id LIMIT 1");
  }
  if (one("SELECT 1 FROM users WHERE username=?", username)) throw bad("Username is taken");
  if (one("SELECT 1 FROM users WHERE email=?", email)) throw bad("Email is already registered");
  const r = run("INSERT INTO users(username,email,name,phone,password_hash,sponsor_id,ref_code,created_at) VALUES(?,?,?,?,?,?,?,?)",
    username, email, name, phone, hashPw(password), sponsor.id, newRefCode(), now());
  const user = one("SELECT * FROM users WHERE id=?", Number(r.lastInsertRowid));
  startSession(res, req, user.id);
  send(res, 200, { user: publicUser(user) });
});

route("POST", "/api/login", (req, res) => {
  if (tooMany("login:" + req.ip, 10, 10 * 60e3)) throw new HttpError(429, "Too many attempts, wait a few minutes");
  const id = String(req.body.username || "").trim().toLowerCase();
  const u = one("SELECT * FROM users WHERE username=? OR email=?", id, id);
  if (!u || !checkPw(String(req.body.password || ""), u.password_hash)) throw new HttpError(401, "Wrong username or password");
  if (u.status !== "active") throw new HttpError(403, "This account is suspended");
  startSession(res, req, u.id);
  send(res, 200, { user: publicUser(u) });
});

route("POST", "/api/logout", (req, res) => {
  const sid = parseCookies(req).sid;
  if (sid) run("DELETE FROM sessions WHERE token=?", sha(sid));
  res.setHeader("Set-Cookie", "sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0");
  send(res, 200, { ok: true });
});

route("GET", "/api/me", (req, res) => send(res, 200, { user: req.user ? publicUser(req.user) : null }));

// ---------------------------------------------------------------- member routes
route("GET", "/api/dashboard", needMember, (req, res) => {
  const id = req.user.id;
  const s = getSettings();
  const earned = one("SELECT COALESCE(SUM(amount),0) v FROM ledger WHERE user_id=? AND type IN ('commission','reversal')", id).v;
  const pendingW = one("SELECT COALESCE(SUM(amount),0) v FROM withdrawals WHERE user_id=? AND status='pending'", id).v;
  const paidW = one("SELECT COALESCE(SUM(amount),0) v FROM withdrawals WHERE user_id=? AND status='paid'", id).v;
  const personalBv = one(`SELECT COALESCE(SUM(total_bv),0) v FROM orders WHERE user_id=? AND status IN ${COUNTED}`, id).v;
  const levels = all(`${DOWNLINE_CTE} SELECT depth, COUNT(*) n FROM d GROUP BY depth ORDER BY depth`, id);
  const teamBv = one(`${DOWNLINE_CTE} SELECT COALESCE(SUM(total_bv),0) v FROM orders WHERE status IN ${COUNTED} AND (user_id=? OR user_id IN (SELECT id FROM d))`, id, id).v;
  const direct = one("SELECT COUNT(*) n FROM users WHERE sponsor_id=?", id).n;
  const sponsor = req.user.sponsor_id ? one("SELECT name, role FROM users WHERE id=?", req.user.sponsor_id) : null;
  send(res, 200, {
    balance: balanceOf(id), total_earned: round2(earned), pending_withdrawals: round2(pendingW), total_withdrawn: round2(paidW),
    personal_bv: round2(personalBv), monthly_bv: round2(monthlyBv(id)), team_bv: round2(teamBv),
    direct_count: direct, team_size: levels.reduce((a, l) => a + l.n, 0), levels,
    rank: rankInfo(teamBv, s.ranks), active_this_month: !(s.min_monthly_bv > 0) || monthlyBv(id) >= s.min_monthly_bv,
    sponsor_name: sponsor ? (sponsor.role === "admin" ? s.company_name : sponsor.name) : null,
    recent: all("SELECT id,type,amount,level,note,created_at FROM ledger WHERE user_id=? ORDER BY id DESC LIMIT 8", id),
  });
});

route("GET", "/api/team", needMember, (req, res) => {
  const rows = all(`${DOWNLINE_CTE}
    SELECT u.id, u.name, u.username, u.sponsor_id, u.status, u.created_at, d.depth,
      (SELECT COALESCE(SUM(total_bv),0) FROM orders WHERE user_id=u.id AND status IN ${COUNTED}) bv
    FROM d JOIN users u ON u.id=d.id ORDER BY d.depth, u.id LIMIT 1500`, req.user.id);
  send(res, 200, { members: rows });
});

route("GET", "/api/ledger", needMember, (req, res) => {
  send(res, 200, { rows: all("SELECT id,type,amount,level,note,created_at FROM ledger WHERE user_id=? ORDER BY id DESC LIMIT 300", req.user.id) });
});

route("GET", "/api/orders", needMember, (req, res) => {
  const orders = all("SELECT * FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 100", req.user.id);
  for (const o of orders) o.items = all("SELECT name,price,qty FROM order_items WHERE order_id=?", o.id);
  send(res, 200, { orders });
});

route("POST", "/api/orders", needMember, (req, res) => {
  if (tooMany("order:" + req.user.id, 20, 3600e3)) throw new HttpError(429, "Too many orders, try later");
  const s = getSettings();
  const b = req.body;
  const items = Array.isArray(b.items) ? b.items.slice(0, 30) : [];
  if (!items.length) throw bad("Your cart is empty");
  const address = String(b.address || "").trim();
  const phone = String(b.phone || "").trim();
  const method = String(b.payment_method || "");
  const ref = String(b.payment_ref || "").trim();
  if (address.length < 8) throw bad("Enter a full delivery address");
  if (!/^[0-9+\-\s]{7,20}$/.test(phone)) throw bad("Enter a valid phone number");
  if (!s.payment_methods.includes(method)) throw bad("Choose a payment method");
  if (ref.length < 3 || ref.length > 60) throw bad("Enter the payment transaction ID");
  const lines = []; let total = 0, totalBv = 0;
  for (const it of items) {
    const qty = Math.floor(Number(it.qty));
    const p = one("SELECT * FROM products WHERE id=? AND active=1", Number(it.id));
    if (!p || !(qty >= 1 && qty <= 100)) throw bad("One of the products is not available");
    lines.push({ p, qty }); total += p.price * qty; totalBv += p.bv * qty;
  }
  const orderId = tx(() => {
    const r = run("INSERT INTO orders(user_id,total,total_bv,address,phone,payment_method,payment_ref,created_at) VALUES(?,?,?,?,?,?,?,?)",
      req.user.id, round2(total), round2(totalBv), address, phone, method, ref, now());
    const id = Number(r.lastInsertRowid);
    for (const { p, qty } of lines) run("INSERT INTO order_items(order_id,product_id,name,price,bv,qty) VALUES(?,?,?,?,?,?)", id, p.id, p.name, p.price, p.bv, qty);
    return id;
  });
  send(res, 200, { id: orderId });
});

route("GET", "/api/withdrawals", needMember, (req, res) => {
  send(res, 200, { rows: all("SELECT * FROM withdrawals WHERE user_id=? ORDER BY id DESC LIMIT 100", req.user.id), balance: balanceOf(req.user.id) });
});

route("POST", "/api/withdrawals", needMember, (req, res) => {
  const s = getSettings();
  const amount = round2(req.body.amount);
  const method = String(req.body.method || "").trim().slice(0, 40);
  const account = String(req.body.account || "").trim().slice(0, 120);
  if (!(amount >= s.min_withdrawal)) throw bad(`Minimum withdrawal is ${s.currency} ${s.min_withdrawal}`);
  if (!method || account.length < 5) throw bad("Enter payout method and account details");
  tx(() => {
    if (amount > balanceOf(req.user.id)) throw bad("Amount is more than your balance");
    const fee = round2((amount * s.withdrawal_fee_pct) / 100);
    const r = run("INSERT INTO withdrawals(user_id,amount,fee,net,method,account,created_at) VALUES(?,?,?,?,?,?,?)",
      req.user.id, amount, fee, round2(amount - fee), method, account, now());
    run("INSERT INTO ledger(user_id,type,amount,note,created_at) VALUES(?,?,?,?,?)",
      req.user.id, "withdrawal", -amount, `Withdrawal request #${Number(r.lastInsertRowid)}`, now());
  });
  send(res, 200, { ok: true });
});

route("PUT", "/api/profile", needUser, (req, res) => {
  const b = req.body;
  const name = String(b.name || "").trim();
  const phone = String(b.phone || "").trim().slice(0, 20);
  if (name.length < 2) throw bad("Enter your name");
  run("UPDATE users SET name=?, phone=? WHERE id=?", name, phone, req.user.id);
  if (b.new_password) {
    if (!checkPw(String(b.current_password || ""), req.user.password_hash)) throw bad("Current password is wrong");
    if (String(b.new_password).length < 8) throw bad("New password must be at least 8 characters");
    run("UPDATE users SET password_hash=? WHERE id=?", hashPw(String(b.new_password)), req.user.id);
  }
  send(res, 200, { user: publicUser(one("SELECT * FROM users WHERE id=?", req.user.id)) });
});

// ---------------------------------------------------------------- admin routes
route("GET", "/api/admin/stats", needAdmin, (req, res) => {
  const week = now() - 7 * 86400e3;
  send(res, 200, {
    members: one("SELECT COUNT(*) n FROM users WHERE role='member'").n,
    new_members_7d: one("SELECT COUNT(*) n FROM users WHERE role='member' AND created_at>?", week).n,
    suspended: one("SELECT COUNT(*) n FROM users WHERE status!='active'").n,
    pending_orders: one("SELECT COUNT(*) n FROM orders WHERE status='pending'").n,
    pending_withdrawals: one("SELECT COUNT(*) n, COALESCE(SUM(net),0) v FROM withdrawals WHERE status='pending'"),
    sales: one(`SELECT COUNT(*) n, COALESCE(SUM(total),0) v, COALESCE(SUM(total_bv),0) bv FROM orders WHERE status IN ${COUNTED}`),
    commissions_credited: one("SELECT COALESCE(SUM(amount),0) v FROM ledger WHERE type IN ('commission','reversal')").v,
    paid_out: one("SELECT COALESCE(SUM(net),0) v FROM withdrawals WHERE status='paid'").v,
    owed_to_members: one("SELECT COALESCE(SUM(amount),0) v FROM ledger WHERE user_id IN (SELECT id FROM users WHERE role='member')").v,
  });
});

route("GET", "/api/admin/members", needAdmin, (req, res) => {
  const q = "%" + String(req.query.q || "").toLowerCase() + "%";
  send(res, 200, {
    members: all(`SELECT u.id,u.name,u.username,u.email,u.phone,u.status,u.ref_code,u.created_at,
      s.username sponsor, (SELECT COALESCE(SUM(amount),0) FROM ledger WHERE user_id=u.id) balance,
      (SELECT COUNT(*) FROM users c WHERE c.sponsor_id=u.id) directs,
      (SELECT COALESCE(SUM(total_bv),0) FROM orders WHERE user_id=u.id AND status IN ${COUNTED}) bv
      FROM users u LEFT JOIN users s ON s.id=u.sponsor_id
      WHERE u.role='member' AND (lower(u.name) LIKE ? OR lower(u.username) LIKE ? OR lower(u.email) LIKE ? OR u.phone LIKE ?)
      ORDER BY u.id DESC LIMIT 300`, q, q, q, q),
  });
});

route("PATCH", "/api/admin/members/:id", needAdmin, (req, res) => {
  const u = one("SELECT * FROM users WHERE id=? AND role='member'", Number(req.params.id));
  if (!u) throw new HttpError(404, "Member not found");
  const status = req.body.status === "suspended" ? "suspended" : "active";
  run("UPDATE users SET status=? WHERE id=?", status, u.id);
  if (status === "suspended") run("DELETE FROM sessions WHERE user_id=?", u.id);
  send(res, 200, { ok: true });
});

route("POST", "/api/admin/members/:id/password", needAdmin, (req, res) => {
  const pw = String(req.body.password || "");
  if (pw.length < 8) throw bad("Password must be at least 8 characters");
  const u = one("SELECT id FROM users WHERE id=? AND role='member'", Number(req.params.id));
  if (!u) throw new HttpError(404, "Member not found");
  run("UPDATE users SET password_hash=? WHERE id=?", hashPw(pw), u.id);
  run("DELETE FROM sessions WHERE user_id=?", u.id);
  send(res, 200, { ok: true });
});

route("POST", "/api/admin/members/:id/adjust", needAdmin, (req, res) => {
  const amount = round2(req.body.amount);
  const note = String(req.body.note || "").trim().slice(0, 120);
  if (!amount || !note) throw bad("Enter an amount (use minus to deduct) and a note");
  const u = one("SELECT id FROM users WHERE id=? AND role='member'", Number(req.params.id));
  if (!u) throw new HttpError(404, "Member not found");
  run("INSERT INTO ledger(user_id,type,amount,note,created_at) VALUES(?,?,?,?,?)", u.id, "adjustment", amount, "Admin adjustment: " + note, now());
  send(res, 200, { ok: true });
});

function productFields(b) {
  const name = String(b.name || "").trim();
  const price = round2(b.price), bv = round2(b.bv);
  if (name.length < 2) throw bad("Product name is required");
  if (!(price > 0)) throw bad("Price must be more than 0");
  if (!(bv >= 0 && bv <= price)) throw bad("BV must be between 0 and the price");
  return [name, String(b.description || "").trim().slice(0, 600), price, bv, String(b.image_url || "").trim().slice(0, 500), b.active === false ? 0 : 1];
}
route("GET", "/api/admin/products", needAdmin, (req, res) => send(res, 200, { products: all("SELECT * FROM products ORDER BY id DESC") }));
route("POST", "/api/admin/products", needAdmin, (req, res) => {
  const f = productFields(req.body);
  run("INSERT INTO products(name,description,price,bv,image_url,active,created_at) VALUES(?,?,?,?,?,?,?)", ...f, now());
  send(res, 200, { ok: true });
});
route("PUT", "/api/admin/products/:id", needAdmin, (req, res) => {
  const f = productFields(req.body);
  run("UPDATE products SET name=?,description=?,price=?,bv=?,image_url=?,active=? WHERE id=?", ...f, Number(req.params.id));
  send(res, 200, { ok: true });
});
route("DELETE", "/api/admin/products/:id", needAdmin, (req, res) => {
  const id = Number(req.params.id);
  if (one("SELECT 1 FROM order_items WHERE product_id=?", id)) run("UPDATE products SET active=0 WHERE id=?", id);
  else run("DELETE FROM products WHERE id=?", id);
  send(res, 200, { ok: true });
});

route("GET", "/api/admin/orders", needAdmin, (req, res) => {
  const st = String(req.query.status || "");
  const orders = all(`SELECT o.*, u.username, u.name member_name FROM orders o JOIN users u ON u.id=o.user_id
    ${st ? "WHERE o.status=?" : "WHERE ?=''"} ORDER BY o.id DESC LIMIT 200`, st);
  for (const o of orders) o.items = all("SELECT name,price,qty FROM order_items WHERE order_id=?", o.id);
  send(res, 200, { orders });
});

route("POST", "/api/admin/orders/:id/:action", needAdmin, (req, res) => {
  const action = req.params.action;
  const note = String(req.body.note || "").trim().slice(0, 200);
  tx(() => {
    const o = one("SELECT * FROM orders WHERE id=?", Number(req.params.id));
    if (!o) throw new HttpError(404, "Order not found");
    if (action === "confirm") {
      if (o.status !== "pending") throw bad("Only pending orders can be confirmed");
      run("UPDATE orders SET status='confirmed', confirmed_at=?, admin_note=? WHERE id=?", now(), note, o.id);
      creditCommissions(o);
    } else if (action === "reject") {
      if (o.status !== "pending") throw bad("Only pending orders can be rejected");
      run("UPDATE orders SET status='rejected', admin_note=? WHERE id=?", note, o.id);
    } else if (action === "deliver") {
      if (o.status !== "confirmed") throw bad("Only confirmed orders can be marked delivered");
      run("UPDATE orders SET status='delivered' WHERE id=?", o.id);
    } else if (action === "refund") {
      if (o.status !== "confirmed" && o.status !== "delivered") throw bad("This order cannot be refunded");
      run("UPDATE orders SET status='refunded', admin_note=? WHERE id=?", note, o.id);
      for (const c of all("SELECT * FROM ledger WHERE order_id=? AND type='commission'", o.id)) {
        run("INSERT INTO ledger(user_id,type,amount,order_id,level,from_user_id,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
          c.user_id, "reversal", -c.amount, o.id, c.level, c.from_user_id, `Commission reversed: order #${o.id} refunded`, now());
      }
    } else throw bad("Unknown action");
  });
  send(res, 200, { ok: true });
});

route("GET", "/api/admin/withdrawals", needAdmin, (req, res) => {
  send(res, 200, { rows: all(`SELECT w.*, u.username, u.name member_name FROM withdrawals w JOIN users u ON u.id=w.user_id
    ORDER BY CASE w.status WHEN 'pending' THEN 0 ELSE 1 END, w.id DESC LIMIT 200`) });
});
route("POST", "/api/admin/withdrawals/:id/:action", needAdmin, (req, res) => {
  const note = String(req.body.note || "").trim().slice(0, 200);
  tx(() => {
    const w = one("SELECT * FROM withdrawals WHERE id=?", Number(req.params.id));
    if (!w) throw new HttpError(404, "Request not found");
    if (w.status !== "pending") throw bad("This request is already processed");
    if (req.params.action === "pay") {
      run("UPDATE withdrawals SET status='paid', admin_note=?, processed_at=? WHERE id=?", note, now(), w.id);
    } else if (req.params.action === "reject") {
      run("UPDATE withdrawals SET status='rejected', admin_note=?, processed_at=? WHERE id=?", note, now(), w.id);
      run("INSERT INTO ledger(user_id,type,amount,note,created_at) VALUES(?,?,?,?,?)", w.user_id, "refund", w.amount, `Withdrawal #${w.id} rejected, amount returned`, now());
    } else throw bad("Unknown action");
  });
  send(res, 200, { ok: true });
});

route("GET", "/api/admin/settings", needAdmin, (req, res) => send(res, 200, { settings: getSettings() }));
route("PUT", "/api/admin/settings", needAdmin, (req, res) => {
  const b = req.body, out = {};
  const str = (k, max) => { if (b[k] !== undefined) out[k] = String(b[k]).trim().slice(0, max); };
  const num = (k, lo, hi) => { if (b[k] !== undefined) { const n = Number(b[k]); if (!(n >= lo && n <= hi)) throw bad(`${k} must be between ${lo} and ${hi}`); out[k] = n; } };
  str("company_name", 60); str("tagline", 140); str("currency", 6); str("payment_instructions", 800);
  num("min_withdrawal", 0, 1e9); num("withdrawal_fee_pct", 0, 50); num("min_monthly_bv", 0, 1e9);
  if (b.open_signup !== undefined) out.open_signup = !!b.open_signup;
  if (b.levels !== undefined) {
    const lv = Array.isArray(b.levels) ? b.levels.map(Number) : [];
    if (!lv.length || lv.length > 10 || lv.some((x) => !(x >= 0 && x <= 100))) throw bad("Levels: 1-10 percentages between 0 and 100");
    if (lv.reduce((a, c) => a + c, 0) > 100) throw bad("Level percentages must add up to 100 or less");
    out.levels = lv;
  }
  if (b.payment_methods !== undefined) {
    const pm = (Array.isArray(b.payment_methods) ? b.payment_methods : []).map((x) => String(x).trim()).filter(Boolean).slice(0, 8);
    if (!pm.length) throw bad("Add at least one payment method");
    out.payment_methods = pm;
  }
  if (b.ranks !== undefined) {
    const rk = (Array.isArray(b.ranks) ? b.ranks : []).map((r) => ({ name: String(r.name || "").trim().slice(0, 30), bv: Number(r.bv) }));
    if (!rk.length || rk.some((r) => !r.name || !(r.bv >= 0))) throw bad("Each rank needs a name and a BV target");
    out.ranks = rk;
  }
  tx(() => { for (const [k, v] of Object.entries(out)) setSetting(k, v); });
  send(res, 200, { settings: getSettings() });
});

route("GET", "/api/admin/backup", needAdmin, (req, res) => {
  const copy = path.join(DATA_DIR, "backup-tmp.db");
  try { fs.rmSync(copy, { force: true }); } catch { /* ignore */ }
  db.exec(`VACUUM INTO '${copy.replace(/'/g, "''")}'`);
  const data = fs.readFileSync(copy);
  fs.rmSync(copy, { force: true });
  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="network-backup-${new Date().toISOString().slice(0, 10)}.db"`,
  });
  res.end(data);
});

if (require.main === module) {
  server.listen(PORT, () => console.log(`Network Hub running on port ${PORT} (data: ${DATA_DIR})`));
}
module.exports = { server, db };
