self.addEventListener("push", (event) => {
  let payload = {
    title: "UniPlanner",
    body: "Tienes una notificacion pendiente.",
    url: "/notifications",
    type: "SYSTEM",
    eventKey: `push-${Date.now()}`,
  };

  try {
    const data = event.data?.json();
    if (data && typeof data === "object") {
      payload = {
        ...payload,
        ...data,
      };
    }
  } catch {
    const text = event.data?.text();
    if (text) payload.body = text;
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icons/icon-192x192.png",
      badge: "/icons/icon-192x192.png",
      tag: payload.eventKey,
      data: {
        url: payload.url || "/notifications",
        type: payload.type,
      },
      renotify: false,
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/notifications";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.postMessage({ type: "OPEN_URL", url: targetUrl });
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});

