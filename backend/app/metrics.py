from __future__ import annotations

import math
from typing import Any

import numpy as np
from scipy import signal


def _finite_or_none(value: float | None) -> float | None:
    if value is None:
        return None
    value = float(value)
    return value if math.isfinite(value) else None


def basic_stats(x: np.ndarray) -> dict[str, float]:
    x = np.asarray(x, dtype=np.float64)
    return {
        "mean_mv": float(np.mean(x)),
        "std_mv": float(np.std(x)),
        "rms_mv": float(np.sqrt(np.mean(x**2))),
        "min_mv": float(np.min(x)),
        "max_mv": float(np.max(x)),
        "peak_to_peak_mv": float(np.max(x) - np.min(x)),
    }


def error_metrics(reference: np.ndarray, estimate: np.ndarray) -> dict[str, Any]:
    """Conventional reference-based error metrics.

    SNR uses the power of the zero-mean reference divided by the power of the
    zero-mean error.  Removing each signal's mean makes the metrics invariant to
    non-physiological constant DC offsets (which the filters may legitimately
    remove); slow baseline drift is still measured as an error.  This is
    deliberately not called "NSTDB SNR": nst uses a QRS-amplitude and
    frequency-weighted noise definition.
    """
    reference = np.asarray(reference, dtype=np.float64)
    estimate = np.asarray(estimate, dtype=np.float64)
    n = min(reference.size, estimate.size)
    reference = reference[:n]
    estimate = estimate[:n]
    if n == 0:
        raise ValueError("Empty signal.")
    reference = reference - float(np.mean(reference))
    estimate = estimate - float(np.mean(estimate))
    error = estimate - reference
    signal_power = float(np.mean(reference**2))
    noise_power = float(np.mean(error**2))
    rmse = float(np.sqrt(noise_power))
    ref_energy = float(np.sum(reference**2))
    prd = 100.0 * math.sqrt(float(np.sum(error**2)) / ref_energy) if ref_energy > 0 else None
    if signal_power > 0 and noise_power > 0:
        snr = 10.0 * math.log10(signal_power / noise_power)
    else:
        snr = None
    if np.std(reference) > 1e-12 and np.std(estimate) > 1e-12:
        corr = float(np.corrcoef(reference, estimate)[0, 1])
    else:
        corr = None
    return {
        "snr_db": _finite_or_none(snr),
        "rmse_mv": rmse,
        "prd_percent": _finite_or_none(prd),
        "correlation": _finite_or_none(corr),
        "signal_power_mv2": signal_power,
        "noise_power_mv2": noise_power,
        "noise_rms_mv": math.sqrt(noise_power),
        "reference_rms_mv": float(np.sqrt(signal_power)),
        "n_samples": int(n),
    }


def welch_spectrum(
    signals: dict[str, np.ndarray], fs: float, max_freq: float = 100.0
) -> dict[str, Any]:
    """One-sided Welch PSD (an FFT-based spectral estimate) for each signal."""
    arrays = {name: np.asarray(x, dtype=np.float64) for name, x in signals.items() if x is not None}
    if not arrays:
        return {"freq_hz": [], "psd_db": {}}
    n = min(len(x) for x in arrays.values())
    if n < 32:
        raise ValueError("The segment is too short for a spectral estimate.")
    nperseg = int(min(4096, n))
    if nperseg < 32:
        nperseg = n
    psd: dict[str, np.ndarray] = {}
    freq = None
    for name, x in arrays.items():
        f, p = signal.welch(
            x[:n],
            fs=fs,
            window="hann",
            nperseg=nperseg,
            noverlap=nperseg // 2,
            detrend="constant",
            scaling="density",
            return_onesided=True,
        )
        if freq is None:
            freq = f
        psd[name] = p
    assert freq is not None
    mask = freq <= max_freq
    return {
        "freq_hz": [round(float(v), 5) for v in freq[mask]],
        "psd_db": {
            name: [round(float(10.0 * np.log10(max(v, 1e-20))), 5) for v in values[mask]]
            for name, values in psd.items()
        },
        "psd_linear": {name: values[mask] for name, values in psd.items()},
    }


def band_powers(
    psd_linear: dict[str, np.ndarray], freq: np.ndarray
) -> dict[str, dict[str, Any]]:
    bands = [
        ("baseline_0p05_0p5_hz", 0.05, 0.5),
        ("ecg_0p5_40_hz", 0.5, 40.0),
        ("high_40_100_hz", 40.0, 100.0),
    ]
    if freq.size and freq[-1] >= 49.0:
        bands.append(("mains_49_51_hz", 49.0, 51.0))
    if freq.size and freq[-1] >= 59.0:
        bands.append(("mains_59_61_hz", 59.0, 61.0))
    out: dict[str, dict[str, Any]] = {}
    total_band = (0.05, min(100.0, float(freq[-1])))
    for name, values in psd_linear.items():
        total_mask = (freq >= total_band[0]) & (freq <= total_band[1])
        total = float(np.trapezoid(values[total_mask], freq[total_mask])) if np.any(total_mask) else 0.0
        entry: dict[str, Any] = {}
        for label, low, high in bands:
            mask = (freq >= low) & (freq <= high)
            if not np.any(mask):
                entry[label] = {"power_mv2": None, "percent": None}
                continue
            power = float(np.trapezoid(values[mask], freq[mask]))
            entry[label] = {
                "power_mv2": power,
                "percent": (100.0 * power / total) if total > 0 else None,
            }
        out[name] = entry
    return out


BEAT_WINDOWS = {
    "P": (-0.25, -0.08),
    "QRS": (-0.06, 0.08),
    "T": (0.12, 0.40),
}


def _window_metrics(ref_win: np.ndarray, est_win: np.ndarray) -> dict[str, Any]:
    if ref_win.size < 3 or est_win.size < 3:
        return {}
    ref_centered = ref_win - float(np.mean(ref_win))
    est_centered = est_win - float(np.mean(est_win))
    err = est_centered - ref_centered
    corr = None
    if np.std(ref_centered) > 1e-9 and np.std(est_centered) > 1e-9:
        corr = float(np.corrcoef(ref_centered, est_centered)[0, 1])
    ref_p2p = float(np.max(ref_win) - np.min(ref_win))
    est_p2p = float(np.max(est_win) - np.min(est_win))
    amp_ratio = est_p2p / ref_p2p if ref_p2p > 0.01 else None
    return {
        "correlation": _finite_or_none(corr),
        "rmse_mv": float(np.sqrt(np.mean(err**2))),
        "amplitude_ratio": _finite_or_none(amp_ratio),
        "ref_peak_to_peak_mv": ref_p2p,
        "mean_offset_mv": float(np.mean(est_win) - np.mean(ref_win)),
    }


def morphology_metrics(
    reference: np.ndarray,
    estimates: dict[str, np.ndarray],
    annotations: list[dict[str, Any]],
    fs: float,
) -> dict[str, Any]:
    """Windowed morphology preservation around annotated R peaks.

    P and T waves are not annotated in MIT-BIH, so their windows are defined
    relative to each R peak.  These are morphology-preservation indices, not
    diagnostic P/T detection results.
    """
    reference = np.asarray(reference, dtype=np.float64)
    n = reference.size
    beats = [a for a in annotations if a.get("symbol") in {"N", "L", "R", "B", "A", "a", "J", "S", "V", "r", "F", "e", "j", "n", "E", "/", "f", "Q", "?"}]
    if not beats:
        return {
            "available": False,
            "reason": "No reference beat annotations fall inside the selected segment.",
            "windows": BEAT_WINDOWS,
            "filters": {},
        }
    out: dict[str, Any] = {
        "available": True,
        "windows": {k: {"start_ms": v[0] * 1000, "end_ms": v[1] * 1000} for k, v in BEAT_WINDOWS.items()},
        "filters": {},
    }
    for name, estimate in estimates.items():
        estimate = np.asarray(estimate, dtype=np.float64)
        n = min(reference.size, estimate.size)
        per_window: dict[str, list[dict[str, Any]]] = {key: [] for key in BEAT_WINDOWS}
        shifts: list[float] = []
        preserved = 0
        qrs_count = 0
        for ann in beats:
            center = int(round(float(ann["time_s"]) * fs))
            if center <= 0 or center >= n:
                continue
            windows_here: dict[str, dict[str, Any]] = {}
            for key, (a, b) in BEAT_WINDOWS.items():
                start = center + int(round(a * fs))
                end = center + int(round(b * fs))
                if start < 0 or end > n or end - start < 3:
                    continue
                metrics = _window_metrics(reference[start:end], estimate[start:end])
                if metrics:
                    windows_here[key] = metrics
                    per_window[key].append(metrics)
            if "QRS" in windows_here:
                a, b = BEAT_WINDOWS["QRS"]
                start = center + int(round(a * fs))
                end = center + int(round(b * fs))
                ref_seg = reference[start:end]
                est_seg = estimate[start:end]
                if ref_seg.size >= 3 and est_seg.size >= 3:
                    ref_peak = int(np.argmax(np.abs(ref_seg - np.median(ref_seg))))
                    est_peak = int(np.argmax(np.abs(est_seg - np.median(est_seg))))
                    shift = (est_peak - ref_peak) / fs * 1000.0
                    shifts.append(shift)
                    qrs_count += 1
                    if abs(shift) <= 50.0:
                        preserved += 1
        filter_result: dict[str, Any] = {}
        for key, values in per_window.items():
            if not values:
                filter_result[key] = {"available": False, "n_beats": 0}
                continue
            corrs = [v["correlation"] for v in values if v.get("correlation") is not None]
            rmses = [v["rmse_mv"] for v in values]
            ratios = [v["amplitude_ratio"] for v in values if v.get("amplitude_ratio") is not None]
            filter_result[key] = {
                "available": True,
                "n_beats": len(values),
                "correlation": float(np.median(corrs)) if corrs else None,
                "rmse_mv": float(np.median(rmses)),
                "amplitude_ratio": float(np.median(ratios)) if ratios else None,
            }
        if qrs_count:
            filter_result["QRS"]["median_abs_timing_shift_ms"] = float(np.median(np.abs(shifts)))
            filter_result["QRS"]["r_peak_preservation_percent"] = 100.0 * preserved / qrs_count
            filter_result["QRS"]["n_timing_beats"] = qrs_count
        out["filters"][name] = filter_result
    return out


def _morphology_score(morph: dict[str, Any] | None, filter_name: str) -> float | None:
    if not morph or not morph.get("available"):
        return None
    entry = morph.get("filters", {}).get(filter_name, {})
    vals = [entry.get(k, {}).get("correlation") for k in ("P", "QRS", "T")]
    vals = [v for v in vals if v is not None]
    return float(np.mean(vals)) if vals else None


def build_conclusions(
    metrics: dict[str, Any],
    morphology: dict[str, Any] | None,
    processing: dict[str, Any],
    selection: dict[str, Any],
    nominal_snr_db: float | None,
    decomposition: dict[str, Any] | None = None,
) -> list[str]:
    fir = metrics.get("fir")
    iir = metrics.get("iir")
    inp = metrics.get("input")
    if (
        not fir
        or not iir
        or not inp
        or fir.get("snr_db") is None
        or iir.get("snr_db") is None
        or inp.get("snr_db") is None
    ):
        return [
            "Reference-based SNR, RMSE and morphology comparisons are unavailable for this "
            "selection because no clean reference is installed. No values have been invented.",
            "The filter responses and processing times are still real; install the official "
            "MIT-BIH records 118 and 119 to enable reference-based evaluation.",
        ]
    conclusions: list[str] = []
    fir_imp = fir["snr_db"] - inp["snr_db"]
    iir_imp = iir["snr_db"] - inp["snr_db"]
    conclusions.append(
        f"Input SNR on this segment is {inp['snr_db']:.2f} dB. FIR improves it by "
        f"{fir_imp:+.2f} dB (to {fir['snr_db']:.2f} dB); IIR improves it by "
        f"{iir_imp:+.2f} dB (to {iir['snr_db']:.2f} dB)."
    )
    if fir["rmse_mv"] < iir["rmse_mv"]:
        conclusions.append(
            f"FIR has the lower residual RMSE ({fir['rmse_mv']:.4f} mV vs "
            f"{iir['rmse_mv']:.4f} mV)."
        )
    elif iir["rmse_mv"] < fir["rmse_mv"]:
        conclusions.append(
            f"IIR has the lower residual RMSE ({iir['rmse_mv']:.4f} mV vs "
            f"{fir['rmse_mv']:.4f} mV)."
        )
    else:
        conclusions.append("FIR and IIR have equal residual RMSE on this segment.")
    if fir_imp > iir_imp + 0.05:
        conclusions.append("FIR provides the larger SNR gain for this noise/filter combination.")
    elif iir_imp > fir_imp + 0.05:
        conclusions.append("IIR provides the larger SNR gain for this noise/filter combination.")
    else:
        conclusions.append("The two designs provide essentially the same SNR gain on this segment.")

    fir_score = _morphology_score(morphology, "fir")
    iir_score = _morphology_score(morphology, "iir")
    if fir_score is not None and iir_score is not None:
        if abs(fir_score - iir_score) < 0.01:
            conclusions.append(
                f"Mean P/QRS/T window correlation is comparable (FIR {fir_score:.3f}, "
                f"IIR {iir_score:.3f})."
            )
        elif fir_score > iir_score:
            conclusions.append(
                f"FIR preserves the annotated-beat morphology windows better on average "
                f"(mean correlation {fir_score:.3f} vs {iir_score:.3f})."
            )
        else:
            conclusions.append(
                f"IIR preserves the annotated-beat morphology windows better on average "
                f"(mean correlation {iir_score:.3f} vs {fir_score:.3f})."
            )

    fir_total = processing["fir"]["total_time_ms"]
    iir_total = processing["iir"]["total_time_ms"]
    if fir_total < iir_total * 0.95:
        conclusions.append(
            f"FIR was faster in this run ({fir_total:.2f} ms vs {iir_total:.2f} ms, "
            "design + filtering, median of three filter passes)."
        )
    elif iir_total < fir_total * 0.95:
        conclusions.append(
            f"IIR was faster in this run ({iir_total:.2f} ms vs {fir_total:.2f} ms, "
            "design + filtering, median of three filter passes)."
        )
    else:
        conclusions.append(
            f"Processing times are similar in this run (FIR {fir_total:.2f} ms, "
            f"IIR {iir_total:.2f} ms). Timing is machine- and order-dependent."
        )

    if decomposition:
        fir_d = decomposition.get("fir") or {}
        iir_d = decomposition.get("iir") or {}
        if (
            fir_d.get("noise_suppression_db") is not None
            and iir_d.get("noise_suppression_db") is not None
        ):
            conclusions.append(
                "Linear decomposition: FIR suppresses additive noise by "
                f"{fir_d['noise_suppression_db']:.2f} dB with "
                f"{fir_d['signal_distortion_rmse_mv']:.4f} mV RMS signal distortion; "
                f"IIR suppresses it by {iir_d['noise_suppression_db']:.2f} dB with "
                f"{iir_d['signal_distortion_rmse_mv']:.4f} mV distortion. Total SNR and "
                "morphology metrics reflect this trade-off."
            )

    if nominal_snr_db is not None:
        conclusions.append(
            f"The NSTDB nominal SNR for this record is {nominal_snr_db:+.0f} dB, but nst "
            "defines it from QRS amplitude and frequency-weighted noise, not conventional "
            "power SNR. Compare the measured value above rather than treating them as identical."
        )
    conclusions.append(
        "No universal winner is claimed: the better choice depends on the noise band, the "
        "allowed filter order, edge effects and the need to preserve specific waveforms."
    )
    return conclusions
