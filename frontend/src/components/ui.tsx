import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  lede,
  actions,
}: {
  eyebrow: string;
  title: string;
  lede?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1 className="page-title">{title}</h1>
        {lede ? <p className="page-lede">{lede}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </header>
  );
}

export function Panel({
  title,
  subtitle,
  actions,
  children,
  footer,
  className = "",
  bodyClassName = "panel-body",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`panel ${className}`.trim()}>
      {title || actions ? (
        <div className="panel-head">
          <div>
            {title ? <h2 className="panel-title">{title}</h2> : null}
            {subtitle ? <p className="panel-sub">{subtitle}</p> : null}
          </div>
          {actions ? <div className="chart-actions">{actions}</div> : null}
        </div>
      ) : null}
      <div className={bodyClassName}>{children}</div>
      {footer ? <div className="panel-foot">{footer}</div> : null}
    </section>
  );
}

export function Stat({
  label,
  value,
  note,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note ? <div className="stat-note">{note}</div> : null}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="stat-grid">{children}</div>;
}

export function Pill({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "ok" | "warn" | "navy";
}) {
  const cls = tone === "default" ? "pill" : `pill ${tone}`;
  return <span className={cls}>{children}</span>;
}

export function Note({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "warn" | "danger";
}) {
  const cls = tone === "info" ? "note" : `note ${tone}`;
  return <div className={cls}>{children}</div>;
}

export function EmptyState({
  title,
  children,
  actions,
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      {children}
      {actions ? <div style={{ marginTop: 14 }}>{actions}</div> : null}
    </div>
  );
}

export function LoadingLine({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return <div className="loading-line" role="progressbar" aria-label="Loading" />;
}

export function SectionTitle({
  children,
  meta,
}: {
  children: ReactNode;
  meta?: ReactNode;
}) {
  return (
    <div className="section-title">
      <h2>{children}</h2>
      {meta ? <div className="meta">{meta}</div> : null}
    </div>
  );
}

export function AcademicNotice() {
  return (
    <div className="note">
      <strong>Academic use.</strong> ECG Filter Lab is a DSP teaching and
      coursework tool. It is not a medical device, has not been clinically
      validated, and must not be used for diagnosis, monitoring or treatment.
    </div>
  );
}

export function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}
