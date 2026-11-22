import type { FilterConfig, FilterFamily, FilterType, FIRWindow, IIRMethod } from "../types";

const FILTER_TYPES: { value: FilterType; label: string }[] = [
  { value: "lowpass", label: "Low-pass" },
  { value: "highpass", label: "High-pass" },
  { value: "bandpass", label: "Band-pass" },
  { value: "notch", label: "Notch" },
];

const WINDOWS: { value: FIRWindow; label: string }[] = [
  { value: "hamming", label: "Hamming" },
  { value: "blackman", label: "Blackman" },
  { value: "hanning", label: "Hann" },
  { value: "bartlett", label: "Bartlett" },
  { value: "kaiser", label: "Kaiser" },
];

const IIR_METHODS: { value: IIRMethod; label: string }[] = [
  { value: "butterworth", label: "Butterworth" },
  { value: "chebyshev1", label: "Chebyshev I" },
  { value: "chebyshev2", label: "Chebyshev II" },
  { value: "elliptic", label: "Elliptic" },
];

interface Preset {
  label: string;
  patch: Partial<FilterConfig>;
}

const PRESETS: Preset[] = [
  {
    label: "ECG 0.5–40 Hz",
    patch: { filter_type: "bandpass", cutoff_low: 0.5, cutoff_high: 40, cutoff: 0.5 },
  },
  {
    label: "ECG 0.5–45 Hz",
    patch: { filter_type: "bandpass", cutoff_low: 0.5, cutoff_high: 45, cutoff: 0.5 },
  },
  {
    label: "Baseline < 0.5 Hz",
    patch: { filter_type: "highpass", cutoff: 0.5 },
  },
  {
    label: "Muscle > 40 Hz",
    patch: { filter_type: "lowpass", cutoff: 40 },
  },
  {
    label: "Notch 50 Hz",
    patch: { filter_type: "notch", cutoff: 50, notch_q: 30 },
  },
  {
    label: "Notch 60 Hz",
    patch: { filter_type: "notch", cutoff: 60, notch_q: 30 },
  },
];

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.1,
  hint,
  unit,
}: {
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  hint?: string;
  unit?: string;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <span className="range-row">
        <input
          className="input mono"
          type="number"
          value={value ?? ""}
          min={min}
          max={max}
          step={step}
          onChange={(event) => {
            const raw = event.target.value;
            onChange(raw === "" ? null : Number(raw));
          }}
        />
        {unit ? <span className="muted small">{unit}</span> : null}
      </span>
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export default function FilterEditor({
  family,
  config,
  onChange,
  fs,
  errors,
}: {
  family: FilterFamily;
  config: FilterConfig;
  onChange: (next: FilterConfig) => void;
  fs: number;
  errors?: string[];
}) {
  const nyquist = fs / 2;
  const update = (patch: Partial<FilterConfig>) => onChange({ ...config, ...patch });
  const isFir = family === "fir";

  return (
    <div className="filter-editor">
      <div className="filter-editor-head">
        <div>
          <div className="filter-family">{isFir ? "FIR" : "IIR"}</div>
          <div className="field-hint">
            {isFir
              ? "Linear phase · window method · order = taps − 1"
              : "Recursive · IIR · second-order sections"}
          </div>
        </div>
        <span className="pill navy">{isFir ? "Window design" : config.iir_method}</span>
      </div>

      <div className="inline-fields three" style={{ marginTop: 14 }}>
        <label className="field">
          <span className="field-label">Response</span>
          <select
            className="select"
            value={config.filter_type}
            onChange={(event) => {
              const type = event.target.value as FilterType;
              const patch: Partial<FilterConfig> = { filter_type: type };
              if (type === "lowpass" && config.cutoff === null) patch.cutoff = config.cutoff_high ?? 40;
              if (type === "highpass" && config.cutoff === null) patch.cutoff = config.cutoff_low ?? 0.5;
              if (type === "notch" && config.cutoff === null) patch.cutoff = 50;
              update(patch);
            }}
          >
            {FILTER_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span className="field-label">Order</span>
          <input
            className="input mono"
            type="number"
            min={isFir ? 4 : 1}
            max={isFir ? 1024 : 12}
            step={1}
            value={config.order}
            onChange={(event) => update({ order: Number(event.target.value) })}
          />
          <span className="field-hint">
            {isFir ? `≈ ${config.order + 1} taps` : "1–12"}
          </span>
        </label>

        <div className="field">
          <span className="field-label">Nyquist</span>
          <div className="readout mono">{nyquist.toFixed(1)} Hz</div>
          <span className="field-hint">fs = {fs.toFixed(0)} Hz</span>
        </div>
      </div>

      {config.filter_type === "bandpass" ? (
        <div className="inline-fields" style={{ marginTop: 10 }}>
          <NumberField
            label="Low cutoff"
            value={config.cutoff_low}
            onChange={(value) => update({ cutoff_low: value })}
            min={0.01}
            max={nyquist}
            unit="Hz"
          />
          <NumberField
            label="High cutoff"
            value={config.cutoff_high}
            onChange={(value) => update({ cutoff_high: value })}
            min={0.01}
            max={nyquist}
            unit="Hz"
            hint="Must stay below Nyquist."
          />
        </div>
      ) : (
        <div className="inline-fields" style={{ marginTop: 10 }}>
          <NumberField
            label={config.filter_type === "notch" ? "Centre frequency" : "Cutoff"}
            value={config.cutoff}
            onChange={(value) => update({ cutoff: value })}
            min={0.01}
            max={nyquist}
            unit="Hz"
            hint={
              config.filter_type === "notch"
                ? "Common mains frequencies: 50 or 60 Hz."
                : "Must satisfy 0 < cutoff < Nyquist."
            }
          />
          {config.filter_type === "notch" ? (
            <NumberField
              label="Quality factor Q"
              value={config.notch_q}
              onChange={(value) => update({ notch_q: value ?? 30 })}
              min={0.5}
              max={200}
              step={1}
              hint="Higher Q gives a narrower notch."
            />
          ) : (
            <div className="field">
              <span className="field-label">Interpretation</span>
              <div className="field-hint" style={{ paddingTop: 7 }}>
                {config.filter_type === "lowpass"
                  ? "Keeps frequencies below the cutoff. Useful for high-frequency muscle noise."
                  : "Keeps frequencies above the cutoff. Useful for baseline wander."}
              </div>
            </div>
          )}
        </div>
      )}

      {isFir ? (
        <div className="inline-fields" style={{ marginTop: 10 }}>
          <label className="field">
            <span className="field-label">Window</span>
            <select
              className="select"
              value={config.window}
              onChange={(event) => update({ window: event.target.value as FIRWindow })}
            >
              {WINDOWS.map((window) => (
                <option key={window.value} value={window.value}>
                  {window.label}
                </option>
              ))}
            </select>
          </label>
          {config.window === "kaiser" ? (
            <NumberField
              label="Kaiser β"
              value={config.kaiser_beta}
              onChange={(value) => update({ kaiser_beta: value ?? 8.6 })}
              min={0}
              max={20}
              step={0.1}
            />
          ) : (
            <div className="field">
              <span className="field-label">Causal delay</span>
              <div className="readout mono">
                {(((config.order + 1) / 2) / fs * 1000).toFixed(1)} ms
              </div>
              <span className="field-hint">Cancelled by zero-phase filtering.</span>
            </div>
          )}
        </div>
      ) : (
        <div className="inline-fields" style={{ marginTop: 10 }}>
          <label className="field">
            <span className="field-label">Design method</span>
            <select
              className="select"
              value={config.iir_method}
              onChange={(event) => update({ iir_method: event.target.value as IIRMethod })}
            >
              {IIR_METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </select>
          </label>
          {config.iir_method === "butterworth" ? (
            <div className="field">
              <span className="field-label">Shape</span>
              <div className="field-hint" style={{ paddingTop: 7 }}>
                Maximally flat passband; monotonic roll-off.
              </div>
            </div>
          ) : (
            <div className="inline-fields">
              {config.iir_method !== "chebyshev2" ? (
                <NumberField
                  label="Pass ripple"
                  value={config.ripple_db}
                  onChange={(value) => update({ ripple_db: value ?? 1 })}
                  min={0.01}
                  max={10}
                  step={0.1}
                  unit="dB"
                />
              ) : null}
              {config.iir_method !== "chebyshev1" ? (
                <NumberField
                  label="Stop attenuation"
                  value={config.attenuation_db}
                  onChange={(value) => update({ attenuation_db: value ?? 40 })}
                  min={1}
                  max={120}
                  step={1}
                  unit="dB"
                />
              ) : null}
            </div>
          )}
        </div>
      )}

      <div className="preset-row" style={{ marginTop: 14 }}>
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="btn btn-small"
            onClick={() => update(preset.patch)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      {errors && errors.length ? (
        <div className="toast-error" style={{ marginTop: 12 }}>
          {errors.map((error) => (
            <div key={error}>{error}</div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
