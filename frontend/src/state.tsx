import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ApiError, api } from "./api";
import type {
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

const DEFAULT_SELECTION: SignalSelection = {
  mode: "existing",
  record: "118e06",
  clean_record: "118",
  noise_record: "em",
  channel: "MLII",
  noise_channel: 0,
  start: 545,
  duration: 10,
  target_snr_db: 6,
  noise_start: 550,
};

const DEFAULT_FIR: FilterConfig = {
  family: "fir",
  filter_type: "bandpass",
  order: 128,
  cutoff: null,
  cutoff_low: 0.5,
  cutoff_high: 40,
  window: "hamming",
  kaiser_beta: 8.6,
  iir_method: "butterworth",
  ripple_db: 1,
  attenuation_db: 40,
  notch_q: 30,
};

const DEFAULT_IIR: FilterConfig = {
  ...DEFAULT_FIR,
  family: "iir",
  order: 4,
  iir_method: "butterworth",
};

const LS_KEY = "ecg-filter-lab:v1";

interface Persisted {
  selection: SignalSelection;
  fir: FilterConfig;
  iir: FilterConfig;
}

function readPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) throw new Error("empty");
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      selection: { ...DEFAULT_SELECTION, ...(parsed.selection || {}) },
      fir: { ...DEFAULT_FIR, ...(parsed.fir || {}), family: "fir" },
      iir: { ...DEFAULT_IIR, ...(parsed.iir || {}), family: "iir" },
    };
  } catch {
    return { selection: DEFAULT_SELECTION, fir: DEFAULT_FIR, iir: DEFAULT_IIR };
  }
}

export function formatApiError(error: unknown): string {
  if (error instanceof ApiError) {
    const detail = error.detail;
    if (typeof detail === "string") return detail;
    if (detail.errors?.length) return detail.errors.join(" ");
    if (detail.message) return detail.message;
    if (detail.error) return detail.error;
  }
  if (error instanceof Error) return error.message;
  return "Unexpected error.";
}

interface AppContextValue {
  dataset: DatasetSummary | null;
  records: RecordMeta[];
  noises: NoiseMeta[];
  references: ReferenceMeta[];
  dataLoading: boolean;
  dataError: string | null;
  reloadData: () => Promise<void>;
  selection: SignalSelection;
  setSelection: (next: SignalSelection | ((prev: SignalSelection) => SignalSelection)) => void;
  selectedRecord: RecordMeta | null;
  fir: FilterConfig;
  setFir: (next: FilterConfig | ((prev: FilterConfig) => FilterConfig)) => void;
  iir: FilterConfig;
  setIir: (next: FilterConfig | ((prev: FilterConfig) => FilterConfig)) => void;
  preview: SignalPreview | null;
  previewLoading: boolean;
  previewError: string | null;
  refreshPreview: () => Promise<void>;
  result: CompareResult | null;
  setResult: (result: CompareResult | null) => void;
  running: boolean;
  runError: string | null;
  runComparison: (options?: { name?: string; notes?: string; save?: boolean }) => Promise<CompareResult>;
  history: ExperimentSummary[];
  historyLoading: boolean;
  refreshHistory: () => Promise<void>;
  resetExperiment: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const persisted = useRef(readPersisted());
  const [dataset, setDataset] = useState<DatasetSummary | null>(null);
  const [records, setRecords] = useState<RecordMeta[]>([]);
  const [noises, setNoises] = useState<NoiseMeta[]>([]);
  const [references, setReferences] = useState<ReferenceMeta[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const [selection, setSelectionState] = useState<SignalSelection>(persisted.current.selection);
  const [fir, setFirState] = useState<FilterConfig>(persisted.current.fir);
  const [iir, setIirState] = useState<FilterConfig>(persisted.current.iir);
  const [preview, setPreview] = useState<SignalPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [result, setResult] = useState<CompareResult | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [history, setHistory] = useState<ExperimentSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const requestSeq = useRef(0);

  const setSelection = useCallback(
    (next: SignalSelection | ((prev: SignalSelection) => SignalSelection)) => {
      setSelectionState((prev) => (typeof next === "function" ? next(prev) : next));
    },
    [],
  );
  const setFir = useCallback(
    (next: FilterConfig | ((prev: FilterConfig) => FilterConfig)) => {
      setFirState((prev) => (typeof next === "function" ? next(prev) : next));
    },
    [],
  );
  const setIir = useCallback(
    (next: FilterConfig | ((prev: FilterConfig) => FilterConfig)) => {
      setIirState((prev) => (typeof next === "function" ? next(prev) : next));
    },
    [],
  );

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      setHistory(await api.experiments());
    } catch {
      setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const reloadData = useCallback(async () => {
    setDataLoading(true);
    setDataError(null);
    try {
      const [summary, recs, ns, refs] = await Promise.all([
        api.summary(),
        api.records(),
        api.noises(),
        api.references(),
      ]);
      setDataset(summary);
      setRecords(recs);
      setNoises(ns);
      setReferences(refs);
      setSelectionState((prev) => {
        const record = recs.find((r) => r.record === prev.record) ?? recs[0];
        if (!record) return prev;
        const channel = record.channels.some((c) => c.name === prev.channel)
          ? prev.channel
          : record.channels[0]?.name ?? prev.channel;
        const recommended = record.recommended?.[channel] ?? prev.start;
        return {
          ...prev,
          record: record.record,
          channel,
          start: prev.record === record.record && prev.channel === channel ? prev.start : recommended,
        };
      });
      await refreshHistory();
    } catch (error) {
      setDataError(formatApiError(error));
    } finally {
      setDataLoading(false);
    }
  }, [refreshHistory]);

  useEffect(() => {
    void reloadData();
  }, [reloadData]);

  useEffect(() => {
    const payload: Persisted = { selection, fir, iir };
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(payload));
    } catch {
      /* storage may be unavailable */
    }
  }, [selection, fir, iir]);

  const selectedRecord = useMemo(
    () => records.find((r) => r.record === selection.record) ?? null,
    [records, selection.record],
  );

  const refreshPreview = useCallback(async () => {
    if (!dataset) return;
    const seq = ++requestSeq.current;
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const next = await api.previewSignal(selection);
      if (seq === requestSeq.current) setPreview(next);
    } catch (error) {
      if (seq === requestSeq.current) {
        setPreview(null);
        setPreviewError(formatApiError(error));
      }
    } finally {
      if (seq === requestSeq.current) setPreviewLoading(false);
    }
  }, [dataset, selection]);

  useEffect(() => {
    if (!dataset) return;
    const handle = window.setTimeout(() => {
      void refreshPreview();
    }, 450);
    return () => window.clearTimeout(handle);
  }, [dataset, refreshPreview]);

  const runComparison = useCallback(
    async (options?: { name?: string; notes?: string; save?: boolean }) => {
      setRunning(true);
      setRunError(null);
      try {
        const next = await api.compare({
          selection,
          fir,
          iir,
          name: options?.name,
          notes: options?.notes,
          save: options?.save ?? true,
        });
        setResult(next);
        if (next.saved) await refreshHistory();
        return next;
      } catch (error) {
        setRunError(formatApiError(error));
        throw error;
      } finally {
        setRunning(false);
      }
    },
    [selection, fir, iir, refreshHistory],
  );

  const resetExperiment = useCallback(() => {
    setResult(null);
    setRunError(null);
  }, []);

  const value: AppContextValue = {
    dataset,
    records,
    noises,
    references,
    dataLoading,
    dataError,
    reloadData,
    selection,
    setSelection,
    selectedRecord,
    fir,
    setFir,
    iir,
    setIir,
    preview,
    previewLoading,
    previewError,
    refreshPreview,
    result,
    setResult,
    running,
    runError,
    runComparison,
    history,
    historyLoading,
    refreshHistory,
    resetExperiment,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}
