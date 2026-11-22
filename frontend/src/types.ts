export type Mode = "existing" | "mix";
export type FilterType = "lowpass" | "highpass" | "bandpass" | "notch";
export type FilterFamily = "fir" | "iir";
export type FIRWindow = "hamming" | "blackman" | "hanning" | "bartlett" | "kaiser";
export type IIRMethod = "butterworth" | "chebyshev1" | "chebyshev2" | "elliptic";

export interface SignalSelection {
  mode: Mode;
  record: string;
  clean_record: string;
  noise_record: string;
  channel: string;
  noise_channel: number;
  start: number;
  duration: number;
  target_snr_db: number;
  noise_start: number;
}

export interface FilterConfig {
  family: FilterFamily;
  filter_type: FilterType;
  order: number;
  cutoff: number | null;
  cutoff_low: number | null;
  cutoff_high: number | null;
  window: FIRWindow;
  kaiser_beta: number;
  iir_method: IIRMethod;
  ripple_db: number;
  attenuation_db: number;
  notch_q: number;
}

export interface ChannelMeta {
  name: string;
  index: number;
  units: string;
}

export interface NoiseSegment {
  start_s: number;
  end_s: number;
  mean_rms_mv: number | null;
  peak_rms_mv: number | null;
  source: string;
}

export interface RecordMeta {
  record: string;
  subject: string | null;
  nominal_snr_db: number | null;
  fs: number;
  sig_len: number;
  duration_s: number;
  channels: ChannelMeta[];
  has_reference: boolean;
  reference_record: string | null;
  annotation_count: number;
  activity: Record<string, number[]>;
  noise_segments: Record<string, NoiseSegment[]>;
  recommended: Record<string, number>;
  activity_step_s: number;
  activity_source: string;
  comments: string[];
}

export interface NoiseMeta {
  record: string;
  label: string;
  description: string;
  fs: number;
  sig_len: number;
  duration_s: number;
  channels: ChannelMeta[];
  activity: Record<string, number[]>;
  activity_step_s: number;
  summary: Record<string, { rms_mv: number; peak_mv: number; recommended_start_s: number }>;
}

export interface ReferenceMeta {
  record: string;
  fs: number;
  sig_len: number;
  duration_s: number;
  channels: ChannelMeta[];
  annotation_count: number;
  source: { database: string; base_url: string; records: string[] };
}

export interface DatasetSummary {
  dataset_path: string;
  clean_reference_path: string;
  clean_reference_available: boolean;
  clean_references: string[];
  record_count: number;
  noise_count: number;
  fs: number;
  duration_s: number;
  channels: string[];
  noise_types: { record: string; label: string }[];
  limitations: string[];
  reference_source: { database: string; base_url: string; records: string[] };
  old_subfolder: string;
  app_version: string;
}

export interface Annotation {
  sample: number;
  time_s: number;
  absolute_s: number;
  symbol: string;
}

export interface SignalStats {
  rms_mv: number;
  std_mv: number;
  mean_mv: number;
  min_mv: number;
  max_mv: number;
  peak_to_peak_mv: number;
}

export interface MixInfo {
  clean_record: string;
  noise_record: string;
  noise_label: string;
  noise_channel: number;
  noise_start_s: number;
  target_snr_db: number;
  achieved_snr_db: number;
  noise_scale: number;
  noise_rms_mv: number;
}

export interface Spectrum {
  freq_hz: number[];
  psd_db: Record<string, number[]>;
}

export interface SignalPreview {
  selection: SignalSelection;
  mode: Mode;
  record: string;
  channel: string;
  start_s: number;
  duration_s: number;
  fs: number;
  time: number[];
  input: number[];
  reference: number[] | null;
  input_stats: SignalStats;
  reference_stats: SignalStats | null;
  offset_mv: number;
  means_mv: { reference: number | null; input: number };
  annotations: Annotation[];
  meta: RecordMeta;
  warnings: string[];
  mix: MixInfo | null;
  spectrum: Spectrum;
}

export interface ErrorMetrics {
  snr_db: number | null;
  rmse_mv: number;
  prd_percent: number | null;
  correlation: number | null;
  signal_power_mv2: number;
  noise_power_mv2: number;
  noise_rms_mv: number;
  reference_rms_mv: number;
  n_samples: number;
}

export interface MorphWindow {
  available: boolean;
  n_beats: number;
  correlation: number | null;
  rmse_mv: number | null;
  amplitude_ratio: number | null;
  median_abs_timing_shift_ms?: number;
  r_peak_preservation_percent?: number;
  n_timing_beats?: number;
}

export interface Morphology {
  available: boolean;
  reason?: string;
  windows: Record<string, { start_ms: number; end_ms: number }>;
  filters: Record<string, Record<string, MorphWindow>>;
}

export interface Decomposition {
  noise_suppression_db: number | null;
  input_noise_rms_mv: number;
  residual_noise_rms_mv: number;
  signal_distortion_rmse_mv: number;
  signal_distortion_correlation: number | null;
  filtered_reference_mean_mv: number;
}

export interface FilterResponse {
  freq_hz: number[];
  magnitude_db: number[];
  phase_deg: number[];
  group_delay_ms: number[];
}

export interface FilterDesign {
  family: FilterFamily;
  config: FilterConfig;
  taps: number | null;
  effective_order: number;
  cutoff_low_hz: number | null;
  cutoff_high_hz: number | null;
  center_hz: number | null;
  bandwidth_hz: number | null;
  group_delay_samples: number | null;
  group_delay_ms: number | null;
  design_time_ms: number;
  notes: string[];
  warnings: string[];
  response?: FilterResponse;
}

export interface Processing {
  design_time_ms: number;
  apply_time_ms: number;
  total_time_ms: number;
}

export interface BandPowerEntry {
  power_mv2: number | null;
  percent: number | null;
}

export interface CompareResult {
  experiment_id: string | null;
  created_at: string;
  saved: boolean;
  name: string;
  notes: string;
  selection: SignalSelection;
  mode: Mode;
  record: string;
  channel: string;
  start_s: number;
  duration_s: number;
  fs: number;
  reference_available: boolean;
  nominal_snr_db: number | null;
  meta: RecordMeta;
  mix: MixInfo | null;
  time: number[];
  reference: number[] | null;
  input: number[];
  fir: number[];
  iir: number[];
  residual_input: number[] | null;
  residual_fir: number[] | null;
  residual_iir: number[] | null;
  means_mv: { reference: number | null; input: number; fir: number; iir: number };
  annotations: Annotation[];
  offset_mv: number;
  alignment: {
    input_offset_removed_mv: number;
    metric_alignment: string;
    display_alignment: string;
  };
  metrics: {
    input: ErrorMetrics | null;
    fir: ErrorMetrics | null;
    iir: ErrorMetrics | null;
  };
  improvements: { fir: number | null; iir: number | null };
  noise_reduction_percent: { input: number | null; fir: number | null; iir: number | null };
  morphology: Morphology;
  decomposition: Record<string, Decomposition>;
  spectrum: Spectrum;
  band_power: Record<string, Record<string, BandPowerEntry>>;
  response: {
    freq_hz: number[];
    fir: FilterResponse;
    iir: FilterResponse;
  };
  filters: { fir: FilterDesign; iir: FilterDesign };
  processing: { fir: Processing; iir: Processing };
  warnings: string[];
  conclusions: string[];
}

export interface ExperimentSummary {
  id: string;
  created_at: string;
  name: string;
  mode: Mode;
  record: string;
  channel: string;
  start_s: number;
  duration_s: number;
  target_snr_db: number | null;
  input_snr_db: number | null;
  fir_snr_db: number | null;
  iir_snr_db: number | null;
  fir_improvement_db: number | null;
  iir_improvement_db: number | null;
  fir_rmse_mv: number | null;
  iir_rmse_mv: number | null;
  fir_total_ms: number | null;
  iir_total_ms: number | null;
  reference_available: boolean;
  winner: string;
}

export interface ApiErrorDetail {
  message?: string;
  errors?: string[];
  warnings?: string[];
  error?: string;
  hint?: string;
}
