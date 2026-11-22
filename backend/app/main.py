from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException, Query, Response
from fastapi.middleware.cors import CORSMiddleware

from . import config, dataset, experiments, filters, metrics
from .schemas import CompareRequest, FilterConfig, NoisePreviewRequest, ResponseRequest, SignalSelection

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger(__name__)

app = FastAPI(
    title="ECG Filter Lab API",
    version=config.APP_VERSION,
    description="Academic DSP application for FIR/IIR ECG denoising comparison on MIT-BIH NSTDB data.",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4173",
        "http://127.0.0.1:4173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _require_dataset() -> None:
    if config.DATASET_DIR is None:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "MIT-BIH Noise Stress Test Database not found.",
                "hint": "Set ECG_DATASET_DIR to the folder containing RECORDS and bw.hea.",
            },
        )


def _round_list(values: np.ndarray | list[float] | None, digits: int = 6) -> list[float] | None:
    if values is None:
        return None
    arr = np.asarray(values, dtype=float)
    return [round(float(v), digits) for v in arr]


def _fmt_time(seconds: float) -> str:
    minutes = int(seconds // 60)
    secs = seconds - minutes * 60
    return f"{minutes:02d}:{secs:04.1f}"


def _dedupe(items: list[str]) -> list[str]:
    seen = set()
    out = []
    for item in items:
        if item and item not in seen:
            seen.add(item)
            out.append(item)
    return out


def _strip_response(payload: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in payload.items() if key != "response"}


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "app_version": config.APP_VERSION,
        "dataset_found": config.DATASET_DIR is not None,
        "dataset_path": str(config.DATASET_DIR) if config.DATASET_DIR else None,
        "clean_reference_available": dataset.clean_reference_available(),
        "clean_reference_path": str(config.CLEAN_REF_DIR),
    }


@app.get("/api/dataset/summary")
def dataset_summary() -> dict[str, Any]:
    _require_dataset()
    try:
        return dataset.dataset_summary()
    except dataset.DatasetError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc


@app.get("/api/dataset/records")
def dataset_records() -> list[dict[str, Any]]:
    _require_dataset()
    try:
        index = dataset.get_index()
        return [dataset.record_metadata(record, index) for record in dataset.list_records()]
    except dataset.DatasetError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc


@app.get("/api/dataset/noises")
def dataset_noises() -> list[dict[str, Any]]:
    _require_dataset()
    try:
        index = dataset.get_index()
        return [dataset.noise_metadata(record, index) for record in dataset.list_noise_records()]
    except dataset.DatasetError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc


@app.get("/api/dataset/references")
def dataset_references() -> list[dict[str, Any]]:
    try:
        return [dataset.reference_metadata(record) for record in dataset.list_clean_references()]
    except dataset.DatasetError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc


@app.post("/api/dataset/rebuild-index")
def rebuild_index() -> dict[str, Any]:
    _require_dataset()
    index = dataset.build_dataset_index(force=True)
    return {"status": "ok", "built_at": index.get("built_at"), "records": len(index.get("records", {}))}


@app.post("/api/signal/preview")
def signal_preview(selection: SignalSelection) -> dict[str, Any]:
    _require_dataset()
    try:
        bundle = dataset.build_signal_bundle(selection)
    except dataset.DatasetError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc
    signals: dict[str, np.ndarray] = {"input": bundle["input"]}
    if bundle["reference"] is not None:
        signals["reference"] = bundle["reference"]
    try:
        spec = metrics.welch_spectrum(signals, bundle["fs"])
        spec.pop("psd_linear", None)
    except Exception as exc:  # spectral estimate is useful but not essential for preview
        log.warning("Preview spectrum failed: %s", exc)
        spec = {"freq_hz": [], "psd_db": {}}
    return {
        "selection": bundle["selection"],
        "mode": bundle["mode"],
        "record": bundle["record"],
        "channel": bundle["channel"],
        "start_s": bundle["start_s"],
        "duration_s": bundle["duration_s"],
        "fs": bundle["fs"],
        "time": _round_list(bundle["time"]),
        "input": _round_list(bundle["input"]),
        "reference": _round_list(bundle["reference"]),
        "input_stats": bundle["input_stats"],
        "reference_stats": bundle["reference_stats"],
        "offset_mv": bundle["offset_mv"],
        "means_mv": {
            "reference": float(np.mean(bundle["reference"])) if bundle["reference"] is not None else None,
            "input": float(np.mean(bundle["input"])),
        },
        "annotations": bundle["annotations"],
        "meta": bundle["meta"],
        "warnings": bundle["warnings"],
        "mix": bundle["mix"],
        "spectrum": spec,
    }


@app.post("/api/noise/preview")
def noise_preview(request: NoisePreviewRequest) -> dict[str, Any]:
    _require_dataset()
    try:
        bundle = dataset.load_noise_segment(
            request.record, request.channel, request.start, request.duration
        )
    except dataset.DatasetError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc
    try:
        spec = metrics.welch_spectrum({"noise": bundle["signal"]}, bundle["fs"])
        spec.pop("psd_linear", None)
    except Exception:
        spec = {"freq_hz": [], "psd_db": {}}
    return {
        **bundle,
        "time": _round_list(bundle["time"]),
        "signal": _round_list(bundle["signal"]),
        "spectrum": spec,
    }


@app.post("/api/filters/response")
def filter_response(request: ResponseRequest) -> dict[str, Any]:
    try:
        fir = filters.design_filter(request.fir, request.fs)
        iir = filters.design_filter(request.iir, request.fs)
    except filters.FilterValidationError as exc:
        raise HTTPException(
            status_code=422, detail={"errors": exc.errors, "warnings": exc.warnings}
        ) from exc
    return {
        "fs": request.fs,
        "fir": filters.design_payload(fir, request.fs),
        "iir": filters.design_payload(iir, request.fs),
    }


def _build_comparison(request: CompareRequest) -> dict[str, Any]:
    bundle = dataset.build_signal_bundle(request.selection)
    fs = float(bundle["fs"])
    input_signal = np.asarray(bundle["input"], dtype=np.float64)
    reference = bundle["reference"]
    n = input_signal.size

    fir_design = filters.design_filter(request.fir, fs, n_samples=n)
    iir_design = filters.design_filter(request.iir, fs, n_samples=n)
    fir_out, fir_apply_ms = filters.apply_filter(fir_design, input_signal)
    iir_out, iir_apply_ms = filters.apply_filter(iir_design, input_signal)

    reference_arr = np.asarray(reference, dtype=np.float64) if reference is not None else None
    warnings = list(bundle["warnings"])
    warnings.extend(fir_design.warnings)
    warnings.extend(iir_design.warnings)

    metrics_payload: dict[str, Any] = {}
    improvements: dict[str, float | None] = {"fir": None, "iir": None}
    noise_reduction: dict[str, float | None] = {"input": None, "fir": None, "iir": None}
    morphology_payload: dict[str, Any] | None = None
    decomposition: dict[str, Any] = {}

    if reference_arr is not None:
        metrics_payload["input"] = metrics.error_metrics(reference_arr, input_signal)
        metrics_payload["fir"] = metrics.error_metrics(reference_arr, fir_out)
        metrics_payload["iir"] = metrics.error_metrics(reference_arr, iir_out)
        input_snr = metrics_payload["input"].get("snr_db")
        for name in ("fir", "iir"):
            out_snr = metrics_payload[name].get("snr_db")
            if input_snr is not None and out_snr is not None:
                improvements[name] = float(out_snr - input_snr)
            inp_noise = metrics_payload["input"].get("noise_power_mv2")
            out_noise = metrics_payload[name].get("noise_power_mv2")
            if inp_noise and out_noise is not None and inp_noise > 0:
                noise_reduction[name] = float(100.0 * (1.0 - out_noise / inp_noise))
        # Linear decomposition: y - d = (H{d} - d) + H{input - d}.
        # This separates intended noise suppression from signal distortion.
        fir_ref, _ = filters.apply_filter(fir_design, reference_arr, repeats=1)
        iir_ref, _ = filters.apply_filter(iir_design, reference_arr, repeats=1)
        noise_input = input_signal - reference_arr
        for name, y, y_ref in (("fir", fir_out, fir_ref), ("iir", iir_out, iir_ref)):
            noise_out = y - y_ref
            distortion = y_ref - reference_arr
            ni = noise_input - float(np.mean(noise_input))
            no = noise_out - float(np.mean(noise_out))
            dist = distortion - float(np.mean(distortion))
            ni_power = float(np.mean(ni**2))
            no_power = float(np.mean(no**2))
            suppression = (
                10.0 * np.log10(ni_power / no_power) if ni_power > 0 and no_power > 0 else None
            )
            dist_rmse = float(np.sqrt(np.mean(dist**2)))
            dist_corr = (
                float(np.corrcoef(reference_arr, y_ref)[0, 1])
                if np.std(reference_arr) > 1e-12 and np.std(y_ref) > 1e-12
                else None
            )
            decomposition[name] = {
                "noise_suppression_db": float(suppression) if suppression is not None else None,
                "input_noise_rms_mv": float(np.sqrt(ni_power)),
                "residual_noise_rms_mv": float(np.sqrt(no_power)),
                "signal_distortion_rmse_mv": dist_rmse,
                "signal_distortion_correlation": dist_corr,
                "filtered_reference_mean_mv": float(np.mean(y_ref)),
            }
        morphology_payload = metrics.morphology_metrics(
            reference_arr, {"fir": fir_out, "iir": iir_out}, bundle["annotations"], fs
        )
    else:
        metrics_payload = {"input": None, "fir": None, "iir": None}
        morphology_payload = {
            "available": False,
            "reason": "No clean reference is installed for this record.",
            "windows": metrics.BEAT_WINDOWS,
            "filters": {},
        }

    signals: dict[str, np.ndarray] = {
        "input": input_signal,
        "fir": fir_out,
        "iir": iir_out,
    }
    if reference_arr is not None:
        signals["reference"] = reference_arr
        signals["residual_input"] = input_signal - reference_arr
        signals["residual_fir"] = fir_out - reference_arr
        signals["residual_iir"] = iir_out - reference_arr
    spectrum_payload: dict[str, Any] = {"freq_hz": [], "psd_db": {}}
    band_power_payload: dict[str, Any] = {}
    try:
        spec = metrics.welch_spectrum(signals, fs)
        band_power_payload = metrics.band_powers(spec["psd_linear"], np.asarray(spec["freq_hz"]))
        spec.pop("psd_linear", None)
        spectrum_payload = spec
    except Exception as exc:
        warnings.append(f"Spectral estimate unavailable: {exc}")

    fir_payload = filters.design_payload(fir_design, fs)
    iir_payload = filters.design_payload(iir_design, fs)
    response_payload = {
        "freq_hz": fir_payload["response"]["freq_hz"],
        "fir": fir_payload["response"],
        "iir": iir_payload["response"],
    }

    processing = {
        "fir": {
            "design_time_ms": fir_design.design_time_ms,
            "apply_time_ms": fir_apply_ms,
            "total_time_ms": fir_design.design_time_ms + fir_apply_ms,
        },
        "iir": {
            "design_time_ms": iir_design.design_time_ms,
            "apply_time_ms": iir_apply_ms,
            "total_time_ms": iir_design.design_time_ms + iir_apply_ms,
        },
    }
    conclusions = metrics.build_conclusions(
        metrics_payload,
        morphology_payload,
        processing,
        request.selection.model_dump(),
        bundle["meta"].get("nominal_snr_db"),
        decomposition,
    )

    start_s = float(bundle["start_s"])
    duration_s = float(bundle["duration_s"])
    auto_name = (
        f"{bundle['record']} · {bundle['channel']} · "
        f"{_fmt_time(start_s)}–{_fmt_time(start_s + duration_s)}"
    )
    result: dict[str, Any] = {
        "experiment_id": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "saved": False,
        "name": request.name.strip() if request.name and request.name.strip() else auto_name,
        "notes": request.notes or "",
        "selection": request.selection.model_dump(),
        "mode": bundle["mode"],
        "record": bundle["record"],
        "channel": bundle["channel"],
        "start_s": start_s,
        "duration_s": duration_s,
        "fs": fs,
        "reference_available": reference_arr is not None,
        "nominal_snr_db": bundle["meta"].get("nominal_snr_db"),
        "meta": bundle["meta"],
        "mix": bundle["mix"],
        "time": _round_list(bundle["time"]),
        "reference": _round_list(reference_arr),
        "input": _round_list(input_signal),
        "fir": _round_list(fir_out),
        "iir": _round_list(iir_out),
        "residual_input": (
            _round_list((input_signal - np.mean(input_signal)) - (reference_arr - np.mean(reference_arr)))
            if reference_arr is not None
            else None
        ),
        "residual_fir": (
            _round_list((fir_out - np.mean(fir_out)) - (reference_arr - np.mean(reference_arr)))
            if reference_arr is not None
            else None
        ),
        "residual_iir": (
            _round_list((iir_out - np.mean(iir_out)) - (reference_arr - np.mean(reference_arr)))
            if reference_arr is not None
            else None
        ),
        "means_mv": {
            "reference": float(np.mean(reference_arr)) if reference_arr is not None else None,
            "input": float(np.mean(input_signal)),
            "fir": float(np.mean(fir_out)),
            "iir": float(np.mean(iir_out)),
        },
        "annotations": bundle["annotations"],
        "offset_mv": bundle["offset_mv"],
        "alignment": {
            "input_offset_removed_mv": bundle["offset_mv"],
            "metric_alignment": "DC-invariant: each signal's mean is removed before error metrics",
            "display_alignment": "plots align each trace to the reference mean",
        },
        "metrics": metrics_payload,
        "improvements": improvements,
        "noise_reduction_percent": noise_reduction,
        "morphology": morphology_payload,
        "decomposition": decomposition,
        "spectrum": spectrum_payload,
        "band_power": band_power_payload,
        "response": response_payload,
        "filters": {
            "fir": _strip_response(fir_payload),
            "iir": _strip_response(iir_payload),
        },
        "processing": processing,
        "warnings": _dedupe(warnings),
        "conclusions": conclusions,
    }
    if request.save:
        result = experiments.save_experiment(result)
        result["saved"] = True
    return result


@app.post("/api/compare")
def compare(request: CompareRequest) -> dict[str, Any]:
    _require_dataset()
    if request.fir.family != "fir":
        raise HTTPException(status_code=422, detail={"errors": ["FIR configuration must have family='fir'."]})
    if request.iir.family != "iir":
        raise HTTPException(status_code=422, detail={"errors": ["IIR configuration must have family='iir'."]})
    try:
        return _build_comparison(request)
    except filters.FilterValidationError as exc:
        raise HTTPException(
            status_code=422, detail={"errors": exc.errors, "warnings": exc.warnings}
        ) from exc
    except dataset.DatasetError as exc:
        raise HTTPException(status_code=400, detail={"message": str(exc)}) from exc
    except Exception as exc:
        log.exception("Comparison failed")
        raise HTTPException(
            status_code=500,
            detail={"message": "Comparison failed.", "error": str(exc)},
        ) from exc


@app.get("/api/experiments")
def list_experiments() -> list[dict[str, Any]]:
    return experiments.list_experiments()


@app.get("/api/experiments/{exp_id}")
def get_experiment(exp_id: str) -> dict[str, Any]:
    try:
        return experiments.get_experiment(exp_id)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=404, detail={"message": str(exc)}) from exc


@app.delete("/api/experiments/{exp_id}")
def delete_experiment(exp_id: str) -> dict[str, Any]:
    try:
        experiments.delete_experiment(exp_id)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=404, detail={"message": str(exc)}) from exc
    return {"status": "deleted", "id": exp_id}


def _csv_response(content: bytes, filename: str) -> Response:
    return Response(
        content=content,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@app.get("/api/experiments/{exp_id}/summary.csv")
def export_summary(exp_id: str) -> Response:
    try:
        exp = experiments.get_experiment(exp_id)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=404, detail={"message": str(exc)}) from exc
    return _csv_response(experiments.summary_csv(exp), experiments.csv_filename(exp, "summary"))


@app.get("/api/experiments/{exp_id}/signals.csv")
def export_signals(exp_id: str) -> Response:
    try:
        exp = experiments.get_experiment(exp_id)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=404, detail={"message": str(exc)}) from exc
    return _csv_response(experiments.signals_csv(exp), experiments.csv_filename(exp, "signals"))


@app.get("/api/experiments/{exp_id}/spectrum.csv")
def export_spectrum(exp_id: str) -> Response:
    try:
        exp = experiments.get_experiment(exp_id)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=404, detail={"message": str(exc)}) from exc
    return _csv_response(experiments.spectrum_csv(exp), experiments.csv_filename(exp, "spectrum"))


@app.get("/api/experiments/{exp_id}/response.csv")
def export_response(exp_id: str) -> Response:
    try:
        exp = experiments.get_experiment(exp_id)
    except (FileNotFoundError, ValueError) as exc:
        raise HTTPException(status_code=404, detail={"message": str(exc)}) from exc
    return _csv_response(experiments.response_csv(exp), experiments.csv_filename(exp, "response"))


@app.get("/api/experiments/{exp_id}/export")
def export_kind(exp_id: str, kind: str = Query(default="summary")) -> Response:
    mapping = {
        "summary": export_summary,
        "signals": export_signals,
        "spectrum": export_spectrum,
        "response": export_response,
    }
    if kind not in mapping:
        raise HTTPException(status_code=400, detail={"message": f"Unknown export kind {kind!r}."})
    return mapping[kind](exp_id)
