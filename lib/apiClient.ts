// lib/apiClient.ts
export const AUTH_TOKEN_KEY = "zv_token";
export const ME_KEY = "zv_me";

export function getStoredToken(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

export function clearStoredAuth() {
  meCache = null;
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(ME_KEY);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function apiClient(
  path: string,
  opts: RequestInit = {}
): Promise<any> {
  const headers = new Headers(opts.headers as HeadersInit | undefined);
  // Skip the default JSON content-type for FormData bodies — the browser
  // must set its own multipart boundary, and overriding it breaks uploads.
  if (!headers.get("Content-Type") && !(opts.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const token = getStoredToken();
  if (token) headers.set("Authorization", "Bearer " + token);

  const res = await fetch(path, { ...opts, headers, cache: "no-store" });

  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    // non-JSON response — leave data empty
  }

  if (!res.ok) {
    // Expired, disabled or otherwise rejected session: drop it so the login page
    // shows the form instead of bouncing back into the app.
    if (res.status === 401 && token) clearStoredAuth();
    const msg =
      (data as { error?: string })?.error ||
      `HTTP ${res.status}: ${res.statusText}`;
    throw new Error(msg);
  }

  return data;
}

// /api/me is needed by the shell AND by every page on load. Share one request
// (and reuse the answer briefly across page navigations) instead of fetching twice.
const ME_TTL_MS = 30_000;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let meCache: { promise: Promise<any>; ts: number; token: string } | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getMe(): Promise<any> {
  const token = getStoredToken();
  const now = Date.now();
  if (meCache && meCache.token === token && now - meCache.ts < ME_TTL_MS) return meCache.promise;
  const promise = apiClient("/api/me");
  meCache = { promise, ts: now, token };
  promise.catch(() => { if (meCache?.promise === promise) meCache = null; });
  return promise;
}

export function invalidateMe() {
  meCache = null;
}
