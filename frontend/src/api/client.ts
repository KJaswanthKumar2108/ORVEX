/**
 * ORVEX Centralized Typed API Client
 * Provides robust error handling, configurable timeout, and base URL resolution.
 */

export class ApiClientError extends Error {
  public readonly status: number;
  public readonly detail: string;

  constructor(status: number, detail: string) {
    super(`API Error ${status}: ${detail}`);
    this.name = "ApiClientError";
    this.status = status;
    this.detail = detail;
  }
}

const resolvedEnvUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ||
  (import.meta.env.BACKEND_URL as string | undefined);

export const API_BASE_URL =
  resolvedEnvUrl?.replace(/\/+$/, "") ??
  (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");

const DEFAULT_TIMEOUT_MS = 10000;

export async function apiRequest<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined | null>,
  options?: RequestInit
): Promise<T> {
  let url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) {
        searchParams.append(key, String(value));
      }
    }
    const queryString = searchParams.toString();
    if (queryString) {
      url += (url.includes("?") ? "&" : "?") + queryString;
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    if (!response.ok) {
      let detail = `Request failed with status ${response.status}`;
      try {
        const errorBody = await response.json();
        if (errorBody && typeof errorBody.detail === "string") {
          detail = errorBody.detail;
        } else if (errorBody && typeof errorBody.message === "string") {
          detail = errorBody.message;
        }
      } catch {
        // Fall back to HTTP status message if non-JSON
      }
      throw new ApiClientError(response.status, detail);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiClientError(408, "Request timed out while contacting ORVEX API service.");
    }
    const message = error instanceof Error ? error.message : "Network error contacting API";
    throw new ApiClientError(0, message);
  } finally {
    clearTimeout(timeoutId);
  }
}
