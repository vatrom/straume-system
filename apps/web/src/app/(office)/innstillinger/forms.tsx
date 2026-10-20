"use client";

import { useState } from "react";

const ROLES = [
  ["admin", "Administrator"],
  ["selger", "Selger"],
  ["prosjektleder", "Prosjektleder"],
  ["kontor", "Kontor"],
] as const;

export function SettingsForms({
  winnerEmail,
  approverRoles,
  isAdmin,
  users,
  trades,
  lists,
  terms,
  letterhead,
}: {
  winnerEmail: string;
  approverRoles: string[];
  isAdmin: boolean;
  users: { id: string; name: string; email: string; role: string; active: boolean }[];
  trades: { code: string; name: string; subcontractor: boolean }[];
  lists: { key: string; name: string; items: { id: string; label: string; active: boolean }[] }[];
  terms: { validDays: number; paymentStartPercent: number; paymentFinishPercent: number; paymentDueDays: number };
  letterhead: { place: string; legalName: string; orgNr: string; address: string; web: string; phone: string; email: string };
}) {
  const [message, setMessage] = useState("");
  const [order, setOrder] = useState(trades);

  async function send(path: string, method: string, body: unknown) {
    const response = await fetch(path, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "Feil");
    return data;
  }

  return (
    <div className="stack">
      <form
        className="card row"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          try {
            await send("/api/settings", "PUT", { winnerEmail: form.get("winnerEmail") });
            setMessage("Mottaker lagret");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Feil");
          }
        }}
      >
        <label className="field grow">
          <span>E-post til Winner-tegner</span>
          <input name="winnerEmail" type="email" defaultValue={winnerEmail} disabled={!isAdmin} required />
        </label>
        {isAdmin ? (
          <button className="btn primary" type="submit">
            Lagre
          </button>
        ) : null}
      </form>
      <form
        className="card stack"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          try {
            await send("/api/settings/letterhead", "PUT", {
              place: form.get("place"),
              legalName: form.get("legalName"),
              orgNr: form.get("orgNr"),
              address: form.get("address"),
              web: form.get("web"),
              phone: form.get("phone"),
              email: form.get("email"),
            });
            setMessage("Brevhode lagret");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Feil");
          }
        }}
      >
        <h2>Brevhode på tilbud</h2>
        <p className="muted">Stedet står i toppteksten. Firmatallene står i bunnteksten på hver side.</p>
        <div className="row">
          <label className="field"><span>Sted</span><input name="place" defaultValue={letterhead.place} disabled={!isAdmin} required /></label>
          <label className="field grow"><span>Firmanavn</span><input name="legalName" defaultValue={letterhead.legalName} disabled={!isAdmin} required /></label>
          <label className="field"><span>Org.nr</span><input name="orgNr" defaultValue={letterhead.orgNr} disabled={!isAdmin} required /></label>
        </div>
        <div className="row">
          <label className="field grow"><span>Adresse</span><input name="address" defaultValue={letterhead.address} disabled={!isAdmin} required /></label>
          <label className="field"><span>Telefon</span><input name="phone" defaultValue={letterhead.phone} disabled={!isAdmin} required /></label>
        </div>
        <div className="row">
          <label className="field"><span>Nettsted</span><input name="web" defaultValue={letterhead.web} disabled={!isAdmin} required /></label>
          <label className="field"><span>E-post</span><input name="email" type="email" defaultValue={letterhead.email} disabled={!isAdmin} required /></label>
        </div>
        {isAdmin ? <button className="btn primary" type="submit">Lagre brevhode</button> : null}
      </form>
      <form
        className="card stack"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          try {
            await send("/api/settings/terms", "PUT", {
              validDays: Number(form.get("validDays")),
              paymentStartPercent: Number(form.get("paymentStartPercent")),
              paymentFinishPercent: Number(form.get("paymentFinishPercent")),
              paymentDueDays: Number(form.get("paymentDueDays")),
            });
            setMessage("Gyldighet og betaling lagret");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Feil");
          }
        }}
      >
        <h2>Gyldighet og betalingsvilkår</h2>
        <p className="muted">Tallene flettes inn i standardteksten. Setningene ellers står fast.</p>
        <div className="row">
          <label className="field"><span>Gyldighet, dager</span><input name="validDays" type="number" min={1} defaultValue={terms.validDays} disabled={!isAdmin} /></label>
          <label className="field"><span>Oppstart, %</span><input name="paymentStartPercent" type="number" min={0} max={100} defaultValue={terms.paymentStartPercent} disabled={!isAdmin} /></label>
          <label className="field"><span>Ferdigstillelse, %</span><input name="paymentFinishPercent" type="number" min={0} max={100} defaultValue={terms.paymentFinishPercent} disabled={!isAdmin} /></label>
          <label className="field"><span>Forfall, dager</span><input name="paymentDueDays" type="number" min={1} defaultValue={terms.paymentDueDays} disabled={!isAdmin} /></label>
        </div>
        {isAdmin ? <button className="btn primary" type="submit">Lagre vilkår</button> : null}
      </form>
      <form
        className="card stack"
        onSubmit={async (event) => {
          event.preventDefault();
          const roles = new FormData(event.currentTarget).getAll("role").map(String);
          try {
            await send("/api/settings/approvers", "PUT", { roles });
            setMessage("Godkjennerroller lagret");
          } catch (error) {
            setMessage(error instanceof Error ? error.message : "Feil");
          }
        }}
      >
        <h2>Hvem kan godkjenne tilbud</h2>
        {ROLES.map(([role, label]) => (
          <label key={role}>
            <input name="role" type="checkbox" value={role} defaultChecked={approverRoles.includes(role)} disabled={!isAdmin} /> {label}
          </label>
        ))}
        {isAdmin ? (
          <button className="btn" type="submit">
            Lagre roller
          </button>
        ) : null}
      </form>
      <section className="card stack">
        <h2>Fag</h2>
        <p className="muted">Rekkefølgen brukes i tilbud, PDF og standard sjekkliste. Underleverandør prises uten egne timer.</p>
        {order.map((trade, index) => (
          <div className="row" key={trade.code}>
            <strong style={{ minWidth: "8rem" }}>{trade.name}</strong>
            <label>
              <input
                type="checkbox"
                checked={trade.subcontractor}
                disabled={!isAdmin}
                onChange={async (event) => {
                  const subcontractor = event.target.checked;
                  setOrder((current) => current.map((item) => (item.code === trade.code ? { ...item, subcontractor } : item)));
                  try {
                    await send(`/api/trades/${trade.code}`, "PATCH", { subcontractor });
                    setMessage(subcontractor ? `${trade.name} er underleverandør` : `${trade.name} er eget fag`);
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : "Feil");
                  }
                }}
              />{" "}
              Underleverandør
            </label>
            <button className="btn" type="button" disabled={!isAdmin || index === 0} onClick={() => setOrder((current) => move(current, index, -1))}>
              Opp
            </button>
            <button
              className="btn"
              type="button"
              disabled={!isAdmin || index === order.length - 1}
              onClick={() => setOrder((current) => move(current, index, 1))}
            >
              Ned
            </button>
          </div>
        ))}
        {isAdmin ? (
          <button
            className="btn primary"
            type="button"
            onClick={async () => {
              try {
                await send("/api/trades/order", "PUT", { codes: order.map((trade) => trade.code) });
                setMessage("Fagrekkefølgen er lagret");
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Feil");
              }
            }}
          >
            Lagre rekkefølge
          </button>
        ) : null}
      </section>
      {isAdmin ? (
        <section className="card stack">
          <h2>Brukere</h2>
          {users.map((user) => (
            <form
              key={user.id}
              className="row"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                try {
                  await send(`/api/users/${user.id}`, "PATCH", {
                    name: form.get("name"),
                    role: form.get("role"),
                    active: form.get("active") === "on",
                    password: String(form.get("password") || "") || undefined,
                  });
                  setMessage(`Oppdaterte ${user.email}`);
                } catch (error) {
                  setMessage(error instanceof Error ? error.message : "Feil");
                }
              }}
            >
              <input name="name" defaultValue={user.name} />
              <span className="muted">{user.email}</span>
              <select name="role" defaultValue={user.role}>
                {ROLES.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              <label>
                <input name="active" type="checkbox" defaultChecked={user.active} /> Aktiv
              </label>
              <input name="password" type="password" placeholder="Nytt passord" />
              <button className="btn" type="submit">
                Lagre
              </button>
            </form>
          ))}
          <form
            className="row"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              try {
                await send("/api/users", "POST", {
                  name: form.get("name"),
                  email: form.get("email"),
                  password: form.get("password"),
                  role: form.get("role"),
                });
                window.location.reload();
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Feil");
              }
            }}
          >
            <input name="name" placeholder="Navn" required />
            <input name="email" type="email" placeholder="E-post" required />
            <input name="password" type="password" placeholder="Passord" required />
            <select name="role" defaultValue="selger">
              {ROLES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button className="btn primary" type="submit">
              Ny bruker
            </button>
          </form>
        </section>
      ) : null}
      {isAdmin
        ? lists.map((list) => (
            <section className="card stack" key={list.key}>
              <h2>{list.name}</h2>
              {list.items.map((item) => (
                <form
                  key={item.id}
                  className="row"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const form = new FormData(event.currentTarget);
                    try {
                      await send(`/api/options/items/${item.id}`, "PATCH", { label: form.get("label"), active: form.get("active") === "on" });
                      setMessage("Valg lagret");
                    } catch (error) {
                      setMessage(error instanceof Error ? error.message : "Feil");
                    }
                  }}
                >
                  <input name="label" defaultValue={item.label} />
                  <label>
                    <input name="active" type="checkbox" defaultChecked={item.active} /> Aktiv
                  </label>
                  <button className="btn" type="submit">
                    Lagre
                  </button>
                  <button
                    className="btn danger"
                    type="button"
                    onClick={async () => {
                      const response = await fetch(`/api/options/items/${item.id}`, { method: "DELETE" });
                      if (response.ok) window.location.reload();
                    }}
                  >
                    Slett
                  </button>
                </form>
              ))}
              <form
                className="row"
                onSubmit={async (event) => {
                  event.preventDefault();
                  const form = new FormData(event.currentTarget);
                  try {
                    await send(`/api/options/${list.key}/items`, "POST", { label: form.get("label") });
                    window.location.reload();
                  } catch (error) {
                    setMessage(error instanceof Error ? error.message : "Feil");
                  }
                }}
              >
                <input name="label" placeholder="Nytt valg" required />
                <button className="btn" type="submit">
                  Legg til
                </button>
              </form>
            </section>
          ))
        : null}
      {message ? <p>{message}</p> : null}
    </div>
  );
}

function move<T>(rows: T[], index: number, delta: number): T[] {
  const next = rows.slice();
  const target = index + delta;
  const current = next[index];
  const other = next[target];
  if (!current || !other) return rows;
  next[index] = other;
  next[target] = current;
  return next;
}
