import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import Chart from "../components/Chart";
import SelectionForm, { ActivityStrip } from "../components/SelectionForm";
import { NoiseSpectrumChart } from "../components/SignalCharts";
import { AcademicNotice, Note, PageHeader, Panel, Pill, Stat, StatGrid } from "../components/ui";
import { formatApiError, useApp } from "../state";
import type { Spectrum } from "../types";
import { fmt, fmtDuration } from "../utils";

interface NoisePreview {
  record: string;
  label: string;
  channel: string;
  start_s: number;
  duration_s: number;
  fs: number;
  time: number[];
  signal: number[];
  stats: Record<string, number>;
  spectrum: Spectrum;
}

export default function DatasetPage() {
  const {
    dataset,
    records,
    noises,
    references,
    selection,
    setSelection,
    preview,
    dataLoading,
    dataError,
    reloadData,
  } = useApp();
  const [rebuilding, setRebuilding] = useState(false);
  const [rebuildMessage, setRebuildMessage] = useState<string | null>(null);
  const [noiseRecord, setNoiseRecord] = useState("em");
  const [noiseChannel, setNoiseChannel] = useState(0);
  const [noiseStart, setNoiseStart] = useState(300);
  const [noisePreview, setNoisePreview] = useState<NoisePreview | null>(null);
  const [noiseLoading, setNoiseLoading] = useState(false);
  const [noiseError, setNoiseError] = useState<string | null>(null);

  const selectedNoise = noises.find((item) => item.record === noiseRecord);

  useEffect(() => {
    if (!selectedNoise) return;
    const recommended = selectedNoise.summary[selectedNoise.channels[noiseChannel]?.name ?? ""];
    if (recommended) setNoiseStart(recommended.recommended_start_s);
  }, [noiseRecord, noiseChannel, selectedNoise]);

  useEffect(() => {
    if (!selectedNoise) return;
    let cancelled = false;
    setNoiseLoading(true);
    setNoiseError(null);
    const handle = window.setTimeout(() => {
      api
        .previewNoise({
          record: noiseRecord,
          channel: noiseChannel,
          start: noiseStart,
          duration: Math.min(10, selection.duration),
        })
        .then((next) => {
          if (!cancelled) setNoisePreview(next as NoisePreview);
        })
        .catch((error) => {
          if (!cancelled) setNoiseError(formatApiError(error));
        })
        .finally(() => {
          if (!cancelled) setNoiseLoading(false);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [noiseRecord, noiseChannel, noiseStart, selection.duration, selectedNoise]);

  const rebuild = async () => {
    setRebuilding(true);
    setRebuildMessage(null);
    try {
      const result = await api.rebuildIndex();
      setRebuildMessage(`Index rebuilt: ${result.records} records at ${result.built_at.slice(0, 19)} UTC.`);
      await reloadData();
    } catch (error) {
      setRebuildMessage(formatApiError(error));
    } finally {
      setRebuilding(false);
    }
  };

  const fs = preview?.fs ?? dataset?.fs ?? 360;

  return (
    <div className="page">
      <PageHeader
        eyebrow="Data"
        title="Dataset Selection"
        lede="Use the real MIT-BIH Noise Stress Test Database files. Existing noisy records include an official clean reference for records 118 and 119, so reference-based metrics can be computed without inventing any signal."
        actions={
          <>
            <button type="button" className="btn" onClick={() => void rebuild()} disabled={rebuilding}>
              {rebuilding ? "Rebuilding…" : "Rebuild activity index"}
            </button>
            <Link className="btn btn-primary" to="/signal">
              Inspect segment
            </Link>
          </>
        }
      />

      {dataError ? (
        <Note tone="danger">
          {dataError}{" "}
          <button type="button" className="btn btn-small" onClick={() => void reloadData()}>
            Retry
          </button>
        </Note>
      ) : null}
      {rebuildMessage ? <Note>{rebuildMessage}</Note> : null}

      <div className="grid grid-2">
        <Panel
          title="Signal source"
          subtitle="Choose the segment that both filters will receive. Changing it updates the preview automatically."
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

        <div className="grid">
          <Panel title="Dataset facts" subtitle="Read-only source files. Nothing is modified in place.">
            <StatGrid>
              <Stat label="Noisy ECG" value={dataset?.record_count ?? "—"} note="NSTDB records" />
              <Stat label="Noise types" value={dataset?.noise_count ?? "—"} note="BW, MA, EM" />
              <Stat label="Sampling" value={dataset ? `${fmt(dataset.fs, 0)} Hz` : "—"} note="fs from header" />
              <Stat
                label="Record length"
                value={dataset ? fmtDuration(dataset.duration_s) : "—"}
                note="30 min per record"
              />
            </StatGrid>
            <dl className="kv" style={{ marginTop: 14 }}>
              <dt>NSTDB</dt>
              <dd className="mono small">{dataset?.dataset_path ?? "not found"}</dd>
              <dt>Clean reference</dt>
              <dd className="mono small">{dataset?.clean_reference_path ?? "—"}</dd>
              <dt>Reference source</dt>
              <dd>
                {dataset?.reference_source.database}
                <br />
                <span className="mono small">{dataset?.reference_source.base_url}</span>
              </dd>
              <dt>Old folder</dt>
              <dd>Ignored by design</dd>
            </dl>
          </Panel>

          <Panel title="Nominal vs measured SNR" subtitle="Two different definitions are kept separate.">
            <p className="small muted" style={{ marginTop: 0 }}>
              NSTDB labels each noisy record with a nominal SNR produced by the <span className="mono">nst</span>{" "}
              program. It derives the signal level from QRS peak-to-peak amplitude and the noise level from a
              frequency-weighted noise measure. It is <em>not</em> a conventional power SNR.
            </p>
            <p className="small muted">
              This application reports conventional reference-based SNR separately:
              <span className="mono"> SNR = 10 log₁₀(P_reference / P_error)</span>, with each signal&apos;s mean
              removed. Compare measured values across filters, not directly with the nominal label.
            </p>
            <Pill tone="navy">Nominal NSTDB SNR ≠ measured power SNR</Pill>
          </Panel>
        </div>
      </div>

      <div className="section-title">
        <h2>Noise library</h2>
        <div className="meta">MIT-BIH NSTDB noise records · two channels · 30 minutes</div>
      </div>

      <div className="grid grid-3">
        {noises.map((noise) => {
          const channelName = noise.channels[0]?.name ?? "";
          const summary = noise.summary[channelName];
          const active = noiseRecord === noise.record;
          return (
            <button
              key={noise.record}
              type="button"
              className={`noise-card ${active ? "active" : ""}`}
              onClick={() => {
                setNoiseRecord(noise.record);
                setNoiseChannel(0);
              }}
            >
              <div className="noise-card-head">
                <span className="noise-code">{noise.record.toUpperCase()}</span>
                <span className="noise-label">{noise.label}</span>
              </div>
              <p>{noise.description}</p>
              <div className="noise-meta">
                <span>RMS {fmt(summary?.rms_mv, 3)} mV</span>
                <span>Peak {fmt(summary?.peak_mv, 2)} mV</span>
                <span>{noise.channels.length} channels</span>
              </div>
              <ActivityStrip
                values={noise.activity[channelName] ?? []}
                step={noise.activity_step_s}
                current={noiseStart}
                duration={selection.duration}
              />
            </button>
          );
        })}
      </div>

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <Panel
          title={`Noise inspector · ${noiseRecord.toUpperCase()}`}
          subtitle={selectedNoise?.description}
          actions={
            <button
              type="button"
              className="btn btn-small"
              onClick={() => {
                setSelection({
                  ...selection,
                  mode: "mix",
                  noise_record: noiseRecord,
                  noise_channel: noiseChannel,
                  noise_start: noiseStart,
                });
              }}
            >
              Use in mixture
            </button>
          }
        >
          <div className="inline-fields three">
            <label className="field">
              <span className="field-label">Channel</span>
              <select
                className="select"
                value={noiseChannel}
                onChange={(event) => setNoiseChannel(Number(event.target.value))}
              >
                {(selectedNoise?.channels ?? []).map((channel) => (
                  <option key={channel.name} value={channel.index}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Start</span>
              <span className="range-row">
                <input
                  className="input mono"
                  type="number"
                  min={0}
                  max={Math.max(0, (selectedNoise?.duration_s ?? 0) - 10)}
                  step={1}
                  value={noiseStart}
                  onChange={(event) => setNoiseStart(Number(event.target.value))}
                />
                <span className="muted small">s</span>
              </span>
            </label>
            <div className="field">
              <span className="field-label">Preview</span>
              <div className="field-hint" style={{ paddingTop: 6 }}>
                {noiseLoading ? "Loading…" : noisePreview ? `${noisePreview.fs.toFixed(0)} Hz · ${noisePreview.signal.length} samples` : "—"}
              </div>
            </div>
          </div>

          {noiseError ? (
            <Note tone="danger">{noiseError}</Note>
          ) : noisePreview ? (
            <div style={{ marginTop: 14 }}>
              <Chart
                title={`${noisePreview.label} noise`}
                subtitle={`${noisePreview.record.toUpperCase()} · channel ${noisePreview.channel} · ${noisePreview.start_s.toFixed(0)} s`}
                x={noisePreview.time}
                series={[{ label: "Noise", data: noisePreview.signal, color: "#a6533c", width: 1.3 }]}
                xLabel="Time (s)"
                yLabel="mV"
                height={220}
                footnote={`RMS ${fmt(noisePreview.stats.rms_mv, 3)} mV · peak ${fmt(noisePreview.stats.peak_mv, 2)} mV · this is real recorded noise, not synthetic.`}
              />
              <div style={{ marginTop: 12 }}>
                <NoiseSpectrumChart spectrum={noisePreview.spectrum} title="Noise spectrum" />
              </div>
            </div>
          ) : (
            <p className="muted small">Loading noise preview…</p>
          )}
        </Panel>

        <div className="grid">
          <Panel title="Clean references" subtitle="Official MIT-BIH Arrhythmia Database records 118 and 119.">
            {references.length ? (
              <div className="reference-list">
                {references.map((reference) => (
                  <div key={reference.record} className="reference-row">
                    <div>
                      <div className="row-label">MIT-BIH {reference.record}</div>
                      <div className="muted small">
                        {fmtDuration(reference.duration_s)} · fs {reference.fs.toFixed(0)} Hz ·{" "}
                        {reference.channels.map((channel) => channel.name).join(" · ")}
                      </div>
                    </div>
                    <Pill tone="ok">{reference.annotation_count.toLocaleString()} beats</Pill>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted small">
                Not installed. Download the official records 118 and 119 from{" "}
                <span className="mono">physionet.org/files/mitdb/1.0.0/</span> into{" "}
                <span className="mono">data/clean-reference</span>.
              </p>
            )}
            <div className="note" style={{ marginTop: 12 }}>
              The NSTDB download does not include these clean source records. They are downloaded
              separately from PhysioNet and disclosed here; no synthetic reference is ever used.
            </div>
          </Panel>

          <Panel title="Data integrity" subtitle="What the backend verifies before analysis.">
            <ul className="warning-list">
              <li>WFDB headers are read for fs, sample count, channel names and units.</li>
              <li>Selected segments must fit inside the record; invalid ranges are rejected.</li>
              <li>Non-finite samples are rejected before filtering.</li>
              <li>Noisy records are aligned to the clean reference and a constant DC offset is removed.</li>
              <li>Noise activity is measured from noisy − clean; the cache stores only derived envelopes.</li>
              <li>No dataset file is ever written, modified or deleted.</li>
            </ul>
          </Panel>
        </div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <AcademicNotice />
        <Panel title="Limitations" subtitle="Carried through to every result and export.">
          <ul className="warning-list">
            {(dataset?.limitations ?? []).map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </Panel>
      </div>

      {dataLoading ? <p className="muted small">Loading dataset metadata…</p> : null}
    </div>
  );
}
