import { AcademicNotice, PageHeader, Panel, Pill } from "../components/ui";

function Formula({ children }: { children: string }) {
  return <div className="formula mono">{children}</div>;
}

export default function MethodsPage() {
  return (
    <div className="page">
      <PageHeader
        eyebrow="Reference"
        title="Methods & Educational Notes"
        lede="Definitions, design choices and limitations behind the application. These notes are part of the coursework documentation and are intended to make every reported number traceable."
        actions={<Pill tone="navy">DSP theory</Pill>}
      />

      <div className="grid grid-2">
        <Panel title="1 · Dataset" subtitle="MIT-BIH Noise Stress Test Database">
          <p className="small muted" style={{ marginTop: 0 }}>
            The NSTDB contains twelve noisy ECG records derived from two MIT-BIH Arrhythmia
            Database subjects (118 and 119) and three two-channel noise records: baseline wander
            (BW), muscle artifact (MA) and electrode motion (EM). Every record is sampled at
            360 Hz and lasts 30 minutes.
          </p>
          <p className="small muted">
            Noise is added by the <span className="mono">nst</span> program after the first five
            minutes, in alternating two-minute noisy and two-minute clean intervals. A segment can
            therefore cross a protocol boundary and contain a DC step. The application warns about
            the removed offset, but does not attempt to hide the underlying data.
          </p>
          <p className="small muted">
            The NSTDB distribution does not ship the clean source ECGs. The official MIT-BIH
            Arrhythmia Database records 118 and 119 are downloaded separately from PhysioNet into
            <span className="mono"> data/clean-reference</span>. When present, they enable
            reference-based metrics and noise mixing. When absent, those features are disabled
            rather than approximated.
          </p>
        </Panel>

        <Panel title="2 · Signal conditioning" subtitle="What happens before metrics">
          <ul className="warning-list">
            <li>
              WFDB physical samples are read at the record&apos;s native sampling frequency; no
              resampling is performed.
            </li>
            <li>
              Noisy NSTDB records use a different ADC baseline from the clean MIT-BIH records. A
              constant median offset is removed after alignment. The value is reported.
            </li>
            <li>
              No detrending, clipping, smoothing or synthetic augmentation is applied to the
              filtered input. The only preprocessing is the constant DC offset removal.
            </li>
            <li>
              Both filters receive the identical sample array. Zero-phase filtering
              (<span className="mono">filtfilt</span> / <span className="mono">sosfiltfilt</span>)
              is used for both.
            </li>
          </ul>
        </Panel>
      </div>

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <Panel title="3 · FIR design" subtitle="Window method, linear phase">
          <p className="small muted" style={{ marginTop: 0 }}>
            The FIR filters are designed with <span className="mono">scipy.signal.firwin</span>.
            The requested order is converted to an odd tap count, producing a Type I linear-phase
            filter that supports low-pass, high-pass, band-pass and band-stop responses. Hamming,
            Blackman, Hann, Bartlett and Kaiser windows are available.
          </p>
          <Formula>h[n] = h_d[n] · w[n],  n = 0 … N−1</Formula>
          <p className="small muted">
            The causal group delay is <span className="mono">(N−1)/2</span> samples. Zero-phase
            filtering cancels it, at the cost of requiring enough samples for padding. The
            approximate transition width scales as <span className="mono">fs/N</span>, so a
            sharper response requires more taps.
          </p>
        </Panel>

        <Panel title="4 · IIR design" subtitle="Butterworth, Chebyshev, elliptic">
          <p className="small muted" style={{ marginTop: 0 }}>
            The IIR filters are designed in second-order sections with{" "}
            <span className="mono">scipy.signal.butter</span>,{" "}
            <span className="mono">cheby1</span>, <span className="mono">cheby2</span> or{" "}
            <span className="mono">ellip</span>. SOS form is used for numerical stability, and
            poles are checked before filtering.
          </p>
          <p className="small muted">
            Butterworth is maximally flat; Chebyshev I allows passband ripple for a steeper
            transition; Chebyshev II controls stopband ripple; elliptic filters trade both for the
            sharpest transition at a given order. IIR phase is nonlinear, so the causal group delay
            varies with frequency.
          </p>
          <Formula>H(z) = (Σ b_k z^−k) / (1 + Σ a_k z^−k)</Formula>
        </Panel>
      </div>

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <Panel title="5 · Zero-phase filtering" subtitle="Why both filters are applied forward and backward">
          <p className="small muted" style={{ marginTop: 0 }}>
            A causal filter delays the signal. Comparing a delayed FIR output with an undelayed IIR
            output would bias RMSE and timing metrics. Applying the filter forward and then
            backward cancels the phase response, producing approximately zero net delay and a
            magnitude response equal to the square of the single-pass magnitude.
          </p>
          <Formula>y = H(H(x))  ⇒  |H_eff(f)| = |H(f)|²,  ∠H_eff(f) = 0</Formula>
          <p className="small muted">
            The plotted frequency response is the single-pass design. The effective zero-phase
            response is steeper. This is disclosed in the charts and exports.
          </p>
        </Panel>

        <Panel title="6 · Metrics" subtitle="Exact definitions used in the tables">
          <Formula>SNR = 10 log₁₀( P_ref / P_err )</Formula>
          <Formula>RMSE = sqrt( mean( (y − d)² ) )</Formula>
          <Formula>PRD = 100 · sqrt( Σ(y − d)² / Σd² )</Formula>
          <Formula>r = corr(d, y)</Formula>
          <p className="small muted">
            Here <span className="mono">d</span> is the clean reference and{" "}
            <span className="mono">y</span> is the input or filtered signal. Each signal&apos;s mean
            is removed first, so a constant DC offset cannot masquerade as signal or noise. Slow
            baseline drift remains part of the error. These are conventional power metrics, not
            the NSTDB nominal SNR.
          </p>
          <p className="small muted">
            The linear decomposition{" "}
            <span className="mono">y − d = (H{"{"}d{"}"} − d) + H{"{"}input − d{"}"}</span> separates
            signal distortion from residual noise, because filtering is linear and the mixture is
            additive.
          </p>
        </Panel>
      </div>

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <Panel title="7 · Morphology preservation" subtitle="P, QRS and T windows">
          <p className="small muted" style={{ marginTop: 0 }}>
            MIT-BIH provides beat annotations (mostly R peaks), not P/T annotations. For every
            annotated beat inside the segment, three windows are extracted relative to the R peak:
          </p>
          <dl className="kv">
            <dt>P</dt>
            <dd>−250 to −80 ms</dd>
            <dt>QRS</dt>
            <dd>−60 to +80 ms</dd>
            <dt>T</dt>
            <dd>+120 to +400 ms</dd>
          </dl>
          <p className="small muted">
            Correlation, RMSE, peak-to-peak amplitude ratio and QRS timing shift are computed per
            beat and summarised by the median. These are preservation indices, not diagnostic
            wave-detection results. Neighbouring beats can overlap the P/T windows at high heart
            rates.
          </p>
        </Panel>

        <Panel title="8 · NSTDB nominal SNR" subtitle="A different definition">
          <p className="small muted" style={{ marginTop: 0 }}>
            The nominal SNR in NSTDB record names is produced by <span className="mono">nst</span>.
            It uses a signal level derived from QRS peak-to-peak amplitude and a noise level based
            on frequency-weighted noise power. It is not the conventional power SNR used in this
            application.
          </p>
          <p className="small muted">
            For this reason the nominal value is shown as metadata, while the measured SNR is
            computed independently from the clean reference. The two should not be treated as
            interchangeable.
          </p>
          <Pill tone="warn">Nominal NSTDB SNR ≠ measured power SNR</Pill>
        </Panel>
      </div>

      <div className="grid grid-2" style={{ marginTop: 18 }}>
        <Panel title="9 · Processing time" subtitle="What is measured">
          <p className="small muted" style={{ marginTop: 0 }}>
            Design time measures filter construction. Application time measures a single
            zero-phase filter pass, reported as the median of three passes. Total time is design
            plus application. These are wall-clock measurements in the Python backend and vary with
            CPU load, segment length, order and BLAS behaviour.
          </p>
          <p className="small muted">
            Timing is not a clinically meaningful criterion on its own. A shorter runtime does not
            imply better denoising.
          </p>
        </Panel>

        <Panel title="10 · Academic integrity" subtitle="Use and limitations">
          <AcademicNotice />
          <ul className="warning-list" style={{ marginTop: 12 }}>
            <li>No ECG sample, metric, spectrum or conclusion is randomly generated or hardcoded.</li>
            <li>Every result is tied to the selected record, segment and filter configuration.</li>
            <li>No universal winner is claimed from a single segment.</li>
            <li>Exports retain the caveats so results are not detached from their context.</li>
            <li>This tool is not a medical device and must not be used for patient care.</li>
          </ul>
        </Panel>
      </div>

      <Panel title="References" subtitle="Primary sources and software." className="" >
        <ul className="reference-links">
          <li>
            Moody GB, Muldrow WE, Mark RG. “A noise stress test for arrhythmia detectors.”
            <em> Computers in Cardiology</em>, 1984.
          </li>
          <li>
            Goldberger AL, et al. “PhysioBank, PhysioToolkit, and PhysioNet: components of a new
            research resource for complex physiologic signals.” <em>Circulation</em>, 2000.
          </li>
          <li>
            MIT-BIH Noise Stress Test Database v1.0.0. PhysioNet.{" "}
            <span className="mono">physionet.org/content/nstdb/1.0.0/</span>
          </li>
          <li>
            MIT-BIH Arrhythmia Database v1.0.0. PhysioNet.{" "}
            <span className="mono">physionet.org/content/mitdb/1.0.0/</span>
          </li>
          <li>
            Virtanen P, et al. “SciPy 1.0: fundamental algorithms for scientific computing in
            Python.” <em>Nature Methods</em>, 2020.
          </li>
          <li>
            WFDB Python package. <span className="mono">physionet.org/content/wfdb-python/</span>
          </li>
        </ul>
      </Panel>
    </div>
  );
}
