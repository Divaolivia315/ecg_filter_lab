import { Link } from "react-router-dom";
import { useApp } from "../state";
import { fmt, fmtDate, fmtDuration, fmtSigned } from "../utils";
import { PreviewSignalChart } from "../components/SignalCharts";
import {
  AcademicNotice,
  LoadingLine,
  Note,
  PageHeader,
  Panel,
  Pill,
  Stat,
  StatGrid,
} from "../components/ui";

export default function Dashboard() {
  const { dataset, records, noises, references, preview, history, dataLoading, dataError, reloadData } =
    useApp();
  const latest = history[0];
  const noisyRecords = records.length;
  const hasReference = Boolean(dataset?.clean_reference_available);

  return (
    <div className="page">
      <PageHeader
        eyebrow="Overview"
        title="ECG Signal Denoising: FIR and IIR Filter Comparison"
        lede="A working DSP laboratory built on the MIT-BIH Noise Stress Test Database. Select a real ECG segment, design a linear-phase FIR filter and an IIR filter, then compare their denoising performance against the clean reference with reference-based metrics."
        actions={
          <>
            <Link className="btn" to="/dataset">
              Select data
            </Link>
            <Link className="btn btn-primary" to="/filters">
              Configure filters
            </Link>
          </>
        }
      />

      <LoadingLine visible={dataLoading} />
      {dataError ? (
        <Note tone="danger">
          <strong>Backend unavailable.</strong> {dataError}{" "}
          <button type="button" className="btn btn-small" onClick={() => void reloadData()}>
            Retry
          </button>
        </Note>
      ) : null}

      <StatGrid>
        <Stat
          label="NSTDB ECG records"
          value={noisyRecords || "—"}
          note="Two subjects · six nominal noise levels each"
        />
        <Stat
          label="Noise records"
          value={noises.length || "—"}
          note="BW · MA · EM, two channels each"
        />
        <Stat
          label="Sampling frequency"
          value={dataset ? `${fmt(dataset.fs, 0)} Hz` : "—"}
          note="Nyquist 180 Hz · 30-minute records"
        />
        <Stat
          label="Clean reference"
          value={hasReference ? "Installed" : "Absent"}
          note={
            hasReference
              ? `MIT-BIH ${dataset?.clean_references.join(" / ")}`
              : "Reference metrics disabled"
          }
        />
      </StatGrid>

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <Panel
          title="Workflow"
          subtitle="The full analysis path, from data selection to exported evidence."
        >
          <ol className="workflow">
            <li>
              <span className="step-index">01</span>
              <div>
                <strong>Select data</strong>
                <p>
                  Choose an existing NSTDB noisy record, or mix an official clean ECG with
                  BW / MA / EM noise at a target SNR.
                </p>
                <Link to="/dataset">Dataset selection →</Link>
              </div>
            </li>
            <li>
              <span className="step-index">02</span>
              <div>
                <strong>Inspect the segment</strong>
                <p>
                  Check the raw waveform, annotations, spectrum and measured noise-activity
                  envelope before filtering.
                </p>
                <Link to="/signal">Signal visualization →</Link>
              </div>
            </li>
            <li>
              <span className="step-index">03</span>
              <div>
                <strong>Design FIR and IIR filters</strong>
                <p>
                  Set response type, order, cutoffs and design method. Both filters receive the
                  same input and are applied with zero-phase filtering.
                </p>
                <Link to="/filters">Filter configuration →</Link>
              </div>
            </li>
            <li>
              <span className="step-index">04</span>
              <div>
                <strong>Compare and evaluate</strong>
                <p>
                  Run the comparison, inspect SNR, RMSE, morphology preservation, spectra and
                  timing, then save and export the experiment.
                </p>
                <Link to="/comparison">FIR / IIR comparison →</Link>
              </div>
            </li>
          </ol>
        </Panel>

        <div className="grid">
          <Panel
            title="Latest experiment"
            subtitle="Saved results are persisted locally as JSON."
            actions={
              <Link className="btn btn-small" to="/results">
                All results
              </Link>
            }
          >
            {latest ? (
              <div>
                <div className="latest-name">{latest.name}</div>
                <div className="muted small" style={{ marginTop: 3 }}>
                  {fmtDate(latest.created_at)} · {latest.record} · {latest.channel}
                </div>
                <div className="latest-metrics">
                  <div>
                    <span className="label">Input SNR</span>
                    <span className="value">{fmt(latest.input_snr_db, 2)} dB</span>
                  </div>
                  <div>
                    <span className="label">FIR ΔSNR</span>
                    <span className="value">{fmtSigned(latest.fir_improvement_db, 2)} dB</span>
                  </div>
                  <div>
                    <span className="label">IIR ΔSNR</span>
                    <span className="value">{fmtSigned(latest.iir_improvement_db, 2)} dB</span>
                  </div>
                  <div>
                    <span className="label">Outcome</span>
                    <span className="value">{latest.winner}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                No experiments saved yet. Run a comparison and keep the result to populate this
                panel.
              </p>
            )}
          </Panel>

          <Panel title="Dataset provenance" subtitle="Everything is read from local PhysioNet files.">
            <dl className="kv">
              <dt>NSTDB path</dt>
              <dd className="mono small">{dataset?.dataset_path ?? "not found"}</dd>
              <dt>Records</dt>
              <dd>
                {noisyRecords} noisy ECG records · {noises.length} noise records
              </dd>
              <dt>Clean references</dt>
              <dd className="mono small">{dataset?.clean_reference_path ?? "—"}</dd>
              <dt>Reference source</dt>
              <dd>
                {dataset?.reference_source.database ?? "—"}
                <br />
                <span className="mono small">{dataset?.reference_source.base_url ?? ""}</span>
              </dd>
              <dt>Old subfolder</dt>
              <dd>{dataset?.old_subfolder === "ignored" ? "Ignored" : "—"}</dd>
            </dl>
            <div style={{ marginTop: 12 }}>
              {hasReference ? (
                <Pill tone="ok">Reference-based metrics available</Pill>
              ) : (
                <Pill tone="warn">Reference metrics disabled</Pill>
              )}
            </div>
          </Panel>
        </div>
      </div>

      {preview ? (
        <div style={{ marginTop: 18 }}>
          <Panel
            title="Quick look"
            subtitle="The current selection, loaded from the NSTDB record."
            actions={
              <Link className="btn btn-small" to="/signal">
                Open in Signal Visualization
              </Link>
            }
            bodyClassName=""
          >
            <div style={{ padding: "0 12px 10px" }}>
              <PreviewSignalChart preview={preview} />
            </div>
          </Panel>
        </div>
      ) : null}

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <Panel title="Scientific scope" subtitle="What this application does and does not claim.">
          <ul className="warning-list">
            {(dataset?.limitations ?? []).map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </Panel>
        <div className="grid">
          <AcademicNotice />
          <Note tone="warn">
            <strong>No hardcoded winners.</strong> Every table, chart and conclusion is
            generated from the selected segment and filter design. Timing depends on the
            machine, and the better filter depends on the noise band and morphology constraints.
          </Note>
          <Panel title="Clean reference availability">
            {references.length ? (
              <div className="reference-list">
                {references.map((reference) => (
                  <div key={reference.record} className="reference-row">
                    <div>
                      <div className="row-label">MIT-BIH {reference.record}</div>
                      <div className="muted small">
                        {fmtDuration(reference.duration_s)} · {reference.channels.map((c) => c.name).join(" · ")}
                      </div>
                    </div>
                    <div className="mono small">
                      {reference.annotation_count.toLocaleString()} annotations
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small" style={{ margin: 0 }}>
                No clean reference files are installed. The app remains usable for visual
                inspection and filter-response analysis, but reference-based metrics are
                deliberately unavailable.
              </p>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
