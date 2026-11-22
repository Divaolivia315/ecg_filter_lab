"""Application paths and constants.

The NSTDB download lives outside this project in the user's read-only
workspace.  Nothing here ever writes to the source dataset.
"""
from __future__ import annotations

import os
from pathlib import Path

APP_VERSION = "1.0.0"
INDEX_VERSION = 3

PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_ROOT / "data"
CLEAN_REF_DIR = Path(os.getenv("ECG_CLEAN_REF_DIR", str(DATA_DIR / "clean-reference"))).expanduser().resolve()
RUNTIME_DATA_DIR = Path(
    os.getenv("ECG_RUNTIME_DIR", "/tmp/ecg-filter-lab" if os.getenv("VERCEL") else str(DATA_DIR))
).expanduser().resolve()
EXPERIMENTS_DIR = Path(os.getenv("ECG_EXPERIMENTS_DIR", str(RUNTIME_DATA_DIR / "experiments"))).expanduser().resolve()
CACHE_DIR = Path(os.getenv("ECG_CACHE_DIR", str(RUNTIME_DATA_DIR / "cache"))).expanduser().resolve()
DATASET_INDEX_PATH = CACHE_DIR / "dataset_index.json"

FS_EXPECTED = 360.0
MIN_SEGMENT_SECONDS = 5.0
MAX_SEGMENT_SECONDS = 60.0
DEFAULT_SEGMENT_SECONDS = 10.0

NOISE_LABELS = {
    "bw": "Baseline Wander",
    "ma": "Muscle Artifact",
    "em": "Electrode Motion",
}
NOISE_DESCRIPTIONS = {
    "bw": (
        "Low-frequency baseline drift caused by respiration, perspiration or "
        "body movement. It overlaps the ECG below roughly 0.5 Hz."
    ),
    "ma": (
        "Muscle (EMG) artifact with broadband energy that overlaps the ECG and "
        "extends well above the diagnostic ECG band."
    ),
    "em": (
        "Intermittent electrode-motion artifact; it contains baseline wander and "
        "muscle noise and is generally the hardest NSTDB noise to remove."
    ),
}

# The NSTDB distribution does not ship the clean source recordings.  These are
# the official MIT-BIH Arrhythmia Database records 118 and 119, downloaded
# separately from https://physionet.org/files/mitdb/1.0.0/.
REFERENCE_SOURCE = {
    "database": "MIT-BIH Arrhythmia Database v1.0.0",
    "base_url": "https://physionet.org/files/mitdb/1.0.0/",
    "records": ["118", "119"],
}

LIMITATIONS = [
    (
        "The NSTDB folder itself does not contain the clean source ECGs. "
        "Reference-based SNR, RMSE and morphology metrics therefore require the "
        "optional clean-reference files for MIT-BIH records 118 and 119."
    ),
    (
        "NSTDB nominal SNR values come from the nst program: S is derived from "
        "QRS peak-to-peak amplitude and N is a frequency-weighted noise power. "
        "They are not conventional power SNR values and will differ from the "
        "measured SNR shown here."
    ),
    (
        "Noise is added by nst after the first five minutes in alternating "
        "two-minute noisy and two-minute noise-free intervals. Segments crossing "
        "those protocol boundaries can contain DC steps."
    ),
    (
        "This is an academic DSP application. It is not a medical device and must "
        "not be used for diagnosis or treatment."
    ),
]


def _valid_dataset(path: Path) -> bool:
    return all((path / required).is_file() for required in ("RECORDS", "bw.hea", "bw.dat"))


def find_dataset_dir() -> Path | None:
    candidates: list[Path] = []
    env = os.getenv("ECG_DATASET_DIR")
    if env:
        candidates.append(Path(env))
    candidates.extend(
        [
            DATA_DIR / "NSTDB" / "mit-bih-noise-stress-test-database-1.0.0",
            DATA_DIR / "nstdb" / "mit-bih-noise-stress-test-database-1.0.0",
            DATA_DIR / "NSTDB",
            PROJECT_ROOT.parent / "website" / "mit-bih-noise-stress-test-database-1.0.0",
            PROJECT_ROOT.parent.parent / "website" / "mit-bih-noise-stress-test-database-1.0.0",
            Path(r"C:\Users\EKG\website\mit-bih-noise-stress-test-database-1.0.0"),
            PROJECT_ROOT / "dataset" / "mit-bih-noise-stress-test-database-1.0.0",
        ]
    )
    for candidate in candidates:
        try:
            candidate = candidate.expanduser().resolve()
        except OSError:
            continue
        if _valid_dataset(candidate):
            return candidate
    return None


DATASET_DIR = find_dataset_dir()

def ensure_dirs() -> None:
    for directory in (CACHE_DIR, EXPERIMENTS_DIR):
        directory.mkdir(parents=True, exist_ok=True)
