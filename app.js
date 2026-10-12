const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const call = async (p, b) => {
  try {
    const r = await fetch(p, b ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) } : {});
    return await r.json();
  } catch { return { error: "Gagal terhubung ke server" }; }
};
const rp = (n) => "Rp " + Number(n || 0).toLocaleString("id-ID");
const BG = { "Menunggu verifikasi": "#FFC4E1", "Menunggu pembayaran": "#FFEBA6", Selesai: "#C9EFCF", pending: "#FFC4E1", approved: "#C9EFCF", rejected: "#FFC9A8", aktif: "#C9EFCF", selesai: "#A8DCF2" };
const TABS = [["orders", "Pesanan", "#FF7EBB"], ["products", "Produk & Stok", "#9BE3AE"], ["members", "Members", "#A8DCF2"], ["warranties", "Garansi", "#FFE680"], ["trash", "Sampah", "#CDB4F6"]];
const KIND = { orders: "Pesanan", members: "Member", warranties: "Garansi", products: "Produk" };
let db = null, tab = "orders", ok = false, err = "", vapid = "";
const b64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

const chip = (s) => `<span class="chip" style="background:${BG[s] || "#fff"}">${esc(s)}</span>`;
const btn = (t, a, id, k, c, v = "") => `<button class="btn" style="background:${c}" data-a="${a}" data-id="${esc(id)}" data-k="${k}" data-v="${esc(v)}">${t}</button>`;
const card = (title, sub, status, acts) => `<div class="card row"><div><b class="f" style="font-size:20px">${title}</b><div>${sub}</div></div>${status}<div class="acts">${acts}</div></div>`;
const wa = (o) => `<a class="btn" style="background:#A8DCF2;display:inline-flex;align-items:center;text-decoration:none" target="_blank" rel="noopener" href="https://wa.me/${esc(o.phone)}?text=${encodeURIComponent(`Halo ${o.member}, pesanan #${o.id} (${o.item}) sudah selesai. Terima kasih!`)}">Kirim via WhatsApp</a>`;
const live = (k) => db[k].filter((x) => !x.deleted);

function rows() {
  if (tab === "orders") return live("orders").map((o) => card("#" + esc(o.id), `${esc(o.member)} · ${rp(o.total)} · ${esc(o.item)}`, chip(o.status),
    (o.status === "Menunggu verifikasi" ? btn("Setujui", "status", o.id, "orders", "#9BE3AE", "Selesai") : "") + (o.status === "Selesai" && o.phone ? wa(o) : "") + btn("Ke Sampah", "trash", o.id, "orders", "#FFC9A8"))).join("");
  if (tab === "products") return live("products").map((p) => card(esc(p.name), `${rp(p.price)} · Stok ${p.stock}`, `<span class="chip" style="background:${p.stock > 0 ? "#C9EFCF" : "#FFC9A8"}">${p.stock > 0 ? "Tersedia" : "Habis"}</span>`, btn("Ubah", "edit", p.id, "products", "#A8DCF2") + btn("Ke Sampah", "trash", p.id, "products", "#FFC9A8"))).join("");
  if (tab === "members") return live("members").map((m) => card(esc(m.name), "ID " + esc(m.id), chip(m.status),
    (m.status !== "approved" ? btn("Setujui", "member", m.id, "members", "#9BE3AE", "approved") : "") +
    (m.status === "pending" ? btn("Tolak", "member", m.id, "members", "#FFC9A8", "rejected") : "") + btn("Ke Sampah", "trash", m.id, "members", "#FFC9A8"))).join("");
  if (tab === "warranties") return live("warranties").map((w) => card(esc(w.item), `${esc(w.member)} · Pesanan #${esc(w.orderId)}`, chip(w.status),
    btn(w.status === "aktif" ? "Tandai selesai" : "Aktifkan", "warranty", w.id, "warranties", "#A8DCF2", w.status === "aktif" ? "selesai" : "aktif") + btn("Ke Sampah", "trash", w.id, "warranties", "#FFC9A8"))).join("");
  return Object.keys(KIND).flatMap((k) => db[k].filter((x) => x.deleted).map((x) =>
    card(esc(x.item || x.name), KIND[k] + " · ID " + esc(x.id), "", btn("Pulihkan", "restore", x.id, k, "#9BE3AE")))).join("");
}
const empty = () => (rows() ? "" : '<div class="card">Belum ada data di sini.</div>');

function draw() {
  const root = document.getElementById("root");
  if (!ok) {
    root.innerHTML = `<form id="lf" class="card login"><img src="/ava.png" alt="" width="96" height="96" style="align-self:center"><h1>Garden Market</h1><label for="pw">Password admin</label><input id="pw" type="password" required autocomplete="current-password"><button class="btn" style="background:#FF7EBB">Masuk</button><p role="alert">${esc(err)}</p></form>`;
    return;
  }
  if (!db) { root.innerHTML = `<div class="card login">${esc(err || "Memuat...")}</div>`; return; }
  const n = (s) => live("orders").filter((o) => o.status === s).length;
  const pform = tab === "products" ? `<form id="pf" class="card"><h2 class="f" style="margin:0 0 8px">Tambah / ubah produk</h2><input id="pn" placeholder="Nama produk" aria-label="Nama produk" required maxlength="60"><input id="pp" type="number" min="1" placeholder="Harga (Rp)" aria-label="Harga" required><input id="ps" type="number" min="0" placeholder="Stok" aria-label="Stok" required><input id="pi" type="hidden"><button class="btn" style="background:#9BE3AE">Simpan</button></form>` : "";
  const stats = tab === "orders" ? `<section class="stats"><div class="card" style="background:#FFC4E1">Menunggu verifikasi<b>${n("Menunggu verifikasi")}</b></div><div class="card" style="background:#FFEBA6">Menunggu pembayaran<b>${n("Menunggu pembayaran")}</b></div><div class="card" style="background:#C9EFCF">Selesai<b>${n("Selesai")}</b></div></section>` : "";
  root.innerHTML = `<div class="app"><aside><div class="card f row" style="font-size:22px;justify-content:flex-start"><img src="/ava.png" alt="" width="52" height="52">Garden Market</div>${TABS.map(([k, t, c]) => `<button class="btn" style="background:${c};${k === tab ? "outline:3px solid #6B4A3A;outline-offset:2px" : ""}" data-a="tab" data-v="${k}">${t}</button>`).join("")}<button class="btn" data-a="push" style="margin-top:auto;background:#FFE680">Aktifkan notifikasi</button><button class="btn" data-a="logout">Keluar</button></aside>
  <main><header class="row"><div><h1>${TABS.find((t) => t[0] === tab)[1]}</h1><p style="margin:4px 0 0">Reseller hanya bisa checkout saat toko buka</p></div>
  <div class="card row" style="padding:6px 8px 6px 18px"><b>${db.open ? "Toko buka" : "Toko tutup"}</b><button class="btn sw ${db.open ? "" : "off"}" aria-label="Buka atau tutup toko" data-a="open"><i></i></button></div></header>
  <p role="alert">${esc(err)}</p>${pform}${stats}${rows()}${empty()}</main></div>`;
}
async function refresh() { const r = await call("/api/admin"); if (r.error) { ok = r.error !== "Belum login" && ok; err = r.error; db = null; } else { db = r; err = ""; } draw(); }

document.addEventListener("submit", async (e) => {
  if (e.target.id !== "lf") return;
  e.preventDefault();
  const r = await call("/api/auth", { action: "login", password: document.getElementById("pw").value });
  if (r.error) { err = r.error; return draw(); }
  ok = true; err = ""; refresh();
});
document.addEventListener("click", async (e) => {
  const t = e.target.closest("[data-a]");
  if (!t) return;
  const { a, id, k, v } = t.dataset;
  if (a === "tab") { tab = v; return draw(); }
  if (a === "edit") {
    const p = db.products.find((x) => x.id === id);
    ["pn:name", "pp:price", "ps:stock", "pi:id"].forEach((f) => { const [i, k2] = f.split(":"); document.getElementById(i).value = p[k2]; });
    return document.getElementById("pn").focus();
  }
  if (a === "push") {
    try {
      if (!vapid) throw new Error("VAPID_PUBLIC belum diisi di Netlify");
      if ((await Notification.requestPermission()) !== "granted") throw new Error("Izin notifikasi ditolak");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64(vapid) });
      const r = await call("/api/admin", { action: "subscribe", sub: sub.toJSON() });
      err = r.error || "Notifikasi aktif di perangkat ini";
    } catch (x) { err = x.message; }
    return draw();
  }
  if (a === "logout") { await call("/api/auth", { action: "logout" }); ok = false; db = null; return draw(); }
  const r = await call("/api/admin", a === "open" ? { action: "open", open: !db.open } : { action: a, id, kind: k, value: v });
  err = r.error || "";
  refresh();
});
(async () => { const a = await call("/api/auth"); ok = !!a.signedIn; vapid = a.vapid || ""; const h = location.hash.slice(1); if (TABS.some((t) => t[0] === h)) tab = h; ok ? refresh() : draw(); })();

document.addEventListener("submit", async (e) => {
  if (e.target.id !== "pf") return;
  e.preventDefault();
  const g = (i) => document.getElementById(i).value;
  const r = await call("/api/admin", { action: "product", id: g("pi"), name: g("pn"), price: g("pp"), stock: g("ps") });
  err = r.error || "";
  refresh();
});
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
