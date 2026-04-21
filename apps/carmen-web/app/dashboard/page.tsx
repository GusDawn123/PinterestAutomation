"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { api } from "../../lib/api";

const cards = [
  { href: "/approvals", title: "Pending approvals", blurb: "Keywords, drafts, images, pins waiting on you." },
  { href: "/calendar", title: "Scheduled pins", blurb: "Calendar of upcoming Pinterest posts." },
  { href: "/analytics", title: "Analytics", blurb: "Best-performing pins and recommended posting slots." },
] as const;

export default function Dashboard() {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleStart() {
    setStarting(true);
    setError(null);
    try {
      const { workflowRunId, approvalId } = await api.startBlogWorkflow("US");
      router.push(`/approvals/keyword?approvalId=${approvalId}&runId=${workflowRunId}`);
    } catch (e) {
      setError((e as Error).message);
      setStarting(false);
    }
  }

  return (
    <main style={{ maxWidth: 960, margin: "2rem auto", padding: "0 1.5rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2rem" }}>
        <h1 style={{ margin: 0 }}>Dashboard</h1>
        <UserButton />
      </header>

      <section style={{ marginBottom: "2rem" }}>
        <button
          type="button"
          onClick={handleStart}
          disabled={starting}
          style={{
            padding: "1rem 2rem",
            fontSize: "1.1rem",
            background: starting ? "#888" : "#c8356d",
            color: "white",
            border: "none",
            borderRadius: 8,
            cursor: starting ? "wait" : "pointer",
          }}
        >
          {starting ? "Starting…" : "+ Start new blog post"}
        </button>
        {error && (
          <p style={{ color: "#b00020", marginTop: "0.75rem" }}>Error: {error}</p>
        )}
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
