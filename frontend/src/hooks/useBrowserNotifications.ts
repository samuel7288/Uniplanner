import { useEffect, useMemo, useState } from "react";

const BROWSER_PUSH_KEY = "uniplanner_browser_push_enabled";
const BROWSER_PUSH_EVENT = "uniplanner-browser-push-change";

function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

function loadEnabledDefault(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(BROWSER_PUSH_KEY) === "true";
}

export function useBrowserNotifications() {
  const supported = isNotificationSupported();
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
    const ok = nextPermission === "granted";
    setEnabled(ok);
    return ok;
  }

  function disable() {
    setEnabled(false);
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
    enabled,
    permission,
    canSend,
    enableWithPrompt,
    disable,
    setEnabled: setEnabledValue,
    notify,
  };
}
