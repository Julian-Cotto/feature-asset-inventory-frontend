// Structured error plumbing so a failed request/action can surface a rich
// detail view (status, request, response body, per-item failures, stack) —
// not just a one-line toast.

/** A thrown HTTP failure that carries the request/response context the
 *  error-detail view renders. `apiClient` throws this on non-OK responses. */
export class ApiError extends Error {
  status?: number;
  statusText?: string;
  method?: string;
  url?: string;
  /** Raw response body text (JSON or plain). */
  body?: string;

  constructor(
    message: string,
    opts: {
      status?: number;
      statusText?: string;
      method?: string;
      url?: string;
      body?: string;
    } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.status = opts.status;
    this.statusText = opts.statusText;
    this.method = opts.method;
    this.url = opts.url;
    this.body = opts.body;
  }
}

export interface ErrorDetailItem {
  label: string;
  message: string;
  kind?: "error" | "warning" | "info";
}

/** Everything the error-detail modal can render. All optional — populate
 *  what you have. */
export interface ErrorDetails {
  /** Headline shown in the modal (falls back to the toast title). */
  title?: string;
  /** Primary human-readable message. */
  message?: string;
  method?: string;
  url?: string;
  status?: number;
  statusText?: string;
  /** Raw response body (pretty-printed as JSON when parseable). */
  body?: string;
  /** Arbitrary key/value context (source, controller, counts, …). */
  context?: Record<string, string | number | boolean | null | undefined>;
  /** Per-item failures (e.g. per-controller, per-badge). */
  items?: ErrorDetailItem[];
  /** JS stack / server traceback. */
  stack?: string;
  /** ISO timestamp of when it happened. */
  occurredAt?: string;
}

/** Normalise any thrown value into `ErrorDetails`, merging optional extras
 *  (context/items/title) supplied by the call site. */
export function toErrorDetails(
  err: unknown,
  extra?: Partial<ErrorDetails>,
): ErrorDetails {
  const base: ErrorDetails = {};

  if (err instanceof ApiError) {
    base.message = err.message;
    base.status = err.status;
    base.statusText = err.statusText;
    base.method = err.method;
    base.url = err.url;
    base.body = err.body;
    base.stack = err.stack;
  } else if (err instanceof Error) {
    base.message = err.message;
    base.stack = err.stack;
  } else if (err != null) {
    base.message = String(err);
  }

  return {
    ...base,
    ...extra,
    context: { ...base.context, ...extra?.context },
  };
}

/** Try to pretty-print a body as JSON; return it untouched otherwise. */
export function prettyBody(body: string | undefined): string | undefined {
  if (!body) return body;
  const trimmed = body.trim();
  if (!trimmed) return undefined;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return body;
  }
}

/** Flatten `ErrorDetails` to a copy-pasteable plain-text block. */
export function errorDetailsToText(d: ErrorDetails): string {
  const lines: string[] = [];
  if (d.title) lines.push(d.title);
  if (d.message) lines.push(d.message);
  if (d.method || d.url) lines.push(`Request: ${d.method ?? ""} ${d.url ?? ""}`.trim());
  if (d.status != null) lines.push(`Status: ${d.status} ${d.statusText ?? ""}`.trim());
  if (d.occurredAt) lines.push(`When: ${d.occurredAt}`);
  if (d.context && Object.keys(d.context).length) {
    lines.push("Context:");
    for (const [k, v] of Object.entries(d.context)) {
      if (v == null || v === "") continue;
      lines.push(`  ${k}: ${v}`);
    }
  }
  if (d.items?.length) {
    lines.push("Items:");
    for (const it of d.items) lines.push(`  [${it.kind ?? "error"}] ${it.label}: ${it.message}`);
  }
  const pretty = prettyBody(d.body);
  if (pretty) {
    lines.push("Response body:");
    lines.push(pretty);
  }
  if (d.stack) {
    lines.push("Stack:");
    lines.push(d.stack);
  }
  return lines.join("\n");
}
