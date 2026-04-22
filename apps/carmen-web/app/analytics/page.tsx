"use client";

import { useEffect, useState } from "react";
import { api, type RecommendedSlot } from "../../lib/api";
import { useToast } from "../../components/toast";

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SearchIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="14" height="14">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);

export default function Analytics() {
  const { toast } = useToast();
  const [boardId, setBoardId] = useState("");
  const [activeBoardId, setActiveBoardId] = useState("");
  const [slots, setSlots] = useState<RecommendedSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyticsItems, setAnalyticsItems] = useState<Array<Record<string, unknown>>>([]);
  const [rowsLoading, setRowsLoading] = useState(true);
  const [selected, setSelected] = useState<RecommendedSlot | null>(null);

  useEffect(() => {
    api.listAnalytics()
      .then(({ items }) => setAnalyticsItems(items))
      .catch(() => {})
      .finally(() => setRowsLoading(false));
  }, []);

  async function loadSlots(e?: React.FormEvent) {
    e?.preventDefault();
    if (!boardId) return;
    setLoading(true);
    setSelected(null);
    try {
      const { slots } = await api.listRecommendedSlots(boardId);
      setSlots(slots);
      setActiveBoardId(boardId);
    } catch (err) {
      toast((err as Error).message, "err");
    } finally {
      setLoading(false);
    }
  }

  const maxScore = slots.length > 0 ? Math.max(...slots.map((s) => s.score)) : 1;

  function heatColor(score: number): string {
    const t = score / maxScore;
    const r = Math.round(180 + 75 * t);
    const g = Math.round(200 - 100 * t);
    const b = Math.round(200 - 160 * t);
    return `rgb(${r},${g},${b})`;
  }

  const slotMap = new Map<string, RecommendedSlot>();
  for (const s of slots) slotMap.set(`${s.dayOfWeek}-${s.hour}`, s);

  return (
    <div className="page-inner">
      <div className="page-header">
        <div className="page-eyebrow">Analytics</div>
        <h1 className="page-title">Posting <em>slots</em></h1>
        <div className="page-sub">Recommended times per board — ranked by impressions, saves, and outbound clicks.</div>
      </div>

      {/* Board search */}
      <form onSubmit={loadSlots} style={{ display: "flex", gap: 10, marginBottom: 28, alignItems: "flex-end" }}>
        <div style={{ flex: 1 }}>
          <div className="field-label"><span>Pinterest board ID</span></div>
          <input
            className="field"
            value={boardId}
            onChange={(e) => setBoardId(e.target.value)}
            placeholder="e.g. 123456789012345678"
          />
        </div>
        <button type="submit" className="btn btn-primary btn-lg" disabled={!boardId || loading}>
          {loading ? "Loading…" : <><SearchIcon /> Load slots</>}
        </button>
      </form>

      {/* Heatmap */}
      {(slots.length > 0 || activeBoardId) && (
        <div style={{ marginBottom: 36 }}>
          <div className="section-label" style={{ marginBottom: 14 }}>
            {activeBoardId ? `Heat map — board ${activeBoardId}` : "Heat map"}
          </div>
          {slots.length === 0 && !loading ? (
            <div className="state" style={{ padding: "32px 20px" }}>
              <div className="mk">✦</div>
              <h3>No slots yet</h3>
              <p>Once pins on this board accumulate impressions, ranked slots appear here.</p>
            </div>
          ) : (
            <div className="heat-wrap card" style={{ padding: 0 }}>
              <div className="heat" style={{ padding: 16 }}>
                {/* Hour headers */}
                <div className="heat-label" />
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="heat-hr">{h}</div>
                ))}

                {/* Day rows */}
                {DAY_NAMES.map((day, dow) => (
                  <>
                    <div key={`label-${dow}`} className="heat-label">{day}</div>
                    {Array.from({ length: 24 }, (_, h) => {
                      const s = slotMap.get(`${dow}-${h}`);
                      const isSelected = selected?.dayOfWeek === dow && selected?.hour === h;
                      return (
                        <div
                          key={`${dow}-${h}`}
                          className={`heat-cell ${isSelected ? "selected" : ""}`}
                          style={s ? { background: heatColor(s.score) } : undefined}
                          title={s ? `${day} ${h}:00 — score ${s.score.toFixed(2)}, n=${s.sampleSize}` : `${day} ${h}:00`}
                          onClick={() => s && setSelected(isSelected ? null : s)}
                        />
                      );
                    })}
                  </>
                ))}
              </div>
              <div style={{ padding: "0 16px 12px", display: "flex", gap: 8, alignItems: "center" }}>
                <div className="heat-legend">
                  <div className="sw" style={{ background: "var(--bg-sunken)" }} />
                  <span>No data</span>
                </div>
                <div className="heat-legend" style={{ marginLeft: 8 }}>
                  <div className="sw" style={{ background: heatColor(maxScore * 0.3) }} />
                  <span>Low</span>
                </div>
                <div className="heat-legend" style={{ marginLeft: 8 }}>
                  <div className="sw" style={{ background: heatColor(maxScore * 0.7) }} />
                  <span>Med</span>
                </div>
                <div className="heat-legend" style={{ marginLeft: 8 }}>
                  <div className="sw" style={{ background: heatColor(maxScore) }} />
                  <span>High</span>
                </div>
              </div>
            </div>
          )}

          {/* Drill-in */}
          {selected && (
            <div className="slot-drill">
              <div className="slot-drill-head">
                <div>
                  <div className="slot-drill-title">
                    {DAY_NAMES[selected.dayOfWeek]} · <em>{String(selected.hour).padStart(2, "0")}:00</em> UTC
                  </div>
                  <div className="slot-drill-sub">
                    Score {selected.score.toFixed(2)} · {selected.sampleSize} sample{selected.sampleSize !== 1 ? "s" : ""}
                  </div>
                </div>
                <button type="button" className="btn btn-ghost" onClick={() => setSelected(null)} style={{ padding: "4px 10px", fontSize: 12 }}>✕ Close</button>
              </div>
              <div style={{ padding: "16px 22px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(100px, 1fr))", gap: 16 }}>
                  <div className="stat-col" style={{ textAlign: "left" }}>
                    <div className="v">{selected.score.toFixed(2)}</div>
                    <div className="l">Composite score</div>
                  </div>
                  <div className="stat-col" style={{ textAlign: "left" }}>
                    <div className="v">{selected.sampleSize}</div>
                    <div className="l">Sample size</div>
                  </div>
                  <div className="stat-col" style={{ textAlign: "left" }}>
                    <div className="v">#{slots.findIndex((s) => s.dayOfWeek === selected.dayOfWeek && s.hour === selected.hour) + 1}</div>
                    <div className="l">Rank</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Top slots list */}
      {slots.length > 0 && (
        <div>
          <div className="section-label" style={{ marginBottom: 14 }}>Top 10 recommended slots</div>
          <div className="card" style={{ overflow: "hidden" }}>
            {slots.slice(0, 10).map((s, i) => (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: "36px 1fr auto",
                  gap: 14,
                  padding: "12px 16px",
                  alignItems: "center",
                  borderBottom: i < Math.min(slots.length, 10) - 1 ? "1px solid var(--border)" : "none",
                  cursor: "pointer",
                  background: selected?.dayOfWeek === s.dayOfWeek && selected?.hour === s.hour ? "var(--accent-soft)" : undefined,
                  transition: "background .15s",
                }}
                onClick={() => setSelected(selected?.dayOfWeek === s.dayOfWeek && selected?.hour === s.hour ? null : s)}
              >
                <div style={{ fontFamily: "var(--font-serif)", fontSize: 22, color: "var(--ink-faint)", lineHeight: 1 }}>
                  {i + 1}
                </div>
                <div>
                  <div style={{ fontWeight: 500, fontSize: 14 }}>{DAY_NAMES[s.dayOfWeek]} · {String(s.hour).padStart(2, "0")}:00 UTC</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--ink-muted)", marginTop: 2 }}>n={s.sampleSize}</div>
                </div>
                <span className="chip good">score {s.score.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw rows */}
      {!activeBoardId && (
        <div style={{ marginTop: 36 }}>
          <div className="section-label" style={{ marginBottom: 14 }}>Recent analytics rows</div>
          {rowsLoading ? (
            <div className="skeleton" style={{ height: 48 }} />
          ) : analyticsItems.length === 0 ? (
            <div className="state" style={{ padding: "32px 20px" }}>
              <div className="mk">✦</div>
              <h3>No analytics yet</h3>
              <p>Once scheduled pins go live, the daily cron fetches impressions, saves, and outbound clicks.</p>
            </div>
          ) : (
            <div className="card" style={{ padding: "14px 18px", fontSize: 13, color: "var(--ink-muted)" }}>
              <span style={{ fontFamily: "var(--font-serif)", fontSize: 22 }}>{analyticsItems.length}</span> rows collected.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
