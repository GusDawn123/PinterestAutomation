import Link from "next/link";

export default function Home() {
  return (
    <div className="landing">
      <div className="landing-inner">
        <div className="landing-mark">C</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, textTransform: "uppercase", letterSpacing: ".12em", color: "var(--ink-muted)", marginBottom: 16 }}>
          Carmen&apos;s Pinterest Cockpit
        </div>
        <h1>
          Good morning, <em>Carmen</em>.<br />The queue is ready.
        </h1>
        <p className="lede">
          Keyword to draft to images to pins to Pinterest — you review, you approve, the rest runs itself.
        </p>
        <Link href="/dashboard" className="enter">
          Enter cockpit <span>→</span>
        </Link>
        <div className="footer-note">Keyword → draft → images → affiliates → pins → Pinterest</div>
      </div>
    </div>
  );
}
