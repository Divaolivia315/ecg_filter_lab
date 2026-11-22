from __future__ import annotations

import math
import time
from dataclasses import dataclass, field
from typing import Any

import numpy as np
from scipy import signal

from .schemas import FilterConfig


class FilterValidationError(ValueError):
    def __init__(self, errors: list[str], warnings: list[str] | None = None):
        super().__init__("; ".join(errors))
        self.errors = errors
        self.warnings = warnings or []


@dataclass
class FilterDesign:
    family: str
    config: dict[str, Any]
    b: np.ndarray | None
    a: np.ndarray | None
    sos: np.ndarray | None
    numtaps: int
    effective_order: int
    cutoff_low: float | None
    cutoff_high: float | None
    center: float | None
    bandwidth: float | None
    group_delay_samples: float | None
    design_time_ms: float
    notes: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def _cutoffs(cfg: FilterConfig, fs: float) -> tuple[float | None, float | None, float | None, float | None]:
    nyq = fs / 2.0
    if cfg.filter_type == "lowpass":
        if cfg.cutoff is None:
            raise FilterValidationError(["A low-pass cutoff frequency is required."])
        low, high, center, bandwidth = None, float(cfg.cutoff), None, None
        if not (0.0 < high < nyq):
            raise FilterValidationError(
                [f"Low-pass cutoff must be between 0 and Nyquist ({nyq:.1f} Hz); got {high:.3f} Hz."]
            )
    elif cfg.filter_type == "highpass":
        if cfg.cutoff is None:
            raise FilterValidationError(["A high-pass cutoff frequency is required."])
        low, high, center, bandwidth = float(cfg.cutoff), None, None, None
        if not (0.0 < low < nyq):
            raise FilterValidationError(
                [f"High-pass cutoff must be between 0 and Nyquist ({nyq:.1f} Hz); got {low:.3f} Hz."]
            )
    elif cfg.filter_type == "bandpass":
        if cfg.cutoff_low is None or cfg.cutoff_high is None:
            raise FilterValidationError(["Band-pass low and high cutoff frequencies are required."])
        low, high = float(cfg.cutoff_low), float(cfg.cutoff_high)
        center, bandwidth = None, None
        if not (0.0 < low < high < nyq):
            raise FilterValidationError(
                [f"Band-pass cutoffs must satisfy 0 < low < high < Nyquist ({nyq:.1f} Hz)."]
            )
    elif cfg.filter_type == "notch":
        if cfg.cutoff is None:
            raise FilterValidationError(["A notch centre frequency is required."])
        center = float(cfg.cutoff)
        if not (0.0 < center < nyq):
            raise FilterValidationError(
                [f"Notch centre must be between 0 and Nyquist ({nyq:.1f} Hz); got {center:.3f} Hz."]
            )
        bandwidth = center / float(cfg.notch_q)
        low, high = center - bandwidth / 2.0, center + bandwidth / 2.0
        if low <= 0.0 or high >= nyq:
            raise FilterValidationError(
                [
                    f"A notch at {center:.2f} Hz with Q={cfg.notch_q:.1f} has edges "
                    f"{low:.2f}-{high:.2f} Hz, outside 0-{nyq:.1f} Hz. Reduce Q or move the centre."
                ]
            )
    else:
        raise FilterValidationError([f"Unsupported filter type: {cfg.filter_type!r}."])
    return low, high, center, bandwidth


def validate_filter_config(cfg: FilterConfig, fs: float, n_samples: int | None = None) -> list[str]:
    warnings: list[str] = []
    if fs <= 0:
        raise FilterValidationError(["Sampling frequency must be positive."])
    low, high, center, bandwidth = _cutoffs(cfg, fs)

    if cfg.filter_type == "lowpass" and high is not None:
        if high < 20.0:
            warnings.append(
                "A low-pass cutoff below 20 Hz can remove clinically relevant QRS and "
                "P/T high-frequency content; inspect the morphology metrics."
            )
        elif high < 40.0:
            warnings.append(
                "A low-pass cutoff below 40 Hz may attenuate some QRS high-frequency content."
            )
    if cfg.filter_type == "highpass" and low is not None and low > 0.5:
        warnings.append(
            "A high-pass cutoff above 0.5 Hz can attenuate slow ST-segment and T-wave content."
        )
    if cfg.filter_type == "bandpass":
        if high is not None and high < 40.0:
            warnings.append(
                "The upper band-pass cutoff is below 40 Hz; check whether QRS morphology is preserved."
            )
        if low is not None and low > 0.5:
            warnings.append(
                "The lower band-pass cutoff is above 0.5 Hz; check ST/T-wave preservation."
            )
    if cfg.filter_type == "notch":
        if center in (50.0, 60.0) and cfg.notch_q < 10.0:
            warnings.append(
                "A low-Q powerline notch is wide and may remove ECG energy near the mains frequency."
            )
        if center is not None and bandwidth is not None and bandwidth > 10.0:
            warnings.append(
                "The notch bandwidth is wide (>10 Hz); a narrower notch is usually preferable for ECG."
            )

    if cfg.family == "fir":
        if cfg.order < 4:
            raise FilterValidationError(["FIR order must be at least 4."])
        if cfg.order > 1024:
            raise FilterValidationError(["FIR order must not exceed 1024."])
        numtaps = cfg.order + 1
        if numtaps % 2 == 0:
            numtaps += 1
            warnings.append(
                "FIR tap count was increased by one to keep an odd number of taps "
                "(Type I linear phase, required for high-pass/band-pass designs)."
            )
        if numtaps > 512:
            warnings.append(
                "A very high FIR order increases zero-phase padding requirements and edge effects."
            )
        if n_samples is not None:
            padlen = 3 * numtaps
            if n_samples <= padlen:
                min_seconds = (padlen + 2) / fs
                raise FilterValidationError(
                    [
                        f"FIR zero-phase filtering with {numtaps} taps needs a segment longer "
                        f"than {min_seconds:.1f} s; the selected segment has {n_samples / fs:.1f} s. "
                        "Reduce the FIR order or lengthen the segment."
                    ]
                )
        if cfg.filter_type in {"lowpass", "highpass"} and high is not None:
            approx_transition = 3.3 * fs / numtaps
            if cfg.filter_type == "lowpass" and high < approx_transition:
                warnings.append(
                    "The cutoff is very close to DC relative to the FIR transition width; "
                    "a longer segment or different design may be needed."
                )
        if cfg.filter_type == "notch" and bandwidth is not None:
            approx_transition = 3.3 * fs / numtaps
            if bandwidth < approx_transition:
                warnings.append(
                    f"The requested notch bandwidth ({bandwidth:.2f} Hz) is narrower than the "
                    f"approximate FIR transition width ({approx_transition:.2f} Hz); increase "
                    "the FIR order or use an IIR notch."
                )
    else:
        if cfg.order < 1 or cfg.order > 12:
            raise FilterValidationError(["IIR order must be between 1 and 12."])
        if cfg.order > 8:
            warnings.append(
                "High-order IIR designs can be numerically sensitive; second-order sections "
                "are used, but inspect the response for instability."
            )
        if cfg.iir_method in {"chebyshev1", "elliptic"} and cfg.ripple_db > 3.0:
            warnings.append("Passband ripple above 3 dB is large for ECG morphology work.")
        if cfg.iir_method in {"chebyshev2", "elliptic"} and cfg.attenuation_db < 20.0:
            warnings.append("Stopband attenuation below 20 dB is modest.")
        if n_samples is not None:
            # Conservative estimate of sosfiltfilt's default padding.
            sections = cfg.order if cfg.filter_type in {"bandpass", "notch"} else math.ceil(cfg.order / 2)
            padlen = 3 * (2 * sections + 1)
            if n_samples <= padlen:
                min_seconds = (padlen + 2) / fs
                raise FilterValidationError(
                    [
                        f"IIR zero-phase filtering at this order needs a segment longer than "
                        f"{min_seconds:.1f} s; the selected segment has {n_samples / fs:.1f} s. "
                        "Reduce the IIR order or lengthen the segment."
                    ]
                )
    return warnings


def design_filter(cfg: FilterConfig, fs: float, n_samples: int | None = None) -> FilterDesign:
    warnings = validate_filter_config(cfg, fs, n_samples)
    low, high, center, bandwidth = _cutoffs(cfg, fs)
    start = time.perf_counter()
    notes: list[str] = []

    if cfg.family == "fir":
        numtaps = cfg.order + 1
        if numtaps % 2 == 0:
            numtaps += 1
        if cfg.window == "kaiser":
            window: Any = ("kaiser", float(cfg.kaiser_beta))
            window_label = f"Kaiser (β={cfg.kaiser_beta:.2f})"
        else:
            window = "hann" if cfg.window == "hanning" else cfg.window
            window_label = cfg.window.capitalize()
        if cfg.filter_type == "lowpass":
            cutoff = high
            pass_zero = True
        elif cfg.filter_type == "highpass":
            cutoff = low
            pass_zero = False
        elif cfg.filter_type == "bandpass":
            cutoff = [low, high]
            pass_zero = False
        else:
            cutoff = [low, high]
            pass_zero = True
        b = signal.firwin(
            numtaps,
            cutoff,
            window=window,
            pass_zero=pass_zero,
            fs=fs,
        )
        a = np.array([1.0])
        sos = None
        effective_order = numtaps - 1
        group_delay = (numtaps - 1) / 2.0
        notes.append(
            f"{numtaps}-tap Type I linear-phase FIR ({window_label} window). "
            "Applied with forward-backward zero-phase filtering."
        )
        notes.append(
            f"Causal group delay would be {group_delay:.1f} samples "
            f"({group_delay / fs * 1000:.2f} ms); it is cancelled by zero-phase filtering."
        )
    else:
        numtaps = 0
        btype = {
            "lowpass": "low",
            "highpass": "high",
            "bandpass": "bandpass",
            "notch": "bandstop",
        }[cfg.filter_type]
        wn = low if cfg.filter_type == "highpass" else high
        if cfg.filter_type in {"bandpass", "notch"}:
            wn = [low, high]
        method = cfg.iir_method
        if method == "butterworth":
            sos = signal.butter(cfg.order, wn, btype=btype, fs=fs, output="sos")
            method_label = "Butterworth"
        elif method == "chebyshev1":
            sos = signal.cheby1(cfg.order, cfg.ripple_db, wn, btype=btype, fs=fs, output="sos")
            method_label = f"Chebyshev I ({cfg.ripple_db:.2f} dB ripple)"
        elif method == "chebyshev2":
            sos = signal.cheby2(cfg.order, cfg.attenuation_db, wn, btype=btype, fs=fs, output="sos")
            method_label = f"Chebyshev II ({cfg.attenuation_db:.1f} dB stopband)"
        else:
            sos = signal.ellip(
                cfg.order, cfg.ripple_db, cfg.attenuation_db, wn, btype=btype, fs=fs, output="sos"
            )
            method_label = (
                f"Elliptic ({cfg.ripple_db:.2f} dB ripple, {cfg.attenuation_db:.1f} dB stopband)"
            )
        b = None
        a = None
        effective_order = cfg.order * (2 if cfg.filter_type in {"bandpass", "notch"} else 1)
        group_delay = None
        notes.append(
            f"Order-{cfg.order} {method_label} IIR ({len(sos)} second-order sections), "
            "applied with forward-backward zero-phase filtering."
        )
        notes.append("IIR phase delay is frequency-dependent and is cancelled by zero-phase filtering.")
        try:
            _, poles, _ = signal.sos2zpk(sos)
            if not np.all(np.isfinite(poles)) or np.any(np.abs(poles) >= 1.0):
                raise FilterValidationError(
                    ["The designed IIR filter is unstable (a pole lies on or outside the unit circle)."]
                )
        except FilterValidationError:
            raise
        except Exception as exc:  # pragma: no cover - defensive
            raise FilterValidationError([f"Could not verify IIR stability: {exc}"]) from exc

    design_time_ms = (time.perf_counter() - start) * 1000.0
    return FilterDesign(
        family=cfg.family,
        config=cfg.model_dump(),
        b=b,
        a=a,
        sos=sos,
        numtaps=numtaps,
        effective_order=effective_order,
        cutoff_low=low,
        cutoff_high=high,
        center=center,
        bandwidth=bandwidth,
        group_delay_samples=group_delay,
        design_time_ms=design_time_ms,
        notes=notes,
        warnings=warnings,
    )


def apply_filter(design: FilterDesign, x: np.ndarray, repeats: int = 3) -> tuple[np.ndarray, float]:
    x = np.asarray(x, dtype=np.float64)
    if x.ndim != 1 or x.size < 8:
        raise FilterValidationError(["The signal segment is too short to filter."])
    if design.family == "fir":
        assert design.b is not None
        padlen = 3 * design.numtaps
        if x.size <= padlen:
            raise FilterValidationError(
                [
                    f"The segment ({x.size} samples) is too short for a {design.numtaps}-tap "
                    f"zero-phase FIR filter (needs more than {padlen} samples)."
                ]
            )
        times = []
        y = None
        for _ in range(max(1, repeats)):
            t0 = time.perf_counter()
            y = signal.filtfilt(design.b, [1.0], x, padlen=padlen)
            times.append((time.perf_counter() - t0) * 1000.0)
    else:
        assert design.sos is not None
        padlen = 3 * (
            2 * len(design.sos) + 1
            - min(int(np.sum(design.sos[:, 2] == 0)), int(np.sum(design.sos[:, 5] == 0)))
        )
        if x.size <= padlen:
            raise FilterValidationError(
                [
                    f"The segment ({x.size} samples) is too short for this IIR zero-phase "
                    f"filter (needs more than {padlen} samples)."
                ]
            )
        times = []
        y = None
        for _ in range(max(1, repeats)):
            t0 = time.perf_counter()
            y = signal.sosfiltfilt(design.sos, x, padlen=padlen)
            times.append((time.perf_counter() - t0) * 1000.0)
    assert y is not None
    if not np.all(np.isfinite(y)):
        raise FilterValidationError(
            ["Filtering produced non-finite output. Check the filter design and segment."]
        )
    if y.size != x.size:
        raise FilterValidationError(["Filtered output length does not match the input length."])
    return np.asarray(y, dtype=np.float64), float(np.median(times))


def _smooth_group_delay(gd: np.ndarray) -> np.ndarray:
    if gd.size < 31:
        return gd
    try:
        return signal.savgol_filter(gd, 31, 3, mode="interp")
    except Exception:  # pragma: no cover
        return gd


def frequency_response(design: FilterDesign, fs: float, worN: int = 2048) -> dict[str, Any]:
    if design.family == "fir":
        assert design.b is not None
        w, h = signal.freqz(design.b, worN=worN)
    else:
        assert design.sos is not None
        w, h = signal.sosfreqz(design.sos, worN=worN)
    freq = w * fs / (2.0 * math.pi)
    mag = np.abs(h)
    mag_db = 20.0 * np.log10(np.maximum(mag, 1e-12))
    phase = np.unwrap(np.angle(h))
    phase_deg = np.degrees(phase)
    gd_samples = -np.gradient(phase, w)
    gd_ms = _smooth_group_delay(gd_samples / fs * 1000.0)
    return {
        "freq_hz": [round(float(v), 5) for v in freq],
        "magnitude_db": [round(float(v), 5) for v in mag_db],
        "phase_deg": [round(float(v), 5) for v in phase_deg],
        "group_delay_ms": [round(float(v), 5) for v in gd_ms],
    }


def design_payload(design: FilterDesign, fs: float) -> dict[str, Any]:
    return {
        "family": design.family,
        "config": design.config,
        "taps": design.numtaps or None,
        "effective_order": design.effective_order,
        "cutoff_low_hz": design.cutoff_low,
        "cutoff_high_hz": design.cutoff_high,
        "center_hz": design.center,
        "bandwidth_hz": design.bandwidth,
        "group_delay_samples": design.group_delay_samples,
        "group_delay_ms": (
            design.group_delay_samples / fs * 1000.0
            if design.group_delay_samples is not None
            else None
        ),
        "design_time_ms": design.design_time_ms,
        "notes": design.notes,
        "warnings": design.warnings,
        "response": frequency_response(design, fs),
    }
