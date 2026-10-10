// End-to-end smoke test: node test.js
const os = require("os"), fs = require("fs"), path = require("path"), assert = require("assert");
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "nh-"));
process.env.ADMIN_PASSWORD = "AdminPass123";
const { server } = require("./server");

function client(base) {
  let cookie = "";
  return async (method, p, body) => {
    const r = await fetch(base + p, {
      method, headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: method === "GET" ? undefined : JSON.stringify(body || {}),
    });
    const sc = r.headers.get("set-cookie");
    if (sc) cookie = sc.split(";")[0];
    const t = await r.text();
    let d; try { d = JSON.parse(t); } catch { d = t; }
    return { status: r.status, data: d };
  };
}

server.listen(0, async () => {
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const admin = client(base);
    let r = await admin("POST", "/api/login", { username: "admin", password: "AdminPass123" });
    assert.equal(r.status, 200);
    r = await admin("PUT", "/api/admin/settings", { company_name: "Test Co", levels: [10, 5, 3] });
    assert.equal(r.status, 200);
    r = await admin("POST", "/api/admin/products", { name: "Herbal Tea", description: "x", price: 1000, bv: 800 });
    assert.equal(r.status, 200);
    const pub = await client(base)("GET", "/api/public");
    const pid = pub.data.products[0].id;
    assert.equal(pub.data.settings.company_name, "Test Co");

    // chain: A (under company) -> B -> C -> D
    const mk = async (u, ref) => {
      const c = client(base);
      r = await c("POST", "/api/register", { name: u.toUpperCase() + " User", username: u, email: u + "@x.com", password: "password123", ref });
      assert.equal(r.status, 200, JSON.stringify(r.data));
      return { c, code: r.data.user.ref_code };
    };
    const A = await mk("alice"); const B = await mk("bob", A.code);
    const C = await mk("carol", B.code); const D = await mk("dave", C.code);
    r = await D.c("POST", "/api/register", {}); // already needs json; just ensure no crash
    r = await client(base)("POST", "/api/register", { name: "Bad", username: "bad", email: "b@x.com", password: "password123", ref: "NOPE1234" });
    assert.equal(r.status, 400);

    // D orders 2 x 1000 -> BV 1600. levels 10/5/3 => carol 160, bob 80, alice 48
    r = await D.c("POST", "/api/orders", { items: [{ id: pid, qty: 2 }], address: "House 1, Street 2, City", phone: "0300-1234567", payment_method: "JazzCash", payment_ref: "TX12345" });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const oid = r.data.id;
    r = await C.c("GET", "/api/dashboard");
    assert.equal(r.data.balance, 0); // nothing before confirmation
    r = await admin("POST", `/api/admin/orders/${oid}/confirm`, {});
    assert.equal(r.status, 200, JSON.stringify(r.data));
    r = await admin("POST", `/api/admin/orders/${oid}/confirm`, {});
    assert.equal(r.status, 400); // no double confirm
    const bal = async (X) => (await X.c("GET", "/api/dashboard")).data;
    assert.equal((await bal(C)).balance, 160);
    assert.equal((await bal(B)).balance, 80);
    assert.equal((await bal(A)).balance, 48);
    assert.equal((await bal(D)).balance, 0);
    const da = await bal(A);
    assert.equal(da.team_size, 3); assert.equal(da.team_bv, 1600);
    r = await A.c("GET", "/api/team"); assert.equal(r.data.members.length, 3);

    // withdrawal flow
    r = await C.c("POST", "/api/withdrawals", { amount: 100, method: "JazzCash", account: "03001234567" });
    assert.equal(r.status, 400); // below min 500
    await admin("PUT", "/api/admin/settings", { min_withdrawal: 100, withdrawal_fee_pct: 5 });
    r = await C.c("POST", "/api/withdrawals", { amount: 100, method: "JazzCash", account: "03001234567" });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal((await bal(C)).balance, 60);
    r = await C.c("POST", "/api/withdrawals", { amount: 999, method: "JazzCash", account: "03001234567" });
    assert.equal(r.status, 400);
    const ws = (await admin("GET", "/api/admin/withdrawals")).data.rows;
    assert.equal(ws[0].net, 95);
    await admin("POST", `/api/admin/withdrawals/${ws[0].id}/reject`, { note: "test" });
    assert.equal((await bal(C)).balance, 160);

    // refund reverses commissions
    r = await admin("POST", `/api/admin/orders/${oid}/refund`, { note: "returned" });
    assert.equal(r.status, 200);
    assert.equal((await bal(C)).balance, 0);
    assert.equal((await bal(A)).balance, 0);

    // permissions
    assert.equal((await A.c("GET", "/api/admin/stats")).status, 403);
    assert.equal((await client(base)("GET", "/api/dashboard")).status, 401);
    r = await admin("GET", "/api/admin/stats"); assert.equal(r.data.members, 4);
    r = await admin("GET", "/api/admin/backup"); assert.equal(r.status, 200);
    r = await admin("GET", "/api/admin/members?q=bo"); assert.equal(r.data.members.length, 1);
    r = await client(base)("GET", "/"); assert.ok(String(r.data).includes("<div id=\"root\">") || r.status === 404 || r.status === 200);
    console.log("ALL TESTS PASSED");
    process.exit(0);
  } catch (e) { console.error("FAILED:", e); process.exit(1); }
});
