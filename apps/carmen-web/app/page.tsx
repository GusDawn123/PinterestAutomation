import Link from "next/link";
import { SignInButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

export default function Home() {
  return (
    <main style={{ maxWidth: 720, margin: "4rem auto", padding: "0 1.5rem" }}>
      <h1>Pinterest Cockpit</h1>
      <p>Carmen&apos;s workflow control center.</p>

      <SignedOut>
        <div style={{ marginTop: "2rem" }}>
          <SignInButton mode="modal">
            <button
              type="button"
              style={{
                padding: "0.75rem 1.5rem",
                background: "#c8356d",
                color: "white",
                border: "none",
                borderRadius: 6,
                cursor: "pointer",
                fontSize: "1rem",
              }}
            >
              Sign in
            </button>
          </SignInButton>
        </div>
      </SignedOut>

      <SignedIn>
        <div style={{ marginTop: "2rem", display: "flex", gap: "1rem", alignItems: "center" }}>
          <Link
            href="/dashboard"
            style={{
              padding: "0.75rem 1.5rem",
              background: "#c8356d",
              color: "white",
              borderRadius: 6,
            }}
          >
            Open dashboard
          </Link>
          <UserButton />
        </div>
      </SignedIn>
    </main>
  );
}
