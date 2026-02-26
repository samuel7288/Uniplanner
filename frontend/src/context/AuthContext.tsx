import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import axios from "axios";
import { api, clearAuthTokens, getErrorMessage, isNetworkError, setAuthTokens } from "../lib/api";
import type { User } from "../lib/types";

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: {
    name: string;
    email: string;
    password: string;
    career?: string;
    university?: string;
    timezone?: string;
  }) => Promise<void>;
  logout: () => Promise<void>;
  forgotPassword: (email: string) => Promise<string>;
  resetPassword: (token: string, newPassword: string) => Promise<string>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const DEBUG_AUTH = import.meta.env.DEV;

  async function refreshProfile(): Promise<void> {
    const response = await api.get<User>("/auth/me");
    setUser(response.data);
  }

  async function bootstrap(): Promise<void> {
    if (DEBUG_AUTH) {
      console.debug("[auth][bootstrap] start", {
        hasAccessToken: Boolean(localStorage.getItem("uniplanner_access_token")),
      });
    }

    try {
      await refreshProfile();
      if (DEBUG_AUTH) {
        console.debug("[auth][bootstrap] refreshProfile success");
      }
    } catch (error) {
      // Only clear stored tokens on definitive auth failure.
      //
      // • Network error (no response) — could be transient (offline, slow start).
      //   Keep the access token so the next page load can restore the session
      //   without forcing the user to log in again.
      //
      // • 401 — the interceptor in api.ts already attempted a token refresh and
      //   cleared tokens when that also failed. We just ensure user state is null.
      //
      // • 5xx / unexpected — server-side problem, not an auth failure. Keep tokens.
      if (DEBUG_AUTH) {
        const status = axios.isAxiosError(error) ? (error.response?.status ?? "NO_RESPONSE") : "NON_AXIOS_ERROR";
        console.debug("[auth][bootstrap] refreshProfile failed", {
          status,
          isNetworkError: isNetworkError(error),
          willClearTokens: !isNetworkError(error),
        });
      }

      if (!isNetworkError(error)) {
        // Tokens may already have been cleared by the response interceptor (on 401).
        // Calling clearAuthTokens() here is safe (idempotent).
        clearAuthTokens();
      }
      setUser(null);
    } finally {
      if (DEBUG_AUTH) {
        console.debug("[auth][bootstrap] end", {
          hasAccessToken: Boolean(localStorage.getItem("uniplanner_access_token")),
        });
      }
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void bootstrap();
  }, []);

  async function login(email: string, password: string): Promise<void> {
    // Backend response no longer includes refreshToken — it is set as an HttpOnly cookie.
    const response = await api.post<{ user: User; accessToken: string }>("/auth/login", { email, password });
    setAuthTokens(response.data.accessToken);
    setUser(response.data.user);
    toast.success(`Bienvenido, ${response.data.user.name}`);
  }

  async function register(payload: {
    name: string;
    email: string;
    password: string;
    career?: string;
    university?: string;
    timezone?: string;
  }): Promise<void> {
    const response = await api.post<{ user: User; accessToken: string }>("/auth/register", payload);
    setAuthTokens(response.data.accessToken);
    setUser(response.data.user);
    toast.success("Cuenta creada exitosamente");
  }

  async function logout(): Promise<void> {
    try {
      // Backend revokes the refresh token cookie
      await api.post("/auth/logout", {});
    } catch {
      // ignore logout errors and clear local auth regardless
    }
    clearAuthTokens();
    setUser(null);
  }

  async function forgotPassword(email: string): Promise<string> {
    try {
      const response = await api.post<{ message: string }>("/auth/forgot-password", { email });
      return response.data.message;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  async function resetPassword(token: string, newPassword: string): Promise<string> {
    try {
      const response = await api.post<{ message: string }>("/auth/reset-password", { token, newPassword });
      return response.data.message;
    } catch (error) {
      throw new Error(getErrorMessage(error));
    }
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      isAuthenticated: Boolean(user),
      login,
      register,
      logout,
      forgotPassword,
      resetPassword,
      refreshProfile,
    }),
    [user, isLoading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
