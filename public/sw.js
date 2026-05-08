/**
 * Service Worker — ORBI Pro
 * Handles Web Push notifications.
 */

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "ORBI Pro", body: event.data.text() };
  }

  const title   = payload.title ?? "ORBI Pro";
  const options = {
    body:    payload.body   ?? "",
    icon:    payload.icon   ?? "/logos/orbi-logo-icon.svg",
    badge:   payload.badge  ?? "/logos/orbi-logo-icon.svg",
    data:    payload.data   ?? {},
    tag:     payload.tag    ?? "orbi-notification",
    vibrate: [200, 100, 200],
    actions: payload.actions ?? [],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const url = event.notification.data?.url ?? "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.focus();
          if (url !== "/") client.navigate(url);
          return;
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});
