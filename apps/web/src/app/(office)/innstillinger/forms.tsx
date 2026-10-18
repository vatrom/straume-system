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
}: {
  winnerEmail: string;
  approverRoles: string[];
  isAdmin: boolean;
  users: { id: string; name: string; email: string; role: string; active: boolean }[];
  trades: { code: string; name: string; subcontractor: boolean }[];
  lists: { key: string; name: string; items: { id: string; label: string; active: boolean }[] }[];
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
