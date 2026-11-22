from __future__ import annotations

import json
import logging
import math
import os
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import numpy as np
import wfdb

from . import config

log = logging.getLogger(__name__)

BEAT_SYMBOLS = {
    "N", "L", "R", "B", "A", "a", "J", "S", "V", "r", "F", "e", "j", "n", "E", "/", "f", "Q", "?"
}

NOISE_NAMES = ("bw", "ma", "em")


class DatasetError(RuntimeError):
    pass


@dataclass(frozen=True)
class HeaderInfo:
    record: str
    path: Path
    fs: float
    sig_len: int
    sig_name: tuple[str, ...]
    units: tuple[str, ...]
    comments: tuple[str, ...]

    @property
    def duration_s(self) -> float:
        return self.sig_len / self.fs

    def channel_index(self, name: str) -> int:
        try:
            return self.sig_name.index(name)
        except ValueError as exc:
            raise DatasetError(
                f"Channel {name!r} is not present in record {self.record}. "
                f"Available channels: {', '.join(self.sig_name)}"
            ) from exc


def _require_dataset() -> Path:
    if config.DATASET_DIR is None:
        raise DatasetError(
            "MIT-BIH Noise Stress Test Database not found. Set ECG_DATASET_DIR to the "
            "folder that contains RECORDS, bw.hea and the record files."
        )
    return config.DATASET_DIR


def _record_path(record: str) -> Path:
    dataset = _require_dataset()
    if not re.fullmatch(r"[A-Za-z0-9_\-]+", record):
        raise DatasetError("Invalid record name.")
    path = dataset / record
    if not path.with_suffix(".hea").is_file():
        raise DatasetError(f"Record {record!r} was not found in {dataset}.")
    return path


@lru_cache(maxsize=64)
def header(record: str) -> HeaderInfo:
    path = _record_path(record)
    h = wfdb.rdheader(str(path))
    return HeaderInfo(
        record=record,
        path=path,
        fs=float(h.fs),
        sig_len=int(h.sig_len),
        sig_name=tuple(h.sig_name or []),
        units=tuple(h.units or ["mV"] * len(h.sig_name or [])),
        comments=tuple(h.comments or []),
    )


def nominal_snr(record: str) -> float | None:
    match = re.fullmatch(r"(118|119)e(_?\d+)", record)
    if not match:
        return None
    suffix = match.group(2).replace("_", "-")
    try:
        return float(int(suffix))
    except ValueError:
        return None


def subject_of(record: str) -> str | None:
    match = re.match(r"^(118|119)e", record)
    return match.group(1) if match else None


def list_records() -> list[str]:
    dataset = _require_dataset()
    records_file = dataset / "RECORDS"
    names = [line.strip() for line in records_file.read_text(encoding="utf-8").splitlines() if line.strip()]
    ecg = [name for name in names if name not in NOISE_NAMES]
    return sorted(ecg, key=lambda name: (subject_of(name) or "", nominal_snr(name) or 0.0))


def list_noise_records() -> list[str]:
    dataset = _require_dataset()
    return [name for name in NOISE_NAMES if (dataset / f"{name}.hea").is_file()]


def _is_clean_reference_name(record: str) -> bool:
    return record in {"118", "119"} and all(
        (config.CLEAN_REF_DIR / f"{record}.{suffix}").is_file() for suffix in ("hea", "dat")
    )


def clean_reference_path(record: str) -> Path | None:
    """Return the clean MIT-BIH 118/119 record matching an NSTDB ECG record."""
    if _is_clean_reference_name(record):
        return config.CLEAN_REF_DIR / record
    subject = subject_of(record)
    if subject is None:
        return None
    path = config.CLEAN_REF_DIR / subject
    if path.with_suffix(".hea").is_file() and path.with_suffix(".dat").is_file():
        return path
    return None


def _fs_for_record(record: str) -> float:
    if _is_clean_reference_name(record):
        return _header_for_path(config.CLEAN_REF_DIR / record).fs
    return header(record).fs


def clean_reference_available() -> bool:
    return all(
        (config.CLEAN_REF_DIR / f"{rec}.{suffix}").is_file()
        for rec in ("118", "119")
        for suffix in ("hea", "dat")
    )


def list_clean_references() -> list[str]:
    if not config.CLEAN_REF_DIR.is_dir():
        return []
    found = []
    for hea in sorted(config.CLEAN_REF_DIR.glob("*.hea")):
        if hea.stem in {"118", "119"} and hea.with_suffix(".dat").is_file():
            found.append(hea.stem)
    return found


def _load_full(path: Path) -> np.ndarray:
    rec = wfdb.rdrecord(str(path), physical=True)
    if rec.p_signal is None:
        raise DatasetError(f"Could not read signal samples from {path}.")
    return np.asarray(rec.p_signal, dtype=np.float64)


@lru_cache(maxsize=8)
def _full_cached(path_string: str) -> np.ndarray:
    return _load_full(Path(path_string))


def load_segment(path: Path, channel_index: int, start_s: float, duration_s: float) -> np.ndarray:
    h = header(path.stem) if path.parent == _require_dataset() else _header_for_path(path)
    sampfrom = int(round(start_s * h.fs))
    sampto = int(round((start_s + duration_s) * h.fs))
    if sampfrom < 0 or sampto > h.sig_len:
        raise DatasetError(
            f"Segment {start_s:.1f}-{start_s + duration_s:.1f} s is outside "
            f"record {path.stem} (0-{h.duration_s:.1f} s)."
        )
    if sampto - sampfrom < 2:
        raise DatasetError("Selected segment is too short.")
    rec = wfdb.rdrecord(
        str(path),
        sampfrom=sampfrom,
        sampto=sampto,
        channels=[channel_index],
        physical=True,
    )
    signal = np.asarray(rec.p_signal, dtype=np.float64)
    if signal.ndim == 2:
        signal = signal[:, 0]
    if signal.size != sampto - sampfrom:
        raise DatasetError("WFDB returned an unexpected number of samples.")
    if not np.all(np.isfinite(signal)):
        raise DatasetError("The selected signal segment contains non-finite samples.")
    return signal


def _header_for_path(path: Path) -> HeaderInfo:
    h = wfdb.rdheader(str(path))
    return HeaderInfo(
        record=path.stem,
        path=path,
        fs=float(h.fs),
        sig_len=int(h.sig_len),
        sig_name=tuple(h.sig_name or []),
        units=tuple(h.units or ["mV"] * len(h.sig_name or [])),
        comments=tuple(h.comments or []),
    )


@lru_cache(maxsize=64)
def annotations(record: str) -> tuple[np.ndarray, tuple[str, ...]]:
    """Reference beat annotations, preferring the clean source record."""
    path: Path
    if _is_clean_reference_name(record):
        path = config.CLEAN_REF_DIR / record
        if not path.with_suffix(".atr").is_file():
            return np.array([], dtype=int), ()
    else:
        ref = clean_reference_path(record)
        if ref is not None and ref.with_suffix(".atr").is_file():
            path = ref
        else:
            path = _record_path(record)
            if not path.with_suffix(".atr").is_file():
                return np.array([], dtype=int), ()
    ann = wfdb.rdann(str(path), "atr")
    samples = np.asarray(ann.sample, dtype=int)
    symbols = tuple(str(s) for s in ann.symbol)
    return samples, symbols


def annotations_for_segment(record: str, start_s: float, duration_s: float) -> list[dict[str, Any]]:
    samples, symbols = annotations(record)
    if samples.size == 0:
        return []
    fs = _fs_for_record(record)
    sampfrom = int(round(start_s * fs))
    sampto = int(round((start_s + duration_s) * fs))
    out: list[dict[str, Any]] = []
    for sample, symbol in zip(samples, symbols):
        if symbol not in BEAT_SYMBOLS:
            continue
        if sampfrom <= sample < sampto:
            out.append(
                {
                    "sample": int(sample),
                    "time_s": float((sample - sampfrom) / fs),
                    "absolute_s": float(sample / fs),
                    "symbol": symbol,
                }
            )
    return out


def _protocol_noise_segments(duration_s: float = 1800.0) -> list[dict[str, float]]:
    """The documented nst standard protocol: 5 min clean, then 2 min alternating."""
    segments: list[dict[str, float]] = []
    t = 300.0
    while t < duration_s:
        end = min(t + 120.0, duration_s)
        segments.append({"start_s": t, "end_s": end, "mean_rms_mv": None, "peak_rms_mv": None, "source": "protocol"})
        t += 240.0
    return segments


def _merge_noise_blocks(
    values: np.ndarray, step_s: float, threshold: float = 0.01
) -> tuple[list[dict[str, float]], int]:
    active = values > threshold
    segments: list[dict[str, float]] = []
    i = 0
    while i < len(values):
        if not active[i]:
            i += 1
            continue
        j = i
        while j + 1 < len(values) and active[j + 1]:
            j += 1
        start = i * step_s
        end = (j + 1) * step_s
        if end - start >= 10.0:
            block = values[i : j + 1]
            segments.append(
                {
                    "start_s": float(start),
                    "end_s": float(end),
                    "mean_rms_mv": float(np.mean(block)),
                    "peak_rms_mv": float(np.max(block)),
                    "source": "measured",
                }
            )
        i = j + 1
    # Best 10-second window inside a detected segment (or the whole record).
    if segments:
        best = max(segments, key=lambda s: s["mean_rms_mv"] or 0.0)
        start_idx = int(best["start_s"] / step_s)
        end_idx = min(len(values), start_idx + int(round(10.0 / step_s)))
        window = values[start_idx:end_idx]
        inset = 5.0 if (best["end_s"] - best["start_s"]) >= 15.0 else 0.0
        recommended = int(best["start_s"] + inset)
        if window.size and float(np.max(window)) > 0:
            candidate = int((start_idx + int(np.argmax(window))) * step_s)
            recommended = max(int(best["start_s"] + inset), min(candidate, int(best["end_s"] - 10.0)))
    else:
        recommended = 300
    return segments, recommended


def _clean_signature() -> str:
    if not config.CLEAN_REF_DIR.is_dir():
        return "none"
    parts = []
    for hea in sorted(config.CLEAN_REF_DIR.glob("*.hea")):
        try:
            parts.append(f"{hea.name}:{hea.stat().st_mtime_ns}")
        except OSError:
            parts.append(hea.name)
    return "|".join(parts)


def _index_is_current(index: dict[str, Any]) -> bool:
    return (
        index.get("version") == config.INDEX_VERSION
        and index.get("dataset") == str(config.DATASET_DIR)
        and index.get("clean_ref") == str(config.CLEAN_REF_DIR)
        and index.get("clean_signature") == _clean_signature()
    )


def _bundled_index_is_compatible(index: dict[str, Any]) -> bool:
    """Use the shipped, precomputed index on Vercel without trusting local paths/mtimes."""
    if not os.getenv("VERCEL") or not clean_reference_available():
        return False
    try:
        expected_records = set(list_records())
        expected_noises = set(list_noise_records())
        return (
            index.get("version") == config.INDEX_VERSION
            and set(index.get("records", {})) == expected_records
            and set(index.get("noises", {})) == expected_noises
        )
    except (DatasetError, TypeError):
        return False


def _atomic_json_write(path: Path, payload: dict[str, Any]) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    tmp.replace(path)


def build_dataset_index(force: bool = False) -> dict[str, Any]:
    """Compute measured noise-activity envelopes, cached to JSON.

    The envelopes are only derived when a clean reference exists.  When it does
    not, the documented nst protocol intervals are returned and explicitly
    labelled as protocol-derived rather than measured.
    """
    if not force and config.DATASET_INDEX_PATH.is_file():
        try:
            cached = json.loads(config.DATASET_INDEX_PATH.read_text(encoding="utf-8"))
            if _index_is_current(cached):
                return cached
        except (OSError, json.JSONDecodeError):
            log.warning("Ignoring unreadable dataset index cache.")

    # The repository ships a measured index. Its source paths and file mtimes
    # belong to the machine that created it, so validate the record inventory
    # instead when running from the immutable Vercel bundle.
    if not force:
        bundled_path = config.DATA_DIR / "cache" / "dataset_index.json"
        if bundled_path != config.DATASET_INDEX_PATH and bundled_path.is_file():
            try:
                bundled = json.loads(bundled_path.read_text(encoding="utf-8"))
                if _bundled_index_is_compatible(bundled):
                    return bundled
            except (OSError, json.JSONDecodeError):
                log.warning("Ignoring unreadable bundled dataset index.")

    _require_dataset()
    config.ensure_dirs()
    step_s = 5.0
    records: dict[str, Any] = {}
    noises: dict[str, Any] = {}
    clean_ok = clean_reference_available()

    if clean_ok:
        for subject in ("118", "119"):
            clean = _load_full(config.CLEAN_REF_DIR / subject)
            subject_records = [r for r in list_records() if subject_of(r) == subject]
            for record in subject_records:
                noisy = _load_full(_record_path(record))
                n = min(len(clean), len(noisy))
                channels = header(record).sig_name
                activity: dict[str, list[float]] = {}
                noise_segments: dict[str, list[dict[str, float]]] = {}
                recommended: dict[str, int] = {}
                for ch, name in enumerate(channels[:2]):
                    diff = noisy[:n, ch] - clean[:n, ch]
                    block = int(round(step_s * header(record).fs))
                    values = []
                    for i in range(0, n, block):
                        part = diff[i : i + block]
                        if part.size < block // 2:
                            continue
                        values.append(float(np.std(part - np.median(part))))
                    arr = np.asarray(values, dtype=float)
                    segs, rec_start = _merge_noise_blocks(arr, step_s)
                    activity[name] = [round(float(v), 5) for v in arr]
                    noise_segments[name] = segs
                    recommended[name] = rec_start
                records[record] = {
                    "activity": activity,
                    "noise_segments": noise_segments,
                    "recommended": recommended,
                    "activity_step_s": step_s,
                    "activity_source": "measured against clean reference",
                }
    else:
        for record in list_records():
            channels = header(record).sig_name
            records[record] = {
                "activity": {name: [] for name in channels},
                "noise_segments": {name: _protocol_noise_segments() for name in channels},
                "recommended": {name: 300 for name in channels},
                "activity_step_s": step_s,
                "activity_source": "nst protocol (clean reference unavailable)",
            }

    for name in list_noise_records():
        h = header(name)
        data = _load_full(h.path)
        activity: dict[str, list[float]] = {}
        summary: dict[str, Any] = {}
        for ch, channel_name in enumerate(h.sig_name[:2]):
            block = int(round(step_s * h.fs))
            vals = []
            for i in range(0, len(data), block):
                part = data[i : i + block, ch]
                if part.size < block // 2:
                    continue
                vals.append(float(np.std(part)))
            arr = np.asarray(vals, dtype=float)
            activity[channel_name] = [round(float(v), 5) for v in arr]
            best = 0
            if arr.size:
                k = max(0, min(len(arr) - int(round(10 / step_s)), int(np.argmax(arr))))
                best = int(k * step_s)
            summary[channel_name] = {
                "rms_mv": float(np.std(data[:, ch])),
                "peak_mv": float(np.max(np.abs(data[:, ch]))),
                "recommended_start_s": best,
            }
        noises[name] = {
            "activity": activity,
            "activity_step_s": step_s,
            "summary": summary,
        }

    payload = {
        "version": config.INDEX_VERSION,
        "built_at": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "dataset": str(config.DATASET_DIR),
        "clean_ref": str(config.CLEAN_REF_DIR),
        "clean_signature": _clean_signature(),
        "records": records,
        "noises": noises,
    }
    _atomic_json_write(config.DATASET_INDEX_PATH, payload)
    return payload


def get_index() -> dict[str, Any]:
    return build_dataset_index(force=False)


def record_metadata(record: str, index: dict[str, Any] | None = None) -> dict[str, Any]:
    h = header(record)
    idx = (index or get_index())["records"].get(record, {})
    ref = clean_reference_path(record)
    channels = [
        {"name": name, "index": i, "units": h.units[i] if i < len(h.units) else "mV"}
        for i, name in enumerate(h.sig_name)
    ]
    try:
        ann_samples, _ = annotations(record)
        ann_count = int(ann_samples.size)
    except Exception:  # annotations are optional metadata
        ann_count = 0
    return {
        "record": record,
        "subject": subject_of(record),
        "nominal_snr_db": nominal_snr(record),
        "fs": h.fs,
        "sig_len": h.sig_len,
        "duration_s": h.duration_s,
        "channels": channels,
        "has_reference": ref is not None,
        "reference_record": ref.stem if ref is not None else None,
        "annotation_count": ann_count,
        "activity": idx.get("activity", {}),
        "noise_segments": idx.get("noise_segments", {}),
        "recommended": idx.get("recommended", {}),
        "activity_step_s": idx.get("activity_step_s", 5.0),
        "activity_source": idx.get("activity_source", "unavailable"),
        "comments": list(h.comments),
    }


def noise_metadata(record: str, index: dict[str, Any] | None = None) -> dict[str, Any]:
    h = header(record)
    idx = (index or get_index())["noises"].get(record, {})
    return {
        "record": record,
        "label": config.NOISE_LABELS.get(record, record),
        "description": config.NOISE_DESCRIPTIONS.get(record, ""),
        "fs": h.fs,
        "sig_len": h.sig_len,
        "duration_s": h.duration_s,
        "channels": [
            {"name": name, "index": i, "units": h.units[i] if i < len(h.units) else "mV"}
            for i, name in enumerate(h.sig_name)
        ],
        "activity": idx.get("activity", {}),
        "activity_step_s": idx.get("activity_step_s", 5.0),
        "summary": idx.get("summary", {}),
    }


def reference_metadata(record: str) -> dict[str, Any]:
    path = config.CLEAN_REF_DIR / record
    if not path.with_suffix(".hea").is_file():
        raise DatasetError(f"Clean reference {record} is not installed.")
    h = _header_for_path(path)
    ann_count = 0
    if path.with_suffix(".atr").is_file():
        ann = wfdb.rdann(str(path), "atr")
        ann_count = len(ann.sample)
    return {
        "record": record,
        "fs": h.fs,
        "sig_len": h.sig_len,
        "duration_s": h.duration_s,
        "channels": [
            {"name": name, "index": i, "units": h.units[i] if i < len(h.units) else "mV"}
            for i, name in enumerate(h.sig_name)
        ],
        "annotation_count": ann_count,
        "source": config.REFERENCE_SOURCE,
    }


def dataset_summary() -> dict[str, Any]:
    records = list_records()
    noises = list_noise_records()
    refs = list_clean_references()
    first = header(records[0])
    return {
        "dataset_path": str(config.DATASET_DIR),
        "clean_reference_path": str(config.CLEAN_REF_DIR),
        "clean_reference_available": clean_reference_available(),
        "clean_references": refs,
        "record_count": len(records),
        "noise_count": len(noises),
        "fs": first.fs,
        "duration_s": first.duration_s,
        "channels": list(first.sig_name),
        "noise_types": [
            {"record": name, "label": config.NOISE_LABELS.get(name, name)} for name in noises
        ],
        "limitations": config.LIMITATIONS,
        "reference_source": config.REFERENCE_SOURCE,
        "old_subfolder": "ignored",
        "app_version": config.APP_VERSION,
    }


def _stats(x: np.ndarray) -> dict[str, float]:
    return {
        "rms_mv": float(np.sqrt(np.mean(x**2))),
        "std_mv": float(np.std(x)),
        "mean_mv": float(np.mean(x)),
        "min_mv": float(np.min(x)),
        "max_mv": float(np.max(x)),
        "peak_to_peak_mv": float(np.max(x) - np.min(x)),
    }


def build_signal_bundle(selection: Any) -> dict[str, Any]:
    """Load a segment and, when possible, its aligned clean reference."""
    if selection.mode == "existing":
        record = selection.record
        if record not in list_records():
            raise DatasetError(f"{record!r} is not an ECG record in the NSTDB index.")
        h = header(record)
        channel_index = h.channel_index(selection.channel)
        duration = float(selection.duration)
        start = float(selection.start)
        if start + duration > h.duration_s + 1e-9:
            raise DatasetError(
                f"Segment ends at {start + duration:.1f} s, beyond the record duration "
                f"of {h.duration_s:.1f} s."
            )
        raw = load_segment(h.path, channel_index, start, duration)
        ref_path = clean_reference_path(record)
        reference = None
        offset = 0.0
        warnings: list[str] = []
        if ref_path is not None:
            ref_h = _header_for_path(ref_path)
            ref_channel = ref_h.sig_name.index(selection.channel)
            reference = load_segment(ref_path, ref_channel, start, duration)
            n = min(len(raw), len(reference))
            raw = raw[:n]
            reference = reference[:n]
            offset = float(np.median(raw - reference))
            raw = raw - offset
            if abs(offset) > 1e-6:
                warnings.append(
                    f"A constant DC offset of {offset:+.3f} mV was removed from the "
                    "NSTDB record before filtering and metric calculation."
                )
        else:
            warnings.append(
                "No clean reference is installed for this record. SNR, RMSE and "
                "morphology metrics are therefore unavailable; no reference signal "
                "has been fabricated."
            )
        ann = annotations_for_segment(record, start, duration)
        meta = record_metadata(record)
        return {
            "selection": selection.model_dump(),
            "mode": "existing",
            "record": record,
            "channel": selection.channel,
            "start_s": start,
            "duration_s": duration,
            "fs": h.fs,
            "time": np.arange(len(raw), dtype=float) / h.fs,
            "input": raw,
            "reference": reference,
            "input_stats": _stats(raw),
            "reference_stats": _stats(reference) if reference is not None else None,
            "offset_mv": offset,
            "annotations": ann,
            "meta": meta,
            "warnings": warnings,
            "mix": None,
        }

    if selection.mode == "mix":
        clean_record = selection.clean_record
        if clean_record not in list_clean_references():
            raise DatasetError(
                f"Clean reference {clean_record!r} is not installed. Noise mixing is "
                "disabled until the official MIT-BIH 118/119 records are present."
            )
        noise_record = selection.noise_record
        if noise_record not in list_noise_records():
            raise DatasetError(f"Unknown NSTDB noise record {noise_record!r}.")
        clean_path = config.CLEAN_REF_DIR / clean_record
        clean_h = _header_for_path(clean_path)
        channel_index = clean_h.channel_index(selection.channel)
        start = float(selection.start)
        duration = float(selection.duration)
        if start + duration > clean_h.duration_s + 1e-9:
            raise DatasetError("Selected segment is outside the clean reference record.")
        clean = load_segment(clean_path, channel_index, start, duration)
        noise_h = header(noise_record)
        noise_start = float(selection.noise_start)
        if noise_start + duration > noise_h.duration_s + 1e-9:
            raise DatasetError(
                f"Noise segment ends at {noise_start + duration:.1f} s, beyond the "
                f"noise record duration of {noise_h.duration_s:.1f} s."
            )
        if selection.noise_channel >= len(noise_h.sig_name):
            raise DatasetError("Selected noise channel does not exist.")
        noise = load_segment(noise_h.path, int(selection.noise_channel), noise_start, duration)
        n = min(len(clean), len(noise))
        clean = clean[:n]
        noise = noise[:n]
        signal_power = float(np.mean((clean - np.mean(clean)) ** 2))
        noise_centered = noise - float(np.mean(noise))
        noise_power = float(np.mean(noise_centered**2))
        if signal_power <= 0 or noise_power <= 0:
            raise DatasetError("Cannot scale the noise: signal or noise power is zero.")
        target = float(selection.target_snr_db)
        scale = math.sqrt(signal_power / (noise_power * 10.0 ** (target / 10.0)))
        noise_scaled = noise_centered * scale
        mixed = clean + noise_scaled
        achieved = 10.0 * math.log10(signal_power / float(np.mean(noise_scaled**2)))
        warnings = [
            f"Mixed with {config.NOISE_LABELS.get(noise_record, noise_record)} noise from "
            f"{noise_start:.1f} s; noise power was scaled to the requested conventional "
            f"power SNR ({target:.1f} dB).",
            "The clean reference is the unmodified MIT-BIH record; the mixture is an "
            "in-memory signal and is not written to the source dataset.",
        ]
        ann = annotations_for_segment(clean_record, start, duration)
        meta = {
            "record": f"{clean_record} + {noise_record}",
            "subject": clean_record,
            "nominal_snr_db": None,
            "fs": clean_h.fs,
            "duration_s": clean_h.duration_s,
            "channels": [
                {"name": name, "index": i, "units": clean_h.units[i] if i < len(clean_h.units) else "mV"}
                for i, name in enumerate(clean_h.sig_name)
            ],
            "has_reference": True,
            "reference_record": clean_record,
            "annotation_count": len(annotations(clean_record)[0]),
            "activity": {},
            "noise_segments": {},
            "recommended": {},
            "activity_step_s": 5.0,
            "activity_source": "not applicable",
            "comments": [],
        }
        return {
            "selection": selection.model_dump(),
            "mode": "mix",
            "record": f"{clean_record}+{noise_record}",
            "channel": selection.channel,
            "start_s": start,
            "duration_s": duration,
            "fs": clean_h.fs,
            "time": np.arange(len(mixed), dtype=float) / clean_h.fs,
            "input": mixed,
            "reference": clean,
            "input_stats": _stats(mixed),
            "reference_stats": _stats(clean),
            "offset_mv": 0.0,
            "annotations": ann,
            "meta": meta,
            "warnings": warnings,
            "mix": {
                "clean_record": clean_record,
                "noise_record": noise_record,
                "noise_label": config.NOISE_LABELS.get(noise_record, noise_record),
                "noise_channel": int(selection.noise_channel),
                "noise_start_s": noise_start,
                "target_snr_db": target,
                "achieved_snr_db": float(achieved),
                "noise_scale": float(scale),
                "noise_rms_mv": float(np.sqrt(np.mean(noise_scaled**2))),
            },
        }

    raise DatasetError(f"Unsupported selection mode: {selection.mode!r}")


def load_noise_segment(record: str, channel: int, start: float, duration: float) -> dict[str, Any]:
    if record not in list_noise_records():
        raise DatasetError(f"Unknown noise record {record!r}.")
    h = header(record)
    if channel < 0 or channel >= len(h.sig_name):
        raise DatasetError("Noise channel does not exist.")
    if start + duration > h.duration_s + 1e-9:
        raise DatasetError("Selected noise segment is outside the record.")
    x = load_segment(h.path, channel, start, duration)
    return {
        "record": record,
        "label": config.NOISE_LABELS.get(record, record),
        "channel": h.sig_name[channel],
        "start_s": float(start),
        "duration_s": float(duration),
        "fs": h.fs,
        "time": np.arange(len(x), dtype=float) / h.fs,
        "signal": x,
        "stats": _stats(x),
    }
