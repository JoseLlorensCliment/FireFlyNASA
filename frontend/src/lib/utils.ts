import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtNum(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (Math.abs(v) >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 0 });
  return Number(v.toFixed(digits)).toString();
}

export function fmtBytes(b: number | null | undefined): string {
  if (!b) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = b;
  while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${u[i]}`;
}

export function year(d: string | null | undefined): string {
  return d ? d.slice(0, 4) : "—";
}

export const PHASE_LABEL: Record<string, string> = {
  solid: "Solid fuels", liquid: "Liquid droplets", gas: "Gaseous flames", aerosol: "Aerosol / dust",
};

export const ROLE_META: Record<string, { label: string; color: string; desc: string }> = {
  prevention: { label: "Prevention", color: "text-flame border-flame/40 bg-flame/10", desc: "Material flammability, ignition and flame spread" },
  detection: { label: "Detection", color: "text-plasma border-plasma/40 bg-plasma/10", desc: "Smoke and aerosol measurement" },
  suppression: { label: "Suppression", color: "text-ok border-ok/40 bg-ok/10", desc: "Extinguishment and inert-gas dilution" },
  fundamental: { label: "Fundamental", color: "text-fg/80 border-line bg-raised", desc: "Combustion science and model validation" },
  modeling: { label: "Modeling", color: "text-warn border-warn/40 bg-warn/10", desc: "Ground-based re-analysis of flight data" },
};

export const QUALITY_META: Record<string, { label: string; tone: string }> = {
  measured: { label: "measured", tone: "text-ok" },
  approx: { label: "approx.", tone: "text-warn" },
  range: { label: "range", tone: "text-plasma" },
  set: { label: "set-points", tone: "text-plasma" },
  derived: { label: "derived", tone: "text-plasma" },
  suspect: { label: "suspect", tone: "text-ember" },
  not_reported: { label: "not reported", tone: "text-muted" },
};
