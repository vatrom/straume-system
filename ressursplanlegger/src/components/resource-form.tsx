"use client";

import { useActionState, useState } from "react";
import { createResource, updateResource, type FormState } from "@/lib/actions";
import { ROLE_SUGGESTIONS, formatHours } from "@/lib/format";

export function ResourceForm({
  resource,
}: {
  resource?: {
    id: string;
    name: string;
    role: string;
    weeklyCapacityHours: number;
    active: boolean;
  };
}) {
  const action = resource ? updateResource.bind(null, resource.id) : createResource;
  const [state, formAction, pending] = useActionState(action, null as FormState);
  const [weekly, setWeekly] = useState(
    resource ? formatHours(resource.weeklyCapacityHours) : "37,5",
  );
  const perDay = Number(weekly.replace(",", "."));
  const dayText = Number.isFinite(perDay) && perDay > 0 ? formatHours(perDay / 5) : "–";

  return (
    <form action={formAction} className="card stack">
      {state?.error ? <p className="error">{state.error}</p> : null}
      <div className="form-grid">
        <label className="field">
          Navn
          <input name="name" required defaultValue={resource?.name ?? ""} placeholder="F.eks. Kari Haugen" />
        </label>
        <label className="field">
          Fag
          <input name="role" required list="fag" defaultValue={resource?.role ?? ""} placeholder="F.eks. tømrer" />
          <datalist id="fag">
            {ROLE_SUGGESTIONS.map((role) => (
              <option key={role} value={role} />
            ))}
          </datalist>
        </label>
        <label className="field">
          Ukekapasitet (timer)
          <input
            name="weeklyCapacityHours"
            inputMode="decimal"
            required
            value={weekly}
            onChange={(event) => setWeekly(event.target.value)}
          />
          <span className="hint">{dayText} timer per arbeidsdag (mandag–fredag).</span>
        </label>
        <label className="check">
          <input type="hidden" name="active" value="false" />
          <input type="checkbox" name="active" value="true" defaultChecked={resource?.active ?? true} />
          Aktiv og med i kapasitetsoversikten
        </label>
      </div>
      <div className="actions">
        <button className="btn" type="submit" disabled={pending}>
          {pending ? "Lagrer …" : resource ? "Lagre endringer" : "Legg til ressurs"}
        </button>
      </div>
    </form>
  );
}
