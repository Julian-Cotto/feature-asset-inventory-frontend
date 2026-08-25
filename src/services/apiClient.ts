import { ApiError } from "../lib/errors";
import { resolveFeatureAuthContext } from "../platform/authAdapter";
import {
  getFeatureMountContext,
  getShellRuntimeContext,
} from "../platform/shellContext";

const LOCAL_DEFAULT_API_BASE_URL =
  "http://localhost:8200/api/inventory/it";

function resolveApiBaseUrl(): string {
  const mountContext = getFeatureMountContext();
  const shellRuntime = getShellRuntimeContext();

  const runtimeApiBaseUrl = mountContext?.runtime?.backend?.baseUrl;
  if (runtimeApiBaseUrl && runtimeApiBaseUrl.trim().length > 0) {
    return runtimeApiBaseUrl;
  }

  const globalRuntimeApiBaseUrl = shellRuntime?.backend?.baseUrl;
  if (globalRuntimeApiBaseUrl && globalRuntimeApiBaseUrl.trim().length > 0) {
    return globalRuntimeApiBaseUrl;
  }

  const manifestApiBaseUrl = mountContext?.manifest?.backend?.baseUrl;
  if (manifestApiBaseUrl && manifestApiBaseUrl.trim().length > 0) {
    return manifestApiBaseUrl;
  }

  const envApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
  if (envApiBaseUrl && envApiBaseUrl.trim().length > 0) {
    return envApiBaseUrl;
  }

  return LOCAL_DEFAULT_API_BASE_URL;
}

function buildHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  const auth = resolveFeatureAuthContext();

  if (!auth.accessToken) {
    throw new Error("Authenticated API call requires access token.");
  }

  headers.set("Authorization", `Bearer ${auth.accessToken}`);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return headers;
}

function buildUrl(path: string): string {
  const baseUrl = resolveApiBaseUrl();
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizedBaseUrl}${normalizedPath}`;
}

async function parseResponse<T>(
  response: Response,
  ctx: { method: string; url: string },
): Promise<T> {
  if (!response.ok) {
    // Read the body once so the error carries the server's message/traceback.
    let bodyText = "";
    try {
      bodyText = await response.text();
    } catch {
      /* body already consumed / unreadable */
    }
    const serverMsg = extractServerMessage(bodyText);
    const base =
      response.status === 401
        ? "Request was rejected as unauthorized."
        : response.status === 403
          ? "Request was rejected as forbidden."
          : `Request failed: ${response.status} ${response.statusText}`;
    throw new ApiError(serverMsg ? `${base} — ${serverMsg}` : base, {
      status: response.status,
      statusText: response.statusText,
      method: ctx.method,
      url: ctx.url,
      body: bodyText || undefined,
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/** FastAPI returns `{"detail": ...}`; pull out a concise human message. */
function extractServerMessage(bodyText: string): string | null {
  if (!bodyText) return null;
  try {
    const parsed = JSON.parse(bodyText);
    const detail = parsed?.detail ?? parsed?.message ?? parsed?.error;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) {
      // FastAPI validation errors: [{loc, msg, type}, …]
      return detail
        .map((d) => (typeof d?.msg === "string" ? d.msg : JSON.stringify(d)))
        .join("; ");
    }
    if (detail != null) return JSON.stringify(detail);
  } catch {
    // Non-JSON body — return a trimmed snippet.
    return bodyText.length > 300 ? `${bodyText.slice(0, 300)}…` : bodyText;
  }
  return null;
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = buildUrl(path);
  const method = (init?.method ?? "GET").toUpperCase();
  const response = await fetch(url, {
    ...init,
    headers: buildHeaders(init?.headers),
  });

  return parseResponse<T>(response, { method, url });
}

/** Fetch with auth header but expect a binary body. Returns the raw Blob
 *  plus the filename hinted at via Content-Disposition (when present).
 *  Used for CSV / XLSX export endpoints. */
export async function apiFetchBlob(
  path: string,
  init?: RequestInit,
): Promise<{ blob: Blob; filename: string | null }> {
  const url = buildUrl(path);
  const method = (init?.method ?? "GET").toUpperCase();
  const response = await fetch(url, {
    ...init,
    headers: buildHeaders(init?.headers),
  });

  if (!response.ok) {
    let bodyText = "";
    try {
      bodyText = await response.text();
    } catch {
      /* unreadable */
    }
    const serverMsg = extractServerMessage(bodyText);
    throw new ApiError(
      serverMsg
        ? `Request failed: ${response.status} ${response.statusText} — ${serverMsg}`
        : `Request failed: ${response.status} ${response.statusText}`,
      {
        status: response.status,
        statusText: response.statusText,
        method,
        url,
        body: bodyText || undefined,
      },
    );
  }

  const blob = await response.blob();
  const disp = response.headers.get("Content-Disposition") ?? "";
  const m = /filename\s*=\s*"?([^";]+)"?/i.exec(disp);
  return { blob, filename: m ? m[1] : null };
}

export async function apiGet<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    method: "GET",
  });
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    method: "POST",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function apiPut<T>(
  path: string,
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    method: "PUT",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function apiPatch<T>(
  path: string,
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    method: "PATCH",
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export async function apiDelete<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  return apiFetch<T>(path, {
    ...init,
    method: "DELETE",
  });
}