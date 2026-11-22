from __future__ import annotations

import csv
import io
import json
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import config

ID_RE = re.compile(r"^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$")


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _index_path() -> Path:
    return config.EXPERIMENTS_DIR / "index.json"


def _exp_path(exp_id: str) -> Path:
    if not ID_RE.fullmatch(exp_id):
        raise ValueError("Invalid experiment id.")
    return config.EXPERIMENTS_DIR / f"{exp_id}.json"


def _atomic_write(path: Path, payload: Any) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def _read_index() -> list[dict[str, Any]]:
    path = _index_path()
    if not path.is_file():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (OSError, json.JSONDecodeError):
        return []


def _winner(metrics: dict[str, Any]) -> str:
    inp = metrics.get("input")
    fir = metrics.get("fir")
    iir = metrics.get("iir")
    if not inp or not fir or not iir or inp.get("snr_db") is None:
        return "Not evaluated"
    fir_imp = fir["snr_db"] - inp["snr_db"]
    iir_imp = iir["snr_db"] - inp["snr_db"]
    if fir_imp > iir_imp + 0.05:
        return "FIR (SNR gain)"
    if iir_imp > fir_imp + 0.05:
        return "IIR (SNR gain)"
    if fir["rmse_mv"] < iir["rmse_mv"] * 0.98:
        return "FIR (RMSE)"
    if iir["rmse_mv"] < fir["rmse_mv"] * 0.98:
        return "IIR (RMSE)"
    return "Comparable"


def summary_from_result(result: dict[str, Any]) -> dict[str, Any]:
    metrics = result.get("metrics", {})
    processing = result.get("processing", {})
    selection = result.get("selection", {})
    inp = metrics.get("input") or {}
    fir = metrics.get("fir") or {}
    iir = metrics.get("iir") or {}
    fir_imp = (
        fir.get("snr_db") - inp.get("snr_db")
        if fir.get("snr_db") is not None and inp.get("snr_db") is not None
        else None
    )
    iir_imp = (
        iir.get("snr_db") - inp.get("snr_db")
        if iir.get("snr_db") is not None and inp.get("snr_db") is not None
        else None
    )
    return {
        "id": result["experiment_id"],
        "created_at": result["created_at"],
        "name": result.get("name") or "",
        "mode": selection.get("mode"),
        "record": result.get("record"),
        "channel": result.get("channel"),
        "start_s": result.get("start_s"),
        "duration_s": result.get("duration_s"),
        "target_snr_db": (result.get("mix") or {}).get("target_snr_db"),
        "input_snr_db": inp.get("snr_db"),
        "fir_snr_db": fir.get("snr_db"),
        "iir_snr_db": iir.get("snr_db"),
        "fir_improvement_db": fir_imp,
        "iir_improvement_db": iir_imp,
        "fir_rmse_mv": fir.get("rmse_mv"),
        "iir_rmse_mv": iir.get("rmse_mv"),
        "fir_total_ms": (processing.get("fir") or {}).get("total_time_ms"),
        "iir_total_ms": (processing.get("iir") or {}).get("total_time_ms"),
        "reference_available": result.get("reference_available", False),
        "winner": _winner(metrics),
    }


def save_experiment(result: dict[str, Any]) -> dict[str, Any]:
    config.ensure_dirs()
    exp_id = str(uuid.uuid4())
    created = _now()
    result = dict(result)
    result["experiment_id"] = exp_id
    result["created_at"] = created
    _atomic_write(_exp_path(exp_id), result)
    index = _read_index()
    index = [row for row in index if row.get("id") != exp_id]
    index.insert(0, summary_from_result(result))
    _atomic_write(_index_path(), index[:500])
    return result


def list_experiments() -> list[dict[str, Any]]:
    return sorted(_read_index(), key=lambda row: row.get("created_at", ""), reverse=True)


def get_experiment(exp_id: str) -> dict[str, Any]:
    path = _exp_path(exp_id)
    if not path.is_file():
        raise FileNotFoundError(f"Experiment {exp_id} was not found.")
    return json.loads(path.read_text(encoding="utf-8"))


def delete_experiment(exp_id: str) -> None:
    path = _exp_path(exp_id)
    if not path.is_file():
        raise FileNotFoundError(f"Experiment {exp_id} was not found.")
    path.unlink()
    index = [row for row in _read_index() if row.get("id") != exp_id]
    _atomic_write(_index_path(), index)


def _csv_bytes(rows: list[list[Any]]) -> bytes:
    buf = io.StringIO()
    writer = csv.writer(buf, lineterminator="\n")
    writer.writerows(rows)
    return buf.getvalue().encode("utf-8-sig")


def _fmt(value: Any) -> Any:
    if value is None:
        return ""
    if isinstance(value, float):
        return f"{value:.6g}"
    return value


def summary_csv(exp: dict[str, Any]) -> bytes:
    rows: list[list[Any]] = []
    rows.append(["ECG Filter Lab — experiment summary"])
    rows.append(["Experiment ID", exp.get("experiment_id")])
    rows.append(["Created (UTC)", exp.get("created_at")])
    rows.append(["Name", exp.get("name") or ""])
    rows.append(["Mode", exp.get("selection", {}).get("mode")])
    rows.append(["Record", exp.get("record")])
    rows.append(["Channel", exp.get("channel")])
    rows.append(["Segment start (s)", exp.get("start_s")])
    rows.append(["Duration (s)", exp.get("duration_s")])
    rows.append(["Sampling frequency (Hz)", exp.get("fs")])
    rows.append(["Reference available", exp.get("reference_available")])
    rows.append(["NSTDB nominal SNR (dB)", exp.get("nominal_snr_db")])
    rows.append(["NSTDB nominal SNR note", "nst-defined (QRS amplitude / frequency-weighted noise), not conventional power SNR"])
    if exp.get("mix"):
        rows.append([])
        rows.append(["Noise mixture"])
        for key, value in exp["mix"].items():
            rows.append([key, _fmt(value)])
    rows.append([])
    rows.append(["Filter designs"])
    rows.append(["Family", "Type", "Order", "Taps", "Effective order", "Cutoffs (Hz)", "Method/window", "Zero-phase", "Design ms", "Apply ms (median)"])
    for family in ("fir", "iir"):
        design = exp.get("filters", {}).get(family, {})
        cfg = design.get("config", {})
        processing = exp.get("processing", {}).get(family, {})
        cut = (
            f"{design.get('cutoff_low_hz') or ''}-{design.get('cutoff_high_hz') or ''}"
            if design.get("cutoff_low_hz") is not None or design.get("cutoff_high_hz") is not None
            else ""
        )
        method = cfg.get("window") if family == "fir" else cfg.get("iir_method")
        rows.append(
            [
                family.upper(),
                cfg.get("filter_type"),
                cfg.get("order"),
                design.get("taps"),
                design.get("effective_order"),
                cut,
                method,
                "yes",
                _fmt(processing.get("design_time_ms")),
                _fmt(processing.get("apply_time_ms")),
            ]
        )
    rows.append([])
    rows.append(["Metrics vs clean reference"])
    rows.append(["Signal", "SNR (dB)", "SNR improvement (dB)", "RMSE (mV)", "PRD (%)", "Correlation", "Noise reduction (%)"])
    for name in ("input", "fir", "iir"):
        m = exp.get("metrics", {}).get(name) or {}
        rows.append(
            [
                name.upper(),
                _fmt(m.get("snr_db")),
                _fmt((exp.get("improvements") or {}).get(name)),
                _fmt(m.get("rmse_mv")),
                _fmt(m.get("prd_percent")),
                _fmt(m.get("correlation")),
                _fmt((exp.get("noise_reduction_percent") or {}).get(name)),
            ]
        )
    rows.append([])
    rows.append(["Morphology preservation (median across annotated beats)"])
    rows.append(["Filter", "Window", "n beats", "Correlation", "RMSE (mV)", "Amplitude ratio", "Median |timing shift| (ms)", "R-peak preservation (%)"])
    morph = exp.get("morphology") or {}
    for family in ("fir", "iir"):
        entry = (morph.get("filters") or {}).get(family, {})
        for window in ("P", "QRS", "T"):
            m = entry.get(window, {})
            rows.append(
                [
                    family.upper(),
                    window,
                    m.get("n_beats"),
                    _fmt(m.get("correlation")),
                    _fmt(m.get("rmse_mv")),
                    _fmt(m.get("amplitude_ratio")),
                    _fmt(m.get("median_abs_timing_shift_ms")),
                    _fmt(m.get("r_peak_preservation_percent")),
                ]
            )
    rows.append([])
    rows.append(["Linear decomposition (noise suppression vs signal distortion)"])
    rows.append(
        [
            "Filter",
            "Noise suppression (dB)",
            "Input noise RMS (mV)",
            "Residual noise RMS (mV)",
            "Signal distortion RMSE (mV)",
            "Filtered-reference correlation",
        ]
    )
    for family in ("fir", "iir"):
        d = (exp.get("decomposition") or {}).get(family, {})
        rows.append(
            [
                family.upper(),
                _fmt(d.get("noise_suppression_db")),
                _fmt(d.get("input_noise_rms_mv")),
                _fmt(d.get("residual_noise_rms_mv")),
                _fmt(d.get("signal_distortion_rmse_mv")),
                _fmt(d.get("signal_distortion_correlation")),
            ]
        )
    rows.append([])
    rows.append(["Conclusions (generated from this run)"])
    for text in exp.get("conclusions", []):
        rows.append([text])
    rows.append([])
    rows.append(["Warnings"])
    for text in exp.get("warnings", []):
        rows.append([text])
    return _csv_bytes(rows)


def signals_csv(exp: dict[str, Any]) -> bytes:
    t = exp.get("time", [])
    start = float(exp.get("start_s") or 0.0)
    rows: list[list[Any]] = [
        ["absolute_time_s", "time_s", "reference_mv", "input_mv", "fir_mv", "iir_mv", "residual_input_mv", "residual_fir_mv", "residual_iir_mv"]
    ]
    arrays = {
        "reference": exp.get("reference") or [],
        "input": exp.get("input") or [],
        "fir": exp.get("fir") or [],
        "iir": exp.get("iir") or [],
        "residual_input": exp.get("residual_input") or [],
        "residual_fir": exp.get("residual_fir") or [],
        "residual_iir": exp.get("residual_iir") or [],
    }
    for i, tv in enumerate(t):
        rows.append(
            [
                _fmt(start + float(tv)),
                _fmt(float(tv)),
                *[_fmt(arr[i] if i < len(arr) else None) for arr in arrays.values()],
            ]
        )
    return _csv_bytes(rows)


def spectrum_csv(exp: dict[str, Any]) -> bytes:
    spec = exp.get("spectrum", {})
    freq = spec.get("freq_hz", [])
    psd = spec.get("psd_db", {})
    keys = ["reference", "input", "fir", "iir", "residual_input", "residual_fir", "residual_iir"]
    rows: list[list[Any]] = [["frequency_hz", *[f"{k}_psd_db" for k in keys]]]
    for i, f in enumerate(freq):
        rows.append([_fmt(f), *[_fmt((psd.get(k) or [None] * len(freq))[i] if i < len(psd.get(k) or []) else None) for k in keys]])
    return _csv_bytes(rows)


def response_csv(exp: dict[str, Any]) -> bytes:
    resp = exp.get("response", {})
    freq = resp.get("freq_hz", [])
    rows: list[list[Any]] = [
        ["frequency_hz", "fir_magnitude_db", "iir_magnitude_db", "fir_phase_deg", "iir_phase_deg", "fir_group_delay_ms", "iir_group_delay_ms"]
    ]
    fir = resp.get("fir", {})
    iir = resp.get("iir", {})
    for i, f in enumerate(freq):
        rows.append(
            [
                _fmt(f),
                _fmt((fir.get("magnitude_db") or [None] * len(freq))[i]),
                _fmt((iir.get("magnitude_db") or [None] * len(freq))[i]),
                _fmt((fir.get("phase_deg") or [None] * len(freq))[i]),
                _fmt((iir.get("phase_deg") or [None] * len(freq))[i]),
                _fmt((fir.get("group_delay_ms") or [None] * len(freq))[i]),
                _fmt((iir.get("group_delay_ms") or [None] * len(freq))[i]),
            ]
        )
    return _csv_bytes(rows)


def csv_filename(exp: dict[str, Any], suffix: str) -> str:
    record = re.sub(r"[^A-Za-z0-9_-]+", "_", str(exp.get("record") or "experiment"))
    stamp = str(exp.get("created_at") or "")[:19].replace(":", "").replace("-", "")
    return f"ecg_filter_lab_{record}_{stamp}_{suffix}.csv"
