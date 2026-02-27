import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";

const BROWSER_PUSH_KEY = "uniplanner_browser_push_enabled";
const BROWSER_PUSH_EVENT = "uniplanner-browser-push-change";

function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    isNotificationSupported()
  );
}

function loadEnabledDefault(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(BROWSER_PUSH_KEY) === "true";
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  return navigator.serviceWorker.register("/service-worker.js");
}

export function useBrowserNotifications() {
  const supported = isNotificationSupported();
  const pushSupported = isPushSupported();
  const [enabled, setEnabled] = useState<boolean>(loadEnabledDefault);
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (!supported) return "denied";
    return Notification.permission;
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(BROWSER_PUSH_KEY, String(enabled));
    window.dispatchEvent(new CustomEvent(BROWSER_PUSH_EVENT, { detail: { enabled } }));
  }, [enabled]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => {
      setEnabled(loadEnabledDefault());
      if (supported) setPermission(Notification.permission);
    };
    window.addEventListener(BROWSER_PUSH_EVENT, handler as EventListener);
    return () => window.removeEventListener(BROWSER_PUSH_EVENT, handler as EventListener);
  }, [supported]);

  const canSend = useMemo(
    () => supported && enabled && permission === "granted",
    [enabled, permission, supported],
  );

  async function enableWithPrompt(): Promise<boolean> {
    if (!supported) return false;

    const nextPermission = await Notification.requestPermission();
    setPermission(nextPermission);
    if (nextPermission !== "granted") {
      setEnabled(false);
      return false;
    }

    if (!pushSupported) {
      setEnabled(true);
      return true;
    }

    try {
      const keyResponse = await api.get<{ publicKey: string }>("/push/public-key");
      const rawKey = urlBase64ToUint8Array(keyResponse.data.publicKey);
      const applicationServerKey = Uint8Array.from(rawKey);
      const registration = await getServiceWorkerRegistration();
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey as BufferSource,
        });
      }

      await api.post("/push/subscribe", {
        subscription: subscription.toJSON(),
      });

      setEnabled(true);
      return true;
    } catch {
      setEnabled(false);
      return false;
    }
  }

  async function disable() {
    setEnabled(false);
    if (!pushSupported) return;

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();

      if (subscription) {
        await api.delete("/push/subscribe", {
          data: {
            endpoint: subscription.endpoint,
          },
        });
        await subscription.unsubscribe();
      } else {
        await api.delete("/push/subscribe", { data: {} });
      }
    } catch {
      // Non-blocking local disable.
    }
  }

  function setEnabledValue(value: boolean) {
    setEnabled(value);
  }

  function notify(title: string, options?: NotificationOptions): Notification | null {
    if (!canSend) return null;
    return new Notification(title, options);
  }

  return {
    supported,
    pushSupported,
    enabled,
    permission,
    canSend,
    enableWithPrompt,
    disable,
    setEnabled: setEnabledValue,
    notify,
  };
}
