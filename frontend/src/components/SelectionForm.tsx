import { useMemo } from "react";
import type {
  NoiseMeta,
  RecordMeta,
  ReferenceMeta,
  SignalSelection,
} from "../types";
import { fmt, fmtDuration } from "../utils";
import { Note, Pill } from "./ui";

export function ActivityStrip({
  values,
  step,
  current,
  duration,
}: {
  values: number[];
  step: number;
  current: number;
  duration: number;
}) {
  if (!values.length) {
    return <span className="muted small">No measured activity envelope.</span>;
  }
  const max = Math.max(...values, 1e-9);
  const end = current + duration;
  return (
    <div className="activity-strip" title="Measured noise activity (5 s blocks)">
      {values.map((value, index) => {
        const start = index * step;
        const active = start < end && start + step > current;
        const ratio = value / max;
        const cls = active ? (ratio > 0.66 ? "activity-bar hot" : "activity-bar active") : "activity-bar";
        return (
          <span
            key={index}
            className={cls}
            style={{ height: `${Math.max(8, Math.round(ratio * 100))}%` }}
          />
        );
      })}
    </div>
  );
}

export default function SelectionForm({
  selection,
  onChange,
  records,
  noises,
  references,
  fs,
  showRecordInfo = true,
}: {
  selection: SignalSelection;
  onChange: (next: SignalSelection) => void;
  records: RecordMeta[];
  noises: NoiseMeta[];
  references: ReferenceMeta[];
  fs: number;
  showRecordInfo?: boolean;
}) {
  const record = records.find((item) => item.record === selection.record) ?? null;
  const clean = references.find((item) => item.record === selection.clean_record) ?? null;
  const noise = noises.find((item) => item.record === selection.noise_record) ?? null;
  const update = (patch: Partial<SignalSelection>) => onChange({ ...selection, ...patch });

  const grouped = useMemo(() => {
    const groups = new Map<string, RecordMeta[]>();
    for (const item of records) {
      const key = item.subject ? `Subject ${item.subject}` : "Records";
      const list = groups.get(key) ?? [];
      list.push(item);
      groups.set(key, list);
    }
    return Array.from(groups.entries());
  }, [records]);

  const activeRecord = selection.mode === "existing" ? record : clean;
  const activeChannelName = selection.mode === "existing" ? selection.channel : selection.channel;
  const activity =
    selection.mode === "existing" && record
      ? record.activity[activeChannelName] ?? []
      : [];

  const maxStart =
    selection.mode === "existing" && record
      ? Math.max(0, record.duration_s - selection.duration)
      : clean
        ? Math.max(0, clean.duration_s - selection.duration)
        : 0;
  const outside = selection.start > maxStart + 1e-6;

  const noiseStartMax = noise ? Math.max(0, noise.duration_s - selection.duration) : 0;
  const noiseOutside = selection.mode === "mix" && selection.noise_start > noiseStartMax + 1e-6;

  return (
    <div className="selection-form">
      <div className="segmented" role="group" aria-label="Input source">
        <button
          type="button"
          className={selection.mode === "existing" ? "active" : ""}
          onClick={() => update({ mode: "existing" })}
        >
          Existing NSTDB record
        </button>
        <button
          type="button"
          className={selection.mode === "mix" ? "active" : ""}
          onClick={() => update({ mode: "mix" })}
        >
          Clean ECG + NSTDB noise
        </button>
      </div>

      {selection.mode === "existing" ? (
        <>
          <div className="inline-fields three" style={{ marginTop: 14 }}>
            <label className="field">
              <span className="field-label">Noisy ECG record</span>
              <select
                className="select"
                value={selection.record}
                onChange={(event) => {
                  const nextRecord = records.find((item) => item.record === event.target.value);
                  const channel = nextRecord?.channels.some((c) => c.name === selection.channel)
                    ? selection.channel
                    : nextRecord?.channels[0]?.name ?? selection.channel;
                  const recommended = nextRecord?.recommended?.[channel];
                  update({
                    record: event.target.value,
                    channel,
                    start: recommended !== undefined ? recommended : selection.start,
                  });
                }}
              >
                {grouped.map(([label, items]) => (
                  <optgroup key={label} label={label}>
                    {items.map((item) => (
                      <option key={item.record} value={item.record}>
                        {item.record} · nominal {item.nominal_snr_db !== null ? `${item.nominal_snr_db > 0 ? "+" : ""}${item.nominal_snr_db} dB` : "—"}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Channel</span>
              <select
                className="select"
                value={selection.channel}
                onChange={(event) => {
                  const channel = event.target.value;
                  const recommended = record?.recommended?.[channel];
                  update({ channel, start: recommended !== undefined ? recommended : selection.start });
                }}
              >
                {(record?.channels ?? []).map((channel) => (
                  <option key={channel.name} value={channel.name}>
                    {channel.name} ({channel.units})
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Start time</span>
              <span className="range-row">
                <input
                  className="input mono"
                  type="number"
                  min={0}
                  max={maxStart}
                  step={1}
                  value={selection.start}
                  onChange={(event) => update({ start: Number(event.target.value) })}
                />
                <span className="muted small">s</span>
              </span>
            </label>
          </div>

          <div className="inline-fields three" style={{ marginTop: 10 }}>
            <label className="field">
              <span className="field-label">Duration</span>
              <span className="range-row">
                <input
                  className="input mono"
                  type="number"
                  min={1}
                  max={60}
                  step={1}
                  value={selection.duration}
                  onChange={(event) => update({ duration: Number(event.target.value) })}
                />
                <span className="muted small">s</span>
              </span>
            </label>
            <div className="field">
              <span className="field-label">Recommended window</span>
              <div className="preset-row" style={{ paddingTop: 2 }}>
                {record?.noise_segments?.[selection.channel]?.slice(0, 3).map((segment) => (
                  <button
                    key={`${segment.start_s}-${segment.end_s}`}
                    type="button"
                    className="btn btn-small"
                    onClick={() =>
                      update({
                        start: Math.round(segment.start_s + 5),
                        duration: Math.min(10, Math.max(1, Math.round(segment.end_s - segment.start_s - 10))),
                      })
                    }
                  >
                    {fmtDuration(segment.start_s)}–{fmtDuration(segment.end_s)}
                  </button>
                )) ?? <span className="muted small">No detected noise segment.</span>}
              </div>
            </div>
            <div className="field">
              <span className="field-label">Segment range</span>
              <div className="field-hint" style={{ paddingTop: 5 }}>
                Start {fmt(selection.start, 0)} s → {fmt(selection.start + selection.duration, 0)} s
                <br />
                Record length {activeRecord ? fmtDuration(activeRecord.duration_s) : "—"}
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="inline-fields three" style={{ marginTop: 14 }}>
            <label className="field">
              <span className="field-label">Clean reference</span>
              <select
                className="select"
                value={selection.clean_record}
                onChange={(event) => update({ clean_record: event.target.value })}
              >
                {references.length ? (
                  references.map((item) => (
                    <option key={item.record} value={item.record}>
                      MIT-BIH {item.record} · {fmtDuration(item.duration_s)}
                    </option>
                  ))
                ) : (
                  <option value={selection.clean_record}>No clean reference installed</option>
                )}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Noise type</span>
              <select
                className="select"
                value={selection.noise_record}
                onChange={(event) => update({ noise_record: event.target.value })}
              >
                {noises.map((item) => (
                  <option key={item.record} value={item.record}>
                    {item.record.toUpperCase()} · {item.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Noise channel</span>
              <select
                className="select"
                value={selection.noise_channel}
                onChange={(event) => update({ noise_channel: Number(event.target.value) })}
              >
                {(noise?.channels ?? []).map((channel) => (
                  <option key={channel.name} value={channel.index}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="inline-fields three" style={{ marginTop: 10 }}>
            <label className="field">
              <span className="field-label">Clean start</span>
              <span className="range-row">
                <input
                  className="input mono"
                  type="number"
                  min={0}
                  max={maxStart}
                  step={1}
                  value={selection.start}
                  onChange={(event) => update({ start: Number(event.target.value) })}
                />
                <span className="muted small">s</span>
              </span>
            </label>
            <label className="field">
              <span className="field-label">Noise start</span>
              <span className="range-row">
                <input
                  className="input mono"
                  type="number"
                  min={0}
                  max={noiseStartMax}
                  step={1}
                  value={selection.noise_start}
                  onChange={(event) => update({ noise_start: Number(event.target.value) })}
                />
                <span className="muted small">s</span>
              </span>
            </label>
            <label className="field">
              <span className="field-label">Target SNR</span>
              <span className="range-row">
                <input
                  className="input mono"
                  type="number"
                  min={-10}
                  max={30}
                  step={1}
                  value={selection.target_snr_db}
                  onChange={(event) => update({ target_snr_db: Number(event.target.value) })}
                />
                <span className="muted small">dB</span>
              </span>
            </label>
          </div>

          <div className="inline-fields" style={{ marginTop: 10 }}>
            <label className="field">
              <span className="field-label">Duration</span>
              <span className="range-row">
                <input
                  className="input mono"
                  type="number"
                  min={1}
                  max={60}
                  step={1}
                  value={selection.duration}
                  onChange={(event) => update({ duration: Number(event.target.value) })}
                />
                <span className="muted small">s</span>
              </span>
            </label>
            <div className="field">
              <span className="field-label">Channel</span>
              <select
                className="select"
                value={selection.channel}
                onChange={(event) => update({ channel: event.target.value })}
              >
                {(clean?.channels ?? []).map((channel) => (
                  <option key={channel.name} value={channel.name}>
                    {channel.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Note>
            Noise is scaled to the requested <em>conventional power SNR</em> and added
            in memory. The clean reference stays unmodified; nothing is written to the
            source dataset.
          </Note>
        </>
      )}

      {outside ? (
        <Note tone="danger">
          The segment ends beyond the record. Reduce the start time or duration.
        </Note>
      ) : null}
      {noiseOutside ? (
        <Note tone="danger">
          The noise segment ends beyond the noise record. Reduce the noise start or duration.
        </Note>
      ) : null}

      {showRecordInfo && selection.mode === "existing" && record ? (
        <div className="selection-info">
          <div className="selection-summary">
            <div className="item">
              <span className="label">Record</span>
              <span className="value">{record.record}</span>
            </div>
            <div className="item">
              <span className="label">Subject</span>
              <span className="value">{record.subject ?? "—"}</span>
            </div>
            <div className="item">
              <span className="label">fs</span>
              <span className="value">{fmt(record.fs, 0)} Hz</span>
            </div>
            <div className="item">
              <span className="label">Nominal SNR</span>
              <span className="value">
                {record.nominal_snr_db !== null ? `${record.nominal_snr_db > 0 ? "+" : ""}${record.nominal_snr_db} dB` : "—"}
              </span>
            </div>
            <div className="item">
              <span className="label">Beats annotated</span>
              <span className="value">{record.annotation_count.toLocaleString()}</span>
            </div>
            <div className="item">
              <span className="label">Clean reference</span>
              <span className="value">{record.has_reference ? record.reference_record : "not installed"}</span>
            </div>
          </div>
          <div style={{ marginTop: 12 }}>
            <div className="field-label" style={{ marginBottom: 6 }}>
              Measured noise activity · {record.activity_source}
            </div>
            <ActivityStrip
              values={activity}
              step={record.activity_step_s}
              current={selection.start}
              duration={selection.duration}
            />
          </div>
          <div className="selection-tags">
            {record.has_reference ? (
              <Pill tone="ok">Reference metrics enabled</Pill>
            ) : (
              <Pill tone="warn">No reference metrics</Pill>
            )}
            {record.nominal_snr_db !== null ? (
              <Pill tone="navy">NSTDB nominal {record.nominal_snr_db > 0 ? "+" : ""}{record.nominal_snr_db} dB</Pill>
            ) : null}
            <Pill>{record.channels.map((channel) => channel.name).join(" · ")}</Pill>
          </div>
        </div>
      ) : null}

      {showRecordInfo && selection.mode === "mix" ? (
        <div className="selection-info">
          <div className="selection-summary">
            <div className="item">
              <span className="label">Clean</span>
              <span className="value">MIT-BIH {selection.clean_record}</span>
            </div>
            <div className="item">
              <span className="label">Noise</span>
              <span className="value">
                {selection.noise_record.toUpperCase()} · {noise?.label ?? "—"}
              </span>
            </div>
            <div className="item">
              <span className="label">Target SNR</span>
              <span className="value">{selection.target_snr_db} dB</span>
            </div>
            <div className="item">
              <span className="label">fs</span>
              <span className="value">{fmt(fs, 0)} Hz</span>
            </div>
            <div className="item">
              <span className="label">Duration</span>
              <span className="value">{selection.duration} s</span>
            </div>
          </div>
          {noise ? <p className="field-hint" style={{ marginTop: 8 }}>{noise.description}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
