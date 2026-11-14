import { useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { BarChart3, Bot, FileText, FlaskConical, GitCompareArrows, LayoutDashboard, Menu, ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { JuryTourButton } from "@/components/JuryTourModal";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, ready: true },
  { to: "/experiments", label: "Experiments", icon: FlaskConical, ready: true },
  { to: "/compare", label: "Compare", icon: GitCompareArrows, ready: true },
  { to: "/assistant", label: "AI Assistant", icon: Bot, ready: true },
  { to: "/safety", label: "Safety Insights", icon: ShieldAlert, ready: true },
  { to: "/reports", label: "Reports", icon: FileText, ready: true },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="relative h-8 w-8">
        <div className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_55%,#cfe9ff,#4cc9f0_45%,rgba(29,63,191,0)_72%)]" />
        <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-flame shadow-[0_0_12px_#ff7a1a]" />
      </div>
      <div className="leading-tight">
        <div className="text-[15px] font-semibold tracking-tight">Flame Intelligence</div>
        <div className="text-[10px] uppercase tracking-[0.16em] text-muted">Microgravity combustion</div>
      </div>
    </div>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ to, label, icon: Icon, ready }) =>
        ready ? (
          <NavLink key={to} to={to} end={to === "/"} onClick={onNavigate}
            className={({ isActive }) => cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              isActive ? "bg-flame/10 text-flame" : "text-fg/80 hover:bg-raised hover:text-fg")}>
            <Icon className="h-4 w-4" /> {label}
          </NavLink>
        ) : (
          <div key={to} title="In development — next phase"
            className="flex cursor-not-allowed items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted/50">
            <Icon className="h-4 w-4" /> {label}
            <span className="ml-auto rounded border border-line px-1 text-[9px] uppercase tracking-wider">soon</span>
          </div>
        ),
      )}
    </nav>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  return (
    <div className="flex min-h-full">
      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line/70 bg-surface/60 px-4 py-5 lg:flex">
        <Logo />
        <JuryTourButton className="mt-5 w-full justify-center" />
        <div className="mt-6 label px-3">Navigate</div>
        <div className="mt-2"><NavItems /></div>
        <div className="mt-auto space-y-2 rounded-lg border border-line/70 bg-raised/50 p-3 text-[11px] leading-relaxed text-muted">
          <div className="flex items-center gap-1.5 font-medium text-fg/80"><BarChart3 className="h-3.5 w-3.5 text-plasma" /> Data source</div>
          NASA Physical Sciences Informatics (PSI), CC0-1.0. Independent project — not endorsed by NASA.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-line/70 bg-bg/85 px-4 py-3 backdrop-blur lg:hidden">
          <Logo />
          <div className="flex items-center gap-2">
          <JuryTourButton className="hidden sm:inline-flex" />
          <button className="btn h-9 w-9 justify-center p-0" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu className="h-4 w-4" />
          </button>
          </div>
        </header>
        {open && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
            <div className="absolute left-0 top-0 h-full w-72 border-r border-line bg-surface p-5">
              <div className="mb-6 flex items-center justify-between">
                <Logo />
                <button className="btn h-8 w-8 justify-center p-0" aria-label="Close menu" onClick={() => setOpen(false)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <JuryTourButton className="mb-4 w-full justify-center" />
              <NavItems onNavigate={() => setOpen(false)} />
            </div>
          </div>
        )}
        <main key={loc.pathname} className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
