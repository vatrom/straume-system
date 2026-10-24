"use client";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <section className="card">
      <h1>Noe gikk galt</h1>
      <p className="lede">Planen kunne ikke vises akkurat nå. Prøv en gang til.</p>
      <button className="btn" type="button" onClick={() => reset()}>
        Prøv igjen
      </button>
    </section>
  );
}
