import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

function AuthLoadingScreen({ isServerWakingUp }: { isServerWakingUp: boolean }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="rounded-lg bg-white px-4 py-3 text-ink-600 shadow dark:bg-ink-800 dark:text-ink-300">
        {isServerWakingUp ? "Iniciando servidor, por favor espera..." : "Cargando..."}
      </p>
    </div>
  );
}

export function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { isLoading, isAuthenticated, isServerWakingUp } = useAuth();

  if (isLoading) {
    return <AuthLoadingScreen isServerWakingUp={isServerWakingUp} />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export function PublicRoute({ children }: { children: JSX.Element }) {
  const { isLoading, isAuthenticated, isServerWakingUp } = useAuth();

  if (isLoading) {
    return <AuthLoadingScreen isServerWakingUp={isServerWakingUp} />;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
