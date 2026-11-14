import { useState, type ReactNode } from "react";
import PlotlyLib from "plotly.js-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";
import type { PlotParams } from "react-plotly.js";
import { BarChart3, Table2 } from "lucide-react";

const PlotlyComponent = createPlotlyComponent(PlotlyLib) as React.ComponentType<PlotParams>;

/*
 * Chart theme — follows the dataviz method:
 *  - categorical hues in a FIXED order (never cycled), dark steps validated with validate_palette.js against the
 *    card surface #0e121a: 6 slots pass the adjacent-pair gates; only the first 3 pass all-pairs, so scatter plots
 *    with more than 3 groups add a second encoding (marker symbol) — see SYMBOLS;
 *  - no violet anywhere (taste-skill rule; the reference slot 7 is dropped);
 *  - hairline solid gridlines one step off the surface, recessive axes, text in ink tokens, never in series colour;
 *  - thin marks: bars <= 24px with 4px rounded data ends, 2px lines, >= 8px markers with a 2px surface ring.
 */
export const SURFACE = "#0e121a";
export const SERIES = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#0ca30c"] as const;
/** @deprecated use SERIES; kept as an alias so older imports keep working */
export const PALETTE = SERIES as unknown as string[];
export const SYMBOLS = ["circle", "square", "diamond", "triangle-up", "hexagon", "star"] as const;
export const INK = { primary: "#e8ecf3", secondary: "#b4bccb", muted: "#8590a3", grid: "#1f2633", axis: "#2e384a" };
/** Reference/annotation colour: neutral, never a series hue. */
export const REFERENCE = "rgba(180,188,203,0.55)";
/** Marker spec: >= 8px, filled with the series colour, 2px ring in the surface colour. */
export const marker = (color: string, extra: Record<string, unknown> = {}) =>
  ({ color, size: 8, line: { color: SURFACE, width: 2 }, ...extra });

const AXIS: Partial<Plotly.LayoutAxis> = {
  gridcolor: INK.grid,
  gridwidth: 1,
  zeroline: false,
  linecolor: INK.axis,
  showline: true,
  ticks: "",
  tickfont: { color: INK.muted, size: 11, family: "JetBrains Mono, ui-monospace, monospace" },
  title: { font: { color: INK.secondary, size: 12 } },
  automargin: true,
};

export interface ChartTable { columns: string[]; rows: (string | number | null)[][] }

export function Plot({ data, layout, height = 300, className, table, label }: {
  data: Plotly.Data[]; layout?: Partial<Plotly.Layout>; height?: number; className?: string;
  /** Table-view twin of the chart (dataviz: every chart has one). */
  table?: ChartTable;
  /** Accessible name of the chart. */
  label?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const toggle = table && (
    <div className="seg absolute right-1 top-0 z-[2]" role="group" aria-label="Chart or table view">
      <button aria-pressed={view === "chart"} onClick={() => setView("chart")} className="inline-flex items-center gap-1">
        <BarChart3 className="h-3 w-3" /> Chart
      </button>
      <button aria-pressed={view === "table"} onClick={() => setView("table")} className="inline-flex items-center gap-1">
        <Table2 className="h-3 w-3" /> Table
      </button>
    </div>
  );

  if (table && view === "table") {
    return (
      <div className={className}>
        <div className="relative h-8">{toggle}</div>
        <TableView table={table} height={height} />
      </div>
    );
  }

  return (
    <div className={table ? "relative pt-8" : undefined} role={label ? "figure" : undefined} aria-label={label}>
      {toggle}
      <PlotlyComponent
        className={className}
        data={data}
        useResizeHandler
        style={{ width: "100%", height }}
        config={{ displaylogo: false, responsive: true, displayModeBar: "hover", modeBarButtonsToRemove: ["lasso2d", "select2d", "autoScale2d"] }}
        layout={{
          autosize: true,
          paper_bgcolor: "rgba(0,0,0,0)",
          plot_bgcolor: "rgba(0,0,0,0)",
          font: { family: "Inter, system-ui, sans-serif", color: INK.secondary, size: 12 },
          margin: { l: 52, r: 16, t: 12, b: 44 },
          colorway: [...SERIES],
          barcornerradius: 4,
          hovermode: "closest",
          hoverlabel: {
            bgcolor: "#151b26", bordercolor: "#2e384a",
            font: { color: INK.primary, family: "Inter, system-ui, sans-serif", size: 12 }, align: "left",
          },
          legend: { font: { color: INK.secondary, size: 11 }, bgcolor: "rgba(0,0,0,0)", itemclick: "toggle", itemdoubleclick: "toggleothers" },
          ...layout,
          xaxis: { ...AXIS, ...(layout?.xaxis ?? {}) },
          yaxis: { ...AXIS, ...(layout?.yaxis ?? {}) },
        } as Partial<Plotly.Layout>}
      />
    </div>
  );
}

function TableView({ table, height }: { table: ChartTable; height: number }) {
  return (
    <div className="overflow-auto rounded-lg border border-line" style={{ maxHeight: height }}>
      <table className="data-table">
        <thead><tr>{table.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {table.rows.map((r, i) => (
            <tr key={i}>{r.map((v, j) => <td key={j} className={typeof v === "number" ? "num text-right" : undefined}>{v ?? "—"}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A colour key beside text: the swatch carries identity, the text stays in ink. */
export function Key({ color, symbol = "circle", children }: { color: string; symbol?: (typeof SYMBOLS)[number] | "line"; children: ReactNode }) {
  const shape = symbol === "square" ? "rounded-[2px]" : symbol === "line" ? "h-0.5 w-3 rounded-full" : "rounded-full";
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-fg-2">
      <span aria-hidden className={symbol === "line" ? shape : `h-2 w-2 ${shape}`} style={{ background: color }} />
      {children}
    </span>
  );
}
