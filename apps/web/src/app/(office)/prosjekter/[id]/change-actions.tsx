"use client";

export function ChangeActions({ id, status }: { id: string; status: string }) {
  if (status !== "draft" && status !== "sent") return null;
  async function decide(next: "approved" | "rejected" | "sent") {
    await fetch(`/api/changes/${id}/decide`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: next }),
    });
    window.location.reload();
  }
  return (
    <div className="row">
      {status === "draft" ? <button className="btn" type="button" onClick={() => void decide("sent")}>Marker sendt</button> : null}
      <button className="btn primary" type="button" onClick={() => void decide("approved")}>Godkjenn internt</button>
      <button className="btn ghost" type="button" onClick={() => void decide("rejected")}>Avvis</button>
    </div>
  );
}
