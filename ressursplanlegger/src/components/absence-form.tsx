"use client";

import { useActionState } from "react";
import { addAbsence, type FormState } from "@/lib/actions";
import { ABSENCE_REASONS } from "@/lib/format";

export function AbsenceForm({ resourceId }: { resourceId: string }) {
  const [state, formAction, pending] = useActionState(addAbsence.bind(null, resourceId), null as FormState);

  return (
    <form action={formAction} className="card">
      <h2>Nytt fravær</h2>
      <p className="hint">Ferie, sykdom og annet fravær tar bort kapasitet de dagene. Timer blir ikke lagt på fraværsdager.</p>
      {state?.error ? <p className="error">{state.error}</p> : null}
      <div className="form-grid" style={{ marginTop: "0.8rem" }}>
        <label className="field">
          Fra
          <input type="date" name="startDate" required />
        </label>
        <label className="field">
          Til
          <input type="date" name="endDate" required />
        </label>
        <label className="field">
          Grunn
          <input name="reason" list="fravaer" defaultValue="Ferie" />
          <datalist id="fravaer">
            {ABSENCE_REASONS.map((reason) => (
              <option key={reason} value={reason} />
            ))}
          </datalist>
        </label>
        <div className="actions" style={{ alignSelf: "end" }}>
          <button className="btn" type="submit" disabled={pending}>
            {pending ? "Lagrer …" : "Legg inn fravær"}
          </button>
        </div>
      </div>
    </form>
  );
}
