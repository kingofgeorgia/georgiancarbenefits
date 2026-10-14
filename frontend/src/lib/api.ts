import axios from "axios";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export const api = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
});

export function apiErrorMessage(
  error: unknown,
  fallback: string,
  messages: { rateLimited: string; payloadTooLarge: string; temporarilyUnavailable: string },
): string {
  if (!axios.isAxiosError(error)) return fallback;
  if (error.response?.status === 429) return messages.rateLimited;
  if (error.response?.status === 413) return messages.payloadTooLarge;
  if (error.response?.status === 503) return messages.temporarilyUnavailable;
  return fallback;
}

// Attach Bearer token from localStorage
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("access_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Auto-logout on 401
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("access_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);
