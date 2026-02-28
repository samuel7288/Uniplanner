import { FormEvent, useEffect, useMemo, useState } from "react";
import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useTheme, type ThemePreset } from "../context/ThemeContext";
import { useBrowserNotifications } from "../hooks/useBrowserNotifications";
import { api, getErrorMessage } from "../lib/api";
import { AchievementsResponseSchema, SettingsPreferencesSchema, UserSchema } from "../lib/schemas";
import type {
  AchievementsResponse,
  Course,
  StudyGroupCalendarEvent,
  StudyGroupMember,
  StudyGroupSummary,
} from "../lib/types";
import { Alert, Button, Card, Field, PageTitle, TextInput } from "../components/UI";

const PRESETS: { id: ThemePreset; label: string; brand: string; accent: string }[] = [
  { id: "ocean", label: "Ocean", brand: "#264ad1", accent: "#1c9366" },
  { id: "forest", label: "Forest", brand: "#1a6e3c", accent: "#0e5c6b" },
  { id: "sunset", label: "Sunset", brand: "#c0451e", accent: "#b8820d" },
  { id: "midnight", label: "Midnight", brand: "#285686", accent: "#0d7286" },
  { id: "sepia", label: "Sepia", brand: "#916126", accent: "#64701f" },
  { id: "violet", label: "Violet", brand: "#6b28c8", accent: "#c428a0" },
];

export function SettingsPage() {
  const { user, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark, toggleDark, preset, setPreset, setDarkMode } = useTheme();
  const {
    supported: browserNotifSupported,
    pushSupported,
    enabled: browserNotifEnabled,
    permission: browserNotifPermission,
    enableWithPrompt,
    disable: disableBrowserPush,
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
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [achievements, setAchievements] = useState<AchievementsResponse | null>(null);
  const [studyReminderPrefs, setStudyReminderPrefs] = useState({
    enabled: true,
    minDaysWithoutStudy: 3,
  });
  const [googleCalendarStatus, setGoogleCalendarStatus] = useState({
    configured: false,
    connected: false,
    lastSyncAt: null as string | null,
    calendarId: null as string | null,
  });
  const [googleCalendarLoading, setGoogleCalendarLoading] = useState(true);
  const [googleCalendarSyncing, setGoogleCalendarSyncing] = useState(false);
  const [courses, setCourses] = useState<Course[]>([]);
  const [studyGroups, setStudyGroups] = useState<StudyGroupSummary[]>([]);
  const [studyGroupsLoading, setStudyGroupsLoading] = useState(true);
  const [groupEventsLoading, setGroupEventsLoading] = useState(false);
  const [groupMembersLoading, setGroupMembersLoading] = useState(false);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [invitingGroupId, setInvitingGroupId] = useState(0);
  const [removingMemberId, setRemovingMemberId] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState(0);
  const [groupEvents, setGroupEvents] = useState<StudyGroupCalendarEvent[]>([]);
  const [groupMembers, setGroupMembers] = useState<StudyGroupMember[]>([]);
  const [groupForm, setGroupForm] = useState({
    name: "",
    courseId: "",
  });
  const [inviteEmailByGroup, setInviteEmailByGroup] = useState<Record<number, string>>({});

  const iosPushNeedsStandalone = useMemo(() => {
    if (typeof window === "undefined") return false;
    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    if (!isIOS) return false;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    return !standalone;
  }, []);

  const selectedGroup = useMemo(
    () => studyGroups.find((group) => group.id === selectedGroupId) ?? null,
    [selectedGroupId, studyGroups],
  );

  async function loadGoogleCalendarStatus() {
    setGoogleCalendarLoading(true);
    try {
      const response = await api.get<{
        configured: boolean;
        connected: boolean;
        lastSyncAt: string | null;
        calendarId: string | null;
      }>("/google-calendar/status");
      setGoogleCalendarStatus(response.data);
    } catch {
      setGoogleCalendarStatus({
        configured: false,
        connected: false,
        lastSyncAt: null,
        calendarId: null,
      });
    } finally {
      setGoogleCalendarLoading(false);
    }
  }

  async function connectGoogleCalendar() {
    setError("");
    try {
      const response = await api.get<{ url: string }>("/google-calendar/connect-url");
      window.location.assign(response.data.url);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function syncGoogleCalendar() {
    setError("");
    setMessage("");
    setGoogleCalendarSyncing(true);
    try {
      const response = await api.post<{ synced: number; inserted: number; updated: number }>("/google-calendar/sync");
      setMessage(
        `Google Calendar sincronizado: ${response.data.synced} eventos (${response.data.inserted} nuevos, ${response.data.updated} actualizados).`,
      );
      await loadGoogleCalendarStatus();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setGoogleCalendarSyncing(false);
    }
  }

  async function disconnectGoogleCalendar() {
    const confirmed = window.confirm("Desconectar Google Calendar y revocar sincronizacion?");
    if (!confirmed) return;
    setError("");
    setMessage("");
    try {
      await api.delete("/google-calendar/disconnect");
      setMessage("Google Calendar desconectado.");
      await loadGoogleCalendarStatus();
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }

  async function loadCourses() {
    try {
      const response = await api.get<Course[]>("/courses");
      setCourses(response.data);
    } catch {
      setCourses([]);
    }
  }

  async function loadStudyGroups() {
    setStudyGroupsLoading(true);
    try {
      const response = await api.get<{ items: StudyGroupSummary[] }>("/groups");
      setStudyGroups(response.data.items);
    } catch {
      setStudyGroups([]);
    } finally {
      setStudyGroupsLoading(false);
    }
  }

  async function loadGroupCalendar(groupId: number) {
    setGroupEventsLoading(true);
    try {
      const response = await api.get<{ events: StudyGroupCalendarEvent[] }>(`/groups/${groupId}/calendar`);
      setGroupEvents(response.data.events);
    } catch (err) {
      setGroupEvents([]);
      setError(getErrorMessage(err));
    } finally {
      setGroupEventsLoading(false);
    }
  }

  async function loadGroupMembers(groupId: number) {
    setGroupMembersLoading(true);
    try {
      const response = await api.get<{ items: StudyGroupMember[] }>(`/groups/${groupId}/members`);
      setGroupMembers(response.data.items);
    } catch (err) {
      setGroupMembers([]);
      setError(getErrorMessage(err));
    } finally {
      setGroupMembersLoading(false);
    }
  }

  async function createStudyGroup() {
    const name = groupForm.name.trim();
    if (!name) {
      setError("Escribe un nombre para el grupo");
      return;
    }

    setError("");
    setMessage("");
    setCreatingGroup(true);
    try {
      const response = await api.post<{ id: number }>("/groups", {
        name,
        courseId: groupForm.courseId || null,
      });
      setGroupForm({ name: "", courseId: "" });
      setMessage("Grupo creado.");
      await loadStudyGroups();
      setSelectedGroupId(response.data.id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setCreatingGroup(false);
    }
  }

  async function inviteMember(groupId: number) {
    const email = (inviteEmailByGroup[groupId] || "").trim();
    if (!email) {
      setError("Escribe un email valido para invitar");
      return;
    }

    setError("");
    setMessage("");
    setInvitingGroupId(groupId);
    try {
      await api.post(`/groups/${groupId}/invite`, { email });
      setInviteEmailByGroup((prev) => ({ ...prev, [groupId]: "" }));
      setMessage("Invitacion enviada.");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setInvitingGroupId(0);
    }
  }

  async function removeMember(groupId: number, member: StudyGroupMember) {
    const confirmed = window.confirm(`Remover a ${member.name} del grupo?`);
    if (!confirmed) return;

    setError("");
    setMessage("");
    setRemovingMemberId(member.userId);
    try {
      await api.delete(`/groups/${groupId}/members/${member.userId}`);
      setMessage("Miembro removido.");
      await Promise.all([loadStudyGroups(), loadGroupMembers(groupId), loadGroupCalendar(groupId)]);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setRemovingMemberId("");
    }
  }

  async function acceptGroupInvite(token: string) {
    setError("");
    setMessage("");
    try {
      const response = await api.get<{ accepted: boolean; group: { id: number; name: string } }>(`/invites/${token}`);
      setMessage(`Te uniste al grupo "${response.data.group.name}".`);
      await loadStudyGroups();
      setSelectedGroupId(response.data.group.id);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      navigate("/settings", { replace: true });
    }
  }

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

  useEffect(() => {
    let active = true;

    async function loadStudyReminderPrefs() {
      try {
        const response = await api.get<{ enabled: boolean; minDaysWithoutStudy: number }>(
          "/settings/study-reminders",
        );
        if (!active) return;
        setStudyReminderPrefs({
          enabled: response.data.enabled,
          minDaysWithoutStudy: response.data.minDaysWithoutStudy,
        });
      } catch {
        // no-op: keep defaults when endpoint is temporarily unavailable
      }
    }

    void loadStudyReminderPrefs();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void loadGoogleCalendarStatus();
  }, []);

  useEffect(() => {
    void loadCourses();
    void loadStudyGroups();
  }, []);

  useEffect(() => {
    if (studyGroups.length === 0) {
      setSelectedGroupId(0);
      setGroupEvents([]);
      setGroupMembers([]);
      return;
    }
    if (!studyGroups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroupId(studyGroups[0].id);
    }
  }, [selectedGroupId, studyGroups]);

  useEffect(() => {
    if (!selectedGroupId) return;
    void Promise.all([loadGroupCalendar(selectedGroupId), loadGroupMembers(selectedGroupId)]);
  }, [selectedGroupId]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const inviteToken = params.get("groupInvite");
    if (inviteToken) {
      void acceptGroupInvite(inviteToken);
      return;
    }

    const status = params.get("googleCalendar");
    if (!status) return;

    if (status === "connected") {
      setMessage("Google Calendar conectado correctamente.");
    } else if (status === "cancelled") {
      setMessage("Conexion de Google Calendar cancelada.");
    } else {
      setError("No se pudo completar la conexion con Google Calendar.");
    }

    void loadGoogleCalendarStatus();
    navigate("/settings", { replace: true });
  }, [location.search, navigate]);

  useEffect(() => {
    let active = true;

    async function loadAchievements() {
      try {
        const response = await api.get<AchievementsResponse>("/achievements");
        const parsed = AchievementsResponseSchema.parse(response.data);
        if (!active) return;
        setAchievements(parsed);
      } catch {
        // no-op
      }
    }

    void loadAchievements();
    return () => {
      active = false;
    };
  }, []);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");

    try {
      const profileResponse = await api.put("/settings/profile", {
        name: profile.name,
        career: profile.career || null,
        university: profile.university || null,
        timezone: profile.timezone,
      });

      const preferencesResponse = await api.put("/settings/preferences", {
        notifyInApp: profile.notifyInApp,
        notifyEmail: profile.notifyEmail,
        darkModePref: isDark,
        themePreset: preset,
        browserPushEnabled: browserNotifEnabled,
      });
      await api.put("/settings/study-reminders", {
        enabled: studyReminderPrefs.enabled,
        minDaysWithoutStudy: studyReminderPrefs.minDaysWithoutStudy,
      });

      const savedProfile = UserSchema.parse(profileResponse.data);
      const savedPreferences = SettingsPreferencesSchema.parse(preferencesResponse.data);

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

  async function archiveCurrentSemester() {
    const confirmed = window.confirm(
      "Se archivaran las materias del semestre activo y ya no apareceran en la vista principal. Continuar?",
    );
    if (!confirmed) return;

    setError("");
    setMessage("");
    setArchiveLoading(true);

    try {
      const response = await api.patch<{ semester: string | null; archivedCount: number }>("/courses/archive-semester", {});
      const { semester, archivedCount } = response.data;

      if (archivedCount === 0) {
        setMessage("No hay materias activas para archivar.");
        return;
      }

      const semesterLabel = semester ? ` del semestre ${semester}` : "";
      setMessage(`Se archivaron ${archivedCount} materias${semesterLabel}.`);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setArchiveLoading(false);
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
            {!pushSupported && (
              <Alert
                tone="warning"
                message="Push real no disponible: este navegador solo mostrara alertas cuando la app este abierta."
              />
            )}
            {iosPushNeedsStandalone && (
              <Alert
                tone="info"
                message="En iOS, instala la app en pantalla de inicio (modo standalone) para recibir push en segundo plano."
              />
            )}
            <p className="text-xs text-ink-500 dark:text-ink-400">
              Permiso actual: <span className="font-semibold">{browserNotifPermission}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                onClick={() => void enableWithPrompt()}
                disabled={browserNotifPermission === "granted" && browserNotifEnabled}
              >
                Activar push
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => void disableBrowserPush()}
                disabled={!browserNotifEnabled}
              >
                Desactivar push
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

      <Card className="max-w-xl space-y-4">
        <h2 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-100">
          Historial academico
        </h2>
        <p className="text-sm text-ink-600 dark:text-ink-400">
          Archiva el semestre actual para congelar materias y consultar su GPA en la vista de historial.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => void archiveCurrentSemester()} disabled={archiveLoading}>
            {archiveLoading ? "Archivando..." : "Archivar semestre"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => navigate("/history")}>
            Ver historial
          </Button>
        </div>
      </Card>

      <Card className="max-w-xl space-y-4">
        <h2 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-100">
          Google Calendar
        </h2>
        {googleCalendarLoading ? (
          <p className="text-sm text-ink-600 dark:text-ink-400">Cargando estado de integracion...</p>
        ) : !googleCalendarStatus.configured ? (
          <Alert
            tone="warning"
            message="Integracion no configurada en servidor. Define GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET y GOOGLE_REDIRECT_URI."
          />
        ) : (
          <>
            <p className="text-sm text-ink-600 dark:text-ink-400">
              Exporta tareas y examenes de UniPlanner a tu Google Calendar.
            </p>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              Estado: <strong>{googleCalendarStatus.connected ? "Conectado" : "No conectado"}</strong>
              {googleCalendarStatus.lastSyncAt
                ? ` • Ultima sync: ${new Date(googleCalendarStatus.lastSyncAt).toLocaleString()}`
                : ""}
            </p>
            <div className="flex flex-wrap gap-2">
              {!googleCalendarStatus.connected ? (
                <Button type="button" onClick={() => void connectGoogleCalendar()}>
                  Conectar Google Calendar
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    onClick={() => void syncGoogleCalendar()}
                    disabled={googleCalendarSyncing}
                  >
                    {googleCalendarSyncing ? "Sincronizando..." : "Sincronizar ahora"}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => void disconnectGoogleCalendar()}>
                    Desconectar
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </Card>

      <Card className="space-y-4">
        <h2 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-100">
          Grupos de estudio
        </h2>
        <p className="text-sm text-ink-600 dark:text-ink-400">
          Crea grupos, invita companeros por email y comparte solo fechas de examenes y entregas.
        </p>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-700 dark:bg-[var(--surface)]/60">
            <h3 className="text-sm font-semibold text-ink-800 dark:text-ink-200">Crear grupo</h3>
            <Field label="Nombre del grupo">
              <TextInput
                value={groupForm.name}
                onChange={(event) => setGroupForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Ej. Algebra 2 - Equipo A"
              />
            </Field>
            <Field label="Materia (opcional)">
              <select
                className="w-full rounded-xl border border-ink-300 bg-white px-3 py-2 text-sm text-ink-700 dark:border-ink-700 dark:bg-[var(--surface)] dark:text-ink-200"
                value={groupForm.courseId}
                onChange={(event) => setGroupForm((prev) => ({ ...prev, courseId: event.target.value }))}
              >
                <option value="">Sin materia fija</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.name}
                  </option>
                ))}
              </select>
            </Field>
            <Button type="button" onClick={() => void createStudyGroup()} disabled={creatingGroup}>
              {creatingGroup ? "Creando..." : "Crear grupo"}
            </Button>

            <div className="space-y-2 pt-2">
              <p className="text-sm font-semibold text-ink-800 dark:text-ink-200">Mis grupos</p>
              {studyGroupsLoading ? (
                <p className="text-sm text-ink-500 dark:text-ink-400">Cargando grupos...</p>
              ) : studyGroups.length === 0 ? (
                <p className="text-sm text-ink-500 dark:text-ink-400">Aun no perteneces a ningun grupo.</p>
              ) : (
                studyGroups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition ${
                      selectedGroupId === group.id
                        ? "border-brand-400 bg-brand-50 text-brand-700 dark:border-brand-500 dark:bg-brand-900/20 dark:text-brand-300"
                        : "border-ink-200 bg-white text-ink-700 hover:border-ink-300 dark:border-ink-700 dark:bg-[var(--surface)] dark:text-ink-300 dark:hover:border-ink-500"
                    }`}
                    onClick={() => setSelectedGroupId(group.id)}
                  >
                    <p className="font-semibold">{group.name}</p>
                    <p className="text-xs opacity-80">
                      {group.courseName ? `${group.courseName} • ` : ""}
                      {group.membersCount} miembro(s) • rol: {group.role}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-ink-200 bg-white/70 p-4 dark:border-ink-700 dark:bg-[var(--surface)]/60">
            {!selectedGroup ? (
              <p className="text-sm text-ink-500 dark:text-ink-400">
                Selecciona un grupo para ver miembros y calendario compartido.
              </p>
            ) : (
              <>
                <div>
                  <p className="text-sm font-semibold text-ink-800 dark:text-ink-200">{selectedGroup.name}</p>
                  <p className="text-xs text-ink-500 dark:text-ink-400">
                    Rol: {selectedGroup.role} | miembros: {selectedGroup.membersCount}
                  </p>
                </div>

                {selectedGroup.role === "admin" && (
                  <div className="space-y-2 rounded-xl border border-ink-200 bg-ink-50/70 p-3 dark:border-ink-700 dark:bg-ink-800/40">
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-500 dark:text-ink-400">
                      Invitar miembro
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <TextInput
                        type="email"
                        placeholder="email@universidad.edu"
                        value={inviteEmailByGroup[selectedGroup.id] || ""}
                        onChange={(event) =>
                          setInviteEmailByGroup((prev) => ({
                            ...prev,
                            [selectedGroup.id]: event.target.value,
                          }))
                        }
                      />
                      <Button
                        type="button"
                        onClick={() => void inviteMember(selectedGroup.id)}
                        disabled={invitingGroupId === selectedGroup.id}
                      >
                        {invitingGroupId === selectedGroup.id ? "Enviando..." : "Invitar"}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-ink-800 dark:text-ink-200">Miembros</p>
                  {groupMembersLoading ? (
                    <p className="text-sm text-ink-500 dark:text-ink-400">Cargando miembros...</p>
                  ) : groupMembers.length === 0 ? (
                    <p className="text-sm text-ink-500 dark:text-ink-400">No hay miembros en este grupo.</p>
                  ) : (
                    groupMembers.map((member) => (
                      <div
                        key={member.userId}
                        className="flex items-center justify-between rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-[var(--surface)]"
                      >
                        <div>
                          <p className="font-medium text-ink-800 dark:text-ink-200">{member.name}</p>
                          <p className="text-xs text-ink-500 dark:text-ink-400">
                            {member.email} | {member.role}
                          </p>
                        </div>
                        {selectedGroup.role === "admin" && member.userId !== user?.id && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => void removeMember(selectedGroup.id, member)}
                            disabled={removingMemberId === member.userId}
                          >
                            {removingMemberId === member.userId ? "Removiendo..." : "Remover"}
                          </Button>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-semibold text-ink-800 dark:text-ink-200">Calendario compartido</p>
                  {groupEventsLoading ? (
                    <p className="text-sm text-ink-500 dark:text-ink-400">Cargando eventos...</p>
                  ) : groupEvents.length === 0 ? (
                    <p className="text-sm text-ink-500 dark:text-ink-400">
                      Aun no hay examenes o entregas compartidas.
                    </p>
                  ) : (
                    <div className="max-h-56 space-y-2 overflow-auto pr-1">
                      {groupEvents.slice(0, 20).map((event) => (
                        <div
                          key={event.id}
                          className="rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm dark:border-ink-700 dark:bg-[var(--surface)]"
                        >
                          <p className="font-medium text-ink-800 dark:text-ink-200">{event.title}</p>
                          <p className="text-xs text-ink-500 dark:text-ink-400">
                            {new Date(event.start).toLocaleString()} | {event.sourceUserName}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </Card>

      <Card className="max-w-xl space-y-4">
        <h2 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-100">
          Recordatorios de estudio
        </h2>
        <p className="text-sm text-ink-600 dark:text-ink-400">
          Recibe alertas inteligentes cuando tienes examenes proximos y llevas dias sin estudiar una materia.
        </p>
        <label className="inline-flex items-center gap-2 text-sm text-ink-700 dark:text-ink-300">
          <input
            type="checkbox"
            checked={studyReminderPrefs.enabled}
            onChange={(event) =>
              setStudyReminderPrefs((prev) => ({ ...prev, enabled: event.target.checked }))
            }
            className="rounded border-ink-300 dark:border-ink-600"
          />
          Recordarme estudiar cuando tengo examen proximo
        </label>
        <Field label="Dias sin estudiar para activar recordatorio">
          <select
            value={String(studyReminderPrefs.minDaysWithoutStudy)}
            onChange={(event) =>
              setStudyReminderPrefs((prev) => ({
                ...prev,
                minDaysWithoutStudy: Number(event.target.value),
              }))
            }
            className="w-full rounded-xl border border-ink-300 bg-white px-3 py-2 text-sm text-ink-700 dark:border-ink-700 dark:bg-[var(--surface)] dark:text-ink-200"
            disabled={!studyReminderPrefs.enabled}
          >
            {[1, 2, 3, 4, 5, 6, 7].map((value) => (
              <option key={value} value={value}>
                {value} dia(s)
              </option>
            ))}
          </select>
        </Field>
      </Card>

      <Card className="max-w-xl space-y-4">
        <h2 className="font-display text-lg font-semibold text-ink-900 dark:text-ink-100">
          Logros
        </h2>
        {!achievements ? (
          <p className="text-sm text-ink-600 dark:text-ink-400">Cargando logros...</p>
        ) : (
          <>
            <p className="text-sm text-ink-600 dark:text-ink-400">
              Racha actual: <strong>{achievements.streak.current}</strong> dias | Record:{" "}
              <strong>{achievements.streak.longest}</strong> dias
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {achievements.items.map((item) => (
                <div
                  key={item.type}
                  className={`rounded-xl border p-3 text-center ${
                    item.unlocked
                      ? "border-success-300 bg-success-50 dark:border-success-700/50 dark:bg-success-900/20"
                      : "border-ink-200 bg-ink-100/60 dark:border-ink-700 dark:bg-ink-800/40"
                  }`}
                >
                  <p
                    className={`text-sm font-semibold ${
                      item.unlocked
                        ? "text-ink-800 dark:text-ink-100"
                        : "text-ink-500 dark:text-ink-400"
                    }`}
                  >
                    {item.unlocked ? item.name : "???"}
                  </p>
                  <p className="mt-1 text-xs text-ink-500 dark:text-ink-400">
                    {item.unlocked ? item.description : "Logro bloqueado"}
                  </p>
                </div>
              ))}
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
