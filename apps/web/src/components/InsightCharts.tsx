import { nok } from "@/lib/format";
import type { InsightResult, InsightSpec, InsightUnit } from "@straume/domain";
import Link from "next/link";

const COLORS = ["#1d5c57", "#c4622d", "#1c7a49", "#8a5a12", "#3d5a80", "#9d2c2c", "#6d665e", "#7a4b8a"];

export function formatInsight(value: number, unit: InsightUnit) {
  if (unit === "nok") return nok(value);
  if (unit === "days") return `${value.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} dager`;
  if (unit === "percent") return `${value.toLocaleString("nb-NO", { maximumFractionDigits: 1 })} %`;
  return value.toLocaleString("nb-NO", { maximumFractionDigits: 1 });
}

export function drillHref(spec: InsightSpec, bucket = "__all") {
  return `/innsikt/avtaler?spec=${encodeURIComponent(JSON.stringify(spec))}&bucket=${encodeURIComponent(bucket)}`;
}

export function exportHref(spec: InsightSpec, format: "csv" | "xls") {
  return `/api/insights/export?format=${format}&spec=${encodeURIComponent(JSON.stringify(spec))}`;
}

export function InsightTile({ title, spec, result }: { title: string; spec: InsightSpec; result: InsightResult }) {
  const view = spec.view === "kpi" || result.buckets.length === 0 ? spec.view : spec.view;
  return (
    <section className={view === "kpi" ? "card kpi insight-kpi" : "card insight-card"}>
      <div className="insight-head">
        <h2>{title}</h2>
        <div className="row">
          <a href={exportHref(spec, "csv")}>CSV</a>
          <a href={exportHref(spec, "xls")}>Excel</a>
        </div>
      </div>
      {view === "kpi" ? <Kpi spec={spec} result={result} /> : null}
      {view === "bar" ? <Bars spec={spec} result={result} /> : null}
      {view === "line" ? <LineChart spec={spec} result={result} /> : null}
      {view === "donut" ? <Donut spec={spec} result={result} /> : null}
      {view === "funnel" ? <Funnel spec={spec} result={result} /> : null}
      {view === "table" ? <Pivot spec={spec} result={result} /> : null}
      {result.buckets.length === 0 ? <p className="muted">Ingen avtaler i utvalget.</p> : null}
    </section>
  );
}

function Delta({ result }: { result: InsightResult }) {
  if (result.compareTotal == null) return null;
  const text = result.delta == null ? "ingen sammenligningsgrunnlag" : `${result.delta > 0 ? "+" : ""}${result.delta.toLocaleString("nb-NO")} % mot sammenligning`;
  return <div className={result.delta != null && result.delta < 0 ? "muted delta down" : "muted delta"}>{text}</div>;
}

function Kpi({ spec, result }: { spec: InsightSpec; result: InsightResult }) {
  return (
    <Link href={drillHref(spec)}>
      <strong>{formatInsight(result.total, result.unit)}</strong>
      <Delta result={result} />
    </Link>
  );
}

function Bars({ spec, result }: { spec: InsightSpec; result: InsightResult }) {
  const max = Math.max(...result.buckets.map((bucket) => bucket.value), 1);
  return (
    <div className="bars">
      {result.buckets.map((bucket, index) => (
        <Link key={bucket.key} href={drillHref(spec, bucket.key)} className="bar-col" title={bucket.label}>
          <span className="bar-value">{formatInsight(bucket.value, result.unit)}</span>
          <span className="bar" style={{ height: `${Math.max(8, (bucket.value / max) * 140)}px`, background: COLORS[index % COLORS.length] }} />
          <span className="bar-label">{bucket.label}</span>
        </Link>
      ))}
    </div>
  );
}

function LineChart({ spec, result }: { spec: InsightSpec; result: InsightResult }) {
  const width = 640;
  const height = 180;
  const max = Math.max(...result.buckets.map((bucket) => bucket.value), 1);
  const step = result.buckets.length > 1 ? width / (result.buckets.length - 1) : width;
  const points = result.buckets.map((bucket, index) => {
    const x = result.buckets.length > 1 ? index * step : width / 2;
    const y = height - (bucket.value / max) * (height - 16);
    return { x, y, bucket };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  return (
    <svg viewBox={`0 0 ${width} ${height + 28}`} className="line-chart" role="img">
      <polyline fill="none" stroke="#1d5c57" strokeWidth="3" points={line} />
      {points.map((point) => (
        <Link key={point.bucket.key} href={drillHref(spec, point.bucket.key)}>
          <circle cx={point.x} cy={point.y} r="5" fill="#c4622d" />
        </Link>
      ))}
      {points.map((point) => (
        <text key={`${point.bucket.key}-l`} x={point.x} y={height + 18} textAnchor="middle" fontSize="11" fill="#6d665e">
          {point.bucket.label}
        </text>
      ))}
    </svg>
  );
}

function Donut({ spec, result }: { spec: InsightSpec; result: InsightResult }) {
  const total = result.buckets.reduce((sum, bucket) => sum + bucket.value, 0) || 1;
  const radius = 42;
  const circ = 2 * Math.PI * radius;
  const lengths = result.buckets.map((bucket) => (bucket.value / total) * circ);
  const slices = lengths.map((length, index) => ({
    key: result.buckets[index]?.key ?? String(index),
    length,
    offset: lengths.slice(0, index).reduce((sum, item) => sum + item, 0),
  }));
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 120 120" className="donut">
        {slices.map((slice, index) => (
          <circle key={slice.key} cx="60" cy="60" r={radius} fill="none" stroke={COLORS[index % COLORS.length]} strokeWidth="16" strokeDasharray={`${slice.length} ${circ - slice.length}`} strokeDashoffset={-slice.offset} transform="rotate(-90 60 60)" />
        ))}
      </svg>
      <ul className="legend">
        {result.buckets.map((bucket, index) => (
          <li key={bucket.key}>
            <Link href={drillHref(spec, bucket.key)}>
              <i style={{ background: COLORS[index % COLORS.length] }} />
              {bucket.label} · {formatInsight(bucket.value, result.unit)}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Funnel({ spec, result }: { spec: InsightSpec; result: InsightResult }) {
  const max = Math.max(...result.buckets.map((bucket) => bucket.value), 1);
  return (
    <div className="funnel">
      {result.buckets.map((bucket, index) => (
        <Link key={bucket.key} href={drillHref(spec, bucket.key)} className="funnel-row">
          <span>{bucket.label}</span>
          <span className="funnel-track">
            <span style={{ width: `${Math.max(8, (bucket.value / max) * 100)}%`, background: COLORS[index % COLORS.length] }} />
          </span>
          <strong>
            {bucket.value.toLocaleString("nb-NO")}
            {bucket.rate != null ? <small> {bucket.rate} %</small> : null}
          </strong>
        </Link>
      ))}
    </div>
  );
}

function Pivot({ spec, result }: { spec: InsightSpec; result: InsightResult }) {
  const segments = result.buckets.flatMap((bucket) => bucket.segments ?? []);
  const segmentKeys = [...new Map(segments.map((segment) => [segment.key, segment.label])).entries()];
  return (
    <table>
      <thead>
        <tr>
          <th>Gruppe</th>
          {segmentKeys.length > 0 ? segmentKeys.map(([key, label]) => <th key={key}>{label}</th>) : <th>Verdi</th>}
        </tr>
      </thead>
      <tbody>
        {result.buckets.map((bucket) => (
          <tr key={bucket.key}>
            <td>
              <Link href={drillHref(spec, bucket.key)}>{bucket.label}</Link>
            </td>
            {segmentKeys.length > 0 ? (
              segmentKeys.map(([key]) => <td key={key}>{formatInsight(bucket.segments?.find((segment) => segment.key === key)?.value ?? 0, result.unit)}</td>)
            ) : (
              <td>{formatInsight(bucket.value, result.unit)}</td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function GoalList({ goals }: { goals: { id: string; ownerName: string; metric: "sum" | "count"; actual: number; target: number; ratio: number; periodStart: string | null; periodEnd: string | null }[] }) {
  if (goals.length === 0) return null;
  return (
    <section className="card">
      <h2>Salgsmål</h2>
      <div className="stack">
        {goals.map((goal) => (
          <div key={goal.id}>
            <div className="insight-head">
              <strong>{goal.ownerName}</strong>
              <span>
                {goal.metric === "count" ? `${goal.actual} av ${goal.target}` : `${nok(goal.actual)} av ${nok(goal.target)}`} · {Math.round(goal.ratio * 100)} %
              </span>
            </div>
            <div className="goal-track">
              <span style={{ width: `${Math.min(100, Math.round(goal.ratio * 100))}%` }} />
            </div>
            <div className="muted">
              {goal.periodStart} – {goal.periodEnd}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
