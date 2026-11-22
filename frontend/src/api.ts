import type {
  ApiErrorDetail,
  CompareResult,
  DatasetSummary,
  ExperimentSummary,
  FilterConfig,
  NoiseMeta,
  RecordMeta,
  ReferenceMeta,
  SignalPreview,
  SignalSelection,
} from "./types";

export class ApiError extends Error {
  detail: ApiErrorDetail | string;
  status: number;

  constructor(status: number, detail: ApiErrorDetail | string) {
    const message =
      typeof detail === "string"
        ? detail
        : detail.message || detail.error || detail.errors?.join(" ") || `Request failed (${status})`;
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  if (!response.ok) {
    let detail: ApiErrorDetail | string = `Request failed (${response.status})`;
    try {
      const body = await response.json();
      detail = body.detail ?? body;
    } catch {
      try {
        detail = await response.text();
      } catch {
        /* keep default */
      }
    }
    throw new ApiError(response.status, detail);
  }
  return (await response.json()) as T;
}

export const api = {
  health: () =>
    apiFetch<{
      status: string;
      app_version: string;
      dataset_found: boolean;
      dataset_path: string | null;
      clean_reference_available: boolean;
      clean_reference_path: string;
    }>("/api/health"),

  summary: () => apiFetch<DatasetSummary>("/api/dataset/summary"),
  records: () => apiFetch<RecordMeta[]>("/api/dataset/records"),
  noises: () => apiFetch<NoiseMeta[]>("/api/dataset/noises"),
  references: () => apiFetch<ReferenceMeta[]>("/api/dataset/references"),

  previewSignal: (selection: SignalSelection) =>
    apiFetch<SignalPreview>("/api/signal/preview", {
      method: "POST",
      body: JSON.stringify(selection),
    }),

  previewNoise: (payload: { record: string; channel: number; start: number; duration: number }) =>
    apiFetch<{
      record: string;
      label: string;
      channel: string;
      start_s: number;
      duration_s: number;
      fs: number;
      time: number[];
      signal: number[];
      stats: Record<string, number>;
      spectrum: { freq_hz: number[]; psd_db: Record<string, number[]> };
    }>("/api/noise/preview", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  filterResponse: (fir: FilterConfig, iir: FilterConfig, fs = 360) =>
    apiFetch<{
      fs: number;
      fir: import("./types").FilterDesign;
      iir: import("./types").FilterDesign;
    }>("/api/filters/response", {
      method: "POST",
      body: JSON.stringify({ fir, iir, fs }),
    }),

  compare: (payload: {
    selection: SignalSelection;
    fir: FilterConfig;
    iir: FilterConfig;
    name?: string;
    notes?: string;
    save?: boolean;
  }) =>
    apiFetch<CompareResult>("/api/compare", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  experiments: () => apiFetch<ExperimentSummary[]>("/api/experiments"),
  experiment: (id: string) => apiFetch<CompareResult>(`/api/experiments/${id}`),
  deleteExperiment: (id: string) =>
    apiFetch<{ status: string; id: string }>(`/api/experiments/${id}`, { method: "DELETE" }),
  rebuildIndex: () =>
    apiFetch<{ status: string; built_at: string; records: number }>("/api/dataset/rebuild-index", {
      method: "POST",
    }),
};

export function exportUrl(id: string, kind: "summary" | "signals" | "spectrum" | "response"): string {
  return `/api/experiments/${id}/${kind}.csv`;
}

export function downloadUrl(url: string, filename?: string): void {
  const anchor = document.createElement("a");
  anchor.href = url;
  if (filename) anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}
