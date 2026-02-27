import { FormEvent, useEffect, useState } from "react";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import { useAuth } from "../context/AuthContext";
import { useTheme, type ThemePreset } from "../context/ThemeContext";
import { useBrowserNotifications } from "../hooks/useBrowserNotifications";
import { api, getErrorMessage } from "../lib/api";
import type { User } from "../lib/types";
import { Alert, Button, Card, Field, PageTitle, TextInput } from "../components/UI";

const PRESETS: { id: ThemePreset; label: string; brand: string; accent: string }[] = [
  { id: "ocean", label: "Ocean", brand: "#264ad1", accent: "#1c9366" },
  { id: "forest", label: "Forest", brand: "#1a6e3c", accent: "#0e5c6b" },
  { id: "sunset", label: "Sunset", brand: "#c0451e", accent: "#b8820d" },
  { id: "violet", label: "Violet", brand: "#6b28c8", accent: "#c428a0" },
];

export function SettingsPage() {
  const { user, refreshProfile } = useAuth();
  const { isDark, toggleDark, preset, setPreset, setDarkMode } = useTheme();
  const {
    supported: browserNotifSupported,
    enabled: browserNotifEnabled,
    permission: browserNotifPermission,
    enableWithPrompt,
    setEnabled: setBrowserNotifEnabled,
    notify,
  } = useBrowserNotifications();
  const [profile, setProfile] = useState({
    name: "",
    career: "",
    university: "",
    timezone: "",
    notifyInApp: true,
    notifyEmail: false,
  });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    setProfile({
      name: user.name,
      career: user.career || "",
      university: user.university || "",
      timezone: user.timezone,
      notifyInApp: user.notifyInApp,
      notifyEmail: user.notifyEmail,
    });
    if (typeof user.browserPushEnabled === "boolean") {
      setBrowserNotifEnabled(user.browserPushEnabled);
    }
  }, [
    setBrowserNotifEnabled,
    user?.browserPushEnabled,
    user?.career,
    user?.name,
    user?.notifyEmail,
    user?.notifyInApp,
    user?.timezone,
    user?.university,
  ]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      const profileResponse = await api.put<User>("/settings/profile", {
        name: profile.name,
        career: profile.career || null,
        university: profile.university || null,
        timezone: profile.timezone,
      });

      const preferencesResponse = await api.put<{
        notifyInApp: boolean;
        notifyEmail: boolean;
        darkModePref: boolean;
        themePreset: ThemePreset;
        browserPushEnabled: boolean;
      }>("/settings/preferences", {
        notifyInApp: profile.notifyInApp,
        notifyEmail: profile.notifyEmail,
        darkModePref: isDark,
        themePreset: preset,
        browserPushEnabled: browserNotifEnabled,
      });

      const savedProfile = profileResponse.data;
      const savedPreferences = preferencesResponse.data;

      setProfile({
        name: savedProfile.name,
        career: savedProfile.career || "",
        university: savedProfile.university || "",
        timezone: savedProfile.timezone,
        notifyInApp: savedPreferences.notifyInApp,
        notifyEmail: savedPreferences.notifyEmail,
      });

      setDarkMode(savedPreferences.darkModePref);
      setPreset(savedPreferences.themePreset);
      setBrowserNotifEnabled(savedPreferences.browserPushEnabled);

      await refreshProfile();
      setMessage("Perfil actualizado.");
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  return (
    <div className="space-y-6">
      <PageTitle
        overline="Configuracion"
        title="Ajustes"
        subtitle="Perfil, zona horaria, preferencias de notificaciones y apariencia."
      />

      {error && <Alert tone="error" message={error} />}
      {message && <Alert tone="success" message={message} />}

      {/* Apariencia */}
      <Card className="max-w-xl space-y-5">
        <h2 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-100">Apariencia</h2>

        <div className="flex items-center justify-between rounded-xl border border-ink-200 bg-ink-50 px-4 py-3 dark:border-ink-700 dark:bg-ink-800">
          <div>
            <p className="text-sm font-semibold text-ink-800 dark:text-ink-200">Modo oscuro</p>
            <p className="text-xs text-ink-500 dark:text-ink-400">Cambia entre tema claro y oscuro</p>
          </div>
          <button
            type="button"
            onClick={toggleDark}
            aria-label={isDark ? "Activar modo claro" : "Activar modo oscuro"}
            className="flex size-10 items-center justify-center rounded-xl border border-ink-200 bg-white text-ink-700 transition hover:bg-ink-100 dark:border-ink-600 dark:bg-ink-700 dark:text-ink-200 dark:hover:bg-ink-600"
          >
            {isDark ? <SunIcon className="size-5" /> : <MoonIcon className="size-5" />}
          </button>
        </div>

        <div>
          <p className="mb-3 text-sm font-semibold text-ink-800 dark:text-ink-200">Color del tema</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                aria-pressed={preset === p.id}
                className={`group flex flex-col items-center gap-2 rounded-xl border-2 p-3 transition ${
                  preset === p.id
                    ? "border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-900/20"
                    : "border-ink-200 bg-white hover:border-ink-300 dark:border-ink-700 dark:bg-ink-800 dark:hover:border-ink-500"
                }`}
              >
                <span className="flex gap-1.5">
                  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                    <circle cx="9" cy="9" r="9" fill={p.brand} />
                  </svg>
                  <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                    <circle cx="9" cy="9" r="9" fill={p.accent} />
                  </svg>
                </span>
                <span className="text-xs font-medium text-ink-700 dark:text-ink-300">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="max-w-xl space-y-4">
        <h2 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-100">
          Notificaciones del navegador
        </h2>
        {!browserNotifSupported ? (
          <Alert tone="warning" message="Este navegador no soporta notificaciones push." />
        ) : (
          <>
            <p className="text-sm text-ink-600 dark:text-ink-400">
              Recibe alertas de tareas y examenes cercanos aunque no tengas abierta la vista de notificaciones.
            </p>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              Permiso actual: <span className="font-semibold">{browserNotifPermission}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => {
                  void enableWithPrompt();
                }}
                disabled={browserNotifPermission === "granted" && browserNotifEnabled}
              >
                Activar navegador
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setBrowserNotifEnabled(!browserNotifEnabled)}
                disabled={browserNotifPermission !== "granted"}
              >
                {browserNotifEnabled ? "Desactivar alertas" : "Activar alertas"}
              </Button>
              <Button
                type="button"
                variant="subtle"
                onClick={() =>
                  notify("UniPlanner", {
                    body: "Las notificaciones del navegador estan funcionando.",
                    tag: "uniplanner-test",
                  })
                }
                disabled={browserNotifPermission !== "granted" || !browserNotifEnabled}
              >
                Probar
              </Button>
            </div>
          </>
        )}
      </Card>

      {/* Perfil */}
      <Card className="max-w-xl">
        <h2 className="mb-4 font-display text-lg font-semibold text-ink-900 dark:text-ink-100">Perfil</h2>
        <form className="grid gap-3" onSubmit={saveProfile}>
          <Field label="Nombre">
            <TextInput
              value={profile.name}
              onChange={(event) => setProfile((prev) => ({ ...prev, name: event.target.value }))}
              required
            />
          </Field>
          <Field label="Carrera">
            <TextInput
              value={profile.career}
              onChange={(event) => setProfile((prev) => ({ ...prev, career: event.target.value }))}
            />
          </Field>
          <Field label="Universidad">
            <TextInput
              value={profile.university}
              onChange={(event) => setProfile((prev) => ({ ...prev, university: event.target.value }))}
            />
          </Field>
          <Field label="Zona horaria">
            <TextInput
              value={profile.timezone}
              onChange={(event) => setProfile((prev) => ({ ...prev, timezone: event.target.value }))}
              required
            />
          </Field>

          <label className="inline-flex items-center gap-2 text-sm text-ink-700 dark:text-ink-300">
            <input
              type="checkbox"
              checked={profile.notifyInApp}
              onChange={(event) => setProfile((prev) => ({ ...prev, notifyInApp: event.target.checked }))}
              className="rounded border-ink-300 dark:border-ink-600"
            />
            Notificaciones in-app
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-ink-700 dark:text-ink-300">
            <input
              type="checkbox"
              checked={profile.notifyEmail}
              onChange={(event) => setProfile((prev) => ({ ...prev, notifyEmail: event.target.checked }))}
              className="rounded border-ink-300 dark:border-ink-600"
            />
            Notificaciones email (requiere SMTP)
          </label>

          <Button type="submit">Guardar ajustes</Button>
        </form>
      </Card>
    </div>
  );
}
