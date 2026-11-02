import { requireOwner, csrfOk } from "./auth";

export const ok = (data: unknown, init?: ResponseInit) => Response.json(data as object, init);
export const fail = (error: string, status = 400) => Response.json({ error }, { status });

export async function readBody<T = Record<string, unknown>>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { return {} as T; }
}

/** Combined guard for owner mutations: CSRF + optional auth. */
export async function guardMutation(req: Request): Promise<Response | null> {
  if (!csrfOk(req)) return fail("CSRF check failed. Refresh the page and try again.", 403);
  return requireOwner();
}

export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : "Unexpected error";
}

export function intOr(v: unknown, d: number | null = null): number | null {
  if (v === null || v === undefined || v === "") return d;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : d;
}
export function numOr(v: unknown, d: number | null = null): number | null {
  if (v === null || v === undefined || v === "") return d;
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
export function strOr(v: unknown, d: string | null = null): string | null {
  if (v === null || v === undefined) return d;
  const s = String(v).trim();
  return s === "" ? d : s;
}
export function dateOr(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(String(v));
  return isNaN(d.getTime()) ? null : d;
}