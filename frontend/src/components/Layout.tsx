import { useEffect, useState, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Bot, FileText, FlaskConical, GitCompareArrows, LayoutDashboard, Menu, ShieldAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { JuryTourButton } from "@/components/JuryTourModal";

const NAV_GROUPS = [
  {
    label: "Explore",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard },
      { to: "/experiments", label: "Experiments", icon: FlaskConical },
      { to: "/compare", label: "Compare", icon: GitCompareArrows },
    ],
  },
  {
    label: "Analyze",
    items: [
      { to: "/assistant", label: "AI Assistant", icon: Bot },
      { to: "/safety", label: "Safety Insights", icon: ShieldAlert },
      { to: "/reports", label: "Reports", icon: FileText },
    ],
  },
];

function Logo() {
  return (
    <NavLink to="/" className="group flex items-center gap-2.5 rounded-lg outline-offset-4" aria-label="Flame Intelligence — home">
      <span className="relative grid h-8 w-8 place-items-center" aria-hidden>
        <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_55%,#cfe9ff,#4cc9f0_42%,rgba(29,63,191,0)_72%)] opacity-90" />
        <span className="relative h-2 w-2 rounded-full bg-flame shadow-[0_0_10px_#ff7a1a]" />
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold tracking-[-0.01em] text-fg">Flame Intelligence</span>
        <span className="block text-[10px] font-medium uppercase tracking-[0.14em] text-muted">Microgravity combustion</span>
      </span>
    </NavLink>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Main" className="space-y-5">
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <div className="label px-3">{group.label}</div>
          <ul className="mt-1.5 space-y-0.5">
            {group.items.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink to={to} end={to === "/"} onClick={onNavigate}
                  className={({ isActive }) => cn(
                    "relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm transition-colors duration-200",
                    isActive
                      ? "bg-raised text-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.04)]"
                      : "text-fg-2 hover:bg-raised/60 hover:text-fg",
                  )}>
                  {({ isActive }) => (
                    <>
                      <span aria-hidden className={cn("absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-flame transition-opacity duration-200",
                        isActive ? "opacity-100" : "opacity-0")} />
                      <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-flame" : "text-muted")} strokeWidth={1.8} />
                      {label}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SourceNote() {
  return (
    <p className="text-[11px] leading-relaxed text-muted">
      Data: NASA Physical Sciences Informatics (PSI), CC0-1.0. Independent project, not endorsed by NASA.
    </p>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const loc = useLocation();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  return (
    <div className="flex min-h-full">
      <a href="#main" className="sr-only z-50 rounded-lg bg-flame px-3 py-2 text-sm font-medium text-[#1a0d03] focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>

      <aside className="no-print sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line/70 bg-surface/50 px-3 py-5 lg:flex">
        <div className="px-2"><Logo /></div>
        <JuryTourButton className="mx-1 mt-5 justify-center" />
        <div className="mt-7 flex-1 overflow-y-auto"><NavItems /></div>
        <div className="mx-2 mt-4 border-t border-line/70 pt-4"><SourceNote /></div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-14 items-center justify-between border-b border-line/70 bg-bg/90 px-4 backdrop-blur lg:hidden">
          <Logo />
          <div className="flex items-center gap-2">
            <JuryTourButton className="hidden sm:inline-flex" />
            <button className="btn h-10 w-10 p-0" aria-label="Open menu" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen(true)}>
              <Menu className="h-4 w-4" />
            </button>
          </div>
        </header>

        {open && (
          <div className="fixed inset-0 z-40 lg:hidden" id="mobile-nav" role="dialog" aria-modal="true" aria-label="Menu">
            <div className="absolute inset-0 bg-black/60 [animation:enter-fade_200ms_ease_both]" onClick={() => setOpen(false)} />
            <div className="drawer absolute left-0 top-0 flex h-full w-[min(20rem,86vw)] flex-col border-r border-line bg-surface p-4">
              <div className="mb-6 flex items-center justify-between pl-1">
                <Logo />
                <button className="btn h-10 w-10 p-0" aria-label="Close menu" onClick={() => setOpen(false)}>
                  <X className="h-4 w-4" />
                </button>
              </div>
              <JuryTourButton className="mb-6 justify-center" />
              <div className="flex-1 overflow-y-auto"><NavItems onNavigate={() => setOpen(false)} /></div>
              <div className="mt-4 border-t border-line/70 pt-4"><SourceNote /></div>
            </div>
          </div>
        )}

        <main id="main" key={loc.pathname} className="mx-auto w-full max-w-[1360px] flex-1 px-4 pb-10 pt-6 sm:px-6 md:px-8 md:pt-9">
          {children}
        </main>
      </div>
    </div>
  );
}
