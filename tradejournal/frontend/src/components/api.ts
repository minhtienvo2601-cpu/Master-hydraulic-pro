// Lớp gọi API duy nhất của frontend. Quyền truy cập do backend quyết định; frontend chỉ hiển thị.

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type Opts = {
  method?: string;
  body?: unknown;
  form?: FormData;
  headers?: Record<string, string>;
};

function detailToMessage(detail: unknown): string {
  if (!detail) return "Có lỗi xảy ra";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d: { loc?: (string | number)[]; msg?: string }) => {
        const field = (d.loc || []).filter((x) => x !== "body").join(".");
        const msg = (d.msg || "").replace(/^Value error, /, "");
        return field && !msg.includes(";") ? `${field}: ${msg}` : msg;
      })
      .join("\n");
  }
  if (typeof detail === "object" && detail && "message" in detail) {
    const d = detail as { message: string; errors?: { line: number; error: string }[] };
    const lines = (d.errors || []).slice(0, 10).map((e) => `Dòng ${e.line}: ${e.error}`);
    return [d.message, ...lines].join("\n");
  }
  return JSON.stringify(detail);
}

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { "X-Requested-With": "tradejournal", ...(opts.headers || {}) };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, { method: opts.method || "GET", headers, body, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "Không kết nối được máy chủ. Kiểm tra mạng và thử lại — dữ liệu chưa được lưu.");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const detail = (data && typeof data === "object" && "detail" in data ? (data as { detail: unknown }).detail : data) as unknown;
    if (res.status === 401 && typeof window !== "undefined" && !location.pathname.startsWith("/login") && !location.pathname.startsWith("/register")) {
      location.href = `/login?next=${encodeURIComponent(location.pathname + location.search)}`;
    }
    throw new ApiError(res.status, detailToMessage(detail));
  }
  return data as T;
}

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
}

export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
