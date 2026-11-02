"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Loader2, Star, X, type LucideIcon } from "lucide-react";

export const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

/* ---------- Buttons ---------- */
export function Button({ children, onClick, variant = "primary", size = "md", busy, disabled, type = "button", className, title }: {
  children: ReactNode; onClick?: () => void; variant?: "primary" | "outline" | "ghost" | "danger" | "rose";
  size?: "sm" | "md"; busy?: boolean; disabled?: boolean; type?: "button" | "submit"; className?: string; title?: string;
}) {
  const base = "inline-flex items-center justify-center gap-1.5 font-semibold rounded-lg transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap";
  const sizes = size === "sm" ? "text-xs px-2.5 py-1.5" : "text-sm px-4 py-2";
  const variants = {
    primary: "bg-amber text-[#221703] hover:brightness-110 shadow-sm shadow-amber/20",
    rose: "bg-rose text-white hover:brightness-110 shadow-sm shadow-rose/20",
    danger: "bg-err text-white hover:brightness-110",
    outline: "border border-line bg-transparent text-ink hover:border-amber/60 hover:text-amber",
    ghost: "text-mut hover:text-ink hover:bg-ink/5",
  }[variant];
  return (
    <button type={type} title={title} onClick={onClick} disabled={disabled || busy} className={cx(base, sizes, variants, className)}>
      {busy && <Loader2 size={size === "sm" ? 13 : 15} className="spin" />}
      {children}
    </button>
  );
}

export function Badge({ children, tone = "mut", className }: { children: ReactNode; tone?: "mut" | "amber" | "rose" | "ok" | "warn" | "err"; className?: string }) {
  const tones = {
    mut: "bg-mut/12 text-mut border-mut/20",
    amber: "bg-amber/12 text-amber border-amber/25",
    rose: "bg-rose/12 text-rose border-rose/25",
    ok: "bg-ok/12 text-ok border-ok/25",
    warn: "bg-warn/12 text-warn border-warn/25",
    err: "bg-err/12 text-err border-err/25",
  }[tone];
  return <span className={cx("inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold leading-none", tones, className)}>{children}</span>;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("rounded-xl border border-line bg-surface/90 shadow-sm", className)}>{children}</div>;
}

/* ---------- Form ---------- */
export function Field({ label, hint, children, required }: { label: string; hint?: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-mut">
        {label} {required && <span className="text-rose">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-mut/80">{hint}</span>}
    </label>
  );
}
export const inputCls = "w-full rounded-lg border border-line bg-raised px-3 py-2 text-sm text-ink placeholder:text-mut/50 transition-colors focus:border-amber/60 focus:outline-none focus:ring-2 focus:ring-amber/25";
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx("relative h-5.5 w-10 shrink-0 rounded-full border transition-colors duration-200", checked ? "border-amber/50 bg-amber" : "border-line bg-mut/20")}>
      <span className={cx("absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full bg-white shadow transition-all duration-200", checked ? "left-[calc(100%-18px)]" : "left-0.5")} />
    </button>
  );
}

export function Stars({ value, onChange, size = 15 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" role={onChange ? "radiogroup" : undefined} aria-label={`Rating: ${value} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        onChange ? (
          <button key={n} type="button" aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => onChange(n === value ? 0 : n)}
            className="transition-transform hover:scale-125">
            <Star size={size} className={n <= value ? "fill-amber text-amber" : "text-mut/40"} />
          </button>
        ) : (
          <Star key={n} size={size} className={n <= value ? "fill-amber text-amber" : "text-mut/25"} />
        )
      ))}
    </span>
  );
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div className={cx("rise relative max-h-[88vh] w-full overflow-y-auto rounded-xl border border-line bg-surface p-5 shadow-2xl", wide ? "max-w-2xl" : "max-w-lg")}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <h3 className="font-display text-lg font-bold">{title}</h3>
          <button onClick={onClose} aria-label="Close dialog" className="rounded-md p-1 text-mut transition-colors hover:bg-ink/5 hover:text-ink"><X size={17} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- Confirm ---------- */
type ConfirmOpts = { title: string; message: ReactNode; confirmLabel?: string; danger?: boolean };
const ConfirmCtx = createContext<(o: ConfirmOpts) => Promise<boolean>>(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

/* ---------- Toasts ---------- */
type Toast = { id: number; msg: string; kind: "ok" | "err" | "info" };
const ToastCtx = createContext<(msg: string, kind?: Toast["kind"]) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function Providers({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const push = useCallback((msg: string, kind: Toast["kind"] = "ok") => {
    const id = ++idRef.current;
    setToasts((t) => [...t.slice(-3), { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  const [confirmState, setConfirmState] = useState<{ opts: ConfirmOpts; resolve: (v: boolean) => void } | null>(null);
  const confirm = useCallback((opts: ConfirmOpts) => new Promise<boolean>((resolve) => setConfirmState({ opts, resolve })), []);
  const close = (v: boolean) => { confirmState?.resolve(v); setConfirmState(null); };
  return (
    <ToastCtx.Provider value={push}>
      <ConfirmCtx.Provider value={confirm}>
        {children}
        <div className="pointer-events-none fixed bottom-4 right-4 z-[70] flex w-80 flex-col gap-2">
          {toasts.map((t) => (
            <div key={t.id} className={cx("rise pointer-events-auto flex items-start gap-2.5 rounded-lg border p-3 text-sm shadow-xl backdrop-blur",
              t.kind === "ok" && "border-ok/30 bg-surface/95 text-ink",
              t.kind === "err" && "border-err/40 bg-surface/95 text-ink",
              t.kind === "info" && "border-line bg-surface/95 text-ink")}>
              {t.kind === "ok" ? <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-ok" /> : t.kind === "err" ? <AlertTriangle size={17} className="mt-0.5 shrink-0 text-err" /> : <Info size={17} className="mt-0.5 shrink-0 text-amber" />}
              <span className="leading-snug">{t.msg}</span>
            </div>
          ))}
        </div>
        <Modal open={!!confirmState} onClose={() => close(false)} title={confirmState?.opts.title ?? ""}>
          <div className="text-sm leading-relaxed text-mut">{confirmState?.opts.message}</div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => close(false)}>Cancel</Button>
            <Button variant={confirmState?.opts.danger ? "danger" : "primary"} onClick={() => close(true)}>
              {confirmState?.opts.confirmLabel ?? "Confirm"}
            </Button>
          </div>
        </Modal>
      </ConfirmCtx.Provider>
    </ToastCtx.Provider>
  );
}

/* ---------- Misc ---------- */
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-14 text-mut">
      <Loader2 size={19} className="spin text-amber" />
      <span className="text-sm">{label ?? "Loading…"}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, body, action }: { icon: LucideIcon; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="rise flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-surface/50 px-6 py-14 text-center">
      <div className="mb-3 rounded-2xl bg-amber/10 p-3.5"><Icon size={26} className="text-amber" /></div>
      <h3 className="font-display text-lg font-bold">{title}</h3>
      {body && <p className="mt-1.5 max-w-md text-sm leading-relaxed text-mut">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function SkeletonGrid({ n = 8 }: { n?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="shimmer aspect-video" />
          <div className="space-y-2 p-3"><div className="shimmer h-3.5 w-4/5 rounded" /><div className="shimmer h-3 w-2/5 rounded" /></div>
        </div>
      ))}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between gap-3 pt-4 text-sm text-mut">
      <span>{total.toLocaleString()} item{total === 1 ? "" : "s"} · page {page} of {pages}</span>
      <div className="flex gap-1.5">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={14} /> Prev</Button>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next <ChevronRight size={14} /></Button>
      </div>
    </div>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: string; actions?: ReactNode }) {
  return (
    <div className="rise mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-display text-3xl font-black tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-sm text-mut">{sub}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}