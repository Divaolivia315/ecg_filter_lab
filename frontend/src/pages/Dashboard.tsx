import { useApp } from "../state";
import { fmt } from "../utils";
import SelectionForm from "../components/SelectionForm";
import FilterEditor from "../components/FilterEditor";
import {
  ComparisonSignalChart,
  FilterResponseCharts,
  PreviewSignalChart,
  ResidualChart,
  SpectrumChart,
} from "../components/SignalCharts";
import {
  BandPowerTable,
  DecompositionTable,
  FilterDesignSummary,
  MorphologyTable,
  ProcessingTable,
  SignalMetricsTable,
} from "../components/MetricTables";
import { AcademicNotice, LoadingLine, Note, Panel, Pill, Spinner } from "../components/ui";

export default function Dashboard() {
  const {
    dataset,
    records,
    noises,
    references,
    selection,
    setSelection,
    fir,
    setFir,
    iir,
    setIir,
    preview,
    previewLoading,
    previewError,
    refreshPreview,
    result,
    running,
    runError,
    runComparison,
    dataLoading,
    dataError,
    reloadData,
  } = useApp();
  const fs = preview?.fs ?? dataset?.fs ?? 360;

  const run = async () => {
    try {
      await runComparison({ save: false });
    } catch {
      // Errors are rendered from shared application state.
    }
  };

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div className="brand-mark">ECG</div>
        <div className="header-copy">
          <div className="eyebrow">DIGITAL SIGNAL PROCESSING LAB</div>
          <h1>ECG Filter Lab</h1>
          <p>Explore FIR and IIR denoising on MIT-BIH ECG signals.</p>
        </div>
        <div className="header-status">
          <Pill tone={dataset ? "ok" : dataLoading ? "default" : "warn"}>
            {dataLoading ? "Connecting" : dataset ? "Dataset ready" : "Dataset unavailable"}
          </Pill>
          <span>{dataset?.clean_reference_available ? "Reference available" : "Reference unavailable"}</span>
        </div>
      </header>

      {dataError ? (
        <Note tone="danger">
          <strong>Backend unavailable.</strong> {dataError}{" "}
          <button type="button" className="btn btn-small" onClick={() => void reloadData()}>Retry</button>
        </Note>
      ) : null}

      <section className="dashboard-section" aria-labelledby="dataset-title">
        <div className="section-heading">
          <span className="section-number">01</span>
          <div>
            <h2 id="dataset-title">Dataset Selection</h2>
            <p>Choose a noisy record or create a controlled mixture.</p>
          </div>
        </div>
        <Panel>
          <SelectionForm
            selection={selection}
            onChange={setSelection}
            records={records}
            noises={noises}
            references={references}
            fs={fs}
            showRecordInfo={false}
          />
          <div className="dataset-footline">
            <span>{dataset ? `${records.length} ECG records · ${noises.length} noise records · ${fmt(dataset.fs, 0)} Hz` : "Waiting for dataset metadata"}</span>
            {dataset?.dataset_path ? <span className="mono">{dataset.dataset_path}</span> : null}
          </div>
        </Panel>
      </section>

      <section className="dashboard-section" aria-labelledby="filters-title">
        <div className="section-heading">
          <span className="section-number">02</span>
          <div>
            <h2 id="filters-title">Filter Configuration</h2>
            <p>Configure both filters; each processes the same selected input.</p>
          </div>
        </div>
        <div className="filter-grid">
          <Panel title="FIR filter" subtitle="Linear phase · window design"><FilterEditor family="fir" config={fir} onChange={setFir} fs={fs} /></Panel>
          <Panel title="IIR filter" subtitle="Recursive · second-order sections"><FilterEditor family="iir" config={iir} onChange={setIir} fs={fs} /></Panel>
        </div>
        <div className="run-row">
          <span className="muted">Filtering uses zero-phase forward-backward application.</span>
          <button type="button" className="btn btn-primary run-button" onClick={() => void run()} disabled={running || !dataset}>
            {running ? <><Spinner /> Filtering…</> : "Run FIR vs IIR comparison"}
          </button>
        </div>
        {runError ? <Note tone="danger"><strong>Filtering failed.</strong> {runError}</Note> : null}
        <LoadingLine visible={running} />
      </section>

      <section className="dashboard-section" aria-labelledby="visualization-title">
        <div className="section-heading">
          <span className="section-number">03</span>
          <div>
            <h2 id="visualization-title">Signal Visualization</h2>
            <p>Inspect the selected input and both filtered outputs.</p>
          </div>
          {previewLoading ? <span className="muted small">Loading signal…</span> : null}
        </div>
        {previewError ? <Note tone="warn">{previewError} <button className="btn btn-small" onClick={() => void refreshPreview()}>Retry</button></Note> : null}
        {result ? <ComparisonSignalChart result={result} /> : preview ? <PreviewSignalChart preview={preview} /> : (
          <Panel><p className="muted">Choose a dataset to preview the original ECG. FIR and IIR traces appear after comparison.</p></Panel>
        )}
      </section>

      <section className="dashboard-section" aria-labelledby="performance-title">
        <div className="section-heading">
          <span className="section-number">04</span>
          <div>
            <h2 id="performance-title">Performance Comparison</h2>
            <p>Reference-based quality metrics and measured processing time for this segment.</p>
          </div>
        </div>
        {result ? (
          <>
            <div className="performance-grid">
              <Panel title="Signal quality" subtitle={result.reference_available ? "Measured against the clean reference" : "Reference metrics are unavailable for this record"}>
                {result.reference_available ? <SignalMetricsTable result={result} /> : <Note tone="warn">SNR, RMSE, and PRD require a matching clean reference. Filtered signals and processing times are still available.</Note>}
              </Panel>
              <Panel title="Processing time" subtitle="Design and filter application timings from this run.">
                <ProcessingTable result={result} />
              </Panel>
            </div>
            <details className="advanced-evaluation">
              <summary>Additional evaluation details</summary>
              <div className="advanced-content">
                <div className="filter-grid">
                  <FilterDesignSummary design={result.filters.fir} />
                  <FilterDesignSummary design={result.filters.iir} />
                </div>
                <FilterResponseCharts result={result} />
                <ResidualChart result={result} />
                {result.reference_available && result.morphology.available ? <Panel title="P / QRS / T morphology preservation"><MorphologyTable result={result} /></Panel> : null}
                {result.reference_available ? <Panel title="Noise suppression and signal distortion"><DecompositionTable result={result} /></Panel> : null}
                <Panel title="Spectrum and band power"><SpectrumChart spectrum={result.spectrum} /><BandPowerTable result={result} /></Panel>
                {result.conclusions.length ? <Panel title="Interpretation"><ul className="conclusion-list">{result.conclusions.map((item) => <li key={item}>{item}</li>)}</ul></Panel> : null}
                {result.warnings.length ? <Panel title="Run notes"><ul className="warning-list">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></Panel> : null}
              </div>
            </details>
          </>
        ) : (
          <Panel><p className="muted">Run a comparison to see SNR, RMSE, PRD, and processing time.</p></Panel>
        )}
      </section>

      <footer className="dashboard-footer"><AcademicNotice /><span>MIT-BIH data · FIR / IIR comparison · Academic use only</span></footer>
    </main>
  );
}
