const { useState, useEffect, useCallback, useContext, createContext } = React;
const AppCtx = createContext(null);

// ------------------------------------------------------------ helpers
async function api(path, method = "GET", body) {
  const r = await fetch("/api" + path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  });
  let d = {};
  try { d = await r.json(); } catch (e) { /* not json */ }
  if (!r.ok) throw new Error(d.error || "Something went wrong");
  return d;
}
const useApp = () => useContext(AppCtx);
const fmtMoney = (n, c) => (c || "") + " " + Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
const fmtDate = (t) => new Date(t).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const go = (p) => { location.hash = p; };

function useRoute() {
  const get = () => {
    const h = location.hash.slice(1) || "/";
    const [path, qs] = h.split("?");
    return { path, q: Object.fromEntries(new URLSearchParams(qs || "")) };
  };
  const [r, setR] = useState(get);
  useEffect(() => {
    const f = () => { setR(get()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", f);
    return () => window.removeEventListener("hashchange", f);
  }, []);
  return r;
}

function useLoad(path) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const load = useCallback(() => {
    api(path).then((d) => { setData(d); setErr(""); }).catch((e) => setErr(e.message));
  }, [path]);
  useEffect(() => { setData(null); load(); }, [path]);
  return [data, load, err];
}

function copyText(t, toast) {
  const done = () => toast("Copied");
  if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, done); else done();
}

// ------------------------------------------------------------ ui bits
function Spinner() { return <p className="p-8 text-center text-ink/60">Loading...</p>; }
function ErrorBox({ msg }) { return msg ? <p className="rounded-lg bg-red-50 border border-red-200 text-red-800 px-3 py-2 text-sm">{msg}</p> : null; }
function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="text-sm font-semibold">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="text-xs text-ink/60">{hint}</span>}
    </label>
  );
}
const STATUS_STYLE = {
  pending: "bg-amber-100 text-amber-900", confirmed: "bg-blue-100 text-blue-900", delivered: "bg-emerald-100 text-emerald-900",
  rejected: "bg-red-100 text-red-900", refunded: "bg-gray-200 text-gray-800", paid: "bg-emerald-100 text-emerald-900",
  active: "bg-emerald-100 text-emerald-900", suspended: "bg-red-100 text-red-900",
};
function Badge({ s }) { return <span className={"inline-block rounded-full px-2.5 py-0.5 text-xs font-bold " + (STATUS_STYLE[s] || "bg-gray-100")}>{s}</span>; }
function Stat({ label, value, sub }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-ink/60 font-semibold">{label}</p>
      <p className="text-2xl font-extrabold mt-1 num">{value}</p>
      {sub && <p className="text-xs text-ink/55 mt-1">{sub}</p>}
    </div>
  );
}
function Table({ head, children, empty }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr>{head.map((h) => <th key={h} className="th">{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
      {empty && <p className="p-6 text-center text-ink/55">{empty}</p>}
    </div>
  );
}
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 bg-ink/50 grid place-items-center p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <h3 className="text-xl font-extrabold">{title}</h3>
          <button onClick={onClose} className="text-2xl leading-none px-2" aria-label="Close">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Logo({ name }) {
  return (
    <span className="flex items-center gap-2 font-extrabold text-lg">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="15" fill="#0F766E" />
        <circle cx="16" cy="9" r="3" fill="#fff" /><circle cx="9" cy="22" r="3" fill="#fff" /><circle cx="23" cy="22" r="3" fill="#fff" />
        <path d="M16 12l-6 8M16 12l6 8M12 22h8" stroke="#fff" strokeWidth="1.6" fill="none" />
      </svg>
      {name}
    </span>
  );
}

// ------------------------------------------------------------ public pages
function PublicLayout({ children }) {
  const { cfg, user, logout } = useApp();
  const link = "px-3 py-2 rounded-lg hover:bg-black/5 font-semibold";
  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white/80 backdrop-blur border-b border-line sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <a href="#/"><Logo name={cfg.company_name} /></a>
          <nav className="flex items-center gap-1 text-sm">
            <a className={link + " hidden sm:block"} href="#/products">Products</a>
            <a className={link + " hidden sm:block"} href="#/plan">Rewards plan</a>
            {user ? (
              <>
                <a className="btn btn-primary" href={user.role === "admin" ? "#/admin" : "#/app"}>Dashboard</a>
                <button className="btn btn-ghost" onClick={logout}>Log out</button>
              </>
            ) : (
              <>
                <a className={link} href="#/login">Log in</a>
                <a className="btn btn-primary" href="#/register">Join</a>
              </>
            )}
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line bg-white">
        <div className="max-w-6xl mx-auto px-4 py-8 text-sm text-ink/65 space-y-2">
          <p className="font-bold text-ink">{cfg.company_name}</p>
          <p>Earnings come only from real product sales. Joining is free and no income is guaranteed. Results depend on your own effort and the sales of your team.</p>
        </div>
      </footer>
    </div>
  );
}

function ProductCard({ p, children }) {
  const { cfg } = useApp();
  return (
    <div className="card overflow-hidden flex flex-col">
      <div className="aspect-[4/3] bg-soft grid place-items-center">
        {p.image_url ? <img src={p.image_url} alt={p.name} className="w-full h-full object-cover" /> : <span className="text-5xl" aria-hidden="true">🌿</span>}
      </div>
      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-bold">{p.name}</h3>
        <p className="text-sm text-ink/65 mt-1 flex-1">{p.description}</p>
        <p className="mt-3 text-lg font-extrabold num">{fmtMoney(p.price, cfg.currency)}</p>
        <p className="text-xs text-ink/55 num">BV {p.bv}</p>
        {children}
      </div>
    </div>
  );
}

function Home({ products }) {
  const { cfg, user } = useApp();
  const steps = [
    ["1", "Join for free", "Create your account with a sponsor code. There is no joining fee."],
    ["2", "Buy and share products", "Use the products yourself and share your personal referral link with people who would like them."],
    ["3", "Earn on team sales", "When orders in your team are confirmed you earn a commission on " + cfg.levels.length + " levels."],
  ];
  return (
    <>
      <section className="hero-bg">
        <div className="max-w-6xl mx-auto px-4 py-16 sm:py-24 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <p className="font-bold text-brand">Product-based network marketing</p>
            <h1 className="text-4xl sm:text-6xl font-extrabold leading-[1.02] mt-3">{cfg.tagline}</h1>
            <p className="mt-5 text-lg text-ink/70 max-w-lg">Real products, a clear rewards plan, and a dashboard where you can see every order, commission and payout.</p>
            <div className="mt-8 flex gap-3 flex-wrap">
              <a className="btn btn-primary text-lg px-6 py-3" href={user ? "#/app" : "#/register"}>{user ? "Open dashboard" : "Join free"}</a>
              <a className="btn btn-ghost text-lg px-6 py-3" href="#/plan">See the rewards plan</a>
            </div>
          </div>
          <div className="card p-6 sm:p-8">
            <p className="font-bold mb-4">How you earn</p>
            {cfg.levels.map((l, i) => (
              <div key={i} className="flex items-center gap-3 mb-3">
                <span className="w-24 text-sm font-semibold">Level {i + 1}</span>
                <div className="flex-1 h-3 rounded-full bg-soft overflow-hidden">
                  <div className="h-full bg-brand" style={{ width: Math.min(100, l * 6) + "%" }}></div>
                </div>
                <span className="w-12 text-right font-extrabold num">{l}%</span>
              </div>
            ))}
            <p className="text-xs text-ink/55 mt-2">Percent of the product BV on every confirmed team order.</p>
          </div>
        </div>
      </section>
      <section className="max-w-6xl mx-auto px-4 py-14">
        <h2 className="text-3xl font-extrabold">How it works</h2>
        <div className="grid md:grid-cols-3 gap-4 mt-6">
          {steps.map(([n, t, d]) => (
            <div key={n} className="card p-6"><span className="text-brand font-extrabold text-3xl">{n}</span><h3 className="font-bold text-lg mt-2">{t}</h3><p className="text-ink/65 mt-1">{d}</p></div>
          ))}
        </div>
      </section>
      <section className="max-w-6xl mx-auto px-4 pb-16">
        <div className="flex justify-between items-end"><h2 className="text-3xl font-extrabold">Products</h2><a href="#/products" className="font-semibold text-brand">View all</a></div>
        <ProductGrid products={products.slice(0, 4)} />
      </section>
    </>
  );
}

function ProductGrid({ products }) {
  if (!products.length) return <p className="mt-6 card p-8 text-center text-ink/60">Products will appear here soon.</p>;
  return <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">{products.map((p) => <ProductCard key={p.id} p={p} />)}</div>;
}

function Plan() {
  const { cfg } = useApp();
  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <h1 className="text-4xl font-extrabold">Rewards plan</h1>
      <p className="mt-3 text-ink/70">Commissions are paid only on confirmed product orders. Joining is free, and nothing is paid for recruiting alone.</p>
      <h2 className="text-xl font-extrabold mt-8 mb-3">Team commission</h2>
      <Table head={["Level", "Commission on order BV"]}>
        {cfg.levels.map((l, i) => <tr key={i}><td className="td font-semibold">Level {i + 1} {i === 0 ? "(your direct referrals)" : ""}</td><td className="td num font-bold">{l}%</td></tr>)}
      </Table>
      <h2 className="text-xl font-extrabold mt-8 mb-3">Ranks</h2>
      <Table head={["Rank", "Team BV needed"]}>
        {cfg.ranks.map((r) => <tr key={r.name}><td className="td font-semibold">{r.name}</td><td className="td num">{Number(r.bv).toLocaleString()}</td></tr>)}
      </Table>
      <h2 className="text-xl font-extrabold mt-8 mb-3">Good to know</h2>
      <ul className="list-disc pl-5 space-y-1.5 text-ink/80">
        <li>BV (business volume) is the part of a product price that commissions are calculated on.</li>
        {cfg.min_monthly_bv > 0 && <li>To earn commission in a month, you need at least {cfg.min_monthly_bv} BV of your own purchases that month.</li>}
        <li>Commission is credited to your wallet when the admin confirms the order.</li>
        <li>Minimum withdrawal is {fmtMoney(cfg.min_withdrawal, cfg.currency)}{cfg.withdrawal_fee_pct > 0 ? ", with a " + cfg.withdrawal_fee_pct + "% processing fee" : ""}.</li>
        <li>If an order is refunded, the commissions paid on it are reversed.</li>
        <li>Earnings are not guaranteed and depend on real sales.</li>
      </ul>
      <a className="btn btn-primary mt-8" href="#/register">Join free</a>
    </div>
  );
}

function AuthForm({ mode, q }) {
  const { cfg, setUser, toast } = useApp();
  const [f, setF] = useState({ name: "", username: "", email: "", phone: "", password: "", ref: q.ref || "" });
  const [sponsor, setSponsor] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  useEffect(() => {
    if (mode !== "register" || f.ref.trim().length < 6) { setSponsor(""); return; }
    const t = setTimeout(() => {
      api("/sponsor/" + encodeURIComponent(f.ref.trim())).then((d) => setSponsor(d.name)).catch(() => setSponsor(""));
    }, 350);
    return () => clearTimeout(t);
  }, [f.ref]);

  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr("");
    try {
      const d = mode === "login" ? await api("/login", "POST", { username: f.username, password: f.password }) : await api("/register", "POST", f);
      setUser(d.user);
      toast(mode === "login" ? "Welcome back" : "Welcome aboard");
      go(d.user.role === "admin" ? "/admin" : "/app");
    } catch (e2) { setErr(e2.message); }
    setBusy(false);
  };
  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <h1 className="text-3xl font-extrabold">{mode === "login" ? "Log in" : "Join " + cfg.company_name}</h1>
      <form onSubmit={submit} className="card p-6 mt-5 space-y-4">
        <ErrorBox msg={err} />
        {mode === "register" && (
          <>
            <Field label="Full name"><input className="input" value={f.name} onChange={set("name")} required /></Field>
            <Field label="Email"><input type="email" className="input" value={f.email} onChange={set("email")} required /></Field>
            <Field label="Phone"><input className="input" value={f.phone} onChange={set("phone")} /></Field>
          </>
        )}
        <Field label={mode === "login" ? "Username or email" : "Username"}>
          <input className="input" value={f.username} onChange={set("username")} autoCapitalize="none" required />
        </Field>
        <Field label="Password" hint={mode === "register" ? "At least 8 characters" : ""}>
          <input type="password" className="input" value={f.password} onChange={set("password")} required />
        </Field>
        {mode === "register" && (
          <Field label={"Sponsor code" + (cfg.open_signup ? " (optional)" : "")} hint={sponsor ? "Your sponsor: " + sponsor : ""}>
            <input className="input uppercase" value={f.ref} onChange={set("ref")} />
          </Field>
        )}
        <button className="btn btn-primary w-full py-3" disabled={busy}>{busy ? "Please wait..." : mode === "login" ? "Log in" : "Create account"}</button>
        <p className="text-sm text-center text-ink/65">
          {mode === "login" ? <>New here? <a className="text-brand font-semibold" href="#/register">Join free</a></> : <>Already a member? <a className="text-brand font-semibold" href="#/login">Log in</a></>}
        </p>
      </form>
    </div>
  );
}

// ------------------------------------------------------------ panel layout
function PanelLayout({ items, base, children, path }) {
  const { cfg, user, logout } = useApp();
  return (
    <div className="min-h-screen lg:flex">
      <aside className="lg:w-64 bg-ink text-white lg:min-h-screen lg:sticky lg:top-0 lg:self-start">
        <div className="flex lg:block items-center justify-between px-4 py-3 lg:py-5">
          <a href="#/" className="block"><Logo name={cfg.company_name} /></a>
          <p className="hidden lg:block text-xs text-white/60 mt-2">{user.role === "admin" ? "Administrator" : "@" + user.username}</p>
        </div>
        <nav className="flex lg:block overflow-x-auto px-2 pb-2 lg:pb-4 gap-1">
          {items.map(([p, label]) => {
            const active = path === base + p;
            return (
              <a key={p} href={"#" + base + p}
                 className={"whitespace-nowrap block px-3 py-2 rounded-lg text-sm font-semibold " + (active ? "bg-white text-ink" : "text-white/80 hover:bg-white/10")}>
                {label}
              </a>
            );
          })}
          <button onClick={logout} className="whitespace-nowrap block text-left px-3 py-2 rounded-lg text-sm font-semibold text-white/80 hover:bg-white/10 lg:mt-4">Log out</button>
        </nav>
      </aside>
      <main className="flex-1 p-4 sm:p-8 max-w-5xl w-full">{children}</main>
    </div>
  );
}
const PageTitle = ({ children, sub }) => (
  <div className="mb-6"><h1 className="text-2xl sm:text-3xl font-extrabold">{children}</h1>{sub && <p className="text-ink/65 mt-1">{sub}</p>}</div>
);

// ------------------------------------------------------------ member pages
function Dashboard() {
  const { cfg, user, toast } = useApp();
  const [d, , err] = useLoad("/dashboard");
  if (err) return <ErrorBox msg={err} />;
  if (!d) return <Spinner />;
  const link = location.origin + "/#/register?ref=" + user.ref_code;
  const c = cfg.currency;
  const pct = d.rank.next_bv ? Math.min(100, Math.round((d.team_bv / d.rank.next_bv) * 100)) : 100;
  return (
    <>
      <PageTitle sub={d.sponsor_name ? "Your sponsor: " + d.sponsor_name : ""}>Hello, {user.name.split(" ")[0]}</PageTitle>
      <div className="card p-5 mb-4 bg-soft border-brand/20">
        <p className="font-bold">Your referral link</p>
        <div className="mt-2 flex flex-col sm:flex-row gap-2">
          <input readOnly className="input num" value={link} onFocus={(e) => e.target.select()} />
          <button className="btn btn-primary shrink-0" onClick={() => copyText(link, toast)}>Copy link</button>
        </div>
        <p className="text-sm text-ink/65 mt-2">Or share your code: <b className="num tracking-wider">{user.ref_code}</b></p>
      </div>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Wallet balance" value={fmtMoney(d.balance, c)} sub={d.pending_withdrawals ? fmtMoney(d.pending_withdrawals, c) + " pending payout" : ""} />
        <Stat label="Total earned" value={fmtMoney(d.total_earned, c)} sub={"Withdrawn " + fmtMoney(d.total_withdrawn, c)} />
        <Stat label="Team size" value={d.team_size} sub={d.direct_count + " direct"} />
        <Stat label="Team BV" value={d.team_bv.toLocaleString()} sub={"Your own BV " + d.personal_bv.toLocaleString()} />
      </div>
      {!d.active_this_month && (
        <p className="mt-4 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 text-sm">
          You need {cfg.min_monthly_bv} BV of your own purchases this month to earn commissions (you have {d.monthly_bv}). <a className="font-bold underline" href="#/app/shop">Go to the shop</a>
        </p>
      )}
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        <div className="card p-5">
          <p className="text-sm text-ink/60 font-semibold">Rank</p>
          <p className="text-2xl font-extrabold text-gold">{d.rank.current}</p>
          {d.rank.next ? (
            <>
              <div className="h-3 rounded-full bg-paper border border-line mt-3 overflow-hidden"><div className="h-full bg-gold" style={{ width: pct + "%" }}></div></div>
              <p className="text-sm text-ink/65 mt-2 num">{d.team_bv.toLocaleString()} / {Number(d.rank.next_bv).toLocaleString()} team BV to reach {d.rank.next}</p>
            </>
          ) : <p className="text-sm text-ink/65 mt-2">You have reached the top rank.</p>}
          <p className="text-sm font-semibold mt-5 mb-2">Team by level</p>
          {d.levels.length ? d.levels.map((l) => <p key={l.depth} className="flex justify-between text-sm py-1 border-t border-line"><span>Level {l.depth}</span><b className="num">{l.n}</b></p>) : <p className="text-sm text-ink/60">No team members yet. Share your link to get started.</p>}
        </div>
        <div className="card p-5">
          <p className="font-bold mb-2">Recent activity</p>
          {d.recent.length ? d.recent.map((r) => (
            <div key={r.id} className="flex justify-between gap-3 py-2 border-t border-line text-sm">
              <span>{r.note}<br /><span className="text-xs text-ink/55">{fmtDate(r.created_at)}</span></span>
              <b className={"num " + (r.amount < 0 ? "text-red-700" : "text-emerald-700")}>{r.amount > 0 ? "+" : ""}{r.amount}</b>
            </div>
          )) : <p className="text-sm text-ink/60">Nothing yet.</p>}
        </div>
      </div>
    </>
  );
}

function Shop() {
  const { cfg, toast } = useApp();
  const [data, , err] = useLoad("/public");
  const [cart, setCart] = useState({});
  const [f, setF] = useState({ address: "", phone: "", payment_method: cfg.payment_methods[0], payment_ref: "" });
  const [e2, setE2] = useState("");
  const [busy, setBusy] = useState(false);
  if (err) return <ErrorBox msg={err} />;
  if (!data) return <Spinner />;
  const products = data.products;
  const lines = products.filter((p) => cart[p.id]).map((p) => ({ p, qty: cart[p.id] }));
  const total = lines.reduce((a, l) => a + l.p.price * l.qty, 0);
  const totalBv = lines.reduce((a, l) => a + l.p.bv * l.qty, 0);
  const add = (id, d) => setCart((c) => { const n = { ...c }; n[id] = Math.max(0, (n[id] || 0) + d); if (!n[id]) delete n[id]; return n; });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const place = async (e) => {
    e.preventDefault(); setBusy(true); setE2("");
    try {
      const d = await api("/orders", "POST", { ...f, items: lines.map((l) => ({ id: l.p.id, qty: l.qty })) });
      toast("Order #" + d.id + " placed. It will be confirmed after payment is verified.");
      go("/app/orders");
    } catch (x) { setE2(x.message); }
    setBusy(false);
  };
  return (
    <>
      <PageTitle sub="Pay first, then enter the transaction ID. Your order is confirmed once the payment is verified.">Shop</PageTitle>
      <div className="grid xl:grid-cols-[1fr_340px] gap-5 items-start">
        <div className="grid sm:grid-cols-2 gap-4">
          {products.length === 0 && <p className="card p-8 text-center text-ink/60 sm:col-span-2">No products available right now.</p>}
          {products.map((p) => (
            <ProductCard key={p.id} p={p}>
              <div className="mt-3 flex items-center gap-2">
                <button className="btn btn-ghost px-3 py-1.5" onClick={() => add(p.id, -1)} aria-label="Remove one">-</button>
                <span className="w-8 text-center font-bold num">{cart[p.id] || 0}</span>
                <button className="btn btn-primary px-3 py-1.5" onClick={() => add(p.id, 1)} aria-label="Add one">+</button>
              </div>
            </ProductCard>
          ))}
        </div>
        <form onSubmit={place} className="card p-5 space-y-3 xl:sticky xl:top-4">
          <h2 className="font-extrabold text-lg">Your order</h2>
          {lines.length === 0 && <p className="text-sm text-ink/60">Add products to begin.</p>}
          {lines.map((l) => <p key={l.p.id} className="flex justify-between text-sm"><span>{l.qty} x {l.p.name}</span><b className="num">{(l.p.price * l.qty).toLocaleString()}</b></p>)}
          {lines.length > 0 && (
            <>
              <p className="flex justify-between border-t border-line pt-2 font-extrabold"><span>Total</span><span className="num">{fmtMoney(total, cfg.currency)}</span></p>
              <p className="text-xs text-ink/55 num">Order BV: {totalBv}</p>
              <p className="rounded-lg bg-soft p-3 text-sm whitespace-pre-line">{cfg.payment_instructions}</p>
              <ErrorBox msg={e2} />
              <Field label="Delivery address"><textarea className="input" rows="2" value={f.address} onChange={set("address")} required /></Field>
              <Field label="Phone"><input className="input" value={f.phone} onChange={set("phone")} required /></Field>
              <Field label="Payment method"><select className="input" value={f.payment_method} onChange={set("payment_method")}>{cfg.payment_methods.map((m) => <option key={m}>{m}</option>)}</select></Field>
              <Field label="Transaction ID"><input className="input" value={f.payment_ref} onChange={set("payment_ref")} required /></Field>
              <button className="btn btn-primary w-full py-3" disabled={busy}>{busy ? "Placing..." : "Place order"}</button>
            </>
          )}
        </form>
      </div>
    </>
  );
}

function Orders() {
  const { cfg } = useApp();
  const [d, , err] = useLoad("/orders");
  if (err) return <ErrorBox msg={err} />;
  if (!d) return <Spinner />;
  return (
    <>
      <PageTitle>My orders</PageTitle>
      <Table head={["Order", "Items", "Total", "Status", "Date"]} empty={d.orders.length ? "" : "You have not placed any orders yet."}>
        {d.orders.map((o) => (
          <tr key={o.id}>
            <td className="td font-bold num">#{o.id}</td>
            <td className="td">{o.items.map((i) => i.qty + " x " + i.name).join(", ")}</td>
            <td className="td num">{fmtMoney(o.total, cfg.currency)}</td>
            <td className="td"><Badge s={o.status} />{o.admin_note && <p className="text-xs text-ink/60 mt-1">{o.admin_note}</p>}</td>
            <td className="td">{fmtDate(o.created_at)}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}

function TeamNode({ n, kids, depth }) {
  const [open, setOpen] = useState(depth < 2);
  const list = kids[n.id] || [];
  return (
    <li className="mt-1">
      <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-paper">
        <button className="w-6 h-6 rounded border border-line text-xs font-bold" disabled={!list.length} onClick={() => setOpen(!open)} aria-label="Toggle">{list.length ? (open ? "-" : "+") : ""}</button>
        <span className="font-semibold">{n.name}</span>
        <span className="text-xs text-ink/55">@{n.username}</span>
        {n.status !== "active" && <Badge s={n.status} />}
        <span className="ml-auto text-xs num text-ink/65">BV {n.bv}</span>
      </div>
      {open && list.length > 0 && <ul className="ml-5 pl-3 border-l border-line">{list.map((c) => <TeamNode key={c.id} n={c} kids={kids} depth={depth + 1} />)}</ul>}
    </li>
  );
}
function Team() {
  const { user } = useApp();
  const [d, , err] = useLoad("/team");
  if (err) return <ErrorBox msg={err} />;
  if (!d) return <Spinner />;
  const kids = {};
  d.members.forEach((m) => { (kids[m.sponsor_id] = kids[m.sponsor_id] || []).push(m); });
  const direct = kids[user.id] || [];
  return (
    <>
      <PageTitle sub={d.members.length + " people in your team"}>My team</PageTitle>
      <div className="card p-4">
        {direct.length ? <ul>{direct.map((n) => <TeamNode key={n.id} n={n} kids={kids} depth={0} />)}</ul>
          : <p className="p-6 text-center text-ink/60">Your team is empty. Share your referral link from the dashboard.</p>}
      </div>
    </>
  );
}

function Earnings() {
  const { cfg } = useApp();
  const [d, , err] = useLoad("/ledger");
  if (err) return <ErrorBox msg={err} />;
  if (!d) return <Spinner />;
  return (
    <>
      <PageTitle sub="Every credit and debit on your wallet">Earnings</PageTitle>
      <Table head={["Date", "Details", "Type", "Amount"]} empty={d.rows.length ? "" : "No earnings yet."}>
        {d.rows.map((r) => (
          <tr key={r.id}>
            <td className="td whitespace-nowrap">{fmtDate(r.created_at)}</td><td className="td">{r.note}</td>
            <td className="td capitalize">{r.type}</td>
            <td className={"td num font-bold " + (r.amount < 0 ? "text-red-700" : "text-emerald-700")}>{r.amount > 0 ? "+" : ""}{fmtMoney(r.amount, cfg.currency)}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}

function Withdraw() {
  const { cfg, toast } = useApp();
  const [d, load, err] = useLoad("/withdrawals");
  const [f, setF] = useState({ amount: "", method: cfg.payment_methods[0], account: "" });
  const [e2, setE2] = useState("");
  const [busy, setBusy] = useState(false);
  if (err) return <ErrorBox msg={err} />;
  if (!d) return <Spinner />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const fee = Number(f.amount || 0) * cfg.withdrawal_fee_pct / 100;
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setE2("");
    try { await api("/withdrawals", "POST", { ...f, amount: Number(f.amount) }); toast("Withdrawal requested"); setF({ ...f, amount: "" }); load(); }
    catch (x) { setE2(x.message); }
    setBusy(false);
  };
  return (
    <>
      <PageTitle sub={"Minimum " + fmtMoney(cfg.min_withdrawal, cfg.currency) + (cfg.withdrawal_fee_pct ? ", fee " + cfg.withdrawal_fee_pct + "%" : "")}>Withdraw</PageTitle>
      <div className="grid lg:grid-cols-[340px_1fr] gap-5 items-start">
        <form onSubmit={submit} className="card p-5 space-y-3">
          <p className="text-sm text-ink/60 font-semibold">Available balance</p>
          <p className="text-3xl font-extrabold num">{fmtMoney(d.balance, cfg.currency)}</p>
          <ErrorBox msg={e2} />
          <Field label="Amount"><input type="number" min="0" step="any" className="input" value={f.amount} onChange={set("amount")} required /></Field>
          {fee > 0 && <p className="text-xs text-ink/60 num">Fee {fee.toFixed(2)}, you receive {(Number(f.amount) - fee).toFixed(2)}</p>}
          <Field label="Method"><select className="input" value={f.method} onChange={set("method")}>{cfg.payment_methods.map((m) => <option key={m}>{m}</option>)}</select></Field>
          <Field label="Account number / details"><input className="input" value={f.account} onChange={set("account")} required /></Field>
          <button className="btn btn-primary w-full" disabled={busy}>Request withdrawal</button>
        </form>
        <Table head={["Date", "Amount", "You get", "Method", "Status"]} empty={d.rows.length ? "" : "No withdrawals yet."}>
          {d.rows.map((w) => (
            <tr key={w.id}>
              <td className="td">{fmtDate(w.created_at)}</td><td className="td num">{w.amount}</td><td className="td num">{w.net}</td>
              <td className="td">{w.method}</td><td className="td"><Badge s={w.status} />{w.admin_note && <p className="text-xs text-ink/60 mt-1">{w.admin_note}</p>}</td>
            </tr>
          ))}
        </Table>
      </div>
    </>
  );
}

function Profile() {
  const { user, setUser, toast } = useApp();
  const [f, setF] = useState({ name: user.name, phone: user.phone || "", current_password: "", new_password: "" });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault(); setErr("");
    try { const d = await api("/profile", "PUT", f); setUser(d.user); setF({ ...f, current_password: "", new_password: "" }); toast("Profile saved"); }
    catch (x) { setErr(x.message); }
  };
  return (
    <>
      <PageTitle>Profile</PageTitle>
      <form onSubmit={save} className="card p-5 space-y-4 max-w-md">
        <ErrorBox msg={err} />
        <p className="text-sm text-ink/65">@{user.username} - {user.email}</p>
        <Field label="Name"><input className="input" value={f.name} onChange={set("name")} required /></Field>
        <Field label="Phone"><input className="input" value={f.phone} onChange={set("phone")} /></Field>
        <p className="font-bold pt-2">Change password</p>
        <Field label="Current password"><input type="password" className="input" value={f.current_password} onChange={set("current_password")} /></Field>
        <Field label="New password"><input type="password" className="input" value={f.new_password} onChange={set("new_password")} /></Field>
        <button className="btn btn-primary">Save</button>
      </form>
    </>
  );
}

// ------------------------------------------------------------ admin pages
function AdminHome() {
  const { cfg } = useApp();
  const [d, , err] = useLoad("/admin/stats");
  if (err) return <ErrorBox msg={err} />;
  if (!d) return <Spinner />;
  const c = cfg.currency;
  return (
    <>
      <PageTitle>Overview</PageTitle>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Stat label="Members" value={d.members} sub={d.new_members_7d + " new this week, " + d.suspended + " suspended"} />
        <Stat label="Orders waiting" value={d.pending_orders} sub={<a className="underline" href="#/admin/orders">Review orders</a>} />
        <Stat label="Payouts waiting" value={d.pending_withdrawals.n} sub={fmtMoney(d.pending_withdrawals.v, c)} />
        <Stat label="Confirmed sales" value={fmtMoney(d.sales.v, c)} sub={d.sales.n + " orders, BV " + d.sales.bv.toLocaleString()} />
        <Stat label="Commissions credited" value={fmtMoney(d.commissions_credited, c)} sub={"Paid out " + fmtMoney(d.paid_out, c)} />
        <Stat label="Owed to members" value={fmtMoney(d.owed_to_members, c)} sub="Total of all wallet balances" />
      </div>
      <p className="card p-5 mt-6 text-sm text-ink/70">Download a database backup regularly from Settings so you never lose member data.</p>
    </>
  );
}

function AdminMembers() {
  const { cfg, toast } = useApp();
  const [q, setQ] = useState("");
  const [d, load, err] = useLoad("/admin/members?q=" + encodeURIComponent(q));
  const [m, setM] = useState(null);
  const [f, setF] = useState({ amount: "", note: "", password: "" });
  const [e2, setE2] = useState("");
  const act = async (fn, msg) => { setE2(""); try { await fn(); toast(msg); setF({ amount: "", note: "", password: "" }); load(); } catch (x) { setE2(x.message); } };
  return (
    <>
      <PageTitle>Members</PageTitle>
      <input className="input mb-4 max-w-sm" placeholder="Search name, username, email, phone" value={q} onChange={(e) => setQ(e.target.value)} />
      <ErrorBox msg={err} />
      {!d ? <Spinner /> : (
        <Table head={["Member", "Sponsor", "Directs", "BV", "Balance", "Status", ""]} empty={d.members.length ? "" : "No members found."}>
          {d.members.map((u) => (
            <tr key={u.id}>
              <td className="td"><b>{u.name}</b><br /><span className="text-xs text-ink/60">@{u.username} - {u.email}</span></td>
              <td className="td">{u.sponsor === "admin" ? "Company" : u.sponsor}</td>
              <td className="td num">{u.directs}</td><td className="td num">{u.bv}</td><td className="td num">{fmtMoney(u.balance, cfg.currency)}</td>
              <td className="td"><Badge s={u.status} /></td>
              <td className="td"><button className="btn btn-ghost px-3 py-1.5" onClick={() => { setM(u); setE2(""); }}>Manage</button></td>
            </tr>
          ))}
        </Table>
      )}
      {m && (
        <Modal title={m.name} onClose={() => setM(null)}>
          <div className="space-y-5">
            <ErrorBox msg={e2} />
            <p className="text-sm text-ink/70">@{m.username} - {m.phone || "no phone"} - code <b>{m.ref_code}</b></p>
            <div>
              <p className="font-bold mb-1">Account</p>
              <button className={"btn " + (m.status === "active" ? "btn-danger" : "btn-primary")}
                onClick={() => act(async () => { await api("/admin/members/" + m.id, "PATCH", { status: m.status === "active" ? "suspended" : "active" }); setM(null); }, "Updated")}>
                {m.status === "active" ? "Suspend member" : "Re-activate member"}
              </button>
            </div>
            <div>
              <p className="font-bold mb-1">Balance adjustment (use minus to deduct)</p>
              <div className="flex gap-2"><input className="input" type="number" step="any" placeholder="Amount" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />
                <input className="input" placeholder="Reason" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></div>
              <button className="btn btn-dark mt-2" onClick={() => act(() => api("/admin/members/" + m.id + "/adjust", "POST", { amount: Number(f.amount), note: f.note }), "Balance adjusted")}>Apply</button>
            </div>
            <div>
              <p className="font-bold mb-1">Reset password</p>
              <div className="flex gap-2"><input className="input" placeholder="New password (8+ characters)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
                <button className="btn btn-dark" onClick={() => act(() => api("/admin/members/" + m.id + "/password", "POST", { password: f.password }), "Password reset")}>Reset</button></div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function AdminProducts() {
  const { toast } = useApp();
  const [d, load, err] = useLoad("/admin/products");
  const [ed, setEd] = useState(null);
  const [e2, setE2] = useState("");
  if (err) return <ErrorBox msg={err} />;
  if (!d) return <Spinner />;
  const blank = { name: "", description: "", price: "", bv: "", image_url: "", active: true };
  const set = (k) => (e) => setEd({ ...ed, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault(); setE2("");
    try {
      const body = { ...ed, price: Number(ed.price), bv: Number(ed.bv) };
      if (ed.id) await api("/admin/products/" + ed.id, "PUT", body); else await api("/admin/products", "POST", body);
      toast("Product saved"); setEd(null); load();
    } catch (x) { setE2(x.message); }
  };
  const del = async (p) => { if (confirm("Delete " + p.name + "? Products with past orders are hidden instead.")) { await api("/admin/products/" + p.id, "DELETE"); load(); } };
  return (
    <>
      <div className="flex justify-between items-center"><PageTitle>Products</PageTitle><button className="btn btn-primary" onClick={() => { setEd(blank); setE2(""); }}>Add product</button></div>
      <Table head={["Product", "Price", "BV", "Status", ""]} empty={d.products.length ? "" : "No products yet. Add your first product."}>
        {d.products.map((p) => (
          <tr key={p.id}>
            <td className="td"><b>{p.name}</b><br /><span className="text-xs text-ink/60">{p.description}</span></td>
            <td className="td num">{p.price}</td><td className="td num">{p.bv}</td>
            <td className="td"><Badge s={p.active ? "active" : "suspended"} /></td>
            <td className="td whitespace-nowrap"><button className="btn btn-ghost px-3 py-1.5" onClick={() => { setEd({ ...p, active: !!p.active }); setE2(""); }}>Edit</button> <button className="btn btn-danger px-3 py-1.5" onClick={() => del(p)}>Delete</button></td>
          </tr>
        ))}
      </Table>
      {ed && (
        <Modal title={ed.id ? "Edit product" : "New product"} onClose={() => setEd(null)}>
          <form onSubmit={save} className="space-y-3">
            <ErrorBox msg={e2} />
            <Field label="Name"><input className="input" value={ed.name} onChange={set("name")} required /></Field>
            <Field label="Description"><textarea className="input" rows="2" value={ed.description} onChange={set("description")} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Price"><input type="number" step="any" className="input" value={ed.price} onChange={set("price")} required /></Field>
              <Field label="BV" hint="Commission base, cannot exceed price"><input type="number" step="any" className="input" value={ed.bv} onChange={set("bv")} required /></Field>
            </div>
            <Field label="Image URL (optional)"><input className="input" value={ed.image_url} onChange={set("image_url")} placeholder="https://..." /></Field>
            <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5 accent-[#0F766E]" checked={ed.active} onChange={(e) => setEd({ ...ed, active: e.target.checked })} /> Visible in shop</label>
            <button className="btn btn-primary w-full">Save</button>
          </form>
        </Modal>
      )}
    </>
  );
}

function AdminOrders() {
  const { cfg, toast } = useApp();
  const [st, setSt] = useState("pending");
  const [d, load, err] = useLoad("/admin/orders?status=" + st);
  const act = async (o, action) => {
    let note = "";
    if (action === "reject" || action === "refund") { note = prompt("Reason (shown to the member):") || ""; if (action === "reject" && !note) return; }
    else if (!confirm(action === "confirm" ? "Confirm payment received and credit commissions?" : "Mark as delivered?")) return;
    try { await api("/admin/orders/" + o.id + "/" + action, "POST", { note }); toast("Order #" + o.id + " updated"); load(); }
    catch (x) { toast(x.message); }
  };
  return (
    <>
      <PageTitle sub="Check the payment in your account first, then confirm. Confirming credits team commissions.">Orders</PageTitle>
      <div className="flex gap-2 mb-4 flex-wrap">
        {["pending", "confirmed", "delivered", "rejected", "refunded", ""].map((s) => (
          <button key={s} onClick={() => setSt(s)} className={"btn " + (st === s ? "btn-dark" : "btn-ghost") + " px-3 py-1.5 capitalize"}>{s || "all"}</button>
        ))}
      </div>
      <ErrorBox msg={err} />
      {!d ? <Spinner /> : (
        <Table head={["Order", "Member", "Items / delivery", "Payment", "Total", "Status", ""]} empty={d.orders.length ? "" : "No orders here."}>
          {d.orders.map((o) => (
            <tr key={o.id}>
              <td className="td num font-bold">#{o.id}<br /><span className="text-xs font-normal text-ink/60">{fmtDate(o.created_at)}</span></td>
              <td className="td">{o.member_name}<br /><span className="text-xs text-ink/60">@{o.username}</span></td>
              <td className="td">{o.items.map((i) => i.qty + " x " + i.name).join(", ")}<br /><span className="text-xs text-ink/60">{o.address} - {o.phone}</span></td>
              <td className="td">{o.payment_method}<br /><b className="num text-xs">{o.payment_ref}</b></td>
              <td className="td num">{fmtMoney(o.total, cfg.currency)}<br /><span className="text-xs text-ink/60">BV {o.total_bv}</span></td>
              <td className="td"><Badge s={o.status} /></td>
              <td className="td"><div className="flex flex-col gap-1">
                {o.status === "pending" && <><button className="btn btn-primary px-3 py-1.5" onClick={() => act(o, "confirm")}>Confirm</button><button className="btn btn-danger px-3 py-1.5" onClick={() => act(o, "reject")}>Reject</button></>}
                {o.status === "confirmed" && <button className="btn btn-ghost px-3 py-1.5" onClick={() => act(o, "deliver")}>Delivered</button>}
                {(o.status === "confirmed" || o.status === "delivered") && <button className="btn btn-danger px-3 py-1.5" onClick={() => act(o, "refund")}>Refund</button>}
              </div></td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}

function AdminWithdrawals() {
  const { cfg, toast } = useApp();
  const [d, load, err] = useLoad("/admin/withdrawals");
  if (err) return <ErrorBox msg={err} />;
  if (!d) return <Spinner />;
  const act = async (w, action) => {
    const note = prompt(action === "pay" ? "Payment reference (optional):" : "Reason for rejecting:") || "";
    if (action === "reject" && !note) return;
    try { await api("/admin/withdrawals/" + w.id + "/" + action, "POST", { note }); toast("Updated"); load(); } catch (x) { toast(x.message); }
  };
  return (
    <>
      <PageTitle sub="Send the money manually, then mark the request as paid. Rejecting returns the amount to the member wallet.">Withdrawals</PageTitle>
      <Table head={["Date", "Member", "Pay to", "Amount", "Send", "Status", ""]} empty={d.rows.length ? "" : "No withdrawal requests."}>
        {d.rows.map((w) => (
          <tr key={w.id}>
            <td className="td">{fmtDate(w.created_at)}</td>
            <td className="td">{w.member_name}<br /><span className="text-xs text-ink/60">@{w.username}</span></td>
            <td className="td">{w.method}<br /><b className="num">{w.account}</b></td>
            <td className="td num">{fmtMoney(w.amount, cfg.currency)}</td>
            <td className="td num font-bold">{fmtMoney(w.net, cfg.currency)}</td>
            <td className="td"><Badge s={w.status} />{w.admin_note && <p className="text-xs text-ink/60 mt-1">{w.admin_note}</p>}</td>
            <td className="td">{w.status === "pending" && <div className="flex flex-col gap-1">
              <button className="btn btn-primary px-3 py-1.5" onClick={() => act(w, "pay")}>Mark paid</button>
              <button className="btn btn-danger px-3 py-1.5" onClick={() => act(w, "reject")}>Reject</button></div>}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}

function AdminSettings() {
  const { toast, reloadCfg } = useApp();
  const [d, , err] = useLoad("/admin/settings");
  const [f, setF] = useState(null);
  const [e2, setE2] = useState("");
  useEffect(() => {
    if (d) setF({
      ...d.settings, levels: d.settings.levels.join(", "), payment_methods: d.settings.payment_methods.join(", "),
      ranks: d.settings.ranks.map((r) => r.name + ":" + r.bv).join(", "),
    });
  }, [d]);
  if (err) return <ErrorBox msg={err} />;
  if (!f) return <Spinner />;
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const save = async (e) => {
    e.preventDefault(); setE2("");
    try {
      await api("/admin/settings", "PUT", {
        ...f,
        levels: f.levels.split(",").map((x) => Number(x.trim())).filter((x) => !isNaN(x)),
        payment_methods: f.payment_methods.split(",").map((x) => x.trim()).filter(Boolean),
        ranks: f.ranks.split(",").map((x) => { const [n, b] = x.split(":"); return { name: (n || "").trim(), bv: Number(b) }; }),
        min_withdrawal: Number(f.min_withdrawal), withdrawal_fee_pct: Number(f.withdrawal_fee_pct), min_monthly_bv: Number(f.min_monthly_bv),
      });
      await reloadCfg(); toast("Settings saved");
    } catch (x) { setE2(x.message); }
  };
  return (
    <>
      <PageTitle>Settings</PageTitle>
      <form onSubmit={save} className="card p-5 space-y-4 max-w-2xl">
        <ErrorBox msg={e2} />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Company name"><input className="input" value={f.company_name} onChange={set("company_name")} /></Field>
          <Field label="Currency"><input className="input" value={f.currency} onChange={set("currency")} /></Field>
        </div>
        <Field label="Tagline"><input className="input" value={f.tagline} onChange={set("tagline")} /></Field>
        <Field label="Commission % per level" hint="Comma separated, level 1 first. Example: 10, 5, 3, 2, 1 (total must be 100 or less)"><input className="input" value={f.levels} onChange={set("levels")} /></Field>
        <Field label="Ranks" hint="name:team BV, comma separated. Example: Member:0, Bronze:10000"><input className="input" value={f.ranks} onChange={set("ranks")} /></Field>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label="Min withdrawal"><input type="number" className="input" value={f.min_withdrawal} onChange={set("min_withdrawal")} /></Field>
          <Field label="Withdrawal fee %"><input type="number" step="any" className="input" value={f.withdrawal_fee_pct} onChange={set("withdrawal_fee_pct")} /></Field>
          <Field label="Monthly BV to qualify" hint="0 = off"><input type="number" className="input" value={f.min_monthly_bv} onChange={set("min_monthly_bv")} /></Field>
        </div>
        <Field label="Payment methods" hint="Comma separated"><input className="input" value={f.payment_methods} onChange={set("payment_methods")} /></Field>
        <Field label="Payment instructions (shown at checkout)" hint="Put your JazzCash / Easypaisa / bank account details here"><textarea rows="4" className="input" value={f.payment_instructions} onChange={set("payment_instructions")} /></Field>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5 accent-[#0F766E]" checked={!!f.open_signup} onChange={(e) => setF({ ...f, open_signup: e.target.checked })} /> Allow joining without a sponsor code</label>
        <div className="flex gap-3 flex-wrap">
          <button className="btn btn-primary">Save settings</button>
          <a className="btn btn-ghost" href="/api/admin/backup">Download database backup</a>
        </div>
      </form>
    </>
  );
}

// ------------------------------------------------------------ app shell
const MEMBER_NAV = [["", "Dashboard"], ["/shop", "Shop"], ["/orders", "My orders"], ["/team", "My team"], ["/earnings", "Earnings"], ["/withdraw", "Withdraw"], ["/profile", "Profile"]];
const ADMIN_NAV = [["", "Overview"], ["/members", "Members"], ["/orders", "Orders"], ["/withdrawals", "Withdrawals"], ["/products", "Products"], ["/settings", "Settings"]];

function App() {
  const [cfg, setCfg] = useState(null);
  const [products, setProducts] = useState([]);
  const [user, setUser] = useState(undefined);
  const [msg, setMsg] = useState("");
  const { path, q } = useRoute();

  const reloadCfg = useCallback(() => api("/public").then((d) => { setCfg(d.settings); setProducts(d.products); document.title = d.settings.company_name; }), []);
  useEffect(() => { reloadCfg(); api("/me").then((d) => setUser(d.user)).catch(() => setUser(null)); }, []);
  const toast = useCallback((m) => { setMsg(m); setTimeout(() => setMsg(""), 3200); }, []);
  const logout = async () => { await api("/logout", "POST"); setUser(null); go("/"); };

  if (!cfg || user === undefined) return <Spinner />;
  const ctx = { cfg, user, setUser, toast, logout, reloadCfg };
  let page;
  const isAdmin = user && user.role === "admin";

  if (path.startsWith("/admin") || path.startsWith("/app")) {
    if (!user) { go("/login"); page = <Spinner />; }
    else if (path.startsWith("/admin") && !isAdmin) { go("/app"); page = <Spinner />; }
    else if (path.startsWith("/app") && isAdmin) { go("/admin"); page = <Spinner />; }
    else {
      const base = isAdmin ? "/admin" : "/app";
      const sub = path.slice(base.length);
      const map = isAdmin
        ? { "": <AdminHome />, "/members": <AdminMembers />, "/orders": <AdminOrders />, "/withdrawals": <AdminWithdrawals />, "/products": <AdminProducts />, "/settings": <AdminSettings /> }
        : { "": <Dashboard />, "/shop": <Shop />, "/orders": <Orders />, "/team": <Team />, "/earnings": <Earnings />, "/withdraw": <Withdraw />, "/profile": <Profile /> };
      page = <PanelLayout items={isAdmin ? ADMIN_NAV : MEMBER_NAV} base={base} path={path}>{map[sub] || map[""]}</PanelLayout>;
    }
  } else {
    if (user && (path === "/login" || path === "/register")) { go(isAdmin ? "/admin" : "/app"); }
    let inner;
    if (path === "/login") inner = <AuthForm mode="login" q={q} />;
    else if (path === "/register") inner = <AuthForm mode="register" q={q} />;
    else if (path === "/plan") inner = <Plan />;
    else if (path === "/products") inner = <div className="max-w-6xl mx-auto px-4 py-12"><h1 className="text-4xl font-extrabold">Products</h1><ProductGrid products={products} /><p className="mt-6 text-ink/65"><a className="text-brand font-semibold" href="#/register">Join free</a> to order and earn rewards.</p></div>;
    else inner = <Home products={products} />;
    page = <PublicLayout>{inner}</PublicLayout>;
  }

  return (
    <AppCtx.Provider value={ctx}>
      {page}
      {msg && <div role="status" className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[60] bg-ink text-white px-5 py-3 rounded-xl shadow-lg font-semibold max-w-[90vw]">{msg}</div>}
    </AppCtx.Provider>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
