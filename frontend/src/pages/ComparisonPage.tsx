import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ImprovementBadges, SignalMetricsTable } from "../components/MetricTables";
import { ComparisonSignalChart, ResidualChart } from "../components/SignalCharts";
import {
  EmptyState,
  LoadingLine,
  Note,
  PageHeader,
  Panel,
  Pill,
  Spinner,
} from "../components/ui";
import { useApp } from "../state";
import { fmt, fmtSigned } from "../utils";

export default function ComparisonPage() {
  const {
    selection,
    fir,
    iir,
    result,
    running,
    runError,
    runComparison,
    resetExperiment,
    preview,
  } = useApp();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [save, setSave] = useState(true);
  const navigate = useNavigate();

  const run = async () => {
    try {
      await runComparison({ name: name || undefined, notes: notes || undefined, save });
      navigate("/evaluation");
    } catch {
      /* error is surfaced through context */
    }
  };

  const modeLabel =
    selection.mode === "existing"
      ? `${selection.record} · ${selection.channel}`
      : `${selection.clean_record} + ${selection.noise_record.toUpperCase()} · ${selection.channel}`;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Experiment"
        title="FIR vs IIR Comparison"
        lede="Run both filters on exactly the same input, then inspect the resulting waveforms, residuals and reference-based metrics. Results can be saved to local experiment history and exported."
        actions={
          <>
            <Link className="btn" to="/filters">
              Adjust filters
            </Link>
            <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={running}>
              {running ? <><Spinner /> Running…</> : "Run comparison"}
            </button>
          </>
        }
      />

      <LoadingLine visible={running} />
      {runError ? (
        <Note tone="danger">
          <strong>Comparison failed.</strong> {runError}
        </Note>
      ) : null}

      <div className="grid grid-2">
        <Panel title="Experiment" subtitle="Optional label and notes are stored with the result.">
          <div className="inline-fields">
            <label className="field">
              <span className="field-label">Name</span>
              <input
                className="input"
                value={name}
                maxLength={120}
                placeholder="e.g. EM noise, 0.5–40 Hz band-pass"
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Save to history</span>
              <label className="checkline" style={{ paddingTop: 7 }}>
                <input type="checkbox" checked={save} onChange={(event) => setSave(event.target.checked)} />
                Persist this run as JSON and add it to Results.
              </label>
            </label>
          </div>
          <label className="field" style={{ marginTop: 10 }}>
            <span className="field-label">Notes</span>
            <textarea
              className="textarea"
              value={notes}
              maxLength={2000}
              placeholder="Optional observations, e.g. hypothesis or intended clinical band."
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          <div className="divider" />
          <dl className="kv">
            <dt>Input</dt>
            <dd>{modeLabel}</dd>
            <dt>Window</dt>
            <dd className="mono">
              {fmt(selection.start, 0)} s → {fmt(selection.start + selection.duration, 0)} s
            </dd>
            <dt>Duration</dt>
            <dd>{selection.duration} s</dd>
            <dt>FIR</dt>
            <dd>
              {fir.filter_type} · order {fir.order} · {fir.window} ·{" "}
              {fir.filter_type === "bandpass"
                ? `${fir.cutoff_low}–${fir.cutoff_high} Hz`
                : fir.filter_type === "notch"
                  ? `${fir.cutoff} Hz`
                  : `${fir.cutoff} Hz`}
            </dd>
            <dt>IIR</dt>
            <dd>
              {iir.filter_type} · order {iir.order} · {iir.iir_method} ·{" "}
              {iir.filter_type === "bandpass"
                ? `${iir.cutoff_low}–${iir.cutoff_high} Hz`
                : iir.filter_type === "notch"
                  ? `${iir.cutoff} Hz`
                  : `${iir.cutoff} Hz`}
            </dd>
          </dl>

          <div style={{ marginTop: 14, display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={running}>
              {running ? <><Spinner /> Running…</> : "Run and save" }
            </button>
            {result ? (
              <button type="button" className="btn" onClick={resetExperiment}>
                Clear displayed result
              </button>
            ) : null}
          </div>
        </Panel>

        <Panel title="Fair-comparison checks" subtitle="Conditions enforced by the backend.">
          <ul className="warning-list">
            <li>Both filters receive the same sample array and the same sampling frequency.</li>
            <li>Both are applied with zero-phase filtering, removing the delay bias.</li>
            <li>Cutoffs are validated against the actual Nyquist frequency of the record.</li>
            <li>FIR order is converted to an odd tap count for Type I linear phase.</li>
            <li>IIR poles are checked for stability before filtering.</li>
            <li>Metrics use the clean reference after DC-invariant alignment; no synthetic target.</li>
          </ul>
          <div className="divider" />
          {preview ? (
            <div className="selection-tags">
              <Pill tone="navy">fs {preview.fs.toFixed(0)} Hz</Pill>
              <Pill>{preview.annotations.length} annotated beats</Pill>
              <Pill tone={preview.reference ? "ok" : "warn"}>
                {preview.reference ? "Clean reference available" : "No clean reference"}
              </Pill>
            </div>
          ) : (
            <p className="muted small">Waiting for the signal preview.</p>
          )}
        </Panel>
      </div>

      {result ? (
        <>
          <div className="section-title">
            <h2>Result</h2>
            <div className="meta">
              {result.saved ? "Saved to history" : "Not saved"} ·{" "}
              {result.created_at.slice(0, 19).replace("T", " ")} UTC
            </div>
          </div>

          <ImprovementBadges result={result} />

          <div style={{ marginTop: 12 }}>
            <ComparisonSignalChart result={result} />
          </div>

          <div style={{ marginTop: 18 }}>
            <ResidualChart result={result} />
          </div>

          <div className="grid grid-2" style={{ marginTop: 18 }}>
            <Panel
              title="Reference-based metrics"
              subtitle="Conventional power SNR and error metrics against the clean reference."
            >
              <SignalMetricsTable result={result} />
              <p className="field-hint" style={{ marginTop: 10 }}>
                SNR is 10 log₁₀(signal power / error power) after removing each signal&apos;s mean.
                PRD is the percentage RMS difference. Correlation is computed on the same aligned
                traces. Lower RMSE and PRD are better; higher SNR and correlation are better.
              </p>
            </Panel>

            <Panel title="Generated conclusions" subtitle="Derived from this run, not hardcoded.">
              <ul className="conclusion-list">
                {result.conclusions.map((conclusion) => (
                  <li key={conclusion}>{conclusion}</li>
                ))}
              </ul>
              <div style={{ marginTop: 12 }}>
                <Link className="btn btn-primary btn-small" to="/evaluation">
                  Full evaluation
                </Link>
              </div>
            </Panel>
          </div>

          <Panel
            title="Run warnings"
            subtitle="Kept visible so the result is not over-interpreted."
            className=""
          >
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
            <div className="divider" />
            <div className="selection-tags">
              <Pill>FIR ΔSNR {fmtSigned(result.improvements.fir, 2)} dB</Pill>
              <Pill>IIR ΔSNR {fmtSigned(result.improvements.iir, 2)} dB</Pill>
              <Pill>FIR total {fmt(result.processing.fir.total_time_ms, 2)} ms</Pill>
              <Pill>IIR total {fmt(result.processing.iir.total_time_ms, 2)} ms</Pill>
            </div>
          </Panel>
        </>
      ) : (
        <div style={{ marginTop: 18 }}>
          <EmptyState
            title="No comparison in this session"
            actions={
              <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={running}>
                Run comparison now
              </button>
            }
          >
            The backend will load the selected segment, design both filters, apply them
            zero-phase, compute reference metrics and return real arrays for plotting. Nothing
            is precomputed or mocked.
          </EmptyState>
        </div>
      )}
    </div>
  );
}
