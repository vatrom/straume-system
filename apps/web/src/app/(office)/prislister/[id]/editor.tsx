"use client";

import { TRADES } from "@straume/domain";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Line = {
  itemId: string;
  code: string;
  tradeCode: string;
  name: string;
  unit: string;
  materialCost: number;
  materialMarkup: number | null;
  hoursPerUnit: number;
  salePriceOverride: number | null;
  salePriceExVat: number;
  splitConfidence: string;
  splitNote: string | null;
  hasBom: boolean;
  bomFlags: string[];
  active: boolean;
};

const SPLIT: Record<string, string> = { known: "Kjent", derived: "Utledet", uncertain: "Må kontrolleres" };

type Commercial = {
  vatRate: number;
  byggstartPercent: number;
  mittanbudPercent: number;
  extraCalloutNok: number | null;
  tileAllowanceExVat: number | null;
};

type Rate = { tradeCode: string; hourlyRateSale: number; calloutPrice: number | null };

export function PriceEditor({
  listId,
  status,
  commercial,
  rates,
  lines,
}: {
  listId: string;
  status: string;
  commercial: Commercial;
  rates: Rate[];
  lines: Line[];
}) {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [trade, setTrade] = useState("alle");
  const [query, setQuery] = useState("");
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const needle = query.trim().toLowerCase();
  const visible = lines.filter((line) => {
    if (trade !== "alle" && line.tradeCode !== trade) return false;
    if (onlyFlagged && line.splitConfidence !== "uncertain" && line.bomFlags.length === 0) return false;
    if (!needle) return true;
    return `${line.code} ${line.name}`.toLowerCase().includes(needle);
  });

  async function send(path: string, body: unknown) {
    const response = await fetch(path, {
      method:
        (path.includes("/lines/") && !path.endsWith("/archive")) || path.endsWith("/commercial") || path.includes("/rates/")
          ? "PATCH"
          : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Feil");
    return data;
  }

  const tileInk = commercial.tileAllowanceExVat == null ? null : Math.round(commercial.tileAllowanceExVat * (1 + commercial.vatRate));
  return (
    <div className="stack">
      <form
        className="card stack"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          try {
            await send(`/api/price-lists/${listId}/commercial`, {
              byggstartPercent: Number(form.get("byggstartPercent")),
              mittanbudPercent: Number(form.get("mittanbudPercent")),
              extraCalloutNok: Number(form.get("extraCalloutNok")),
              tileAllowanceExVat: Number(form.get("tileAllowanceExVat")),
            });
            window.location.reload();
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Feil");
          }
        }}
      >
        <h2>Kilde og felles satser</h2>
        <p className="muted">
          Kildetillegget er prosent av sum eks. mva, før mva. Flis mot kunde vises inkl. mva
          {tileInk != null ? ` (${tileInk.toLocaleString("nb-NO")} kr)` : ""}.
        </p>
        <div className="row">
          <label className="field">
            <span>Byggstart %</span>
            <input name="byggstartPercent" type="number" step="0.1" min="0" max="100" defaultValue={commercial.byggstartPercent * 100} />
          </label>
          <label className="field">
            <span>MittAnbud XL %</span>
            <input name="mittanbudPercent" type="number" step="0.1" min="0" max="100" defaultValue={commercial.mittanbudPercent * 100} />
          </label>
          <label className="field">
            <span>Ekstra oppmøte eks. mva</span>
            <input name="extraCalloutNok" type="number" step="1" min="0" defaultValue={commercial.extraCalloutNok ?? ""} />
          </label>
          <label className="field">
            <span>Flis kr/m² eks. mva</span>
            <input name="tileAllowanceExVat" type="number" step="1" min="0" defaultValue={commercial.tileAllowanceExVat ?? ""} />
          </label>
          <button className="btn" type="submit">
            Lagre satser
          </button>
        </div>
      </form>
      <section className="card stack">
        <h2>Timepris og oppmøte per fag</h2>
        <p className="muted">Tomt oppmøtefelt bruker den felles satsen. Et tall overstyrer bare det faget.</p>
        {rates.map((rate) => (
          <form
            key={rate.tradeCode}
            className="row"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              const callout = String(form.get("calloutPrice") ?? "").trim();
              try {
                await send(`/api/price-lists/${listId}/rates/${rate.tradeCode}`, {
                  hourlyRateSale: Number(form.get("hourlyRateSale")),
                  calloutPrice: callout === "" ? null : Number(callout),
                });
                setMessage("Fagsats lagret");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Feil");
              }
            }}
          >
            <strong style={{ minWidth: "8rem" }}>{TRADES.find((trade) => trade.code === rate.tradeCode)?.name ?? rate.tradeCode}</strong>
            <label className="field">
              <span>Timepris eks. mva</span>
              <input name="hourlyRateSale" type="number" step="1" min="0" defaultValue={rate.hourlyRateSale} />
            </label>
            <label className="field">
              <span>Oppmøte, overstyring</span>
              <input name="calloutPrice" type="number" step="1" min="0" placeholder="Felles sats" defaultValue={rate.calloutPrice ?? ""} />
            </label>
            <button className="btn" type="submit">
              Lagre
            </button>
          </form>
        ))}
      </section>
      {status !== "active" ? (
        <button
          className="btn primary"
          type="button"
          onClick={async () => {
            try {
              await send(`/api/price-lists/${listId}/activate`, {});
              window.location.reload();
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Feil");
            }
          }}
        >
          Aktiver denne versjonen
        </button>
      ) : null}
      <form
        className="card row"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const selected = form.getAll("trade").map(String);
          try {
            await send(`/api/price-lists/${listId}/version`, {
              name: form.get("name"),
              validFrom: form.get("validFrom"),
              percent: Number(form.get("percent")),
              tradeCodes: selected.length ? selected : undefined,
              includeLaborRates: form.get("includeLaborRates") === "on",
            });
            router.push("/prislister");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Feil");
          }
        }}
      >
        <label className="field">
          <span>Ny versjon</span>
          <input name="name" required placeholder="Prisliste 2027" />
        </label>
        <label className="field">
          <span>Gyldig fra</span>
          <input name="validFrom" type="date" required />
        </label>
        <label className="field">
          <span>Prosent</span>
          <input name="percent" type="number" step="0.1" required defaultValue={5} />
        </label>
        <label className="field">
          <span>Timepriser</span>
          <input name="includeLaborRates" type="checkbox" />
        </label>
        {TRADES.filter((item) => item.code !== "annet").map((item) => (
          <label key={item.code} className="field">
            <span>{item.name}</span>
            <input name="trade" type="checkbox" value={item.code} />
          </label>
        ))}
        <button className="btn" type="submit">
          Lag ny versjon
        </button>
      </form>
      <form
        className="card row"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const selected = form.getAll("scope").map(String);
          try {
            await send(`/api/price-lists/${listId}/components`, {
              name: form.get("name"),
              validFrom: form.get("validFrom"),
              materialPercent: Number(form.get("materialPercent")),
              laborPercent: Number(form.get("laborPercent")),
              tradeCodes: selected.length ? selected : undefined,
            });
            router.push("/prislister");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Feil");
          }
        }}
      >
        <label className="field">
          <span>Justering materiell og timer</span>
          <input name="name" required placeholder="Prisliste materiell/timer" />
        </label>
        <label className="field">
          <span>Gyldig fra</span>
          <input name="validFrom" type="date" required />
        </label>
        <label className="field">
          <span>Materiell %</span>
          <input name="materialPercent" type="number" step="0.1" defaultValue={0} />
        </label>
        <label className="field">
          <span>Timepris %</span>
          <input name="laborPercent" type="number" step="0.1" defaultValue={0} />
        </label>
        {TRADES.filter((item) => item.code !== "annet").map((item) => (
          <label key={`scope-${item.code}`} className="field">
            <span>{item.name}</span>
            <input name="scope" type="checkbox" value={item.code} />
          </label>
        ))}
        <button className="btn" type="submit">
          Ny versjon med delt justering
        </button>
      </form>
      <div className="row">
        <a className="btn" href={`/api/price-lists/${listId}/excel`}>
          Last ned Excel
        </a>
      </div>
      <form
        className="card row"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          try {
            await send(`/api/price-lists/${listId}/items`, {
              code: form.get("code"),
              name: form.get("name"),
              tradeCode: form.get("tradeCode"),
              unit: form.get("unit"),
              type: "unit_price",
              materialCost: Number(form.get("materialCost") || 0),
              hoursPerUnit: Number(form.get("hoursPerUnit") || 0),
            });
            window.location.reload();
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Feil");
          }
        }}
      >
        <label className="field">
          <span>Ny kode</span>
          <input name="code" required placeholder="TOM-099" />
        </label>
        <label className="field grow">
          <span>Navn</span>
          <input name="name" required />
        </label>
        <label className="field">
          <span>Fag</span>
          <select name="tradeCode">
            {TRADES.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Enhet</span>
          <input name="unit" defaultValue="stk" required />
        </label>
        <label className="field">
          <span>Materiell</span>
          <input name="materialCost" type="number" step="0.01" defaultValue={0} />
        </label>
        <label className="field">
          <span>Timer</span>
          <input name="hoursPerUnit" type="number" step="0.01" defaultValue={0} />
        </label>
        <button className="btn" type="submit">
          Legg til post
        </button>
      </form>
      <div className="filters">
        <select value={trade} onChange={(event) => setTrade(event.target.value)}>
          <option value="alle">Alle fag</option>
          {TRADES.map((item) => (
            <option key={item.code} value={item.code}>
              {item.name}
            </option>
          ))}
        </select>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Søk kode eller navn" />
        <label>
          <input type="checkbox" checked={onlyFlagged} onChange={(event) => setOnlyFlagged(event.target.checked)} /> Bare merkede
        </label>
      </div>
      <div className="card" style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th>Kode</th>
              <th>Post</th>
              <th>Enhet</th>
              <th>Materiell</th>
              <th>Påslag</th>
              <th>Timer</th>
              <th>Salgspris</th>
              <th>Splitt</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((line) => (
              <tr key={line.itemId}>
                <td>{line.code}</td>
                <td>{line.name}</td>
                <td>{line.unit}</td>
                <td>
                  <input id={`m-${line.itemId}`} defaultValue={line.materialCost} style={{ width: 90 }} disabled={line.hasBom} />
                </td>
                <td>
                  <input id={`p-${line.itemId}`} defaultValue={line.materialMarkup ?? ""} style={{ width: 70 }} />
                </td>
                <td>
                  <input id={`h-${line.itemId}`} defaultValue={line.hoursPerUnit} style={{ width: 70 }} />
                </td>
                <td>
                  {line.salePriceExVat.toLocaleString("nb-NO")}
                  {line.salePriceOverride != null ? <div className="muted">overstyrt</div> : null}
                </td>
                <td>
                  <span className={line.splitConfidence === "uncertain" || line.bomFlags.length ? "badge warn" : "badge ok"}>{SPLIT[line.splitConfidence] ?? line.splitConfidence}</span>
                  {line.hasBom ? <div><Link href={`/prislister/${listId}/poster/${line.code}`}>Stykkliste</Link></div> : <div><Link href={`/prislister/${listId}/poster/${line.code}`}>Legg til stykkliste</Link></div>}
                  {line.bomFlags.map((flag) => <div key={flag} className="badge missing">{flag}</div>)}
                  {!line.active ? <div className="muted">arkivert</div> : null}
                  {line.splitNote ? <div className="muted">{line.splitNote}</div> : null}
                </td>
                <td>
                  <button
                    className="btn"
                    type="button"
                    onClick={async () => {
                      const material = (document.getElementById(`m-${line.itemId}`) as HTMLInputElement).value;
                      const markup = (document.getElementById(`p-${line.itemId}`) as HTMLInputElement).value;
                      const hours = (document.getElementById(`h-${line.itemId}`) as HTMLInputElement).value;
                      try {
                        await send(`/api/price-lists/${listId}/lines/${line.itemId}`, {
                          materialCost: Number(material),
                          materialMarkup: markup === "" ? null : Number(markup),
                          hoursPerUnit: Number(hours),
                        });
                        setMessage(`Lagret ${line.code}`);
                      } catch (error) {
                        setMessage(error instanceof Error ? error.message : "Feil");
                      }
                    }}
                  >
                    Lagre
                  </button>
                  {line.active ? (
                    <button
                      className="btn ghost"
                      type="button"
                      onClick={async () => {
                        try {
                          await send(`/api/price-lists/${listId}/lines/${line.itemId}/archive`, {});
                          window.location.reload();
                        } catch (error) {
                          setMessage(error instanceof Error ? error.message : "Feil");
                        }
                      }}
                    >
                      Arkiver
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {message ? <p>{message}</p> : null}
    </div>
  );
}
