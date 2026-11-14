import PlotlyLib from "plotly.js-dist-min";
import createPlotlyComponent from "react-plotly.js/factory";
import type { PlotParams } from "react-plotly.js";

const PlotlyComponent = createPlotlyComponent(PlotlyLib) as React.ComponentType<PlotParams>;

const AXIS = {
  gridcolor: "rgba(138,148,167,0.12)",
  zerolinecolor: "rgba(138,148,167,0.2)",
  linecolor: "rgba(138,148,167,0.25)",
  tickfont: { color: "#8a94a7", size: 11, family: "JetBrains Mono, monospace" },
  titlefont: { color: "#aab3c5", size: 12 },
};

export const PALETTE = ["#ff7a1a", "#4cc9f0", "#34d399", "#facc15", "#c084fc", "#ff4d40", "#94a3b8", "#60a5fa"];

export function Plot({ data, layout, height = 300, className }: {
  data: Plotly.Data[]; layout?: Partial<Plotly.Layout>; height?: number; className?: string;
}) {
  return (
    <PlotlyComponent
      className={className}
      data={data}
      useResizeHandler
      style={{ width: "100%", height }}
      config={{ displaylogo: false, responsive: true, modeBarButtonsToRemove: ["lasso2d", "select2d"] }}
      layout={{
        autosize: true,
        paper_bgcolor: "rgba(0,0,0,0)",
        plot_bgcolor: "rgba(0,0,0,0)",
        font: { family: "Inter, sans-serif", color: "#e5eaf2", size: 12 },
        margin: { l: 48, r: 16, t: 16, b: 40 },
        colorway: PALETTE,
        hoverlabel: { bgcolor: "#141a25", bordercolor: "#212938", font: { color: "#e5eaf2" } },
        legend: { font: { color: "#aab3c5", size: 11 }, bgcolor: "rgba(0,0,0,0)" },
        ...layout,
        xaxis: { ...AXIS, ...(layout?.xaxis ?? {}) },
        yaxis: { ...AXIS, ...(layout?.yaxis ?? {}) },
      }}
    />
  );
}
