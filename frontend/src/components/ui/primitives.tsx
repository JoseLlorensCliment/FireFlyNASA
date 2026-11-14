import type { ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn, ROLE_META } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("card", className)}>{children}</div>;
}

export function CardHeader({ title, subtitle, right }: { title: ReactNode; subtitle?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line/70 px-5 py-4">
      <div className="min-w-0">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-fg">{title}</h3>
        {subtitle && <p className="mt-1 max-w-prose text-xs leading-relaxed text-muted">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-md border border-line bg-raised/60 px-1.5 py-0.5 text-[11px] font-medium leading-4 text-fg-2", className)}>
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
    <Card className="relative overflow-hidden px-5 py-4">
      {accent && <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-flame/70 to-transparent" />}
      <div className="label">{label}</div>
      <div className={cn("figure mt-2 text-[32px] leading-none", accent && "text-flame")}>{value}</div>
      {hint && <div className="mt-2 text-xs leading-snug text-muted">{hint}</div>}
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
    <header className="mb-7">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1 className="display mt-2 text-[26px] md:text-[32px]">{title}</h1>
      {children && <div className="mt-3 max-w-3xl text-[14px] leading-relaxed text-fg-2">{children}</div>}
    </header>
  );
}
