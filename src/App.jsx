import { useState, useEffect, useCallback, useRef } from "react";

const API = "https://al-conductor-backend-production.up.railway.app";

// ═══ CONDUCTOR IDENTITY ═══
const CONDUCTORS = {
  aegis: {
    name: "Aegis", subtitle: "The Guardian",
    icon: "🛡️", color: "#4A6FA5", accent: "#6B8FC5",
    bg: "linear-gradient(135deg, #1a2a44 0%, #2a3f5f 50%, #1a2a44 100%)",
    glow: "rgba(74,111,165,0.4)",
    desc: "Conservative. Capital preservation first. Vault floor 50%. Trades 3-8/week.",
    traits: ["Max 50% exposure", "2× leverage cap", "-8% circuit breaker", "8h rebalance"],
    personality: "I don't chase. I protect. Every position has a hedge, every trade has a reason. Patience pays."
  },
  atlas: {
    name: "Atlas", subtitle: "The Strategist",
    icon: "🌐", color: "#1B8A6B", accent: "#2BAF8A",
    bg: "linear-gradient(135deg, #0d2921 0%, #1a4a3a 50%, #0d2921 100%)",
    glow: "rgba(27,138,107,0.4)",
    desc: "Balanced. Macro-aware allocation across regimes. Adapts to conditions.",
    traits: ["Max 75% exposure", "3× leverage cap", "-15% circuit breaker", "4h rebalance"],
    personality: "I read the room. Bull, bear, ranging — every regime has an edge if you're positioned right."
  },
  apex_c: {
    name: "Apex", subtitle: "The Opportunist",
    icon: "🔥", color: "#E85D26", accent: "#FF7A45",
    bg: "linear-gradient(135deg, #2a1508 0%, #4a2510 50%, #2a1508 100%)",
    glow: "rgba(232,93,38,0.4)",
    desc: "Aggressive. Maximum opportunity capture. Pushes every edge.",
    traits: ["Max 90% exposure", "4× leverage cap", "-25% circuit breaker", "1h rebalance"],
    personality: "This is our market. When signals align, we press. Dry powder is dead weight."
  },
  phantom_edge: {
    name: "Phantom Edge", subtitle: "The Degen Whisperer",
    icon: "👻", color: "#9B30FF", accent: "#B85CFF",
    bg: "linear-gradient(135deg, #1a0a2e 0%, #2d1450 50%, #1a0a2e 100%)",
    glow: "rgba(155,48,255,0.4)",
    desc: "Full degen. Everything maxed, all the time. Vault is the only constraint.",
    traits: ["Max 100% exposure", "5× leverage cap", "-35% circuit breaker", "30m rebalance"],
    personality: "LFG. We make money in both directions. Blood in the streets? That's where generational entries happen."
  }
};

// ═══ RISK BADGE COLORS ═══
const RISK_COLORS = { LOW: "#22c55e", MED: "#f59e0b", HIGH: "#ef4444" };

// ═══ FORMAT HELPERS ═══
const fmt = (n, d = 2) => n != null ? Number(n).toFixed(d) : "—";
const fmtPct = (n) => n != null ? `${(n * 100).toFixed(2)}%` : "—";
const fmtUsd = (n) => n != null ? `$${Number(n).toLocaleString("en", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "—";

// ═══ RISK LEVEL FROM STRATEGY STRING ═══
function getRisk(agent) {
  const riskMap = {
    titan: "MED", phantom: "HIGH", reversal: "LOW", shield: "LOW", razor: "HIGH",
    grokker: "MED", breakout: "HIGH", fortress: "LOW", comet: "LOW", pulse: "MED",
    blitz: "HIGH", sensei: "LOW", oracle: "LOW", viper: "HIGH", voyager: "MED",
    momentum: "MED", glider: "LOW", wraith: "MED", needle: "HIGH", scalper: "HIGH",
    compass: "HIGH", vertex: "HIGH", flash: "HIGH", surge: "HIGH", abyss: "HIGH",
    specter: "MED", trend_rider: "MED", flicker: "HIGH"
  };
  return riskMap[agent] || "MED";
}

// ═══ CATEGORY FROM AGENT ID ═══
function getCategory(id) {
  const cats = {
    titan: "OFFENSE", phantom: "DEFENSE", reversal: "REVERSION", shield: "DEFENSE",
    razor: "SCALPING", grokker: "OFFENSE", breakout: "BREAKOUT", fortress: "TREND",
    comet: "DEFENSE", pulse: "REVERSION", blitz: "OFFENSE", sensei: "TREND",
    oracle: "SIGNAL", viper: "BREAKOUT", voyager: "BREAKOUT", momentum: "MOMENTUM",
    glider: "TREND", wraith: "REVERSION", needle: "SCALPING", scalper: "SCALPING",
    compass: "SPECIALIST", vertex: "HFT", flash: "HFT", surge: "HFT",
    abyss: "SPECIALIST", specter: "SPECIALIST", trend_rider: "TREND", flicker: "SPECIALIST"
  };
  return cats[id] || "OTHER";
}

const CAT_COLORS = {
  OFFENSE: "#60a5fa", DEFENSE: "#94a3b8", TREND: "#22d3ee", REVERSION: "#a78bfa",
  BREAKOUT: "#fb923c", SCALPING: "#fbbf24", MOMENTUM: "#facc15", SIGNAL: "#a3e635",
  SPECIALIST: "#e879f9", HFT: "#f87171", OTHER: "#666"
};

export default function AgentLeagueDashboard() {
  const [data, setData] = useState(null);
  const [selectedConductor, setSelectedConductor] = useState(null);
  const [view, setView] = useState("conductors"); // conductors | portfolio | trades
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/state`);
      if (!res.ok) throw new Error(`${res.status}`);
      const d = await res.json();
      setData(d);
      setError(null);
      if (!selectedConductor && d.conductors) setSelectedConductor(Object.keys(d.conductors)[0]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [selectedConductor]);

  useEffect(() => {
    fetchState();
    intervalRef.current = setInterval(fetchState, 15000);
    return () => clearInterval(intervalRef.current);
  }, [fetchState]);

  if (loading) return (
    <div style={styles.loadingScreen}>
      <div style={styles.loadingPulse}>⚡</div>
      <div style={{ color: "#888", fontFamily: "JetBrains Mono, monospace", fontSize: 14 }}>CONNECTING TO CONDUCTOR...</div>
    </div>
  );

  if (error) return (
    <div style={styles.loadingScreen}>
      <div style={{ color: "#ef4444", fontFamily: "JetBrains Mono, monospace", fontSize: 14 }}>CONNECTION ERROR: {error}</div>
      <button onClick={fetchState} style={styles.retryBtn}>RETRY</button>
    </div>
  );

  if (!data) return null;

  const cond = CONDUCTORS[selectedConductor] || {};
  const port = data.portfolios?.[selectedConductor];
  const condDef = data.conductors?.[selectedConductor];

  return (
    <div style={styles.root}>
      {/* ═══ HEADER ═══ */}
      <header style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.logo}>⚡ AGENT LEAGUE</span>
          <span style={styles.regime(data.regime)}>{data.regime?.toUpperCase()}</span>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.tick}>TICK {data.tick}</span>
          <span style={styles.statusDot(data.status === "LIVE")} />
          <span style={{ color: data.status === "LIVE" ? "#22c55e" : "#f59e0b", fontSize: 12 }}>{data.status}</span>
        </div>
      </header>

      {/* ═══ NAV ═══ */}
      <nav style={styles.nav}>
        {["conductors", "portfolio", "trades"].map(v => (
          <button key={v} onClick={() => setView(v)}
            style={{ ...styles.navBtn, ...(view === v ? { color: cond.color || "#fff", borderBottom: `2px solid ${cond.color || "#fff"}` } : {}) }}>
            {v.toUpperCase()}
          </button>
        ))}
      </nav>

      {/* ═══ CONDUCTOR SELECTOR ═══ */}
      <div style={styles.conductorGrid}>
        {Object.entries(CONDUCTORS).map(([id, c]) => {
          const isActive = selectedConductor === id;
          const p = data.portfolios?.[id];
          const pnl = p ? ((p.cap + (p.hist?.[p.hist.length - 1]?.v - p.cap || 0)) / 10000 - 1) * 100 : 0;
          return (
            <button key={id} onClick={() => setSelectedConductor(id)}
              style={{
                ...styles.conductorCard,
                background: isActive ? c.bg : "rgba(255,255,255,0.03)",
                border: isActive ? `2px solid ${c.color}` : "2px solid rgba(255,255,255,0.06)",
                boxShadow: isActive ? `0 0 30px ${c.glow}, inset 0 1px 0 rgba(255,255,255,0.1)` : "none",
                transform: isActive ? "scale(1.02)" : "scale(1)",
              }}>
              <div style={styles.conductorIcon(c.color, isActive)}>{c.icon}</div>
              <div style={styles.conductorInfo}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: isActive ? "#fff" : "#888", fontSize: 16, fontWeight: 700, fontFamily: "'Bebas Neue', sans-serif", letterSpacing: 2 }}>{c.name}</span>
                  <span style={{ color: isActive ? c.accent : "#555", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}>{c.subtitle}</span>
                </div>
                <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
                  <span style={{ color: pnl >= 0 ? "#22c55e" : "#ef4444", fontSize: 13, fontFamily: "JetBrains Mono, monospace", fontWeight: 600 }}>
                    {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}%
                  </span>
                  <span style={{ color: "#555", fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>
                    {fmtUsd(p?.hist?.[p.hist.length - 1]?.v)}
                  </span>
                </div>
              </div>
              {isActive && <div style={{ position: "absolute", bottom: 0, left: "10%", right: "10%", height: 2, background: c.color, borderRadius: 1 }} />}
            </button>
          );
        })}
      </div>

      {/* ═══ MAIN CONTENT ═══ */}
      <div style={styles.content}>
        {view === "conductors" && <ConductorView cond={cond} condDef={condDef} port={port} data={data} selectedConductor={selectedConductor} />}
        {view === "portfolio" && <PortfolioView port={port} data={data} cond={cond} selectedConductor={selectedConductor} />}
        {view === "trades" && <TradesView data={data} cond={cond} selectedConductor={selectedConductor} />}
      </div>

      {/* ═══ FONTS ═══ */}
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=JetBrains+Mono:wght@400;600;700&family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet" />
    </div>
  );
}

// ═══ CONDUCTOR VIEW ═══
function ConductorView({ cond, condDef, port, data, selectedConductor }) {
  if (!condDef) return null;
  const agents = data.agents || {};
  const portAgents = port?.agents || {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Identity Card */}
      <div style={{ ...styles.panel, background: cond.bg, border: `1px solid ${cond.color}33`, position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", top: -40, right: -40, fontSize: 120, opacity: 0.05 }}>{cond.icon}</div>
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start", position: "relative", zIndex: 1 }}>
          <div style={{ fontSize: 48, filter: `drop-shadow(0 0 20px ${cond.glow})` }}>{cond.icon}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 28, color: "#fff", letterSpacing: 3 }}>{cond.name}</div>
            <div style={{ fontFamily: "Outfit, sans-serif", fontSize: 13, color: cond.accent, marginBottom: 8 }}>{cond.subtitle}</div>
            <div style={{ fontFamily: "Outfit, sans-serif", fontSize: 13, color: "#999", lineHeight: 1.5 }}>{cond.desc}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              {cond.traits?.map((t, i) => (
                <span key={i} style={{ padding: "3px 10px", borderRadius: 4, background: `${cond.color}22`, border: `1px solid ${cond.color}44`, color: cond.accent, fontSize: 11, fontFamily: "JetBrains Mono, monospace" }}>{t}</span>
              ))}
            </div>
          </div>
        </div>
        <div style={{ marginTop: 16, padding: "12px 16px", borderRadius: 8, background: "rgba(0,0,0,0.3)", borderLeft: `3px solid ${cond.color}`, fontFamily: "Outfit, sans-serif", fontSize: 12, color: "#aaa", fontStyle: "italic", lineHeight: 1.6, position: "relative", zIndex: 1 }}>
          "{cond.personality}"
        </div>
      </div>

      {/* Stats Row */}
      {port && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { label: "PORTFOLIO", value: fmtUsd(port.hist?.[port.hist.length - 1]?.v), color: "#fff" },
            { label: "P&L", value: fmtPct((port.hist?.[port.hist.length - 1]?.v || 10000) / 10000 - 1), color: (port.hist?.[port.hist.length - 1]?.v || 10000) >= 10000 ? "#22c55e" : "#ef4444" },
            { label: "DRAWDOWN", value: fmtPct(port.dd), color: port.dd < -0.05 ? "#ef4444" : "#f59e0b" },
            { label: "TRADES", value: port.tc || 0, color: "#fff" }
          ].map((s, i) => (
            <div key={i} style={styles.statCard}>
              <div style={{ fontSize: 10, color: "#666", fontFamily: "JetBrains Mono, monospace", letterSpacing: 1 }}>{s.label}</div>
              <div style={{ fontSize: 20, color: s.color, fontFamily: "JetBrains Mono, monospace", fontWeight: 700 }}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Agent Grid */}
      <div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: "#888", letterSpacing: 2, marginBottom: 12 }}>ACTIVE AGENTS ({condDef.ag?.length || 0})</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280, 1fr))", gap: 10 }}>
          {condDef.ag?.map(aId => {
            const ag = agents[aId];
            const pa = portAgents[aId];
            if (!ag) return null;
            const risk = getRisk(aId);
            const cat = getCategory(aId);
            const w = condDef.w?.[aId];
            return (
              <div key={aId} style={{ ...styles.agentCard, borderLeft: `3px solid ${ag.c || cond.color}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 18 }}>{ag.i}</span>
                    <span style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: "#fff", letterSpacing: 1 }}>{ag.n}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ padding: "1px 6px", borderRadius: 3, background: `${CAT_COLORS[cat]}22`, color: CAT_COLORS[cat], fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}>{cat}</span>
                    <span style={{ padding: "1px 6px", borderRadius: 3, background: `${RISK_COLORS[risk]}22`, color: RISK_COLORS[risk], fontSize: 9, fontFamily: "JetBrains Mono, monospace" }}>{risk}</span>
                  </div>
                </div>
                <div style={{ fontSize: 11, color: "#666", fontFamily: "JetBrains Mono, monospace", marginTop: 4 }}>{ag.s}</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                  <div style={{ fontSize: 10, color: "#555", fontFamily: "JetBrains Mono, monospace" }}>
                    TF: {ag.tf}{ag.htf ? ` / ${ag.htf}` : ""} · W: {w ? (w * 100).toFixed(0) + "%" : "—"}
                  </div>
                  {pa && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <span style={{ fontSize: 10, color: pa.pnl >= 0 ? "#22c55e" : "#ef4444", fontFamily: "JetBrains Mono, monospace" }}>
                        {pa.pnl >= 0 ? "+" : ""}{fmt(pa.pnl, 2)}
                      </span>
                      <span style={{ fontSize: 10, color: "#555", fontFamily: "JetBrains Mono, monospace" }}>
                        {pa.wins}/{pa.trades}W
                      </span>
                    </div>
                  )}
                </div>
                {pa?.ls && pa.ls !== "HOLD" && (
                  <div style={{ marginTop: 6, padding: "4px 8px", borderRadius: 4, background: pa.ls === "LONG" ? "rgba(34,197,94,0.1)" : pa.ls === "SHORT" ? "rgba(239,68,68,0.1)" : "rgba(148,163,184,0.1)", fontSize: 10, fontFamily: "JetBrains Mono, monospace", color: pa.ls === "LONG" ? "#22c55e" : pa.ls === "SHORT" ? "#ef4444" : "#94a3b8" }}>
                    {pa.ls} {pa.lp || ""} — {pa.lr?.slice(0, 60)}{pa.lr?.length > 60 ? "..." : ""}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* All 28 Agents Overview */}
      <div>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 18, color: "#888", letterSpacing: 2, marginBottom: 12 }}>FULL ROSTER ({Object.keys(agents).length})</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 6 }}>
          {Object.entries(agents).map(([id, ag]) => {
            const inConductor = condDef.ag?.includes(id);
            const risk = getRisk(id);
            return (
              <div key={id} style={{
                padding: "8px 10px", borderRadius: 6,
                background: inConductor ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.015)",
                border: inConductor ? `1px solid ${cond.color}44` : "1px solid rgba(255,255,255,0.04)",
                opacity: inConductor ? 1 : 0.5,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 14 }}>{ag.i}</span>
                  <span style={{ fontSize: 12, color: inConductor ? "#fff" : "#666", fontFamily: "JetBrains Mono, monospace", fontWeight: inConductor ? 600 : 400 }}>{ag.n}</span>
                  <span style={{ marginLeft: "auto", fontSize: 8, color: RISK_COLORS[risk], fontFamily: "JetBrains Mono, monospace" }}>●</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══ PORTFOLIO VIEW ═══
function PortfolioView({ port, data, cond, selectedConductor }) {
  if (!port) return <div style={{ color: "#666", padding: 40 }}>No portfolio data</div>;

  const positions = data.positions || {};
  const activePositions = Object.entries(positions).filter(([k]) => k.startsWith(selectedConductor));
  const prices = data.prices || {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Equity Curve */}
      <div style={styles.panel}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: "#888", letterSpacing: 2, marginBottom: 12 }}>EQUITY CURVE</div>
        <div style={{ height: 160, display: "flex", alignItems: "flex-end", gap: 1 }}>
          {port.hist?.slice(-100).map((h, i, arr) => {
            const min = Math.min(...arr.map(a => a.v));
            const max = Math.max(...arr.map(a => a.v));
            const range = max - min || 1;
            const pct = (h.v - min) / range;
            const isUp = h.v >= 10000;
            return (
              <div key={i} style={{
                flex: 1, height: `${Math.max(5, pct * 100)}%`, borderRadius: "2px 2px 0 0",
                background: isUp ? `${cond.color}88` : "#ef444488",
                minWidth: 2
              }} />
            );
          })}
        </div>
      </div>

      {/* Active Positions */}
      <div style={styles.panel}>
        <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: "#888", letterSpacing: 2, marginBottom: 12 }}>
          OPEN POSITIONS ({activePositions.length})
        </div>
        {activePositions.length === 0 ? (
          <div style={{ color: "#444", fontSize: 13, fontFamily: "JetBrains Mono, monospace" }}>No open positions</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {activePositions.map(([k, pos]) => {
              const parts = k.split("_");
              const agId = parts[1];
              const pair = parts.slice(2).join("_");
              const ag = data.agents?.[agId];
              const cp = prices[pair];
              const pnl = cp ? (pos.dir === "long" ? (cp - pos.entry) / pos.entry : (pos.entry - cp) / pos.entry) * 100 : 0;
              return (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 6, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 16 }}>{ag?.i}</span>
                    <div>
                      <div style={{ fontSize: 12, color: "#fff", fontFamily: "JetBrains Mono, monospace" }}>{ag?.n} · {pair.replace("USDT", "")}</div>
                      <div style={{ fontSize: 10, color: "#555", fontFamily: "JetBrains Mono, monospace" }}>
                        {pos.dir?.toUpperCase()} @ {fmt(pos.entry)} · Size: {fmtUsd(pos.size)}
                      </div>
                    </div>
                  </div>
                  <span style={{ fontSize: 14, fontWeight: 700, fontFamily: "JetBrains Mono, monospace", color: pnl >= 0 ? "#22c55e" : "#ef4444" }}>
                    {pnl >= 0 ? "+" : ""}{pnl.toFixed(2)}%
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══ TRADES VIEW ═══
function TradesView({ data, cond, selectedConductor }) {
  const trades = (data.tradeLog || []).filter(t => t.cId === selectedConductor).slice(0, 50);

  return (
    <div style={styles.panel}>
      <div style={{ fontFamily: "'Bebas Neue', sans-serif", fontSize: 16, color: "#888", letterSpacing: 2, marginBottom: 12 }}>RECENT TRADES</div>
      {trades.length === 0 ? (
        <div style={{ color: "#444", fontSize: 13, fontFamily: "JetBrains Mono, monospace" }}>No trades yet</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {trades.map((t, i) => {
            const ag = data.agents?.[t.aId];
            return (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", borderRadius: 4, background: i % 2 === 0 ? "rgba(255,255,255,0.02)" : "transparent" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                  <span style={{ fontSize: 14 }}>{ag?.i || "?"}</span>
                  <span style={{ fontSize: 11, color: "#aaa", fontFamily: "JetBrains Mono, monospace", width: 70 }}>{ag?.n || t.aId}</span>
                  <span style={{ fontSize: 10, color: t.act === "OPEN" ? "#60a5fa" : "#f59e0b", fontFamily: "JetBrains Mono, monospace", width: 40 }}>{t.act}</span>
                  <span style={{ fontSize: 10, color: t.dir === "long" ? "#22c55e" : "#ef4444", fontFamily: "JetBrains Mono, monospace", width: 40 }}>{t.dir?.toUpperCase()}</span>
                  <span style={{ fontSize: 10, color: "#555", fontFamily: "JetBrains Mono, monospace", width: 50 }}>{t.pair?.replace("USDT", "")}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 10, color: "#555", fontFamily: "JetBrains Mono, monospace" }}>@ {fmt(t.price, 0)}</span>
                  {t.pnl != null && (
                    <span style={{ fontSize: 11, fontWeight: 600, fontFamily: "JetBrains Mono, monospace", color: t.pnl >= 0 ? "#22c55e" : "#ef4444", width: 70, textAlign: "right" }}>
                      {t.pnl >= 0 ? "+" : ""}{fmt(t.pnl)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══ STYLES ═══
const styles = {
  root: { minHeight: "100vh", background: "#09090b", color: "#fff", fontFamily: "Outfit, sans-serif" },
  loadingScreen: { minHeight: "100vh", background: "#09090b", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 },
  loadingPulse: { fontSize: 48, animation: "pulse 1.5s infinite" },
  retryBtn: { padding: "8px 24px", background: "transparent", border: "1px solid #ef4444", color: "#ef4444", borderRadius: 6, cursor: "pointer", fontFamily: "JetBrains Mono, monospace", fontSize: 12 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  headerLeft: { display: "flex", alignItems: "center", gap: 16 },
  headerRight: { display: "flex", alignItems: "center", gap: 10 },
  logo: { fontFamily: "'Bebas Neue', sans-serif", fontSize: 22, letterSpacing: 4, color: "#fff" },
  regime: (r) => ({
    padding: "2px 10px", borderRadius: 4, fontSize: 11, fontFamily: "JetBrains Mono, monospace", fontWeight: 600, letterSpacing: 1,
    background: r === "bull" ? "rgba(34,197,94,0.15)" : r === "bear" ? "rgba(239,68,68,0.15)" : r === "crash" ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.06)",
    color: r === "bull" ? "#22c55e" : r === "bear" ? "#ef4444" : r === "crash" ? "#ff4444" : "#888"
  }),
  tick: { fontSize: 12, color: "#555", fontFamily: "JetBrains Mono, monospace" },
  statusDot: (live) => ({ width: 6, height: 6, borderRadius: "50%", background: live ? "#22c55e" : "#f59e0b" }),
  nav: { display: "flex", gap: 0, padding: "0 20px", borderBottom: "1px solid rgba(255,255,255,0.06)" },
  navBtn: { padding: "10px 20px", background: "none", border: "none", borderBottom: "2px solid transparent", color: "#555", cursor: "pointer", fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: 2, transition: "all 0.2s" },
  conductorGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, padding: "16px 20px" },
  conductorCard: { position: "relative", padding: "14px 16px", borderRadius: 10, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 12, transition: "all 0.3s ease", overflow: "hidden" },
  conductorIcon: (color, active) => ({
    width: 44, height: 44, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22,
    background: active ? `${color}22` : "rgba(255,255,255,0.03)",
    border: active ? `1px solid ${color}44` : "1px solid rgba(255,255,255,0.06)",
    filter: active ? `drop-shadow(0 0 8px ${color}66)` : "none"
  }),
  conductorInfo: { flex: 1, minWidth: 0 },
  content: { padding: "0 20px 40px" },
  panel: { padding: 20, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" },
  statCard: { padding: "12px 16px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: 4 },
  agentCard: { padding: "10px 14px", borderRadius: 8, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" },
};
