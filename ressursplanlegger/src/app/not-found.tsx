import Link from "next/link";

export default function NotFound() {
  return (
    <section className="card">
      <h1>Finner ikke siden</h1>
      <p className="lede">Lenken kan være feil, eller oppføringen er slettet.</p>
      <p>
        <Link className="btn" href="/">
          Til oversikten
        </Link>
      </p>
    </section>
  );
}
