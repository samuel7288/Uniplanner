import { createContext, PropsWithChildren, useContext, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import axios from "axios";
import { api, clearAuthTokens, getErrorMessage, hasAccessToken, isNetworkError, setAuthTokens } from "../lib/api";
import { AuthResponseSchema, UserSchema } from "../lib/schemas";
import type { User } from "../lib/types";

type AuthContextValue = {
  user: User | null;
  isLoading: boolean;
  isServerWakingUp: boolean;
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
const RETRY_DELAYS_MS = [2000, 4000, 8000] as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function getHttpStatus(error: unknown): number | undefined {
  return axios.isAxiosError(error) ? error.response?.status : undefined;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isServerWakingUp, setIsServerWakingUp] = useState(false);
  const DEBUG_AUTH = import.meta.env.DEV;

  async function refreshProfile(): Promise<void> {
    const response = await api.get("/auth/me");
    setUser(UserSchema.parse(response.data));
  }

  async function bootstrap(): Promise<void> {
    if (DEBUG_AUTH) {
      console.debug("[auth][bootstrap] start", {
        hasAccessToken: hasAccessToken(),
      });
    }

    try {
      for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt += 1) {
        try {
          await refreshProfile();
          setIsServerWakingUp(false);

          if (DEBUG_AUTH) {
            console.debug("[auth][bootstrap] refreshProfile success", { attempt });
          }
          return;
        } catch (error) {
          const status = getHttpStatus(error);
          const isAuthFailure = status === 401;
          const isServerUnavailable = status === 502 || status === 503 || status === 504;
          const canRetry = attempt < RETRY_DELAYS_MS.length;
          const shouldRetry = canRetry && (isServerUnavailable || isNetworkError(error));

          if (DEBUG_AUTH) {
            console.debug("[auth][bootstrap] refreshProfile failed", {
              attempt,
              status: status ?? "NO_RESPONSE",
              isNetworkError: isNetworkError(error),
              isServerUnavailable,
              isAuthFailure,
              shouldRetry,
            });
          }

          if (shouldRetry) {
            setIsServerWakingUp(true);
            await sleep(RETRY_DELAYS_MS[attempt]);
            continue;
          }

          setIsServerWakingUp(false);

          // Only clear tokens on a definitive auth failure.
          if (isAuthFailure) {
            clearAuthTokens();
          }

          setUser(null);
          return;
        }
      }
    } finally {
      setIsServerWakingUp(false);
      if (DEBUG_AUTH) {
        console.debug("[auth][bootstrap] end", {
          hasAccessToken: hasAccessToken(),
        });
      }
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void bootstrap();
  }, []);

  async function login(email: string, password: string): Promise<void> {
    // Backend response no longer includes refreshToken; it is set as an HttpOnly cookie.
    const response = await api.post("/auth/login", { email, password });
    const data = AuthResponseSchema.parse(response.data);
    setAuthTokens(data.accessToken);
    setUser(data.user);
    toast.success(`Bienvenido, ${data.user.name}`);
  }

  async function register(payload: {
    name: string;
    email: string;
    password: string;
    career?: string;
    university?: string;
    timezone?: string;
  }): Promise<void> {
    const response = await api.post("/auth/register", payload);
    const data = AuthResponseSchema.parse(response.data);
    setAuthTokens(data.accessToken);
    setUser(data.user);
    toast.success("Cuenta creada exitosamente");
  }

  async function logout(): Promise<void> {
    try {
      // Backend revokes the refresh token cookie.
      await api.post("/auth/logout", {});
    } catch {
      // Ignore logout errors and clear local auth regardless.
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
      isServerWakingUp,
      isAuthenticated: Boolean(user),
      login,
      register,
      logout,
      forgotPassword,
      resetPassword,
      refreshProfile,
    }),
    [user, isLoading, isServerWakingUp],
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
