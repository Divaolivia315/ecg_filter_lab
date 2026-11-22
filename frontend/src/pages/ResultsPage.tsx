import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, downloadUrl, exportUrl } from "../api";
import { SignalMetricsTable } from "../components/MetricTables";
import { ComparisonSignalChart } from "../components/SignalCharts";
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
import { formatApiError, useApp } from "../state";
import type { CompareResult, ExperimentSummary } from "../types";
import { fmt, fmtDate, fmtSigned } from "../utils";

export default function ResultsPage() {
  const { history, historyLoading, refreshHistory, setResult } = useApp();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .experiment(selectedId)
      .then((next) => {
        if (!cancelled) setDetail(next);
      })
      .catch((err) => {
        if (!cancelled) setError(formatApiError(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId && history.length) setSelectedId(history[0].id);
  }, [history, selectedId]);

  const remove = async (row: ExperimentSummary) => {
    if (!window.confirm(`Delete “${row.name}” permanently?`)) return;
    setDeleting(row.id);
    setError(null);
    try {
      await api.deleteExperiment(row.id);
      if (selectedId === row.id) {
        setSelectedId(null);
        setDetail(null);
      }
      await refreshHistory();
    } catch (err) {
      setError(formatApiError(err));
    } finally {
      setDeleting(null);
    }
  };

  const openEvaluation = () => {
    if (!detail) return;
    setResult(detail);
    navigate("/evaluation");
  };

  const withReference = history.filter((row) => row.reference_available);
  const bestFir = history.reduce<number | null>(
    (best, row) =>
      row.fir_improvement_db !== null && (best === null || row.fir_improvement_db > best)
        ? row.fir_improvement_db
        : best,
    null,
  );
  const bestIir = history.reduce<number | null>(
    (best, row) =>
      row.iir_improvement_db !== null && (best === null || row.iir_improvement_db > best)
        ? row.iir_improvement_db
        : best,
    null,
  );

  return (
    <div className="page">
      <PageHeader
        eyebrow="Archive"
        title="Experiment Results"
        lede="Saved runs are stored as individual JSON files with an index. Open a run to inspect its real waveforms and metrics, export CSV evidence, or delete it."
        actions={
          <>
            <button type="button" className="btn" onClick={() => void refreshHistory()}>
              Refresh
            </button>
            <Link className="btn btn-primary" to="/comparison">
              New comparison
            </Link>
          </>
        }
      />

      <LoadingLine visible={historyLoading || loading} />
      {error ? <Note tone="danger">{error}</Note> : null}

      <StatGrid>
        <Stat label="Saved experiments" value={history.length} note="Local JSON storage" />
        <Stat
          label="With clean reference"
          value={withReference.length}
          note="Reference-based metrics available"
        />
        <Stat
          label="Best FIR ΔSNR"
          value={bestFir === null ? "—" : `${fmtSigned(bestFir, 2)} dB`}
          note="Across saved runs"
        />
        <Stat
          label="Best IIR ΔSNR"
          value={bestIir === null ? "—" : `${fmtSigned(bestIir, 2)} dB`}
          note="Across saved runs"
        />
      </StatGrid>

      {history.length === 0 ? (
        <div style={{ marginTop: 18 }}>
          <EmptyState
            title="No saved experiments"
            actions={
              <Link className="btn btn-primary" to="/comparison">
                Run the first comparison
              </Link>
            }
          >
            Every comparison saved with “Save to history” appears here. The archive is stored in
            <span className="mono"> data/experiments</span> and survives page reloads.
          </EmptyState>
        </div>
      ) : (
        <div className="results-layout" style={{ marginTop: 18 }}>
          <Panel
            title="History"
            subtitle="Newest first. Select a row to inspect its stored result."
            bodyClassName="panel-body tight"
          >
            <div className="table-wrap">
              <table className="table history-table">
                <thead>
                  <tr>
                    <th>Experiment</th>
                    <th>Input</th>
                    <th>Input SNR</th>
                    <th>FIR Δ</th>
                    <th>IIR Δ</th>
                    <th>Outcome</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {history.map((row) => (
                    <tr
                      key={row.id}
                      className={selectedId === row.id ? "selected-row" : ""}
                      onClick={() => setSelectedId(row.id)}
                    >
                      <td>
                        <div className="row-label">{row.name}</div>
                        <div className="muted small">
                          {fmtDate(row.created_at)} · {row.record} · {row.channel} ·{" "}
                          {fmt(row.start_s, 0)}–{fmt(row.start_s + row.duration_s, 0)} s
                        </div>
                      </td>
                      <td>
                        <Pill>{row.mode === "mix" ? `Mix ${row.target_snr_db ?? ""} dB` : "NSTDB"}</Pill>
                      </td>
                      <td className="num">{fmt(row.input_snr_db, 2)}</td>
                      <td className="num">{fmtSigned(row.fir_improvement_db, 2)}</td>
                      <td className="num">{fmtSigned(row.iir_improvement_db, 2)}</td>
                      <td>
                        <Pill tone={row.winner.startsWith("FIR") ? "navy" : row.winner.startsWith("IIR") ? "warn" : "default"}>
                          {row.winner}
                        </Pill>
                      </td>
                      <td>
                        <div className="history-actions" onClick={(event) => event.stopPropagation()}>
                          <button
                            type="button"
                            className="btn btn-small"
                            onClick={() => setSelectedId(row.id)}
                          >
                            View
                          </button>
                          <button
                            type="button"
                            className="btn btn-small btn-danger"
                            onClick={() => void remove(row)}
                            disabled={deleting === row.id}
                          >
                            {deleting === row.id ? "…" : "Delete"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="grid">
            {detail ? (
              <>
                <Panel
                  title={detail.name}
                  subtitle={`${detail.record} · ${detail.channel} · ${fmt(
                    detail.start_s,
                    0,
                  )}–${fmt(detail.start_s + detail.duration_s, 0)} s · ${detail.saved ? "saved" : "unsaved"}`}
                  actions={
                    <>
                      <button type="button" className="btn btn-small" onClick={openEvaluation}>
                        Full evaluation
                      </button>
                      <button
                        type="button"
                        className="btn btn-small"
                        onClick={() => downloadUrl(exportUrl(detail.experiment_id!, "summary"))}
                      >
                        Summary CSV
                      </button>
                    </>
                  }
                >
                  <div className="selection-tags">
                    <Pill tone="navy">Input {fmt(detail.metrics.input?.snr_db, 2)} dB</Pill>
                    <Pill tone="navy">FIR {fmt(detail.metrics.fir?.snr_db, 2)} dB</Pill>
                    <Pill tone="navy">IIR {fmt(detail.metrics.iir?.snr_db, 2)} dB</Pill>
                    <Pill>{detail.filters.fir.config.filter_type} / {detail.filters.iir.config.filter_type}</Pill>
                    {detail.notes ? <Pill>Notes attached</Pill> : null}
                  </div>
                  {detail.notes ? (
                    <p className="small muted" style={{ marginBottom: 0 }}>
                      {detail.notes}
                    </p>
                  ) : null}
                  <div className="divider" />
                  <SignalMetricsTable result={detail} />
                  <div style={{ marginTop: 12 }}>
                    <ComparisonSignalChart result={detail} />
                  </div>
                  <div className="export-grid" style={{ marginTop: 12 }}>
                    {(["summary", "signals", "spectrum", "response"] as const).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        className="btn btn-small"
                        onClick={() => downloadUrl(exportUrl(detail.experiment_id!, kind))}
                      >
                        {kind[0].toUpperCase() + kind.slice(1)} CSV
                      </button>
                    ))}
                  </div>
                </Panel>

                <Panel title="Stored conclusions" subtitle="Exactly as generated at run time.">
                  <ul className="conclusion-list">
                    {detail.conclusions.map((conclusion) => (
                      <li key={conclusion}>{conclusion}</li>
                    ))}
                  </ul>
                </Panel>
              </>
            ) : (
              <EmptyState title="Select an experiment">
                Choose a row in the history table to load its stored waveforms, metrics and
                exports.
              </EmptyState>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
