self.addEventListener("install", (e) => e.waitUntil(self.skipWaiting()));
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data.json(); } catch {}
  e.waitUntil(self.registration.showNotification(d.title || "Garden Market", { body: d.body || "Ada pembaruan baru.", icon: "/icon-192.png", badge: "/icon-192.png", data: { tab: d.tab || "orders" } }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow("/#" + e.notification.data.tab));
});
