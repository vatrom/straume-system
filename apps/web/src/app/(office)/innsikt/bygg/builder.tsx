"use client";

import { InsightTile } from "@/components/InsightCharts";
import type { InsightResult, InsightSpec } from "@straume/domain";
import { useEffect, useState } from "react";

type Meta = {
  sellers: { id: string; name: string }[];
  pipelines: { id: string; name: string; stages: { id: string; name: string }[] }[];
  sources: string[];
  areas: string[];
  fields: { key: string; name: string; options: string[] }[];
  reports: { id: string; name: string; shared: boolean; ownerName: string; spec: InsightSpec }[];
};

const KINDS: { value: InsightSpec["kind"]; label: string }[] = [
  { value: "won", label: "Avtaler vunnet" },
  { value: "lost", label: "Avtaler tapt" },
  { value: "started", label: "Avtaler startet" },
  { value: "funnel", label: "Konvertering / trakt" },
  { value: "movement", label: "Fasebevegelser" },
  { value: "forecast", label: "Vektet prognose" },
  { value: "average", label: "Gjennomsnittlig ordreverdi" },
  { value: "cycle", label: "Salgssyklus" },
  { value: "lost_reasons", label: "Tapsgrunner" },
  { value: "activity", label: "Aktivitet per selger" },
  { value: "quotes", label: "Tilbud" },
  { value: "quote_margin", label: "Margin på tilbud" },
  { value: "quote_hit", label: "Hitrate tilbud til vunnet" },
  { value: "planned_hours", label: "Planlagte timer" },
];

const GROUPS: { value: InsightSpec["groupBy"]; label: string }[] = [
  { value: "none", label: "Ingen" },
  { value: "seller", label: "Selger" },
  { value: "pipeline", label: "Pipeline" },
  { value: "stage", label: "Fase" },
  { value: "source", label: "Kilde" },
  { value: "lostReason", label: "Tapsgrunn" },
  { value: "area", label: "Område" },
  { value: "month", label: "Måned" },
  { value: "quarter", label: "Kvartal" },
  { value: "year", label: "År" },
];

export function ReportBuilder({ meta, initial }: { meta: Meta; initial: InsightSpec }) {
  const [spec, setSpec] = useState<InsightSpec>(initial);
  const [result, setResult] = useState<InsightResult | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [message, setMessage] = useState("");
  const stages = meta.pipelines.find((pipeline) => pipeline.id === spec.pipelineId)?.stages ?? meta.pipelines.flatMap((pipeline) => pipeline.stages);
  const field = meta.fields.find((item) => item.key === spec.customKey);

  useEffect(() => {
    void run(initial);
    // Første visning bruker spec som siden ble åpnet med.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function run(next = spec) {
    setError("");
    const response = await fetch("/api/insights/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "Kunne ikke kjøre rapporten");
      return;
    }
    setResult(data as InsightResult);
  }

  function patch(partial: Partial<InsightSpec>) {
    const next = { ...spec, ...partial };
    setSpec(next);
    return next;
  }

  return (
    <div className="stack">
      <form
        className="card stack"
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <h2>Rapportbygger</h2>
        <div className="row">
          <label className="field">
            <span>Rapport</span>
            <select value={spec.kind} onChange={(event) => patch({ kind: event.target.value as InsightSpec["kind"] })}>
              {KINDS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Mål</span>
            <select value={spec.measure} onChange={(event) => patch({ measure: event.target.value as InsightSpec["measure"] })}>
              <option value="sum">Sum</option>
              <option value="count">Antall</option>
              <option value="avg">Snitt</option>
            </select>
          </label>
          <label className="field">
            <span>Grupper etter</span>
            <select value={spec.groupBy} onChange={(event) => patch({ groupBy: event.target.value as InsightSpec["groupBy"] })}>
              {GROUPS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Segment</span>
            <select value={spec.segmentBy} onChange={(event) => patch({ segmentBy: event.target.value as InsightSpec["groupBy"] })}>
              {GROUPS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Visning</span>
            <select value={spec.view} onChange={(event) => patch({ view: event.target.value as InsightSpec["view"] })}>
              <option value="bar">Søyle</option>
              <option value="line">Linje</option>
              <option value="donut">Kake</option>
              <option value="funnel">Trakt</option>
              <option value="table">Tabell</option>
              <option value="kpi">Nøkkeltall</option>
            </select>
          </label>
        </div>
        <div className="row">
          <label className="field">
            <span>Periode</span>
            <select value={spec.period} onChange={(event) => patch({ period: event.target.value as InsightSpec["period"] })}>
              <option value="this_month">Denne måneden</option>
              <option value="last_month">Forrige måned</option>
              <option value="this_quarter">Dette kvartalet</option>
              <option value="this_year">I år</option>
              <option value="last_year">I fjor</option>
              <option value="last_12">Siste 12 måneder</option>
              <option value="custom">Egendefinert</option>
            </select>
          </label>
          {spec.period === "custom" ? (
            <>
              <label className="field"><span>Fra</span><input type="date" value={spec.from ?? ""} onChange={(event) => patch({ from: event.target.value })} /></label>
              <label className="field"><span>Til</span><input type="date" value={spec.to ?? ""} onChange={(event) => patch({ to: event.target.value })} /></label>
            </>
          ) : null}
          <label className="field">
            <span>Sammenlign</span>
            <select value={spec.compare} onChange={(event) => patch({ compare: event.target.value as InsightSpec["compare"] })}>
              <option value="none">Ingen</option>
              <option value="previous">Forrige periode</option>
              <option value="year">Samme periode i fjor</option>
            </select>
          </label>
          <label className="field">
            <span>Selger</span>
            <select value={spec.sellerId ?? ""} onChange={(event) => patch({ sellerId: event.target.value || null })}>
              <option value="">Alle</option>
              {meta.sellers.map((seller) => <option key={seller.id} value={seller.id}>{seller.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Pipeline</span>
            <select value={spec.pipelineId ?? ""} onChange={(event) => patch({ pipelineId: event.target.value || null, stageId: null })}>
              <option value="">Alle</option>
              {meta.pipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Fase</span>
            <select value={spec.stageId ?? ""} onChange={(event) => patch({ stageId: event.target.value || null })}>
              <option value="">Alle</option>
              {stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select value={spec.status ?? ""} onChange={(event) => patch({ status: (event.target.value || null) as InsightSpec["status"] })}>
              <option value="">Alle</option>
              <option value="open">Åpen</option>
              <option value="won">Vunnet</option>
              <option value="lost">Tapt</option>
            </select>
          </label>
          <label className="field">
            <span>Kilde</span>
            <select value={spec.source ?? ""} onChange={(event) => patch({ source: event.target.value || null })}>
              <option value="">Alle</option>
              {meta.sources.map((source) => <option key={source}>{source}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Område</span>
            <select value={spec.area ?? ""} onChange={(event) => patch({ area: event.target.value || null })}>
              <option value="">Alle</option>
              {meta.areas.map((area) => <option key={area}>{area}</option>)}
            </select>
          </label>
          <label className="field"><span>Verdi fra</span><input type="number" value={spec.valueMin ?? ""} onChange={(event) => patch({ valueMin: event.target.value === "" ? null : Number(event.target.value) })} /></label>
          <label className="field"><span>Verdi til</span><input type="number" value={spec.valueMax ?? ""} onChange={(event) => patch({ valueMax: event.target.value === "" ? null : Number(event.target.value) })} /></label>
          <label className="field">
            <span>Egendefinert felt</span>
            <select value={spec.customKey ?? ""} onChange={(event) => patch({ customKey: event.target.value || null, customValue: null })}>
              <option value="">Ingen</option>
              {meta.fields.map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
            </select>
          </label>
          {field ? (
            <label className="field">
              <span>{field.name}</span>
              <select value={spec.customValue ?? ""} onChange={(event) => patch({ customValue: event.target.value || null })}>
                <option value="">Alle</option>
                {field.options.map((option) => <option key={option}>{option}</option>)}
              </select>
            </label>
          ) : null}
        </div>
        <button className="btn primary" type="submit">Vis rapport</button>
        {error ? <p className="error">{error}</p> : null}
      </form>
      {result ? <InsightTile title={result.title} spec={spec} result={result} /> : <p className="muted">Velg filter og trykk Vis rapport.</p>}
      <form
        className="card row"
        onSubmit={async (event) => {
          event.preventDefault();
          const response = await fetch("/api/insights/reports", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name, shared, spec }),
          });
          const data = await response.json().catch(() => ({}));
          setMessage(response.ok ? "Rapporten er lagret." : data.error ?? "Kunne ikke lagre");
        }}
      >
        <label className="field grow"><span>Lagre rapport</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Navn" required /></label>
        <label className="field"><span>Deling</span><select value={shared ? "1" : "0"} onChange={(event) => setShared(event.target.value === "1")}><option value="0">Bare meg</option><option value="1">Delt med andre</option></select></label>
        <button className="btn" type="submit">Lagre</button>
        {message ? <span>{message}</span> : null}
      </form>
      {meta.reports.length > 0 ? (
        <section className="card stack">
          <h2>Lagrede rapporter</h2>
          {meta.reports.map((report) => (
            <div key={report.id} className="insight-head">
              <button className="btn" type="button" onClick={() => { setSpec(report.spec); void run(report.spec); }}>{report.name}</button>
              <span className="muted">{report.ownerName}{report.shared ? " · delt" : ""}</span>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
