import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn, ROLE_META } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("card", className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, right }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line/70 px-5 py-4">
      <div>
        <h3 className="text-sm font-semibold text-fg">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border border-line bg-raised px-1.5 py-0.5 text-[11px] font-medium text-muted", className)}>
      {children}
    </span>
  );
}

export function RoleBadge({ role }: { role: string }) {
  const m = ROLE_META[role];
  return <Badge className={m?.color} >{m?.label ?? role}</Badge>;
}

export function Stat({ label, value, hint, accent }: { label: string; value: ReactNode; hint?: ReactNode; accent?: boolean }) {
  return (
    <Card className="px-5 py-4">
      <div className="label">{label}</div>
      <div className={cn("num mt-2 text-3xl font-semibold", accent ? "text-flame" : "text-fg")}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

export function Loading({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-sm text-muted">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}…
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  return (
    <div className="card flex items-start gap-3 border-ember/40 p-5 text-sm">
      <AlertTriangle className="mt-0.5 h-4 w-4 text-ember" />
      <div>
        <div className="font-medium text-fg">Could not load data</div>
        <div className="mt-1 text-muted">{String((error as Error)?.message ?? error)}</div>
        <div className="mt-1 text-muted">Is the API running? <code className="num">uvicorn app.main:app --port 8000</code></div>
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-6">
      {eyebrow && <div className="label text-flame/90">{eyebrow}</div>}
      <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-[28px]">{title}</h1>
      {children && <div className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">{children}</div>}
    </header>
  );
}
