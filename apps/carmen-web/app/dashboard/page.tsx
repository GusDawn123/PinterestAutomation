import Link from "next/link";
import { UserButton } from "@clerk/nextjs";

const cards = [
  { href: "/approvals/keyword" as const, title: "Pending approvals", blurb: "Keywords, drafts, images, pins waiting on you." },
  { href: "/calendar" as const, title: "Scheduled pins", blurb: "Calendar of upcoming Pinterest posts." },
  { href: "/analytics" as const, title: "Analytics", blurb: "Best-performing pins and recommended posting slots." },
];

export default function Dashboard() {
  return (
    <main style={{ maxWidth: 960, margin: "2rem auto", padding: "0 1.5rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <UserButton />
      </header>

      <section style={{ marginBottom: "2rem" }}>
        <form action="/api/workflows/start-blog" method="post">
          <button
            type="submit"
            style={{
              padding: "1rem 2rem",
              fontSize: "1.1rem",
              background: "#c8356d",
              color: "white",
              border: "none",
              borderRadius: 8,
              cursor: "pointer",
            }}
          >
            + Start new blog post
          </button>
        </form>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            style={{
              padding: "1.25rem",
              background: "white",
              border: "1px solid #e5e5e5",
              borderRadius: 8,
              display: "block",
              color: "inherit",
            }}
          >
            <h3 style={{ marginTop: 0 }}>{c.title}</h3>
            <p style={{ margin: 0, color: "#666" }}>{c.blurb}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
