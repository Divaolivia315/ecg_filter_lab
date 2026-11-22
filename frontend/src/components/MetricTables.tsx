import type { BandPowerEntry, CompareResult, FilterDesign } from "../types";
import { fmt, fmtSigned } from "../utils";

function bestClass(a: number | null, b: number | null, higherIsBetter: boolean, mine: number | null) {
  if (a === null || b === null || mine === null) return "";
  if (Math.abs(a - b) < 1e-9) return "";
  const better = higherIsBetter ? Math.max(a, b) : Math.min(a, b);
  return Math.abs(mine - better) < 1e-9 ? "num best" : "num";
}

export function SignalMetricsTable({ result }: { result: CompareResult }) {
  const { metrics, improvements } = result;
  if (!metrics.input || !metrics.fir || !metrics.iir) return null;
  const rows = [
    {
      label: "SNR vs reference",
      unit: "dB",
      input: metrics.input.snr_db,
      fir: metrics.fir.snr_db,
      iir: metrics.iir.snr_db,
      digits: 2,
      higher: true,
    },
    {
      label: "SNR improvement",
      unit: "dB",
      input: null,
      fir: improvements.fir,
      iir: improvements.iir,
      digits: 2,
      higher: true,
    },
    {
      label: "RMSE",
      unit: "mV",
      input: metrics.input.rmse_mv,
      fir: metrics.fir.rmse_mv,
      iir: metrics.iir.rmse_mv,
      digits: 4,
      higher: false,
    },
    {
      label: "PRD",
      unit: "%",
      input: metrics.input.prd_percent,
      fir: metrics.fir.prd_percent,
      iir: metrics.iir.prd_percent,
      digits: 2,
      higher: false,
    },
    {
      label: "Correlation",
      unit: "",
      input: metrics.input.correlation,
      fir: metrics.fir.correlation,
      iir: metrics.iir.correlation,
      digits: 4,
      higher: true,
    },
    {
      label: "Residual noise power",
      unit: "mV²",
      input: metrics.input.noise_power_mv2,
      fir: metrics.fir.noise_power_mv2,
      iir: metrics.iir.noise_power_mv2,
      digits: 5,
      higher: false,
    },
  ];
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Metric</th>
            <th>Unit</th>
            <th>Input</th>
            <th>FIR</th>
            <th>IIR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <td className="row-label">{row.label}</td>
              <td className="muted">{row.unit}</td>
              <td className="num">{fmt(row.input, row.digits)}</td>
              <td className={bestClass(row.fir, row.iir, row.higher, row.fir)}>
                {fmt(row.fir, row.digits)}
              </td>
              <td className={bestClass(row.fir, row.iir, row.higher, row.iir)}>
                {fmt(row.iir, row.digits)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function MorphologyTable({ result }: { result: CompareResult }) {
  const morph = result.morphology;
  if (!morph.available) return null;
  const windows = ["P", "QRS", "T"];
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Window</th>
            <th>Filter</th>
            <th>Beats</th>
            <th>Correlation</th>
            <th>RMSE (mV)</th>
            <th>Amp. ratio</th>
            <th>|Timing shift| (ms)</th>
            <th>R-peak preserved</th>
          </tr>
        </thead>
        <tbody>
          {windows.map((window) =>
            ["fir", "iir"].map((family, index) => {
              const entry = morph.filters[family]?.[window];
              if (!entry) return null;
              return (
                <tr key={`${window}-${family}`}>
                  {index === 0 ? (
                    <td className="row-label" rowSpan={2}>
                      {window}
                      <div className="muted small" style={{ fontWeight: 400 }}>
                        {morph.windows[window]
                          ? `${morph.windows[window].start_ms} to ${morph.windows[window].end_ms} ms`
                          : ""}
                      </div>
                    </td>
                  ) : null}
                  <td>{family.toUpperCase()}</td>
                  <td className="num">{entry.n_beats}</td>
                  <td className="num">{fmt(entry.correlation, 4)}</td>
                  <td className="num">{fmt(entry.rmse_mv, 4)}</td>
                  <td className="num">{fmt(entry.amplitude_ratio, 3)}</td>
                  <td className="num">
                    {window === "QRS" ? fmt(entry.median_abs_timing_shift_ms, 1) : "—"}
                  </td>
                  <td className="num">
                    {window === "QRS" ? `${fmt(entry.r_peak_preservation_percent, 1)} %` : "—"}
                  </td>
                </tr>
              );
            }),
          )}
        </tbody>
      </table>
    </div>
  );
}

export function DecompositionTable({ result }: { result: CompareResult }) {
  const entries = Object.entries(result.decomposition ?? {});
  if (!entries.length) return null;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Filter</th>
            <th>Noise suppression (dB)</th>
            <th>Input noise RMS (mV)</th>
            <th>Residual noise RMS (mV)</th>
            <th>Signal distortion RMSE (mV)</th>
            <th>Filtered-reference correlation</th>
          </tr>
        </thead>
        <tbody>
          {entries.map(([family, entry]) => (
            <tr key={family}>
              <td className="row-label">{family.toUpperCase()}</td>
              <td className="num">{fmt(entry.noise_suppression_db, 2)}</td>
              <td className="num">{fmt(entry.input_noise_rms_mv, 4)}</td>
              <td className="num">{fmt(entry.residual_noise_rms_mv, 4)}</td>
              <td className="num">{fmt(entry.signal_distortion_rmse_mv, 4)}</td>
              <td className="num">{fmt(entry.signal_distortion_correlation, 4)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const BAND_LABELS: Record<string, string> = {
  baseline_0p05_0p5_hz: "Baseline 0.05–0.5 Hz",
  ecg_0p5_40_hz: "ECG band 0.5–40 Hz",
  high_40_100_hz: "High band 40–100 Hz",
  mains_49_51_hz: "Mains 49–51 Hz",
  mains_59_61_hz: "Mains 59–61 Hz",
};

export function BandPowerTable({ result }: { result: CompareResult }) {
  const signals = Object.keys(result.band_power ?? {});
  if (!signals.length) return null;
  const bands = Object.keys(result.band_power[signals[0]] ?? {});
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Band</th>
            {signals.map((signal) => (
              <th key={signal}>{signal.replace("_", " ").toUpperCase()}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {bands.map((band) => (
            <tr key={band}>
              <td className="row-label">{BAND_LABELS[band] ?? band}</td>
              {signals.map((signal) => {
                const entry: BandPowerEntry | undefined = result.band_power[signal]?.[band];
                return (
                  <td key={signal} className="num">
                    {entry?.percent === null || entry?.percent === undefined
                      ? "—"
                      : `${fmt(entry.percent, 2)} %`}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ProcessingTable({ result }: { result: CompareResult }) {
  const families: ("fir" | "iir")[] = ["fir", "iir"];
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Filter</th>
            <th>Design (ms)</th>
            <th>Apply median (ms)</th>
            <th>Total (ms)</th>
            <th>Taps / effective order</th>
            <th>Causal group delay</th>
          </tr>
        </thead>
        <tbody>
          {families.map((family) => {
            const processing = result.processing[family];
            const design: FilterDesign = result.filters[family];
            return (
              <tr key={family}>
                <td className="row-label">{family.toUpperCase()}</td>
                <td className="num">{fmt(processing.design_time_ms, 2)}</td>
                <td className="num">{fmt(processing.apply_time_ms, 2)}</td>
                <td className="num">{fmt(processing.total_time_ms, 2)}</td>
                <td className="num">
                  {design.taps ? `${design.taps} taps` : `order ${design.effective_order}`}
                </td>
                <td className="num">
                  {design.group_delay_ms !== null ? `${fmt(design.group_delay_ms, 1)} ms` : "frequency-dependent"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function FilterDesignSummary({ design }: { design: FilterDesign }) {
  const cfg = design.config;
  return (
    <div className="filter-card">
      <h3>{design.family.toUpperCase()} design</h3>
      <div className="filter-name">
        {cfg.filter_type === "bandpass"
          ? `Band-pass ${cfg.cutoff_low}–${cfg.cutoff_high} Hz`
          : cfg.filter_type === "notch"
            ? `Notch ${cfg.cutoff} Hz (Q ${cfg.notch_q})`
            : `${cfg.filter_type === "lowpass" ? "Low-pass" : "High-pass"} ${cfg.cutoff} Hz`}
      </div>
      <dl>
        <dt>Order</dt>
        <dd>{cfg.order}</dd>
        <dt>{design.taps ? "Taps" : "Effective order"}</dt>
        <dd>{design.taps ?? design.effective_order}</dd>
        <dt>{design.family === "fir" ? "Window" : "Method"}</dt>
        <dd>{design.family === "fir" ? cfg.window : cfg.iir_method}</dd>
        <dt>Zero-phase</dt>
        <dd>yes</dd>
        <dt>Group delay</dt>
        <dd>{design.group_delay_ms !== null ? `${fmt(design.group_delay_ms, 2)} ms` : "frequency-dependent"}</dd>
      </dl>
    </div>
  );
}

export function ImprovementBadges({ result }: { result: CompareResult }) {
  return (
    <div className="selection-tags">
      <span className="pill navy">
        FIR ΔSNR {fmtSigned(result.improvements.fir, 2)} dB
      </span>
      <span className="pill navy">
        IIR ΔSNR {fmtSigned(result.improvements.iir, 2)} dB
      </span>
      <span className="pill">
        FIR RMSE {fmt(result.metrics.fir?.rmse_mv, 4)} mV
      </span>
      <span className="pill">
        IIR RMSE {fmt(result.metrics.iir?.rmse_mv, 4)} mV
      </span>
    </div>
  );
}
