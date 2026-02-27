import { Suspense, lazy, type ReactElement } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ProtectedRoute, PublicRoute } from "./components/RouteGuards";

const LoginPage = lazy(() => import("./pages/LoginPage").then((m) => ({ default: m.LoginPage })));
const RegisterPage = lazy(() => import("./pages/RegisterPage").then((m) => ({ default: m.RegisterPage })));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage").then((m) => ({ default: m.ResetPasswordPage })));
const DashboardPage = lazy(() => import("./pages/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const TodayPage = lazy(() => import("./pages/TodayPage").then((m) => ({ default: m.TodayPage })));
const SemesterHistoryPage = lazy(() => import("./pages/SemesterHistoryPage").then((m) => ({ default: m.SemesterHistoryPage })));
const CoursesPage = lazy(() => import("./pages/CoursesPage").then((m) => ({ default: m.CoursesPage })));
const SchedulePage = lazy(() => import("./pages/SchedulePage").then((m) => ({ default: m.SchedulePage })));
const AssignmentsPage = lazy(() => import("./pages/AssignmentsPage").then((m) => ({ default: m.AssignmentsPage })));
const ExamsPage = lazy(() => import("./pages/ExamsPage").then((m) => ({ default: m.ExamsPage })));
const ProjectsPage = lazy(() => import("./pages/ProjectsPage").then((m) => ({ default: m.ProjectsPage })));
const CalendarPage = lazy(() => import("./pages/CalendarPage").then((m) => ({ default: m.CalendarPage })));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage").then((m) => ({ default: m.NotificationsPage })));
const SettingsPage = lazy(() => import("./pages/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const NotFoundPage = lazy(() => import("./pages/NotFoundPage").then((m) => ({ default: m.NotFoundPage })));

function RouteLoadingFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <p className="text-sm font-medium text-ink-500 dark:text-ink-400">Cargando modulo...</p>
    </div>
  );
}

function RouteChunkErrorFallback() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 rounded-2xl border border-ink-200 bg-white/80 p-6 text-center dark:border-ink-700 dark:bg-[var(--surface)]/70">
      <p className="font-semibold text-ink-900 dark:text-ink-100">No se pudo cargar esta vista</p>
      <p className="text-sm text-ink-600 dark:text-ink-400">Intenta recargar la pagina para descargar el modulo de nuevo.</p>
      <button
        type="button"
        className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-700"
        onClick={() => window.location.reload()}
      >
        Recargar
      </button>
    </div>
  );
}

function withAsyncBoundary(node: ReactElement): ReactElement {
  return (
    <ErrorBoundary fallback={<RouteChunkErrorFallback />}>
      <Suspense fallback={<RouteLoadingFallback />}>{node}</Suspense>
    </ErrorBoundary>
  );
}

function App() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <PublicRoute>
            {withAsyncBoundary(<LoginPage />)}
          </PublicRoute>
        }
      />
      <Route
        path="/register"
        element={
          <PublicRoute>
            {withAsyncBoundary(<RegisterPage />)}
          </PublicRoute>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <PublicRoute>
            {withAsyncBoundary(<ForgotPasswordPage />)}
          </PublicRoute>
        }
      />
      <Route
        path="/reset-password"
        element={
          <PublicRoute>
            {withAsyncBoundary(<ResetPasswordPage />)}
          </PublicRoute>
        }
      />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell>
              <Navigate to="/dashboard" replace />
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <AppShell>
              {withAsyncBoundary(<DashboardPage />)}
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/today"
        element={
          <ProtectedRoute>
            <AppShell>
              {withAsyncBoundary(<TodayPage />)}
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/courses"
        element={
          <ProtectedRoute>
            <AppShell>
              {withAsyncBoundary(<CoursesPage />)}
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/history"
        element={
          <ProtectedRoute>
            <AppShell>
              {withAsyncBoundary(<SemesterHistoryPage />)}
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/schedule"
        element={
          <ProtectedRoute>
            <AppShell>
              {withAsyncBoundary(<SchedulePage />)}
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/assignments"
        element={
          <ProtectedRoute>
            <AppShell>
              {withAsyncBoundary(<AssignmentsPage />)}
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/exams"
        element={
          <ProtectedRoute>
            <AppShell>
              {withAsyncBoundary(<ExamsPage />)}
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/projects"
        element={
          <ProtectedRoute>
            <AppShell>
              {withAsyncBoundary(<ProjectsPage />)}
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/calendar"
        element={
          <ProtectedRoute>
            <AppShell>
              {withAsyncBoundary(<CalendarPage />)}
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/notifications"
        element={
          <ProtectedRoute>
            <AppShell>
              {withAsyncBoundary(<NotificationsPage />)}
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <AppShell>
              {withAsyncBoundary(<SettingsPage />)}
            </AppShell>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={withAsyncBoundary(<NotFoundPage />)} />
    </Routes>
  );
}

export default App;
