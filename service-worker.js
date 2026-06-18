const CACHE_NAME = "memo-pad-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./app.js",
  "./notifications.js",
  "./manifest.json",
  "./icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))),
    ).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request)),
  );
});

/* 3차: 서버 Web Push 연동 시 사용 */
self.addEventListener("push", (event) => {
  let payload = { title: "플래너", body: "" };
  try {
    payload = event.data?.json() ?? payload;
  } catch {
    payload.body = event.data?.text() || "";
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "./icons/icon.svg",
      badge: "./icons/icon.svg",
      tag: payload.tag || "planner-push",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      if (clients.length) return clients[0].focus();
      return self.clients.openWindow("./index.html");
    }),
  );
});
