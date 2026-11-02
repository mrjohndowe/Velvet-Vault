"use client";

export type ApiError = Error & { status?: number };

export async function api<T = Record<string, unknown>>(
  path: string,
  opts: { method?: string; body?: unknown; form?: FormData } = {},
): Promise<T> {
  const headers: Record<string, string> = { "x-vault": "1" };
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const basePath = "/vault";
  const url =
    path.startsWith(`${basePath}/`) || path === basePath
      ? path
      : `${basePath}${path.startsWith("/") ? path : `/${path}`}`;

  const res = await fetch(url, {
    method: opts.method ?? (opts.body || opts.form ? "POST" : "GET"),
    headers,
    body,
    cache: "no-store",
  });
  let data: Record<string, unknown> = {};
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  if (!res.ok) {
    const err = new Error(
      String(data.error ?? `Request failed (${res.status})`),
    ) as ApiError;
    err.status = res.status;
    (err as ApiError & { retryAfterSec?: number }).retryAfterSec =
      data.retryAfterSec as number | undefined;
    throw err;
  }
  return data as T;
}

export function download(path: string) {
  const a = document.createElement("a");
  a.href = path;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function setTheme(t: "light" | "dark") {
  document.documentElement.classList.toggle("dark", t === "dark");
  try {
    localStorage.setItem("vv-theme", t);
  } catch {
    /* ignore */
  }
}
export function getTheme(): "light" | "dark" {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

import { useEffect, useState } from "react";
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}
