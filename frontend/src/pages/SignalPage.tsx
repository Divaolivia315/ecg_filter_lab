import { Link } from "react-router-dom";
import SelectionForm from "../components/SelectionForm";
import { AnnotationsList, PreviewSignalChart, SpectrumChart } from "../components/SignalCharts";
import {
  EmptyState,
  LoadingLine,
  Note,
  PageHeader,
  Panel,
  Pill,
  Stat,
  StatGrid,
} from "../components/ui";
import { useApp } from "../state";
import { fmt } from "../utils";

export default function SignalPage() {
  const {
    dataset,
    records,
    noises,
    references,
    selection,
    setSelection,
    preview,
    previewLoading,
    previewError,
    refreshPreview,
  } = useApp();
  const fs = preview?.fs ?? dataset?.fs ?? 360;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Inspection"
        title="Signal Visualization"
        lede="Inspect the exact segment before filtering. Check baseline drift, high-frequency noise, annotations and the spectrum so the filter design is grounded in the data rather than a guess."
        actions={
          <>
            <button type="button" className="btn" onClick={() => void refreshPreview()}>
              Refresh preview
            </button>
            <Link className="btn btn-primary" to="/filters">
              Continue to filters
            </Link>
          </>
        }
      />

      <LoadingLine visible={previewLoading} />
      {previewError ? (
        <Note tone="danger">
          <strong>Preview unavailable.</strong> {previewError}
        </Note>
      ) : null}

      <div className="grid grid-2">
        <Panel
          title="Selection"
          subtitle="The same input will be passed to both FIR and IIR filters."
        >
          <SelectionForm
            selection={selection}
            onChange={setSelection}
            records={records}
            noises={noises}
            references={references}
            fs={fs}
          />
        </Panel>

        <Panel
          title="Segment statistics"
          subtitle={preview ? `${preview.input.length.toLocaleString()} samples · fs ${preview.fs} Hz` : "Waiting for preview"}
        >
          {preview ? (
            <>
              <StatGrid>
                <Stat
                  label="Input RMS"
                  value={`${fmt(preview.input_stats.rms_mv, 3)}`}
                  note="mV"
                />
                <Stat
                  label="Input std"
                  value={`${fmt(preview.input_stats.std_mv, 3)}`}
                  note="mV"
                />
                <Stat
                  label="Peak-to-peak"
                  value={`${fmt(preview.input_stats.peak_to_peak_mv, 2)}`}
                  note="mV"
                />
                <Stat
                  label="DC offset removed"
                  value={`${fmt(preview.offset_mv, 3)}`}
                  note="mV, NSTDB vs clean"
                />
              </StatGrid>

              {preview.reference_stats ? (
                <div className="table-wrap" style={{ marginTop: 14 }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Signal</th>
                        <th>Mean (mV)</th>
                        <th>Std (mV)</th>
                        <th>RMS (mV)</th>
                        <th>Min (mV)</th>
                        <th>Max (mV)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td className="row-label">Input</td>
                        <td className="num">{fmt(preview.input_stats.mean_mv, 3)}</td>
                        <td className="num">{fmt(preview.input_stats.std_mv, 3)}</td>
                        <td className="num">{fmt(preview.input_stats.rms_mv, 3)}</td>
                        <td className="num">{fmt(preview.input_stats.min_mv, 3)}</td>
                        <td className="num">{fmt(preview.input_stats.max_mv, 3)}</td>
                      </tr>
                      <tr>
                        <td className="row-label">Clean reference</td>
                        <td className="num">{fmt(preview.reference_stats.mean_mv, 3)}</td>
                        <td className="num">{fmt(preview.reference_stats.std_mv, 3)}</td>
                        <td className="num">{fmt(preview.reference_stats.rms_mv, 3)}</td>
                        <td className="num">{fmt(preview.reference_stats.min_mv, 3)}</td>
                        <td className="num">{fmt(preview.reference_stats.max_mv, 3)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : null}

              <div className="selection-tags" style={{ marginTop: 12 }}>
                <Pill tone="navy">{preview.channel}</Pill>
                <Pill>{preview.record}</Pill>
                <Pill>{preview.annotations.length} annotated beats</Pill>
                {preview.mix ? <Pill tone="warn">Target {preview.mix.target_snr_db} dB</Pill> : null}
                {preview.meta.nominal_snr_db !== null ? (
                  <Pill>Nominal {preview.meta.nominal_snr_db > 0 ? "+" : ""}{preview.meta.nominal_snr_db} dB</Pill>
                ) : null}
              </div>

              {preview.mix ? (
                <div className="note" style={{ marginTop: 12 }}>
                  Mixture: MIT-BIH {preview.mix.clean_record} + {preview.mix.noise_label} noise from{" "}
                  {fmt(preview.mix.noise_start_s, 0)} s, scaled to {fmt(preview.mix.achieved_snr_db, 2)} dB
                  conventional power SNR (noise RMS {fmt(preview.mix.noise_rms_mv, 3)} mV).
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState title="No preview yet">
              Choose a valid segment. The backend loads the real NSTDB samples and aligns the
              clean reference when it is available.
            </EmptyState>
          )}
        </Panel>
      </div>

      {preview ? (
        <>
          <div style={{ marginTop: 18 }}>
            <PreviewSignalChart preview={preview} />
          </div>

          <div className="grid grid-2" style={{ marginTop: 18 }}>
            <SpectrumChart
              spectrum={preview.spectrum}
              title="Input and reference spectrum"
              subtitle="Welch PSD · 0–100 Hz"
            />
            <Panel
              title="Annotations"
              subtitle="Beat markers inside the selected window, taken from the MIT-BIH annotations."
            >
              <AnnotationsList annotations={preview.annotations} />
              <p className="field-hint" style={{ marginTop: 10 }}>
                Symbols follow the MIT-BIH annotation convention. These are reference annotations,
                not detections produced by the filters.
              </p>
            </Panel>
          </div>

          <div className="grid grid-2" style={{ marginTop: 18 }}>
            <Panel title="Warnings and alignment" subtitle="Applied before any filter is designed.">
              {preview.warnings.length ? (
                <ul className="warning-list">
                  {preview.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted small" style={{ margin: 0 }}>
                  No alignment or data warnings for this segment.
                </p>
              )}
              <div className="divider" />
              <dl className="kv">
                <dt>Display alignment</dt>
                <dd>Each trace is shifted to the reference mean.</dd>
                <dt>Metric alignment</dt>
                <dd>Each signal&apos;s mean is removed before SNR / RMSE.</dd>
                <dt>Input DC removed</dt>
                <dd className="mono">{fmt(preview.offset_mv, 4)} mV</dd>
              </dl>
            </Panel>

            <Panel title="What to look for" subtitle="Reading the segment before choosing a filter.">
              <ul className="warning-list">
                <li>
                  <strong>Baseline wander</strong> appears as slow drift across the whole window.
                  A high-pass around 0.5 Hz targets it, but higher cutoffs can distort ST segments.
                </li>
                <li>
                  <strong>Muscle artifact</strong> is broadband and raises the spectrum above
                  roughly 40 Hz. A low-pass can suppress it but may blunt QRS peaks.
                </li>
                <li>
                  <strong>Electrode motion</strong> mixes drift and abrupt transients. No single
                  linear filter removes it cleanly.
                </li>
                <li>
                  Check that annotated beats are inside the window; morphology metrics need them.
                </li>
              </ul>
            </Panel>
          </div>
        </>
      ) : null}
    </div>
  );
}
