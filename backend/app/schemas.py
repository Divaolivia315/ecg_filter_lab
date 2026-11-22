from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


FilterType = Literal["lowpass", "highpass", "bandpass", "notch"]
FilterFamily = Literal["fir", "iir"]
FIRWindow = Literal["hamming", "blackman", "hanning", "bartlett", "kaiser"]
IIRMethod = Literal["butterworth", "chebyshev1", "chebyshev2", "elliptic"]


class SignalSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["existing", "mix"] = "existing"
    record: str = "118e06"
    clean_record: str = "118"
    noise_record: str = "em"
    channel: str = "MLII"
    noise_channel: int = Field(default=0, ge=0, le=1)
    start: float = Field(default=300.0, ge=0.0)
    duration: float = Field(default=10.0, ge=1.0, le=60.0)
    target_snr_db: float = Field(default=6.0, ge=-10.0, le=30.0)
    noise_start: float = Field(default=300.0, ge=0.0)


class FilterConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    family: FilterFamily
    filter_type: FilterType = "bandpass"
    order: int = Field(default=128, ge=2, le=1024)
    cutoff: float | None = Field(default=None, ge=0.01)
    cutoff_low: float | None = Field(default=0.5, ge=0.01)
    cutoff_high: float | None = Field(default=40.0, ge=0.01)
    window: FIRWindow = "hamming"
    kaiser_beta: float = Field(default=8.6, ge=0.0, le=20.0)
    iir_method: IIRMethod = "butterworth"
    ripple_db: float = Field(default=1.0, gt=0.0, le=10.0)
    attenuation_db: float = Field(default=40.0, gt=0.0, le=120.0)
    notch_q: float = Field(default=30.0, ge=0.5, le=200.0)


class CompareRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    selection: SignalSelection
    fir: FilterConfig
    iir: FilterConfig
    name: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=2000)
    save: bool = True


class ResponseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fir: FilterConfig
    iir: FilterConfig
    fs: float = Field(default=360.0, gt=0.0)


class NoisePreviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    record: str
    channel: int = Field(default=0, ge=0, le=1)
    start: float = Field(default=300.0, ge=0.0)
    duration: float = Field(default=10.0, ge=1.0, le=60.0)
