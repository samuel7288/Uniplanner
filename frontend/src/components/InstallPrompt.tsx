import { ArrowDownTrayIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";

const DISMISSED_KEY = "uniplanner_install_prompt_dismissed_v1";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Shows a banner inviting the user to install UniPlanner as a PWA.
 * - On Android/Chrome: captures beforeinstallprompt and shows a native install dialog.
 * - On iOS/Safari: shows instructions to use "Add to Home Screen".
 * - Once dismissed, never shows again.
 */
export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed or already running as standalone
    if (localStorage.getItem(DISMISSED_KEY) === "true") return;
    if (window.matchMedia("(display-mode: standalone)").matches) return;
    if ((navigator as unknown as { standalone?: boolean }).standalone) return;

    // iOS detection
    const isIos =
      /iphone|ipad|ipod/i.test(navigator.userAgent) &&
      !/crios/i.test(navigator.userAgent); // exclude Chrome on iOS
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);

    if (isIos && isSafari) {
      // Delay a bit so it's not the first thing the user sees
      const id = window.setTimeout(() => {
        setShowIosHint(true);
        setVisible(true);
      }, 4000);
      return () => window.clearTimeout(id);
    }

    // Android/Chrome — listen for the browser's install event
    function onBeforeInstall(event: Event) {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      // Delay so the user has time to explore first
      window.setTimeout(() => setVisible(true), 4000);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    return () => window.removeEventListener("beforeinstallprompt", onBeforeInstall);
  }, []);

  function dismiss() {
    setVisible(false);
    localStorage.setItem(DISMISSED_KEY, "true");
  }

  async function install() {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      localStorage.setItem(DISMISSED_KEY, "true");
    }
    setVisible(false);
    setDeferredPrompt(null);
  }

  if (!visible) return null;

  return (
    <div
      role="banner"
      aria-label="Instalar UniPlanner"
      className="fixed bottom-20 left-3 right-3 z-50 lg:bottom-4 lg:left-auto lg:right-4 lg:w-96"
    >
      <div className="flex items-start gap-3 rounded-2xl border border-brand-200 bg-white p-4 shadow-panel dark:border-brand-700/50 dark:bg-[var(--surface)]">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 dark:bg-brand-700/30">
          <ArrowDownTrayIcon className="size-5 text-brand-600 dark:text-brand-400" />
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-ink-900 dark:text-ink-100">
            Instala UniPlanner
          </p>

          {showIosHint ? (
            <p className="mt-0.5 text-xs text-ink-600 dark:text-ink-400">
              Toca{" "}
              <span className="inline-flex items-center gap-0.5 rounded border border-ink-300 px-1 font-semibold dark:border-ink-600">
                <svg viewBox="0 0 24 24" className="inline size-3" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 8.25H7.5a2.25 2.25 0 0 0-2.25 2.25v9a2.25 2.25 0 0 0 2.25 2.25h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25H15M9 12l3 3m0 0 3-3m-3 3V2.25" />
                </svg>
                Compartir
              </span>{" "}
              y luego <strong>"Agregar a pantalla de inicio"</strong>.
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-ink-600 dark:text-ink-400">
              Úsala como app en tu celular y computadora, sin navegador.
            </p>
          )}

          {!showIosHint && (
            <button
              type="button"
              onClick={() => void install()}
              className="mt-2 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-700 dark:bg-brand-700 dark:hover:bg-brand-600"
            >
              Instalar ahora
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={dismiss}
          aria-label="Cerrar"
          className="shrink-0 rounded-lg p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-600 dark:hover:bg-ink-800 dark:hover:text-ink-300"
        >
          <XMarkIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}
