"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

export function NewDealForm({
  pipelineId,
  pipelines,
  people,
  organizations,
  users,
  channels,
}: {
  pipelineId?: string;
  pipelines: { id: string; name: string; stages: { id: string; name: string }[] }[];
  people: { id: string; name: string }[];
  organizations: { id: string; name: string }[];
  users: { id: string; name: string }[];
  channels: string[];
}) {
  const router = useRouter();
  const [pipe, setPipe] = useState(pipelineId || pipelines[0]?.id || "");
  const [newPerson, setNewPerson] = useState(false);
  const [error, setError] = useState("");
  const stages = useMemo(() => pipelines.find((item) => item.id === pipe)?.stages ?? [], [pipelines, pipe]);

  return (
    <form
      className="card stack"
      style={{ maxWidth: 760 }}
      onSubmit={async (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const body: Record<string, unknown> = {
          title: form.get("title"),
          valueNok: Number(form.get("valueNok") || 0),
          pipelineId: pipe,
          stageId: form.get("stageId"),
          ownerId: form.get("ownerId"),
          organizationId: form.get("organizationId") || null,
          sourceChannel: form.get("sourceChannel") || null,
          plannedStartDate: form.get("plannedStartDate") || null,
          expectedCloseDate: form.get("expectedCloseDate") || null,
        };
        if (newPerson) {
          body.newPerson = {
            firstName: form.get("firstName"),
            lastName: form.get("lastName"),
            phone: form.get("phone"),
            email: form.get("email"),
            street: form.get("street"),
            houseNumber: form.get("houseNumber"),
            postalCode: form.get("postalCode"),
            city: form.get("city"),
          };
        } else {
          body.personId = form.get("personId") || null;
        }
        const response = await fetch("/api/deals", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
        const data = await response.json();
        if (!response.ok) {
          setError(data.error ?? "Feil");
          return;
        }
        router.push(`/avtaler/${data.id}`);
      }}
    >
      <label className="field"><span>Tittel</span><input name="title" required placeholder="Adresse eller kundenavn" /></label>
      <div className="row">
        <label className="field"><span>Verdi (NOK)</span><input name="valueNok" type="number" min={0} defaultValue={0} /></label>
        <label className="field"><span>Selger</span>
          <select name="ownerId">{users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}</select>
        </label>
      </div>
      <div className="row">
        <label className="field"><span>Pipeline</span>
          <select value={pipe} onChange={(event) => setPipe(event.target.value)}>{pipelines.map((pipeline) => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}</select>
        </label>
        <label className="field"><span>Fase</span>
          <select name="stageId">{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select>
        </label>
      </div>
      <div className="row">
        <label className="field"><span>Kildekanal</span>
          <select name="sourceChannel"><option value="">—</option>{channels.map((channel) => <option key={channel}>{channel}</option>)}</select>
        </label>
        <label className="field"><span>Planlagt oppstart</span><input name="plannedStartDate" type="date" /></label>
        <label className="field"><span>Forventet inngåelse</span><input name="expectedCloseDate" type="date" /></label>
      </div>
      <label className="field"><span>Organisasjon</span>
        <select name="organizationId"><option value="">Ingen</option>{organizations.map((org) => <option key={org.id} value={org.id}>{org.name}</option>)}</select>
      </label>
      <label className="row"><input type="checkbox" checked={newPerson} onChange={(event) => setNewPerson(event.target.checked)} /> Ny person</label>
      {newPerson ? (
        <div className="row">
          <input name="firstName" placeholder="Fornavn" required />
          <input name="lastName" placeholder="Etternavn" required />
          <input name="phone" placeholder="Telefon" />
          <input name="email" placeholder="E-post" />
          <input name="street" placeholder="Gate" />
          <input name="houseNumber" placeholder="Nr" />
          <input name="postalCode" placeholder="Postnr" />
          <input name="city" placeholder="Sted" />
        </div>
      ) : (
        <label className="field"><span>Person</span>
          <select name="personId"><option value="">Ingen</option>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select>
        </label>
      )}
      {error ? <div className="error">{error}</div> : null}
      <button className="btn primary" type="submit">Opprett avtale</button>
    </form>
  );
}
