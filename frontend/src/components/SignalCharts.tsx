import type { Annotation, CompareResult, FilterDesign, SignalPreview, Spectrum } from "../types";
import { fmt } from "../utils";
import Chart, { type ChartSeries } from "./Chart";

export const COLORS = {
  reference: "#8795a1",
  input: "#a9762b",
  fir: "#2b5d86",
  iir: "#a6533c",
};

function alignTo(value: number[], mean: number, target: number | null): number[] {
  if (target === null) return value;
  const shift = target - mean;
  return value.map((v) => v + shift);
}

export function PreviewSignalChart({ preview }: { preview: SignalPreview }) {
  const refMean = preview.means_mv.reference;
  const series: ChartSeries[] = [];
  if (preview.reference) {
    series.push({
      label: "Clean reference",
      data: alignTo(preview.reference, preview.means_mv.reference ?? 0, refMean),
      color: COLORS.reference,
      width: 1.1,
    });
  }
  series.push({
    label: preview.mode === "mix" ? "Mixture (input)" : "Noisy input",
    data: alignTo(preview.input, preview.means_mv.input, refMean),
    color: COLORS.input,
    width: 1.3,
  });
  return (
    <Chart
      title="Selected segment"
      subtitle={`${preview.record} · ${preview.channel} · ${preview.start_s.toFixed(1)}–${(
        preview.start_s + preview.duration_s
      ).toFixed(1)} s`}
      x={preview.time}
      series={series}
      xLabel="Time (s)"
      yLabel="mV"
      height={300}
      syncKey="preview-time"
      markers={preview.annotations.map((a) => a.time_s)}
      footnote="Traces are aligned to the clean-reference mean for display. Beat annotations are shown as dotted markers."
    />
  );
}

export function ComparisonSignalChart({ result }: { result: CompareResult }) {
  const refMean = result.means_mv.reference;
  const series: ChartSeries[] = [];
  if (result.reference) {
    series.push({
      label: "Clean reference",
      data: alignTo(result.reference, result.means_mv.reference ?? 0, refMean),
      color: COLORS.reference,
      width: 1.1,
    });
  }
  series.push({
    label: "Input",
    data: alignTo(result.input, result.means_mv.input, refMean),
    color: COLORS.input,
    width: 1.2,
  });
  series.push({
    label: "FIR output",
    data: alignTo(result.fir, result.means_mv.fir, refMean),
    color: COLORS.fir,
    width: 1.4,
  });
  series.push({
    label: "IIR output",
    data: alignTo(result.iir, result.means_mv.iir, refMean),
    color: COLORS.iir,
    width: 1.4,
  });
  return (
    <Chart
      title="Denoised signals"
      subtitle={`${result.record} · ${result.channel} · ${result.duration_s.toFixed(0)} s segment`}
      x={result.time}
      series={series}
      xLabel="Time (s)"
      yLabel="mV"
      height={330}
      syncKey="result-time"
      markers={result.annotations.map((a) => a.time_s)}
      footnote="All traces are aligned to the clean-reference mean for visual comparison; metrics use DC-invariant error after removing each mean."
    />
  );
}

export function ResidualChart({ result }: { result: CompareResult }) {
  if (!result.residual_input || !result.residual_fir || !result.residual_iir) return null;
  const series: ChartSeries[] = [
    { label: "Input − reference", data: result.residual_input, color: COLORS.input, width: 1.1 },
    { label: "FIR − reference", data: result.residual_fir, color: COLORS.fir, width: 1.2 },
    { label: "IIR − reference", data: result.residual_iir, color: COLORS.iir, width: 1.2 },
  ];
  return (
    <Chart
      title="Residual error"
      subtitle="Filtered signal minus clean reference"
      x={result.time}
      series={series}
      xLabel="Time (s)"
      yLabel="mV"
      height={260}
      syncKey="result-time"
      footnote="Residuals are mean-aligned. A smaller residual indicates closer agreement with the clean reference."
    />
  );
}

export function SpectrumChart({
  spectrum,
  title = "Power spectral density",
  subtitle = "Welch estimate, Hann window",
}: {
  spectrum: Spectrum;
  title?: string;
  subtitle?: string;
}) {
  const keys = ["reference", "input", "fir", "iir"].filter(
    (key) => (spectrum.psd_db[key]?.length ?? 0) > 0,
  );
  const series: ChartSeries[] = keys.map((key) => ({
    label:
      key === "reference"
        ? "Clean reference"
        : key === "input"
          ? "Input"
          : `${key.toUpperCase()} output`,
    data: spectrum.psd_db[key],
    color: COLORS[key as keyof typeof COLORS] ?? "#44505c",
    width: 1.3,
  }));
  return (
    <Chart
      title={title}
      subtitle={subtitle}
      x={spectrum.freq_hz}
      series={series}
      xLabel="Frequency (Hz)"
      yLabel="PSD (dB/Hz)"
      height={280}
      footnote="PSD is computed with scipy.signal.welch on the selected segment. Levels are density values in dB relative to 1 mV²/Hz."
    />
  );
}

export function NoiseSpectrumChart({
  spectrum,
  title,
}: {
  spectrum: Spectrum;
  title: string;
}) {
  const data = spectrum.psd_db.noise ?? [];
  return (
    <Chart
      title={title}
      subtitle="Welch estimate of the noise record"
      x={spectrum.freq_hz}
      series={[{ label: "Noise", data, color: COLORS.iir, width: 1.3 }]}
      xLabel="Frequency (Hz)"
      yLabel="PSD (dB/Hz)"
      height={240}
    />
  );
}

function cutoffsFor(design: FilterDesign): { value: number; label: string }[] {
  const out: { value: number; label: string }[] = [];
  if (design.cutoff_low_hz !== null && design.cutoff_low_hz !== undefined) {
    out.push({ value: design.cutoff_low_hz, label: `${fmt(design.cutoff_low_hz, 1)} Hz` });
  }
  if (design.cutoff_high_hz !== null && design.cutoff_high_hz !== undefined) {
    out.push({ value: design.cutoff_high_hz, label: `${fmt(design.cutoff_high_hz, 1)} Hz` });
  }
  if (design.center_hz !== null && design.center_hz !== undefined) {
    out.push({ value: design.center_hz, label: `${fmt(design.center_hz, 1)} Hz` });
  }
  return out;
}

export function FilterResponseCharts({
  result,
  maxFreq = 100,
}: {
  result: CompareResult;
  maxFreq?: number;
}) {
  const response = result.response;
  const indices = response.freq_hz
    .map((f, i) => ({ f, i }))
    .filter((entry) => entry.f <= maxFreq);
  const freq = indices.map((entry) => entry.f);
  const firMag = indices.map((entry) => response.fir.magnitude_db[entry.i]);
  const iirMag = indices.map((entry) => response.iir.magnitude_db[entry.i]);
  const firGd = indices.map((entry) => response.fir.group_delay_ms[entry.i]);
  const iirGd = indices.map((entry) => response.iir.group_delay_ms[entry.i]);
  return (
    <div className="grid grid-2">
      <Chart
        title="Magnitude response"
        subtitle="Zero-phase design magnitude · 0–100 Hz"
        x={freq}
        series={[
          { label: "FIR", data: firMag, color: COLORS.fir, width: 1.5 },
          { label: "IIR", data: iirMag, color: COLORS.iir, width: 1.5 },
        ]}
        xLabel="Frequency (Hz)"
        yLabel="Magnitude (dB)"
        height={260}
        cutoffs={[...cutoffsFor(result.filters.fir), ...cutoffsFor(result.filters.iir)]}
        footnote="The plotted magnitude is the design response before forward-backward application. Zero-phase filtering squares the magnitude."
      />
      <Chart
        title="Group delay"
        subtitle="Causal design delay · cancelled by zero-phase filtering"
        x={freq}
        series={[
          { label: "FIR", data: firGd, color: COLORS.fir, width: 1.5 },
          { label: "IIR", data: iirGd, color: COLORS.iir, width: 1.5 },
        ]}
        xLabel="Frequency (Hz)"
        yLabel="Group delay (ms)"
        height={260}
        footnote="Group delay is −dφ/dω of the causal design. Both filters are applied with filtfilt / sosfiltfilt, so the net delay is approximately zero."
      />
    </div>
  );
}

export function AnnotationsList({ annotations }: { annotations: Annotation[] }) {
  if (!annotations.length) {
    return <p className="muted small">No beat annotations fall inside this segment.</p>;
  }
  return (
    <div className="annotation-list">
      {annotations.map((annotation) => (
        <span key={`${annotation.sample}-${annotation.symbol}`} className="annotation-chip">
          <span className="mono">{annotation.time_s.toFixed(2)} s</span>
          <span className="symbol">{annotation.symbol}</span>
        </span>
      ))}
    </div>
  );
}
