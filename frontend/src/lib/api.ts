import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

// In dev the Vite proxy forwards /api → backend (same origin, cookies work).
// In production set VITE_API_BASE_URL to the full backend URL if not using a reverse proxy.
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "/api";
const ACCESS_TOKEN_KEY = "uniplanner_access_token";

type QueuedRequest = {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
};

let isRefreshing = false;
let queue: QueuedRequest[] = [];

const DEBUG_AUTH = import.meta.env.DEV;

function getTokenStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

function getAccessToken(): string | null {
  return getTokenStorage()?.getItem(ACCESS_TOKEN_KEY) ?? null;
}

export function hasAccessToken(): boolean {
  return Boolean(getAccessToken());
}

function processQueue(error: unknown, token: string | null): void {
  queue.forEach((item) => {
    if (error) { item.reject(error); return; }
    if (token) { item.resolve(token); }
  });
  queue = [];
}

/** Store only the short-lived access token in sessionStorage.
 *  The long-lived refresh token lives in an HttpOnly cookie set by the backend. */
export function setAuthTokens(accessToken: string): void {
  getTokenStorage()?.setItem(ACCESS_TOKEN_KEY, accessToken);
}

export function clearAuthTokens(): void {
  getTokenStorage()?.removeItem(ACCESS_TOKEN_KEY);
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true, // send the HttpOnly refreshToken cookie automatically
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalConfig = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (DEBUG_AUTH) {
      const hasAccessToken = Boolean(getAccessToken());
      const status = error.response?.status ?? "NO_RESPONSE";
      const url = originalConfig?.url ?? "UNKNOWN_URL";
      console.debug("[auth][response-error]", {
        status,
        url,
        hasAccessToken,
        isRefreshing,
        retried: Boolean(originalConfig?._retry),
      });
    }

    if (!originalConfig || error.response?.status !== 401 || originalConfig._retry) {
      return Promise.reject(error);
    }

    // Don't retry the refresh endpoint itself to avoid infinite loops
    if (originalConfig.url?.includes("/auth/refresh")) {
      if (DEBUG_AUTH) {
        console.debug("[auth][refresh] refresh endpoint failed; clearing access token");
      }
      clearAuthTokens();
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        queue.push({
          resolve: (newToken) => {
            originalConfig.headers.Authorization = `Bearer ${newToken}`;
            resolve(api(originalConfig));
          },
          reject,
        });
      });
    }

    originalConfig._retry = true;
    isRefreshing = true;

    try {
      // The refresh token is sent automatically via the HttpOnly cookie (withCredentials: true).
      // No body needed — the backend reads req.cookies.refreshToken.
      const response = await axios.post<{ accessToken: string }>(
        `${API_BASE_URL}/auth/refresh`,
        {},
        { withCredentials: true },
      );
      const newAccessToken = response.data.accessToken;
      if (DEBUG_AUTH) {
        console.debug("[auth][refresh] success", {
          hasAccessTokenBeforeStore: Boolean(getAccessToken()),
        });
      }
      setAuthTokens(newAccessToken);
      processQueue(null, newAccessToken);
      originalConfig.headers.Authorization = `Bearer ${newAccessToken}`;
      return api(originalConfig);
    } catch (refreshError) {
      if (DEBUG_AUTH) {
        const refreshAxiosError = refreshError as AxiosError;
        console.debug("[auth][refresh] failed", {
          status: refreshAxiosError.response?.status ?? "NO_RESPONSE",
          hasAccessToken: Boolean(getAccessToken()),
        });
      }
      clearAuthTokens();
      processQueue(refreshError, null);
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export type ApiError = {
  message: string;
  details?: Array<{ path: string; message: string }>;
};

/**
 * Returns true when the error is a pure network failure (no HTTP response received).
 * Use this to distinguish transient connectivity issues from definitive auth/server errors
 * so we don't prematurely clear tokens during bootstrap when the network is momentarily down.
 */
export function isNetworkError(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response;
}

export function getErrorMessage(error: unknown): string {
  const fallback = "Unexpected error";
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as ApiError | undefined;
    if (data?.message) return data.message;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
