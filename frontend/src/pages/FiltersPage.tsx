import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import Chart from "../components/Chart";
import FilterEditor from "../components/FilterEditor";
import { COLORS } from "../components/SignalCharts";
import { LoadingLine, Note, PageHeader, Panel, Pill } from "../components/ui";
import { formatApiError, useApp } from "../state";
import type { FilterDesign } from "../types";
import { fmt } from "../utils";

interface ResponseState {
  fir: FilterDesign;
  iir: FilterDesign;
  fs: number;
}

function cutoffMarks(design: FilterDesign): { value: number; label: string }[] {
  const marks: { value: number; label: string }[] = [];
  if (design.cutoff_low_hz !== null && design.cutoff_low_hz !== undefined) {
    marks.push({ value: design.cutoff_low_hz, label: `${fmt(design.cutoff_low_hz, 1)} Hz` });
  }
  if (design.cutoff_high_hz !== null && design.cutoff_high_hz !== undefined) {
    marks.push({ value: design.cutoff_high_hz, label: `${fmt(design.cutoff_high_hz, 1)} Hz` });
  }
  if (design.center_hz !== null && design.center_hz !== undefined) {
    marks.push({ value: design.center_hz, label: `${fmt(design.center_hz, 1)} Hz` });
  }
  return marks;
}

export default function FiltersPage() {
  const { fir, iir, setFir, setIir, dataset, preview, selection, runComparison, running, runError } = useApp();
  const fs = preview?.fs ?? dataset?.fs ?? 360;
  const [response, setResponse] = useState<ResponseState | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const handle = window.setTimeout(() => {
      api
        .filterResponse(fir, iir, fs)
        .then((next) => {
          if (cancelled) return;
          setResponse(next);
          setErrors([]);
          setWarnings([
            ...(next.fir.warnings ?? []).map((warning) => `FIR: ${warning}`),
            ...(next.iir.warnings ?? []).map((warning) => `IIR: ${warning}`),
          ]);
        })
        .catch((error) => {
          if (cancelled) return;
          setResponse(null);
          setErrors([formatApiError(error)]);
          setWarnings([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [fir, iir, fs]);

  const responseData = useMemo(() => {
    if (!response) return null;
    const indices = response.fir.response!.freq_hz
      .map((f, i) => ({ f, i }))
      .filter((entry) => entry.f <= 100);
    return {
      freq: indices.map((entry) => entry.f),
      firMag: indices.map((entry) => response.fir.response!.magnitude_db[entry.i]),
      iirMag: indices.map((entry) => response.iir.response!.magnitude_db[entry.i]),
      firGd: indices.map((entry) => response.fir.response!.group_delay_ms[entry.i]),
      iirGd: indices.map((entry) => response.iir.response!.group_delay_ms[entry.i]),
    };
  }, [response]);

  const firErrors = errors.filter((error) => /FIR|tap|order/i.test(error));
  const iirErrors = errors.filter((error) => /IIR|order/i.test(error));
  const sharedErrors = errors.filter((error) => !firErrors.includes(error) && !iirErrors.includes(error));

  return (
    <div className="page">
      <PageHeader
        eyebrow="Design"
        title="Filter Configuration"
        lede="Design one FIR and one IIR filter for the same input segment. Both are applied with forward-backward zero-phase filtering, so their causal group delays are cancelled and the comparison is not biased by a lag."
        actions={
          <>
            <Link className="btn" to="/signal">
              Back to signal
            </Link>
            <Link className="btn btn-primary" to="/comparison">
              Run comparison
            </Link>
          </>
        }
      />

      <LoadingLine visible={loading} />
      {runError ? <Note tone="danger">{runError}</Note> : null}
      {sharedErrors.length ? (
        <Note tone="danger">
          {sharedErrors.map((error) => (
            <div key={error}>{error}</div>
          ))}
        </Note>
      ) : null}

      <div className="grid grid-2">
        <Panel
          title="FIR filter"
          subtitle="Finite impulse response · linear phase · window method."
          actions={<Pill tone="navy">Family: FIR</Pill>}
        >
          <FilterEditor
            family="fir"
            config={fir}
            onChange={setFir}
            fs={fs}
            errors={firErrors}
          />
        </Panel>

        <Panel
          title="IIR filter"
          subtitle="Infinite impulse response · recursive · second-order sections."
          actions={<Pill tone="navy">Family: IIR</Pill>}
        >
          <FilterEditor
            family="iir"
            config={iir}
            onChange={setIir}
            fs={fs}
            errors={iirErrors}
          />
        </Panel>
      </div>

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <Panel
          title="Magnitude response"
          subtitle="Design magnitude before forward-backward application."
        >
          {responseData ? (
            <Chart
              title="FIR vs IIR magnitude"
              subtitle={`fs ${fs.toFixed(0)} Hz · Nyquist ${(fs / 2).toFixed(0)} Hz`}
              x={responseData.freq}
              series={[
                { label: "FIR", data: responseData.firMag, color: COLORS.fir, width: 1.6 },
                { label: "IIR", data: responseData.iirMag, color: COLORS.iir, width: 1.6 },
              ]}
              xLabel="Frequency (Hz)"
              yLabel="Magnitude (dB)"
              height={280}
              cutoffs={response ? [...cutoffMarks(response.fir), ...cutoffMarks(response.iir)] : []}
              footnote="Zero-phase filtering squares the magnitude response; the passband remains the same but the effective roll-off steepens."
            />
          ) : (
            <p className="muted small">
              {loading ? "Designing filters…" : "Fix the validation errors to see the response."}
            </p>
          )}
        </Panel>

        <Panel title="Group delay" subtitle="Causal design delay, shown for transparency.">
          {responseData ? (
            <Chart
              title="Group delay"
              subtitle="−dφ/dω · cancelled by filtfilt / sosfiltfilt"
              x={responseData.freq}
              series={[
                { label: "FIR", data: responseData.firGd, color: COLORS.fir, width: 1.6 },
                { label: "IIR", data: responseData.iirGd, color: COLORS.iir, width: 1.6 },
              ]}
              xLabel="Frequency (Hz)"
              yLabel="Group delay (ms)"
              height={280}
              footnote="An FIR design has constant group delay. An IIR design has frequency-dependent delay, which is why zero-phase application matters."
            />
          ) : (
            <p className="muted small">No valid design yet.</p>
          )}
        </Panel>
      </div>

      <div className="grid grid-3" style={{ marginTop: 18 }}>
        <Panel title="FIR design notes" subtitle="Derived from the current configuration.">
          {response ? (
            <>
              <dl className="kv">
                <dt>Taps</dt>
                <dd>{response.fir.taps}</dd>
                <dt>Effective order</dt>
                <dd>{response.fir.effective_order}</dd>
                <dt>Design time</dt>
                <dd>{fmt(response.fir.design_time_ms, 3)} ms</dd>
                <dt>Group delay</dt>
                <dd>{fmt(response.fir.group_delay_ms, 2)} ms</dd>
              </dl>
              <div className="divider" />
              <ul className="warning-list">
                {(response.fir.notes ?? []).map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted small">No valid FIR design.</p>
          )}
        </Panel>

        <Panel title="IIR design notes" subtitle="Derived from the current configuration.">
          {response ? (
            <>
              <dl className="kv">
                <dt>Sections</dt>
                <dd>{response.iir.effective_order > 0 ? "SOS" : "—"}</dd>
                <dt>Effective order</dt>
                <dd>{response.iir.effective_order}</dd>
                <dt>Design time</dt>
                <dd>{fmt(response.iir.design_time_ms, 3)} ms</dd>
                <dt>Delay</dt>
                <dd>frequency-dependent</dd>
              </dl>
              <div className="divider" />
              <ul className="warning-list">
                {(response.iir.notes ?? []).map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted small">No valid IIR design.</p>
          )}
        </Panel>

        <Panel title="Validation" subtitle="Checked before any filtering runs.">
          {warnings.length ? (
            <ul className="warning-list">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : (
            <p className="muted small" style={{ margin: 0 }}>
              No design warnings. Cutoffs are inside 0–{fmt(fs / 2, 1)} Hz and the orders are
              within the supported range.
            </p>
          )}
          <div className="divider" />
          <p className="field-hint">
            Nyquist is {fmt(fs / 2, 1)} Hz. Band-pass and notch edges must stay strictly inside
            that range. FIR segments must be long enough for zero-phase padding; IIR order is
            limited to 12 for numerical stability.
          </p>
        </Panel>
      </div>

      <div className="note" style={{ marginTop: 18 }}>
        <strong>Same input, fair comparison.</strong> The selected segment{" "}
        <span className="mono">
          {selection.mode === "existing"
            ? `${selection.record} · ${selection.channel} · ${selection.start.toFixed(0)}–${(
                selection.start + selection.duration
              ).toFixed(0)} s`
            : `${selection.clean_record} + ${selection.noise_record.toUpperCase()} · ${selection.start.toFixed(0)}–${(
                selection.start + selection.duration
              ).toFixed(0)} s`}
        </span>{" "}
        is passed unchanged to both filters. Only the filter design differs.
      </div>

      <div style={{ marginTop: 18, display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Link className="btn btn-primary" to="/comparison">
          {running ? "Comparison running…" : "Continue to comparison"}
        </Link>
      </div>
    </div>
  );
}
