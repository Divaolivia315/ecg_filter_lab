import { useEffect, useMemo, useRef, useState } from "react";
import uPlot, {
  type AlignedData,
  type Options,
  type Plugin,
  type Series as UPlotSeries,
} from "uplot";
import "uplot/dist/uPlot.min.css";

export interface ChartSeries {
  label: string;
  data: (number | null)[];
  color: string;
  width?: number;
  dash?: number[];
}

interface Cutoff {
  value: number;
  label: string;
}

interface ChartProps {
  title: string;
  subtitle?: string;
  x: number[];
  series: ChartSeries[];
  height?: number;
  xLabel: string;
  yLabel: string;
  syncKey?: string;
  cutoffs?: Cutoff[];
  markers?: number[];
  yRange?: [number | null, number | null];
  footnote?: string;
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 70);
}

export default function Chart({
  title,
  subtitle,
  x,
  series,
  height = 260,
  xLabel,
  yLabel,
  syncKey,
  cutoffs,
  markers,
  yRange,
  footnote,
}: ChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<uPlot | null>(null);
  const prevXRef = useRef<[number, number] | null>(null);
  const [ready, setReady] = useState(false);

  const n = Math.min(x.length, ...series.map((s) => s.data.length));
  const data = useMemo<AlignedData>(() => {
    return [
      x.slice(0, n),
      ...series.map((s) => s.data.slice(0, n) as (number | null)[]),
    ] as AlignedData;
  }, [x, series, n]);

  const seriesSignature = useMemo(
    () =>
      JSON.stringify(
        series.map((s) => [s.label, s.color, s.width ?? 1.4, s.dash ?? null]),
      ),
    [series],
  );
  const cutoffSignature = useMemo(() => JSON.stringify(cutoffs ?? []), [cutoffs]);
  const markerSignature = useMemo(
    () => `${markers?.length ?? 0}:${markers?.[0] ?? ""}:${markers?.[markers.length - 1] ?? ""}`,
    [markers],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const width = Math.max(320, el.clientWidth || 640);

    const plugins: Plugin[] = [];
    if ((markers && markers.length) || (cutoffs && cutoffs.length)) {
      plugins.push({
        hooks: {
          draw: (u) => {
            const { ctx, bbox } = u;
            if (!bbox) return;
            ctx.save();
            if (markers && markers.length) {
              ctx.strokeStyle = "#b8c3cc";
              ctx.lineWidth = 1;
              ctx.setLineDash([2, 4]);
              for (const marker of markers) {
                const px = u.valToPos(marker, "x", true);
                if (px < bbox.left || px > bbox.left + bbox.width) continue;
                ctx.beginPath();
                ctx.moveTo(px, bbox.top);
                ctx.lineTo(px, bbox.top + bbox.height);
                ctx.stroke();
              }
            }
            if (cutoffs && cutoffs.length) {
              ctx.strokeStyle = "#7f8c98";
              ctx.lineWidth = 1;
              ctx.setLineDash([3, 3]);
              ctx.font = "9px Segoe UI, sans-serif";
              ctx.fillStyle = "#6d7882";
              for (const cutoff of cutoffs) {
                const px = u.valToPos(cutoff.value, "x", true);
                if (px < bbox.left || px > bbox.left + bbox.width) continue;
                ctx.beginPath();
                ctx.moveTo(px, bbox.top);
                ctx.lineTo(px, bbox.top + bbox.height);
                ctx.stroke();
                const labelX = Math.min(px + 4, bbox.left + bbox.width - 42);
                ctx.fillText(cutoff.label, labelX, bbox.top + 11);
              }
            }
            ctx.restore();
          },
        },
      });
    }

    const seriesOptions: UPlotSeries[] = [
      {
        label: xLabel,
        value: (_u, raw) => (raw == null ? "—" : Number(raw).toFixed(2)),
        show: false,
      },
      ...series.map((s) => ({
        label: s.label,
        stroke: s.color,
        width: s.width ?? 1.4,
        dash: s.dash,
        points: { show: false },
        spanGaps: true,
      })),
    ];

    const options: Options = {
      width,
      height,
      padding: [10, 14, 0, 2],
      legend: { show: true, live: true },
      cursor: {
        drag: { x: true, y: false, setScale: true },
        sync: syncKey ? { key: syncKey, setSeries: false } : undefined,
        points: {
          size: 4,
          width: 1,
          stroke: (u) => u.series[u.cursor.idx ?? 0]?.stroke as string,
        },
      },
      scales: {
        x: { time: false },
        y: {
          auto: true,
          range: yRange
            ? (_u, min, max) => [yRange[0] ?? min, yRange[1] ?? max]
            : undefined,
        },
      },
      axes: [
        {
          stroke: "#8a949d",
          grid: { stroke: "#edf0f2", width: 1 },
          ticks: { stroke: "#d9dee2", width: 1 },
          font: "10px Segoe UI, sans-serif",
          label: xLabel,
          labelFont: "10px Segoe UI, sans-serif",
          labelSize: 22,
          size: 32,
          space: 70,
        },
        {
          stroke: "#8a949d",
          grid: { stroke: "#edf0f2", width: 1 },
          ticks: { stroke: "#d9dee2", width: 1 },
          font: "10px Segoe UI, sans-serif",
          label: yLabel,
          labelFont: "10px Segoe UI, sans-serif",
          labelSize: 24,
          size: 54,
        },
      ],
      series: seriesOptions,
      plugins,
    };

    const chart = new uPlot(options, data, el);
    chartRef.current = chart;
    setReady(true);
    prevXRef.current = [x[0] ?? 0, x[x.length - 1] ?? 0];

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const nextWidth = Math.max(320, entry.contentRect.width);
      chart.setSize({ width: nextWidth, height });
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      chart.destroy();
      chartRef.current = null;
      setReady(false);
    };
    // Data is updated separately; only structural changes recreate the chart.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height, xLabel, yLabel, seriesSignature, syncKey, cutoffSignature, markerSignature]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setData(data);
    const first = x[0] ?? 0;
    const last = x[x.length - 1] ?? 0;
    const prev = prevXRef.current;
    if (!prev || prev[0] !== first || prev[1] !== last) {
      chart.setScale("x", { min: first, max: last });
      prevXRef.current = [first, last];
    }
  }, [data, x]);

  const resetZoom = () => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.setScale("x", { min: x[0] ?? 0, max: x[x.length - 1] ?? 0 });
  };

  const exportPNG = () => {
    const chart = chartRef.current;
    if (!chart) return;
    const src = chart.ctx.canvas;
    const pad = 30;
    const header = 66;
    const legendH = 30;
    const out = document.createElement("canvas");
    out.width = src.width + pad * 2;
    out.height = src.height + header + legendH + pad;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.fillStyle = "#162b45";
    ctx.font = "600 19px Georgia, serif";
    ctx.fillText(title, pad, 28);
    if (subtitle) {
      ctx.fillStyle = "#737d87";
      ctx.font = "11px Segoe UI, sans-serif";
      ctx.fillText(subtitle, pad, 46);
    }
    ctx.drawImage(src, pad, header);
    let lx = pad;
    const ly = header + src.height + 18;
    ctx.font = "10px Segoe UI, sans-serif";
    for (const s of series) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(lx, ly - 3);
      ctx.lineTo(lx + 16, ly - 3);
      ctx.stroke();
      ctx.fillStyle = "#44505c";
      ctx.fillText(s.label, lx + 21, ly);
      lx += 21 + ctx.measureText(s.label).width + 20;
    }
    downloadDataUrl(out.toDataURL("image/png"), `${slugify(title)}.png`);
  };

  return (
    <div className="chart-card">
      <div className="chart-toolbar">
        <div>
          <div className="chart-title">{title}</div>
          {subtitle ? <div className="chart-subtitle">{subtitle}</div> : null}
        </div>
        <div className="chart-actions">
          <button type="button" className="btn btn-ghost btn-small" onClick={resetZoom}>
            Reset view
          </button>
          <button type="button" className="btn btn-ghost btn-small" onClick={exportPNG} disabled={!ready}>
            PNG
          </button>
        </div>
      </div>
      <div className="chart-body" ref={containerRef} />
      {footnote ? <div className="chart-foot">{footnote}</div> : null}
    </div>
  );
}
