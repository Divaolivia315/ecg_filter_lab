import { useState } from "react";
import { Link } from "react-router-dom";
import { downloadUrl, exportUrl } from "../api";
import {
  BandPowerTable,
  DecompositionTable,
  FilterDesignSummary,
  ImprovementBadges,
  MorphologyTable,
  ProcessingTable,
  SignalMetricsTable,
} from "../components/MetricTables";
import {
  ComparisonSignalChart,
  FilterResponseCharts,
  ResidualChart,
  SpectrumChart,
} from "../components/SignalCharts";
import {
  EmptyState,
  Note,
  PageHeader,
  Panel,
  Pill,
  Stat,
  StatGrid,
} from "../components/ui";
import { useApp } from "../state";
import { fmt, fmtSigned } from "../utils";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "morphology", label: "Morphology" },
  { id: "spectrum", label: "Spectrum & bands" },
  { id: "response", label: "Frequency response" },
  { id: "timing", label: "Timing & design" },
  { id: "conclusions", label: "Conclusions & exports" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function EvaluationPage() {
  const { result, running, runError } = useApp();
  const [tab, setTab] = useState<TabId>("overview");

  if (!result) {
    return (
      <div className="page">
        <PageHeader
          eyebrow="Evaluation"
          title="Performance Evaluation"
          lede="Quantitative comparison of the two filters: SNR, RMSE, PRD, correlation, morphology preservation, spectral content and processing time."
        />
        {runError ? <Note tone="danger">{runError}</Note> : null}
        <EmptyState
          title="No evaluated result"
          actions={
            <Link className="btn btn-primary" to="/comparison">
              Go to comparison
            </Link>
          }
        >
          Run a comparison first. The evaluation page then reports every metric that can be
          computed from the real clean reference, without filling gaps with invented values.
        </EmptyState>
      </div>
    );
  }

  const saved = result.saved && result.experiment_id;
  const firSnr = result.metrics.fir?.snr_db ?? null;
  const iirSnr = result.metrics.iir?.snr_db ?? null;
  const winner =
    firSnr !== null && iirSnr !== null
      ? Math.abs(firSnr - iirSnr) < 0.05
        ? "Comparable"
        : firSnr > iirSnr
          ? "FIR"
          : "IIR"
      : "—";

  return (
    <div className="page">
      <PageHeader
        eyebrow="Evaluation"
        title="Performance Evaluation"
        lede={`${result.name} · ${result.record} · ${result.channel} · ${result.start_s.toFixed(
          0,
        )}–${(result.start_s + result.duration_s).toFixed(0)} s`}
        actions={
          <>
            <Link className="btn" to="/comparison">
              New comparison
            </Link>
            {saved ? (
              <button
                type="button"
                className="btn"
                onClick={() => downloadUrl(exportUrl(result.experiment_id!, "summary"))}
              >
                Summary CSV
              </button>
            ) : null}
            <Link className="btn btn-primary" to="/results">
              Experiment results
            </Link>
          </>
        }
      />

      {running ? <Note>Re-running comparison…</Note> : null}
      {runError ? <Note tone="danger">{runError}</Note> : null}
      {!saved ? (
        <Note tone="warn">
          This result was not saved to history. You can still inspect it, but CSV exports are
          available only for saved experiments.
        </Note>
      ) : null}

      <StatGrid>
        <Stat
          label="Input SNR"
          value={`${fmt(result.metrics.input?.snr_db, 2)} dB`}
          note="Conventional power SNR"
        />
        <Stat
          label="FIR SNR"
          value={`${fmt(firSnr, 2)} dB`}
          note={`${fmtSigned(result.improvements.fir, 2)} dB vs input`}
        />
        <Stat
          label="IIR SNR"
          value={`${fmt(iirSnr, 2)} dB`}
          note={`${fmtSigned(result.improvements.iir, 2)} dB vs input`}
        />
        <Stat
          label="Higher SNR"
          value={winner}
          note={
            winner === "Comparable"
              ? "Within 0.05 dB"
              : "On this segment and design"
          }
        />
      </StatGrid>

      <div className="tabs" role="tablist" aria-label="Evaluation sections">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            role="tab"
            aria-selected={tab === entry.id}
            className={`tab ${tab === entry.id ? "active" : ""}`}
            onClick={() => setTab(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "overview" ? (
        <>
          <ImprovementBadges result={result} />
          <div style={{ marginTop: 12 }}>
            <ComparisonSignalChart result={result} />
          </div>
          <div className="grid grid-2" style={{ marginTop: 18 }}>
            <Panel
              title="Error metrics"
              subtitle="Reference-based, DC-invariant. Best value in each row is emphasised."
            >
              <SignalMetricsTable result={result} />
              <div style={{ marginTop: 12 }}>
                <ImprovementBadges result={result} />
              </div>
            </Panel>
            <Panel
              title="Noise suppression vs signal distortion"
              subtitle="Linear decomposition: y − d = (H{d} − d) + H{input − d}."
            >
              <DecompositionTable result={result} />
              <p className="field-hint" style={{ marginTop: 10 }}>
                Suppressing noise is only half of the story. A filter that removes noise but also
                distorts the ECG can still show a modest total SNR gain. The distortion column
                isolates that effect.
              </p>
            </Panel>
          </div>
          <div style={{ marginTop: 18 }}>
            <ResidualChart result={result} />
          </div>
          <div className="filter-summary" style={{ marginTop: 18 }}>
            <FilterDesignSummary design={result.filters.fir} />
            <FilterDesignSummary design={result.filters.iir} />
          </div>
        </>
      ) : null}

      {tab === "morphology" ? (
        <div className="grid">
          <Panel
            title="P / QRS / T preservation"
            subtitle="Median across annotated beats inside the segment. P and T windows are defined relative to each annotated R peak."
          >
            {result.morphology.available ? (
              <>
                <MorphologyTable result={result} />
                <p className="field-hint" style={{ marginTop: 10 }}>
                  Amplitude ratio is the filtered peak-to-peak divided by the reference
                  peak-to-peak in the same window. A ratio near 1 means amplitude is preserved.
                  The timing shift is the displacement of the largest QRS deflection. These are
                  preservation indices, not diagnostic wave detections.
                </p>
              </>
            ) : (
              <Note tone="warn">
                {result.morphology.reason ??
                  "Morphology metrics are unavailable for this selection."}
              </Note>
            )}
          </Panel>
          <Panel title="How to read this" subtitle="Avoiding over-interpretation.">
            <ul className="warning-list">
              <li>
                MIT-BIH annotates beats, not P or T waves. P/T windows are fixed offsets around
                annotated R peaks and can overlap neighbouring beats at high heart rates.
              </li>
              <li>
                A high QRS correlation with a low P/T correlation suggests the filter preserves
                the sharp ventricular complex but distorts slower atrial or repolarisation content.
              </li>
              <li>
                Zero-phase filtering removes net delay, so timing shifts here should be small.
                Residual shifts indicate waveform reshaping, not a constant lag.
              </li>
            </ul>
          </Panel>
        </div>
      ) : null}

      {tab === "spectrum" ? (
        <div className="grid">
          <SpectrumChart
            spectrum={result.spectrum}
            title="Input, reference and filtered spectra"
            subtitle="Welch PSD · 0–100 Hz · Hann window"
          />
          <Panel
            title="Band power distribution"
            subtitle="Integrated PSD in physiological and noise-relevant bands, as a percentage of 0.05–100 Hz power."
          >
            <BandPowerTable result={result} />
            <p className="field-hint" style={{ marginTop: 10 }}>
              Band power is a descriptive measure. The ECG band 0.5–40 Hz contains most
              diagnostic content, while baseline and high-frequency bands are more likely to be
              noise-dominated. Percentages are not clinical scores.
            </p>
          </Panel>
        </div>
      ) : null}

      {tab === "response" ? (
        <div className="grid">
          <FilterResponseCharts result={result} />
          <Panel title="Response notes" subtitle="Design-level interpretation.">
            <ul className="warning-list">
              <li>
                The FIR design is linear phase. Its magnitude can be made sharp only by increasing
                the order, which also lengthens the zero-phase padding requirement.
              </li>
              <li>
                The IIR design reaches a similar transition with a much lower order, but its phase
                is nonlinear and its impulse response is infinite.
              </li>
              <li>
                Forward-backward filtering doubles the effective order and squares the magnitude.
                The plotted response is the single-pass design, which is the conventional way to
                document the filter.
              </li>
            </ul>
          </Panel>
        </div>
      ) : null}

      {tab === "timing" ? (
        <div className="grid">
          <Panel
            title="Processing time"
            subtitle="Design and application timings measured in this run. Application timing is the median of three passes."
          >
            <ProcessingTable result={result} />
            <p className="field-hint" style={{ marginTop: 10 }}>
              Timings are wall-clock measurements on the machine that served this request. They
              are indicative, not portable benchmarks. FIR application scales with taps × samples;
              IIR cost scales with sections × samples.
            </p>
          </Panel>
          <div className="filter-summary">
            <FilterDesignSummary design={result.filters.fir} />
            <FilterDesignSummary design={result.filters.iir} />
          </div>
          <Panel title="Design warnings" subtitle="Returned by the filter design stage.">
            {result.filters.fir.warnings.length || result.filters.iir.warnings.length ? (
              <ul className="warning-list">
                {result.filters.fir.warnings.map((warning) => (
                  <li key={`fir-${warning}`}>FIR: {warning}</li>
                ))}
                {result.filters.iir.warnings.map((warning) => (
                  <li key={`iir-${warning}`}>IIR: {warning}</li>
                ))}
              </ul>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                No design warnings.
              </p>
            )}
          </Panel>
        </div>
      ) : null}

      {tab === "conclusions" ? (
        <div className="grid">
          <Panel title="Conclusions from this run" subtitle="Generated from the measured values above.">
            <ul className="conclusion-list">
              {result.conclusions.map((conclusion) => (
                <li key={conclusion}>{conclusion}</li>
              ))}
            </ul>
          </Panel>
          <div className="grid grid-2">
            <Panel title="Warnings" subtitle="Data, alignment and interpretation caveats.">
              {result.warnings.length ? (
                <ul className="warning-list">
                  {result.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted small" style={{ margin: 0 }}>
                  No warnings for this run.
                </p>
              )}
            </Panel>
            <Panel
              title="Exports"
              subtitle={
                saved
                  ? "CSV files are generated by the backend from the saved experiment."
                  : "Save the experiment to enable CSV exports."
              }
            >
              {saved ? (
                <div className="export-grid">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => downloadUrl(exportUrl(result.experiment_id!, "summary"))}
                  >
                    Summary CSV
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => downloadUrl(exportUrl(result.experiment_id!, "signals"))}
                  >
                    Signals CSV
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => downloadUrl(exportUrl(result.experiment_id!, "spectrum"))}
                  >
                    Spectrum CSV
                  </button>
                  <button
                    type="button"
                    className="btn"
                    onClick={() => downloadUrl(exportUrl(result.experiment_id!, "response"))}
                  >
                    Response CSV
                  </button>
                </div>
              ) : (
                <p className="muted small">
                  Run the comparison with “Save to history” enabled to persist the JSON and
                  enable all four CSV exports.
                </p>
              )}
              <p className="field-hint" style={{ marginTop: 10 }}>
                PNG export is available from the toolbar of every chart. CSV files include the
                experiment metadata, filter designs, metrics, morphology, conclusions and, where
                applicable, the sample arrays and spectra.
              </p>
            </Panel>
          </div>
          <Panel title="Scientific caveat" subtitle="No universal winner is claimed.">
            <div className="selection-tags">
              <Pill tone="navy">{result.filters.fir.config.filter_type} FIR</Pill>
              <Pill tone="navy">{result.filters.iir.config.filter_type} IIR</Pill>
              <Pill>{result.duration_s.toFixed(0)} s segment</Pill>
              <Pill>{result.reference_available ? "Reference available" : "No reference"}</Pill>
            </div>
            <p className="small muted" style={{ marginBottom: 0, marginTop: 10 }}>
              The better choice depends on the noise band, the permitted filter order, edge
              effects and which waveforms must be preserved. One segment is one piece of
              evidence; repeat across records, noise types and SNRs before generalising.
            </p>
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
