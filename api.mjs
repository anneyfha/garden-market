import { getStore } from "@netlify/blobs";
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";
import webpush from "web-push";

const ORD = ["Menunggu pembayaran", "Menunggu verifikasi", "Selesai"];
const KINDS = ["orders", "members", "warranties", "products"];
const uid = () => randomUUID().slice(0, 8);
const blob = () => getStore("garden-market");
const load = async () => {
  const d = (await blob().get("db", { type: "json" })) || { open: true, orders: [], members: [], warranties: [] };
  d.products ||= [];
  return d;
};
const save = (db) => blob().setJSON("db", db);
const json = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json", ...h } });
const sign = (v) => createHmac("sha256", process.env.SESSION_SECRET || "").update(v).digest("hex");
const same = (a, b) => timingSafeEqual(Buffer.from(sign(a)), Buffer.from(sign(b)));
const authed = (req) => {
  const m = /kw=(\d+)\.([a-f0-9]+)/.exec(req.headers.get("cookie") || "");
  return !!m && +m[1] > Date.now() && same(m[1], m[1]) && m[2] === sign(m[1]);
};
const txt = (v, n) => String(v || "").trim().slice(0, n);
const limited = async (req) => {
  const k = "rl-" + (req.headers.get("x-nf-client-connection-ip") || "x") + "-" + Math.floor(Date.now() / 6e4);
  const n = +(await blob().get(k)) || 0;
  if (n >= 10) return true;
  await blob().set(k, String(n + 1));
  return false;
};
const notify = async (title, body, tab) => {
  const E = process.env;
  if (!E.VAPID_PUBLIC || !E.VAPID_PRIVATE) return;
  try {
    webpush.setVapidDetails(E.VAPID_SUBJECT || "mailto:admin@example.com", E.VAPID_PUBLIC, E.VAPID_PRIVATE);
    const subs = (await blob().get("push", { type: "json" })) || [], keep = [];
    await Promise.all(subs.map(async (s) => {
      try { await webpush.sendNotification(s, JSON.stringify({ title, body, tab })); keep.push(s); }
      catch (e) { if (![404, 410].includes(e.statusCode)) keep.push(s); }
    }));
    if (keep.length !== subs.length) await blob().setJSON("push", keep);
  } catch {}
};

export default async (req) => {
  const path = new URL(req.url).pathname.replace(/\/$/, "");
  const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  const E = process.env;

  if (path === "/api/auth") {
    if (req.method === "GET") return json({ signedIn: authed(req), vapid: E.VAPID_PUBLIC || "" });
    if (body.action === "logout") return json({ ok: true }, 200, { "set-cookie": "kw=; Path=/; Max-Age=0" });
    if (!E.ADMIN_PASSWORD || !E.SESSION_SECRET) return json({ error: "ADMIN_PASSWORD dan SESSION_SECRET belum diisi di Netlify" }, 500);
    if (!same(String(body.password || ""), E.ADMIN_PASSWORD)) return json({ error: "Password salah" }, 401);
    const exp = String(Date.now() + 7 * 864e5);
    return json({ ok: true }, 200, { "set-cookie": `kw=${exp}.${sign(exp)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800` });
  }

  const db = await load();

  if (path === "/api/store") {
    if (req.method === "GET") return json({ open: db.open, products: db.products.filter((p) => !p.deleted && p.stock > 0).map(({ id, name, price, stock }) => ({ id, name, price, stock })) });
    if (await limited(req)) return json({ error: "Terlalu banyak permintaan, coba lagi sebentar" }, 429);
    const m = db.members.find((x) => x.id === body.memberId && !x.deleted);
    if (body.action === "register") {
      const name = txt(body.name, 60);
      const phone = txt(body.phone, 20).replace(/\D/g, "").replace(/^0/, "62");
      if (!name || phone.length < 9) return json({ error: "Nama dan nomor WhatsApp wajib diisi" }, 400);
      if (db.members.length >= 1000) return json({ error: "Pendaftaran penuh" }, 429);
      const member = { id: uid(), name, phone, status: "pending", deleted: false };
      db.members.push(member);
      await save(db);
      await notify("Reseller baru", name + " mendaftar", "members");
      return json({ memberId: member.id });
    }
    if (body.action === "order") {
      if (!db.open) return json({ error: "Toko sedang tutup" }, 403);
      if (!m || m.status !== "approved") return json({ error: "Reseller belum disetujui admin" }, 403);
      const p = db.products.find((x) => x.id === body.productId && !x.deleted), qty = Math.floor(Number(body.qty));
      if (!p || !(qty > 0)) return json({ error: "Pilih produk dan jumlah dengan benar" }, 400);
      if (p.stock < qty) return json({ error: "Stok tidak cukup" }, 409);
      p.stock -= qty;
      const order = { id: uid(), memberId: m.id, member: m.name, phone: m.phone, productId: p.id, qty, item: `${p.name} x${qty}`, total: p.price * qty, status: ORD[0], deleted: false };
      db.orders.push(order);
      await save(db);
      await notify("Pesanan baru", `${m.name}: ${order.item}`, "orders");
      return json({ orderId: order.id });
    }
    if (body.action === "paid") {
      const o = db.orders.find((x) => x.id === body.orderId && x.memberId === body.memberId && x.status === ORD[0]);
      if (!o) return json({ error: "Pesanan tidak ditemukan" }, 404);
      o.status = ORD[1];
      await notify("Pembayaran masuk", "Pesanan #" + o.id + " perlu diverifikasi", "orders");
      await save(db);
      return json({ ok: true });
    }
    return json({ error: "Aksi tidak valid" }, 400);
  }

  if (path === "/api/admin") {
    if (!authed(req)) return json({ error: "Belum login" }, 401);
    if (req.method === "GET") return json(db);
    const { action, id, kind, value } = body;
    const it = KINDS.includes(kind) ? db[kind].find((x) => x.id === id) : null;
    if (action === "open") db.open = !!body.open;
    else if (action === "product") {
      const name = txt(body.name, 60), price = Math.round(Number(body.price)), stock = Math.floor(Number(body.stock));
      if (!name || !(price > 0) || !(stock >= 0)) return json({ error: "Isi nama, harga, dan stok dengan benar" }, 400);
      const p = db.products.find((x) => x.id === id);
      if (p) Object.assign(p, { name, price, stock });
      else db.products.push({ id: uid(), name, price, stock, deleted: false });
    } else if (action === "subscribe") {
      if (!body.sub?.endpoint) return json({ error: "Langganan tidak valid" }, 400);
      const subs = ((await blob().get("push", { type: "json" })) || []).filter((s) => s.endpoint !== body.sub.endpoint);
      await blob().setJSON("push", [...subs, body.sub]);
      return json({ ok: true });
    } else if (!it) return json({ error: "Data tidak ditemukan" }, 404);
    else if (action === "status" && ORD.includes(value)) {
      it.status = value;
      if (value === ORD[2] && !db.warranties.some((w) => w.orderId === it.id))
        db.warranties.push({ id: uid(), orderId: it.id, item: it.item, member: it.member, status: "aktif", deleted: false });
    } else if (action === "member" && ["approved", "rejected"].includes(value)) it.status = value;
    else if (action === "warranty" && ["aktif", "selesai"].includes(value)) it.status = value;
    else if (action === "trash" || action === "restore") {
      const pr = kind === "orders" && it.status !== ORD[2] ? db.products.find((x) => x.id === it.productId) : null;
      if (pr && action === "trash" && !it.deleted) pr.stock += it.qty;
      if (pr && action === "restore" && it.deleted) pr.stock = Math.max(0, pr.stock - it.qty);
      it.deleted = action === "trash";
    }
    else return json({ error: "Aksi tidak valid" }, 400);
    await save(db);
    return json({ ok: true });
  }
  return json({ error: "Tidak ditemukan" }, 404);
};

export const config = { path: "/api/*" };
