import { useEffect } from "react";
import {
  NavLink,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AppProvider, useApp } from "./state";
import Dashboard from "./pages/Dashboard";
import DatasetPage from "./pages/DatasetPage";
import SignalPage from "./pages/SignalPage";
import FiltersPage from "./pages/FiltersPage";
import ComparisonPage from "./pages/ComparisonPage";
import EvaluationPage from "./pages/EvaluationPage";
import ResultsPage from "./pages/ResultsPage";
import MethodsPage from "./pages/MethodsPage";
import { AcademicNotice, Pill } from "./components/ui";

const NAV = [
  {
    label: "Workflow",
    items: [
      { to: "/", index: "01", label: "Dashboard", end: true },
      { to: "/dataset", index: "02", label: "Dataset selection" },
      { to: "/signal", index: "03", label: "Signal visualization" },
      { to: "/filters", index: "04", label: "Filter configuration" },
      { to: "/comparison", index: "05", label: "FIR vs IIR comparison" },
      { to: "/evaluation", index: "06", label: "Performance evaluation" },
      { to: "/results", index: "07", label: "Experiment results" },
    ],
  },
  {
    label: "Reference",
    items: [{ to: "/methods", index: "A", label: "Methods & notes" }],
  },
];

function ScrollToTop() {
  const location = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, [location.pathname]);
  return null;
}

function Crumb() {
  const location = useLocation();
  const flat = NAV.flatMap((section) => section.items);
  const current =
    flat.find((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to))) ??
    flat[0];
  return (
    <div className="crumb">
      ECG Filter Lab <span>/</span> {current.label}
    </div>
  );
}

function Topbar() {
  const { dataset, preview, fir, iir, history } = useApp();
  const online = Boolean(dataset);
  return (
    <div className="topbar">
      <div className="topbar-left">
        <Crumb />
      </div>
      <div className="topbar-right">
        {preview ? (
          <span className="topbar-context mono">
            {preview.record} · {preview.channel} · {preview.duration_s.toFixed(0)} s
          </span>
        ) : null}
        <Pill tone={online ? "ok" : "warn"}>{online ? "NSTDB online" : "Dataset offline"}</Pill>
        <Pill tone={dataset?.clean_reference_available ? "ok" : "warn"}>
          {dataset?.clean_reference_available ? "Clean reference" : "No reference"}
        </Pill>
        <Pill>{history.length} saved</Pill>
        <span className="topbar-filters mono" title="Current filter families">
          FIR {fir.order} · IIR {iir.order}
        </span>
      </div>
    </div>
  );
}

function Sidebar() {
  const { dataset } = useApp();
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">DSP</div>
        <div>
          <div className="brand-title">ECG Filter Lab</div>
          <div className="brand-sub">FIR / IIR denoising</div>
        </div>
      </div>
      <nav className="nav" aria-label="Primary">
        {NAV.map((section) => (
          <div className="nav-section" key={section.label}>
            <div className="nav-section-label">{section.label}</div>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}
              >
                <span>{item.label}</span>
                <span className="nav-index">{item.index}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="sidebar-footer">
        <div>
          <strong>Source</strong>
          <br />
          MIT-BIH NSTDB
          <br />
          PhysioNet, 360 Hz
        </div>
        <div style={{ marginTop: 10 }}>
          <strong>Version</strong> {dataset?.app_version ?? "1.0.0"}
        </div>
        <div style={{ marginTop: 10 }}>Academic DSP tool · not for diagnosis.</div>
      </div>
    </aside>
  );
}

function Layout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="main">
        <Topbar />
        <ScrollToTop />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dataset" element={<DatasetPage />} />
          <Route path="/signal" element={<SignalPage />} />
          <Route path="/filters" element={<FiltersPage />} />
          <Route path="/comparison" element={<ComparisonPage />} />
          <Route path="/evaluation" element={<EvaluationPage />} />
          <Route path="/results" element={<ResultsPage />} />
          <Route path="/methods" element={<MethodsPage />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
        <footer className="footer">
          <div>
            <strong>ECG Filter Lab</strong> · FIR and IIR denoising comparison on the MIT-BIH
            Noise Stress Test Database.
          </div>
          <div>
            Real PhysioNet data only. No synthetic ECG, metrics or conclusions. Not a medical
            device.
          </div>
        </footer>
        <div style={{ marginTop: 16 }}>
          <AcademicNotice />
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <Layout />
    </AppProvider>
  );
}
