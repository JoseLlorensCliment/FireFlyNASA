import { useQuery } from "@tanstack/react-query";
import { INK, Plot, SERIES, SURFACE, SYMBOLS } from "@/components/Plot";
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

const OTHER = "#6b7488";

/**
 * Oxygen concentration vs pressure, with the exploration atmospheres stated in the challenge
 * (Earth/ISS-like, expected Moon Base & rovers, spacecraft suit) drawn as neutral reference marks.
 *
 * Encoding (dataviz): each investigation keeps a fixed categorical slot (colour) AND a marker shape, because a
 * scatter only clears the colour-blind gates for 3 hues; inverse-flame rows use the hollow version of the same
 * shape. More than 6 groups fold into "Other". Reference regions never use a series hue.
 */
export function AtmosphereMap({ points, height = 420, colorFor, groupOrder }: {
  points: MapPoint[]; height?: number; colorFor?: (group: string, i: number) => string;
  /** Fixed slot order (e.g. the investigations as selected), so colour and shape follow the entity. */
  groupOrder?: string[];
}) {
  const { data: scenarios } = useQuery({ queryKey: ["scenarios"], queryFn: api.scenarios });
  const present = Array.from(new Set(points.map((p) => p.group)));
  const allGroups = groupOrder ? [...groupOrder.filter((g) => present.includes(g)), ...present.filter((g) => !groupOrder.includes(g))] : present;
  const kept = allGroups.length > 6 ? allGroups.slice(0, 5) : allGroups;
  const groupOf = (g: string) => (kept.includes(g) ? g : "Other");
  const groups = [...kept, ...(allGroups.length > kept.length ? ["Other"] : [])];

  const traces: Plotly.Data[] = [];
  groups.forEach((g, gi) => {
    const slot = groupOrder && groupOrder.includes(g) ? groupOrder.indexOf(g) : gi;
    const color = g === "Other" ? OTHER : colorFor?.(g, slot) ?? SERIES[slot % SERIES.length];
    const symbol = SYMBOLS[slot % SYMBOLS.length];
    for (const inverse of [false, true]) {
      const s = points.filter((p) => groupOf(p.group) === g && !!p.inverse === inverse);
      if (!s.length) continue;
      const ranged = s.some((p) => p.o2_min !== undefined && p.o2_min !== null && p.o2_min !== p.o2_max);
      traces.push({
        type: "scatter", mode: "markers", name: inverse ? `${g} · inverse (burner O₂)` : g,
        legendgroup: g,
        x: s.map((p) => p.o2), y: s.map((p) => p.pressure),
        error_x: ranged ? {
          type: "data", symmetric: false, thickness: 1, width: 0, color,
          array: s.map((p) => (p.o2_max ?? p.o2) - p.o2), arrayminus: s.map((p) => p.o2 - (p.o2_min ?? p.o2)),
        } : undefined,
        marker: inverse
          ? { color, size: 8, symbol: `${symbol}-open`, line: { width: 2, color } }
          : { color, size: 8, symbol, opacity: 0.9, line: { width: 1.5, color: SURFACE } },
        text: s.map((p) => p.label ?? ""),
        hovertemplate: "<b>" + g + (inverse ? " · inverse flame" : "") + "</b><br>O₂ %{x:.1f}% · %{y:.0f} kPa<br>%{text}<extra></extra>",
      } as Plotly.Data);
    }
  });

  const shapes: Partial<Plotly.Shape>[] = [];
  const annotations: Partial<Plotly.Annotation>[] = [];
  for (const sc of scenarios ?? []) {
    if (sc.id === "moon_base") {
      shapes.push({ type: "rect", xref: "x", yref: "y", x0: sc.o2_pct_min, x1: 100, y0: 0, y1: sc.pressure_kpa_max,
        fillcolor: "rgba(180,188,203,0.07)", line: { color: "rgba(180,188,203,0.4)", width: 1 }, layer: "below" });
      annotations.push({ x: 99, y: 3, xanchor: "right", yanchor: "bottom",
        text: "<b>Moon Base & rovers</b> (expected)<br>≥30% O₂, ≤10.2 psi", showarrow: false,
        font: { size: 10, color: INK.secondary }, align: "right" });
    } else if (sc.o2_pct !== undefined && sc.pressure_kpa !== undefined) {
      traces.push({
        type: "scatter", mode: "markers+text", name: sc.label, x: [sc.o2_pct], y: [sc.pressure_kpa],
        marker: { symbol: "star", size: 14, color: INK.primary, line: { color: SURFACE, width: 2 } },
        text: [sc.id === "earth" ? "Earth / ISS air" : "Spacesuit"], textposition: sc.id === "earth" ? "top right" : "top left",
        textfont: { size: 11, color: INK.secondary }, hovertemplate: sc.label + "<br>" + sc.basis + "<extra></extra>", showlegend: false,
      } as Plotly.Data);
    }
  }

  return (
    <Plot height={height} data={traces} label="Tested atmospheres versus exploration atmospheres"
      layout={{
        shapes, annotations,
        xaxis: { title: { text: "Oxygen concentration (%)" }, range: [0, 102] },
        yaxis: { title: { text: "Pressure (kPa)" }, rangemode: "tozero" },
        legend: { orientation: "h", y: 1.02, x: 0, yanchor: "bottom" },
        margin: { l: 56, r: 16, t: 44, b: 48 },
      }}
      table={{
        columns: ["Investigation", "Flame", "O₂ (%)", "Pressure (kPa)", "Detail"],
        rows: points.map((p) => [p.group, p.inverse ? "inverse (burner O₂)" : "ambient", Number(p.o2.toFixed(2)), Number(p.pressure.toFixed(1)), p.label ?? ""]),
      }} />
  );
}
