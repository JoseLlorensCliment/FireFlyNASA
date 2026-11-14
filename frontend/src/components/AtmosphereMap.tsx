import { useQuery } from "@tanstack/react-query";
import { Plot, PALETTE } from "@/components/Plot";
import { api } from "@/services/api";

export interface MapPoint {
  group: string;
  o2: number;
  o2_min?: number | null;
  o2_max?: number | null;
  pressure: number;
  inverse?: boolean;
  label?: string;
}

/**
 * Oxygen concentration vs pressure, with the exploration atmospheres stated in the challenge
 * (Earth/ISS-like, expected Moon Base & rovers, spacecraft suit) drawn as reference regions.
 */
export function AtmosphereMap({ points, height = 420, colorFor }: {
  points: MapPoint[]; height?: number; colorFor?: (group: string, i: number) => string;
}) {
  const { data: scenarios } = useQuery({ queryKey: ["scenarios"], queryFn: api.scenarios });
  const groups = Array.from(new Set(points.map((p) => p.group)));

  const traces: Plotly.Data[] = [];
  groups.forEach((g, gi) => {
    const color = colorFor?.(g, gi) ?? PALETTE[gi % PALETTE.length];
    for (const inverse of [false, true]) {
      const s = points.filter((p) => p.group === g && !!p.inverse === inverse);
      if (!s.length) continue;
      const ranged = s.some((p) => p.o2_min !== undefined && p.o2_min !== null && p.o2_min !== p.o2_max);
      traces.push({
        type: "scatter", mode: "markers", name: inverse ? `${g} (inverse: burner O₂)` : g,
        x: s.map((p) => p.o2), y: s.map((p) => p.pressure),
        error_x: ranged ? {
          type: "data", symmetric: false, thickness: 1, width: 0, color,
          array: s.map((p) => (p.o2_max ?? p.o2) - p.o2), arrayminus: s.map((p) => p.o2 - (p.o2_min ?? p.o2)),
        } : undefined,
        marker: { color, size: 7, opacity: 0.75, symbol: inverse ? "diamond-open" : "circle", line: { width: inverse ? 1.5 : 0, color } },
        text: s.map((p) => p.label ?? ""),
        hovertemplate: "<b>" + g + "</b><br>O₂ %{x:.1f}% · %{y:.0f} kPa<br>%{text}<extra></extra>",
      } as Plotly.Data);
    }
  });

  const shapes: Partial<Plotly.Shape>[] = [];
  const annotations: Partial<Plotly.Annotation>[] = [];
  for (const sc of scenarios ?? []) {
    if (sc.id === "moon_base") {
      shapes.push({ type: "rect", xref: "x", yref: "y", x0: sc.o2_pct_min, x1: 100, y0: 0, y1: sc.pressure_kpa_max,
        fillcolor: "rgba(76,201,240,0.08)", line: { color: "rgba(76,201,240,0.6)", dash: "dot", width: 1 }, layer: "below" });
      annotations.push({ x: 99, y: 3, xanchor: "right", yanchor: "bottom",
        text: "Moon Base & rovers (expected)<br>≥30% O₂, ≤10.2 psi", showarrow: false, font: { size: 10, color: "#4cc9f0" }, align: "right" });
    } else if (sc.o2_pct !== undefined && sc.pressure_kpa !== undefined) {
      traces.push({
        type: "scatter", mode: "markers+text", name: sc.label, x: [sc.o2_pct], y: [sc.pressure_kpa],
        marker: { symbol: "star", size: 14, color: "#ffffff", line: { color: "#0b0e14", width: 1 } },
        text: [sc.id === "earth" ? "Earth / ISS air" : "Spacesuit"], textposition: sc.id === "earth" ? "top right" : "top left",
        textfont: { size: 10, color: "#e5eaf2" }, hovertemplate: sc.label + "<br>" + sc.basis + "<extra></extra>", showlegend: false,
      } as Plotly.Data);
    }
  }

  return (
    <Plot height={height} data={traces}
      layout={{
        shapes, annotations,
        xaxis: { title: { text: "Oxygen concentration (%)" }, range: [0, 102] },
        yaxis: { title: { text: "Pressure (kPa)" }, rangemode: "tozero" },
        legend: { orientation: "h", y: -0.18, x: 0 },
        margin: { l: 56, r: 16, t: 12, b: 80 },
      }} />
  );
}
