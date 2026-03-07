import { useState, useEffect, useRef, useCallback } from "react";
import { AreaChart, Area, ResponsiveContainer, LineChart, Line } from "recharts";

// ── Binance Trading Universe (top USDT pairs by liquidity) ──
const PAIRS = ["BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","DOGEUSDT","ADAUSDT","AVAXUSDT"];
const PAIR_LABELS = { BTCUSDT:"BTC", ETHUSDT:"ETH", BNBUSDT:"BNB", SOLUSDT:"SOL", XRPUSDT:"XRP", DOGEUSDT:"DOGE", ADAUSDT:"ADA", AVAXUSDT:"AVAX" };

// ── Indicator Math ──
function calcEMA(data, period) {
  if (!data.length) return [];
  const k = 2/(period+1);
  let ema = data[0];
  return data.map(v => (ema = v*k + ema*(1-k)));
}
function calcSMA(data, period) {
  return data.map((_,i) => {
    if (i < period-1) return null;
    let s = 0;
    for (let j = i-period+1; j <= i; j++) s += data[j];
    return s/period;
  });
}
function calcRSI(closes, period=14) {
  if (closes.length < period+1) return Array(closes.length).fill(50);
  const result = Array(closes.length).fill(50);
  let avgGain=0, avgLoss=0;
  for (let i=1; i<=period; i++) {
    const d = closes[i]-closes[i-1];
    if (d>0) avgGain+=d; else avgLoss-=d;
  }
  avgGain/=period; avgLoss/=period;
  result[period] = avgLoss===0 ? 100 : 100-100/(1+avgGain/avgLoss);
  for (let i=period+1; i<closes.length; i++) {
    const d = closes[i]-closes[i-1];
    avgGain = (avgGain*(period-1)+(d>0?d:0))/period;
    avgLoss = (avgLoss*(period-1)+(d<0?-d:0))/period;
    result[i] = avgLoss===0 ? 100 : 100-100/(1+avgGain/avgLoss);
  }
  return result;
}
function calcMACD(closes) {
  const ema12 = calcEMA(closes,12), ema26 = calcEMA(closes,26);
  const macdLine = ema12.map((v,i) => v-ema26[i]);
  const signal = calcEMA(macdLine,9);
  return { macdLine, signal, histogram: macdLine.map((v,i) => v-signal[i]) };
}
function calcBB(closes, period=20, mult=2) {
  const sma = calcSMA(closes, period);
  return sma.map((m,i) => {
    if (m===null) return {upper:null,mid:null,lower:null};
    let sum=0;
    for (let j=i-period+1;j<=i;j++) sum+=(closes[j]-m)**2;
    const std = Math.sqrt(sum/period);
    return { upper:m+mult*std, mid:m, lower:m-mult*std, std };
  });
}
function calcATR(candles, period=14) {
  if (candles.length < 2) return Array(candles.length).fill(0);
  const tr = candles.map((c,i) => {
    if (i===0) return c.high-c.low;
    return Math.max(c.high-c.low, Math.abs(c.high-candles[i-1].close), Math.abs(c.low-candles[i-1].close));
  });
  return calcEMA(tr, period);
}
function calcADX(candles, period=14) {
  if (candles.length < period*2) return { adx: Array(candles.length).fill(20), plusDI: Array(candles.length).fill(25), minusDI: Array(candles.length).fill(25) };
  const plusDM=[], minusDM=[], tr=[];
  for (let i=0;i<candles.length;i++) {
    if (i===0) { plusDM.push(0);minusDM.push(0);tr.push(candles[i].high-candles[i].low);continue; }
    const up=candles[i].high-candles[i-1].high, down=candles[i-1].low-candles[i].low;
    plusDM.push(up>down&&up>0?up:0);
    minusDM.push(down>up&&down>0?down:0);
    tr.push(Math.max(candles[i].high-candles[i].low,Math.abs(candles[i].high-candles[i-1].close),Math.abs(candles[i].low-candles[i-1].close)));
  }
  const atr=calcEMA(tr,period), sPlusDM=calcEMA(plusDM,period), sMinusDM=calcEMA(minusDM,period);
  const plusDI=sPlusDM.map((v,i)=>atr[i]?v/atr[i]*100:0);
  const minusDI=sMinusDM.map((v,i)=>atr[i]?v/atr[i]*100:0);
  const dx=plusDI.map((p,i)=>{const s=p+minusDI[i];return s?Math.abs(p-minusDI[i])/s*100:0;});
  const adx=calcEMA(dx,period);
  return {adx,plusDI,minusDI};
}
function calcCCI(candles, period=20) {
  return candles.map((c,i) => {
    if (i<period-1) return 0;
    const tps=[];
    for (let j=i-period+1;j<=i;j++) tps.push((candles[j].high+candles[j].low+candles[j].close)/3);
    const mean=tps.reduce((a,b)=>a+b,0)/period;
    const md=tps.reduce((a,b)=>a+Math.abs(b-mean),0)/period;
    return md ? ((candles[i].high+candles[i].low+candles[i].close)/3-mean)/(0.015*md) : 0;
  });
}

// ── Agent Definitions ──
const AGENTS = {
  titan:    { name:"Titan",    icon:"▲", type:"Hybrid BB/EMA/RSI",   color:"#60a5fa", dir:"long" },
  phantom:  { name:"Phantom",  icon:"▼", type:"Short Seller",        color:"#f87171", dir:"short" },
  reversal: { name:"Reversal", icon:"☯", type:"Z-Score Mean Rev",    color:"#a78bfa", dir:"neutral" },
  shield:   { name:"Shield",   icon:"🛡", type:"Hedge Overlay",      color:"#94a3b8", dir:"hedge" },
  razor:    { name:"Razor",    icon:"⚡", type:"EMA/RSI Scalp",      color:"#fbbf24", dir:"long" },
  grokker:  { name:"Grokker",  icon:"◑", type:"Sentiment Proxy",     color:"#34d399", dir:"contrarian" },
  breakout: { name:"Breakout", icon:"💥", type:"ATR Breakout",       color:"#fb923c", dir:"long" },
  fortress: { name:"Fortress", icon:"🏰", type:"ADX Trend Strength", color:"#7dd3fc", dir:"long" },
  comet:    { name:"Comet",    icon:"☄", type:"Smart DCA",           color:"#c084fc", dir:"long" },
  pulse:    { name:"Pulse",    icon:"📊", type:"CCI Cycle",          color:"#2dd4bf", dir:"neutral" },
  blitz:    { name:"Blitz",    icon:"🎯", type:"Meme Momentum",      color:"#f472b6", dir:"long" },
};

// ── Strategy Signal Generators (real indicator logic) ──
function signalTitan(candles, closes) {
  const n = closes.length-1;
  if (n < 50) return { signal:"HOLD", confidence:0, reason:"Warming up" };
  const bb = calcBB(closes); const ema50 = calcEMA(closes,50); const rsi = calcRSI(closes);
  const bbn = bb[n]; if (!bbn?.mid) return { signal:"HOLD", confidence:0, reason:"Insufficient data" };
  if (closes[n] <= bbn.lower && closes[n] > ema50[n] && rsi[n] < 40 && rsi[n] > rsi[n-1]) {
    return { signal:"LONG", confidence: Math.min(0.9, (ema50[n]-bbn.lower)/closes[n]*100), reason:`BB lower touch + RSI ${rsi[n].toFixed(0)} rising` };
  }
  if (closes[n] >= bbn.upper && closes[n] < ema50[n] && rsi[n] > 60 && rsi[n] < rsi[n-1]) {
    return { signal:"SHORT", confidence: Math.min(0.9, (bbn.upper-ema50[n])/closes[n]*100), reason:`BB upper touch + RSI ${rsi[n].toFixed(0)} falling` };
  }
  return { signal:"HOLD", confidence:0, reason:`RSI ${rsi[n].toFixed(0)}, price mid-band` };
}
function signalPhantom(candles, closes) {
  const n = closes.length-1;
  if (n < 50) return { signal:"HOLD", confidence:0, reason:"Warming up" };
  const ema9 = calcEMA(closes,9), ema21 = calcEMA(closes,21), ema50 = calcEMA(closes,50);
  const rsi = calcRSI(closes);
  if (ema9[n]<ema21[n] && closes[n]<ema50[n] && rsi[n]<45) {
    const highs3 = candles.slice(-3).map(c=>c.high);
    const rejected = Math.max(...highs3) > ema21[n] && closes[n] < ema21[n];
    if (rejected) return { signal:"SHORT", confidence:0.75, reason:`Failed bounce at EMA21, RSI ${rsi[n].toFixed(0)}` };
    return { signal:"SHORT", confidence:0.6, reason:`Bearish structure, below EMA50` };
  }
  return { signal:"HOLD", confidence:0, reason:"No bearish setup" };
}
function signalReversal(candles, closes) {
  const n = closes.length-1;
  if (n < 50) return { signal:"HOLD", confidence:0, reason:"Warming up" };
  const sma = calcSMA(closes,50); if (!sma[n]) return { signal:"HOLD", confidence:0, reason:"SMA not ready" };
  let sum=0; for (let i=n-49;i<=n;i++) sum+=(closes[i]-sma[n])**2;
  const std = Math.sqrt(sum/50); if (!std) return { signal:"HOLD", confidence:0, reason:"No volatility" };
  const z = (closes[n]-sma[n])/std;
  const prevZ = n>0 ? (closes[n-1]-sma[n-1])/(std||1) : z;
  if (z < -2.0 && z > prevZ) return { signal:"LONG", confidence:Math.min(1,Math.abs(z)/3), reason:`Z-score ${z.toFixed(2)} reverting` };
  if (z > 2.0 && z < prevZ) return { signal:"SHORT", confidence:Math.min(1,Math.abs(z)/3), reason:`Z-score ${z.toFixed(2)} reverting` };
  return { signal:"HOLD", confidence:0, reason:`Z-score ${z.toFixed(2)}` };
}
function signalRazor(candles, closes) {
  const n = closes.length-1;
  if (n < 20) return { signal:"HOLD", confidence:0, reason:"Warming up" };
  const ema5 = calcEMA(closes,5), ema13 = calcEMA(closes,13), rsi = calcRSI(closes,9);
  if (n>0 && ema5[n]>ema13[n] && ema5[n-1]<=ema13[n-1] && rsi[n]>50 && rsi[n]<75) {
    return { signal:"LONG", confidence:0.7, reason:`EMA5/13 bull cross, RSI ${rsi[n].toFixed(0)}` };
  }
  if (n>0 && ema5[n]<ema13[n] && ema5[n-1]>=ema13[n-1] && rsi[n]<50 && rsi[n]>25) {
    return { signal:"SHORT", confidence:0.7, reason:`EMA5/13 bear cross, RSI ${rsi[n].toFixed(0)}` };
  }
  return { signal:"HOLD", confidence:0, reason:`No EMA cross` };
}
function signalBreakout(candles, closes) {
  const n = closes.length-1;
  if (n < 25) return { signal:"HOLD", confidence:0, reason:"Warming up" };
  const highs = candles.slice(n-20,n).map(c=>c.high);
  const lows = candles.slice(n-20,n).map(c=>c.low);
  const upper = Math.max(...highs), lower = Math.min(...lows);
  const atr = calcATR(candles); const vol = candles[n].volume;
  const avgVol = candles.slice(n-20,n).reduce((a,c)=>a+c.volume,0)/20;
  if (closes[n]>upper && vol>avgVol*1.3 && atr[n]>atr[n-1]) {
    return { signal:"LONG", confidence:0.7, reason:`Breakout above ${upper.toFixed(2)}, vol ${(vol/avgVol).toFixed(1)}x` };
  }
  if (closes[n]<lower && vol>avgVol*1.3 && atr[n]>atr[n-1]) {
    return { signal:"SHORT", confidence:0.7, reason:`Breakdown below ${lower.toFixed(2)}` };
  }
  return { signal:"HOLD", confidence:0, reason:"In range" };
}
function signalFortress(candles, closes) {
  const n = closes.length-1;
  if (n < 30) return { signal:"HOLD", confidence:0, reason:"Warming up" };
  const {adx,plusDI,minusDI} = calcADX(candles);
  const ema50 = calcEMA(closes,50);
  if (adx[n]>25 && plusDI[n]>minusDI[n] && closes[n]>ema50[n] && adx[n]>adx[n-1]) {
    return { signal:"LONG", confidence:Math.min(1,adx[n]/50), reason:`ADX ${adx[n].toFixed(0)} +DI>${minusDI[n].toFixed(0)}` };
  }
  if (adx[n]>25 && minusDI[n]>plusDI[n] && closes[n]<ema50[n] && adx[n]>adx[n-1]) {
    return { signal:"SHORT", confidence:Math.min(1,adx[n]/50), reason:`ADX ${adx[n].toFixed(0)} -DI>${plusDI[n].toFixed(0)}` };
  }
  return { signal:"HOLD", confidence:0, reason:`ADX ${adx[n].toFixed(0)} — weak trend` };
}
function signalPulse(candles, closes) {
  const n = closes.length-1;
  if (n < 25) return { signal:"HOLD", confidence:0, reason:"Warming up" };
  const cci = calcCCI(candles);
  const ema50 = calcEMA(closes,50);
  const slope = ema50[n]-ema50[Math.max(0,n-3)];
  if (cci[n]>-100 && cci[n-1]<=-100 && slope>0) return { signal:"LONG", confidence:0.65, reason:`CCI exit oversold ${cci[n].toFixed(0)}` };
  if (cci[n]<100 && cci[n-1]>=100 && slope<0) return { signal:"SHORT", confidence:0.65, reason:`CCI exit overbought ${cci[n].toFixed(0)}` };
  return { signal:"HOLD", confidence:0, reason:`CCI ${cci[n].toFixed(0)}` };
}
function signalGrokker(candles, closes) {
  // Sentiment proxy: extreme RSI + volume divergence as contrarian
  const n = closes.length-1;
  if (n < 20) return { signal:"HOLD", confidence:0, reason:"Warming up" };
  const rsi = calcRSI(closes); const vol = candles[n].volume;
  const avgVol = candles.slice(Math.max(0,n-20),n).reduce((a,c)=>a+c.volume,0)/20;
  if (rsi[n]<25 && vol>avgVol*1.5 && rsi[n]>rsi[n-1]) {
    return { signal:"LONG", confidence:0.7, reason:`Extreme fear RSI ${rsi[n].toFixed(0)}, vol spike — contrarian buy` };
  }
  if (rsi[n]>75 && vol>avgVol*1.5 && rsi[n]<rsi[n-1]) {
    return { signal:"SHORT", confidence:0.7, reason:`Euphoria RSI ${rsi[n].toFixed(0)}, vol spike — contrarian sell` };
  }
  return { signal:"HOLD", confidence:0, reason:`RSI ${rsi[n].toFixed(0)}, sentiment neutral` };
}
function signalComet(candles, closes, tick) {
  // Smart DCA: buys every N ticks with RSI-based multiplier
  if (tick % 20 !== 0) return { signal:"HOLD", confidence:0, reason:"Waiting for DCA cycle" };
  const n = closes.length-1;
  if (n < 14) return { signal:"HOLD", confidence:0, reason:"Warming up" };
  const rsi = calcRSI(closes);
  let mult = 1.0;
  if (rsi[n]<30) mult=1.5; else if (rsi[n]<40) mult=1.25; else if (rsi[n]>70) mult=0.5; else if (rsi[n]>60) mult=0.75;
  return { signal:"LONG", confidence:0.3*mult, reason:`DCA buy (${mult}x), RSI ${rsi[n].toFixed(0)}` };
}
function signalBlitz(candles, closes) {
  const n = closes.length-1;
  if (n < 10) return { signal:"HOLD", confidence:0, reason:"Warming up" };
  const vol = candles[n].volume;
  const avgVol = candles.slice(Math.max(0,n-10),n).reduce((a,c)=>a+c.volume,0)/10;
  const roc = (closes[n]-closes[Math.max(0,n-5)])/closes[Math.max(0,n-5)]*100;
  if (vol>avgVol*3 && roc>2 && roc<10) {
    return { signal:"LONG", confidence:0.6, reason:`Vol ${(vol/avgVol).toFixed(1)}x, ROC +${roc.toFixed(1)}%` };
  }
  return { signal:"HOLD", confidence:0, reason:"No meme momentum" };
}

const SIGNAL_FNS = {
  titan:signalTitan, phantom:signalPhantom, reversal:signalReversal,
  razor:signalRazor, breakout:signalBreakout, fortress:signalFortress,
  pulse:signalPulse, grokker:signalGrokker, comet:signalComet, blitz:signalBlitz,
  shield: ()=>({signal:"HEDGE",confidence:0.5,reason:"Auto-hedge active"}),
};

// ── Conductors (v2.0 fixed) ──
const CONDUCTORS = {
  aegis: { name:"Aegis", role:"The Guardian", color:"#4A6FA5", risk:"Conservative",
    maxExposure:0.5, vaultFloor:0.5, drawdownBreaker:-0.08, convictionThreshold:0.75,
    agents:["titan","reversal","comet","shield","fortress","pulse"],
    baseWeights:{titan:0.15,reversal:0.12,comet:0.08,shield:0.08,fortress:0.05,pulse:0.05}},
  atlas: { name:"Atlas", role:"The Strategist", color:"#1B8A6B", risk:"Balanced",
    maxExposure:0.75, vaultFloor:0.25, drawdownBreaker:-0.15, convictionThreshold:0.55,
    agents:["titan","phantom","reversal","grokker","shield","razor"],
    baseWeights:{titan:0.20,phantom:0.15,reversal:0.12,grokker:0.10,shield:0.10,razor:0.08}},
  apex_c: { name:"Apex", role:"The Opportunist", color:"#E85D26", risk:"Aggressive",
    maxExposure:0.9, vaultFloor:0.1, drawdownBreaker:-0.25, convictionThreshold:0.45,
    agents:["titan","phantom","grokker","breakout","razor","blitz"],
    baseWeights:{titan:0.22,phantom:0.18,grokker:0.15,breakout:0.12,razor:0.12,blitz:0.11}},
  phantom_edge: { name:"Phantom Edge", role:"The Degen Whisperer", color:"#9B30FF", risk:"Degen",
    maxExposure:1.0, vaultFloor:0.0, drawdownBreaker:-0.35, convictionThreshold:0.35,
    agents:["titan","phantom","grokker","razor","breakout","blitz"],
    baseWeights:{titan:0.22,phantom:0.20,grokker:0.18,razor:0.15,breakout:0.13,blitz:0.12}},
};

const REGIMES = { bull:{label:"BULL",color:"#22c55e",icon:"▲"}, bear:{label:"BEAR",color:"#ef4444",icon:"▼"}, ranging:{label:"RANGE",color:"#f59e0b",icon:"◆"}, crash:{label:"CRASH",color:"#dc2626",icon:"⚠"} };

const fmt = (n,d=2) => n?.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d})??"—";
const pct = n => (n>=0?"+":"")+(n*100).toFixed(2)+"%";

// ── Main Dashboard ──
export default function PaperTrader() {
  const [candleData, setCandleData] = useState({}); // {BTCUSDT: [{open,high,low,close,volume,time},...]}
  const [prices, setPrices] = useState({});
  const [regime, setRegime] = useState("ranging");
  const [portfolios, setPortfolios] = useState({});
  const [positions, setPositions] = useState({}); // {conductor_agent_pair: {entry,size,dir,stopLoss,takeProfit}}
  const [tradeLog, setTradeLog] = useState([]);
  const [tick, setTick] = useState(0);
  const [status, setStatus] = useState("INITIALIZING");
  const [selectedConductor, setSelectedConductor] = useState("atlas");
  const startCapital = 10000;

  const candleRef = useRef({});
  const portfolioRef = useRef({});
  const positionRef = useRef({});
  const tradeLogRef = useRef([]);

  // Initialize portfolios
  useEffect(() => {
    const init = {};
    Object.entries(CONDUCTORS).forEach(([id,c]) => {
      const agentStates = {};
      c.agents.forEach(a => { agentStates[a] = {pnl:0,trades:0,wins:0,lastSignal:"HOLD",lastReason:"",openPositions:0}; });
      init[id] = { capital:startCapital, peak:startCapital, agents:agentStates, pnlHistory:[{t:Date.now(),v:startCapital}], drawdown:0, circuitBreaker:false, tradeCount:0 };
    });
    setPortfolios(init); portfolioRef.current = init;
  }, []);

  // Fetch initial candle data (100 candles of 5m data)
  const fetchInitialCandles = useCallback(async () => {
    setStatus("LOADING CANDLES");
    const data = {};
    for (const pair of PAIRS) {
      try {
        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=5m&limit=100`);
        const raw = await res.json();
        data[pair] = raw.map(k => ({ time:k[0], open:+k[1], high:+k[2], low:+k[3], close:+k[4], volume:+k[5] }));
      } catch(e) { data[pair] = []; }
      await new Promise(r => setTimeout(r, 100)); // Rate limit respect
    }
    candleRef.current = data;
    setCandleData({...data});
    const p = {};
    PAIRS.forEach(pair => { if (data[pair]?.length) p[pair] = data[pair][data[pair].length-1].close; });
    setPrices(p);
    setStatus("LIVE");
    return data;
  }, []);

  // Fetch latest candles
  const fetchLatestCandles = useCallback(async () => {
    const data = {...candleRef.current};
    const p = {};
    for (const pair of PAIRS) {
      try {
        const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${pair}&interval=5m&limit=2`);
        const raw = await res.json();
        if (!raw.length) continue;
        const latest = { time:raw[raw.length-1][0], open:+raw[raw.length-1][1], high:+raw[raw.length-1][2], low:+raw[raw.length-1][3], close:+raw[raw.length-1][4], volume:+raw[raw.length-1][5] };
        if (!data[pair]) data[pair] = [];
        // Update or append
        if (data[pair].length && data[pair][data[pair].length-1].time === latest.time) {
          data[pair][data[pair].length-1] = latest;
        } else {
          data[pair].push(latest);
          if (data[pair].length > 150) data[pair].shift();
        }
        p[pair] = latest.close;
      } catch(e) {}
    }
    candleRef.current = data;
    setCandleData({...data});
    setPrices(prev => ({...prev,...p}));
    return {data,prices:p};
  }, []);

  // Detect regime from BTC data
  const detectRegime = useCallback((btcCandles) => {
    if (!btcCandles || btcCandles.length < 20) return "ranging";
    const closes = btcCandles.map(c => c.close);
    const n = closes.length-1;
    const ema8 = calcEMA(closes,8), ema21 = calcEMA(closes,21);
    const rsi = calcRSI(closes);
    const pctChange = (closes[n]-closes[Math.max(0,n-12)])/closes[Math.max(0,n-12)];
    if (pctChange < -0.04) return "crash";
    if (ema8[n]>ema21[n] && rsi[n]>50) return "bull";
    if (ema8[n]<ema21[n] && rsi[n]<50) return "bear";
    return "ranging";
  }, []);

  // Run trading cycle
  const runCycle = useCallback((allCandles, currentTick) => {
    if (!allCandles?.BTCUSDT?.length) return;

    const r = detectRegime(allCandles.BTCUSDT);
    setRegime(r);

    const ports = {...portfolioRef.current};
    const pos = {...positionRef.current};
    const newLogs = [];

    Object.entries(CONDUCTORS).forEach(([cId, conductor]) => {
      if (!ports[cId]) return;
      const port = {...ports[cId]};
      const agents = {...port.agents};

      // Check circuit breaker
      if (port.circuitBreaker) return;

      conductor.agents.forEach(aId => {
        if (!agents[aId]) return;
        const agent = AGENTS[aId];
        const signalFn = SIGNAL_FNS[aId];
        if (!signalFn) return;

        // Pick best pair for this agent
        const pairScores = PAIRS.map(pair => {
          const candles = allCandles[pair];
          if (!candles?.length) return {pair, score:0};
          const closes = candles.map(c=>c.close);
          const sig = aId === "comet" ? signalFn(candles,closes,currentTick) : signalFn(candles,closes);
          return {pair, score:sig.confidence, signal:sig, candles, closes};
        }).sort((a,b)=>b.score-a.score);

        const best = pairScores[0];
        if (!best?.signal) return;

        const posKey = `${cId}_${aId}_${best.pair}`;
        const existing = pos[posKey];
        const currentPrice = best.closes[best.closes.length-1];
        const weight = conductor.baseWeights[aId] || 0.1;

        // Update agent state
        agents[aId] = {...agents[aId], lastSignal:best.signal.signal, lastReason:best.signal.reason, lastPair:PAIR_LABELS[best.pair]||best.pair};

        // Shield: calculate hedge based on net exposure
        if (aId === "shield") {
          const netLong = Object.entries(pos).filter(([k,v])=>k.startsWith(cId)&&v.dir==="long").reduce((a,p)=>a+p[1].size,0);
          const netShort = Object.entries(pos).filter(([k,v])=>k.startsWith(cId)&&v.dir==="short").reduce((a,p)=>a+p[1].size,0);
          const netExposure = netLong - netShort;
          agents[aId].lastReason = `Net exposure: $${netExposure.toFixed(0)}. ${netExposure>100?"Hedging long bias":"Balanced"}`;
          return; // Shield doesn't open its own positions in paper mode
        }

        // Manage existing position
        if (existing) {
          const pnlPct = existing.dir==="long" ? (currentPrice-existing.entry)/existing.entry : (existing.entry-currentPrice)/existing.entry;
          const atr = calcATR(best.candles);
          const atrN = atr[atr.length-1] || currentPrice*0.01;

          // Check stop loss / take profit
          let shouldClose = false;
          let closeReason = "";
          if (pnlPct < -0.015) { shouldClose=true; closeReason="Stop loss hit (-1.5%)"; }
          if (pnlPct > 0.025) { shouldClose=true; closeReason="Take profit (+2.5%)"; }
          if (best.signal.signal==="HOLD" && pnlPct > 0.01) { shouldClose=true; closeReason="Signal faded, locking profit"; }
          // Opposing signal
          if ((existing.dir==="long" && best.signal.signal==="SHORT") || (existing.dir==="short" && best.signal.signal==="LONG")) {
            shouldClose=true; closeReason="Signal reversed";
          }

          if (shouldClose) {
            const realPnl = pnlPct * existing.size;
            port.capital += realPnl;
            agents[aId].pnl += realPnl;
            agents[aId].trades++;
            if (realPnl > 0) agents[aId].wins++;
            agents[aId].openPositions--;
            delete pos[posKey];
            newLogs.push({ t:Date.now(), conductor:cId, agent:aId, pair:best.pair, action:"CLOSE", dir:existing.dir, pnl:realPnl, reason:closeReason, price:currentPrice });
          }
          return;
        }

        // Open new position
        if (best.signal.signal==="HOLD" || best.signal.signal==="HEDGE" || best.signal.signal==="PAUSED") return;
        if (best.signal.confidence < conductor.convictionThreshold) return;

        // Check max positions per agent
        const agentPositions = Object.keys(pos).filter(k=>k.startsWith(`${cId}_${aId}`)).length;
        if (agentPositions >= 2) return;

        const dir = best.signal.signal==="LONG" ? "long" : "short";
        const posSize = port.capital * weight * (r==="crash"?0.3:r==="bear"?0.6:1.0);
        if (posSize < 10) return;

        pos[posKey] = { entry:currentPrice, size:posSize, dir, openTime:Date.now() };
        agents[aId].openPositions = (agents[aId].openPositions||0)+1;
        port.tradeCount = (port.tradeCount||0)+1;
        newLogs.push({ t:Date.now(), conductor:cId, agent:aId, pair:best.pair, action:"OPEN", dir, size:posSize, reason:best.signal.reason, price:currentPrice });
      });

      // Mark to market all open positions
      let unrealizedPnl = 0;
      Object.entries(pos).forEach(([k,p]) => {
        if (!k.startsWith(cId)) return;
        const pair = k.split("_")[2];
        const currentPrice = allCandles[pair]?.[allCandles[pair].length-1]?.close;
        if (!currentPrice) return;
        const pnl = p.dir==="long" ? (currentPrice-p.entry)/p.entry*p.size : (p.entry-currentPrice)/p.entry*p.size;
        unrealizedPnl += pnl;
      });

      const totalValue = port.capital + unrealizedPnl;
      port.peak = Math.max(port.peak, totalValue);
      port.drawdown = (totalValue-port.peak)/port.peak;
      port.circuitBreaker = port.drawdown <= conductor.drawdownBreaker;
      port.agents = agents;
      port.pnlHistory = [...port.pnlHistory.slice(-80), {t:Date.now(), v:totalValue}];
      ports[cId] = port;
    });

    portfolioRef.current = ports;
    positionRef.current = pos;
    setPortfolios({...ports});
    setPositions({...pos});

    if (newLogs.length) {
      tradeLogRef.current = [...newLogs, ...tradeLogRef.current].slice(0,50);
      setTradeLog([...tradeLogRef.current]);
    }
  }, [detectRegime]);

  // Initialize
  useEffect(() => {
    fetchInitialCandles().then(data => {
      if (data) runCycle(data, 0);
    });
  }, [fetchInitialCandles, runCycle]);

  // Main loop
  useEffect(() => {
    if (status !== "LIVE") return;
    const interval = setInterval(async () => {
      const {data} = await fetchLatestCandles();
      const t = tick+1;
      setTick(t);
      runCycle(data, t);
    }, 15000); // 15 second cycles
    return () => clearInterval(interval);
  }, [status, tick, fetchLatestCandles, runCycle]);

  const regimeData = REGIMES[regime];
  const sel = CONDUCTORS[selectedConductor];
  const selPort = portfolios[selectedConductor];
  const openPosCount = Object.keys(positions).filter(k=>k.startsWith(selectedConductor)).length;

  return (
    <div style={{ fontFamily:"'Courier New',monospace", background:"#06060a", color:"#c8c8d0", minHeight:"100vh", padding:"16px 12px" }}>
      <div style={{ position:"fixed",inset:0,opacity:0.02,pointerEvents:"none", backgroundImage:"linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize:"48px 48px" }}/>
      <div style={{ maxWidth:1100, margin:"0 auto", position:"relative", zIndex:1 }}>

        {/* Header */}
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16, flexWrap:"wrap", gap:8 }}>
          <div>
            <div style={{fontSize:7,letterSpacing:6,color:"#333",textTransform:"uppercase"}}>Agent League · Binance Paper Trading</div>
            <h1 style={{fontSize:18,fontWeight:700,color:"#f0f0f4",margin:"2px 0 0"}}>Conductor Simulation</h1>
          </div>
          <div style={{display:"flex",gap:12,alignItems:"center",flexWrap:"wrap"}}>
            {Object.entries(prices).slice(0,4).map(([pair,price])=>(
              <div key={pair} style={{textAlign:"right"}}>
                <div style={{fontSize:8,color:"#444",letterSpacing:1}}>{PAIR_LABELS[pair]}</div>
                <div style={{fontSize:12,fontWeight:700,color:"#eee"}}>${fmt(price,pair==="DOGEUSDT"||pair==="XRPUSDT"||pair==="ADAUSDT"?4:2)}</div>
              </div>
            ))}
            <div style={{display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:5,height:5,borderRadius:"50%",background:status==="LIVE"?"#22c55e":"#f59e0b",boxShadow:status==="LIVE"?"0 0 6px #22c55e":"none",animation:"pulse 2s infinite"}}/>
              <span style={{fontSize:8,color:"#444"}}>{status} · T{tick}</span>
            </div>
          </div>
        </div>

        {/* Regime + Conductor selector */}
        <div style={{display:"flex",gap:8,marginBottom:12,alignItems:"center",flexWrap:"wrap"}}>
          <div style={{padding:"6px 12px",background:`${regimeData.color}10`,borderLeft:`3px solid ${regimeData.color}`,borderRadius:2}}>
            <span style={{fontSize:10,fontWeight:700,letterSpacing:2,color:regimeData.color}}>{regimeData.icon} {regimeData.label}</span>
            <span style={{fontSize:8,color:"#444",marginLeft:8}}>BTC regime on 5m</span>
          </div>
          <div style={{flex:1}}/>
          {Object.entries(CONDUCTORS).map(([id,c])=>(
            <button key={id} onClick={()=>setSelectedConductor(id)} style={{
              padding:"6px 12px",background:selectedConductor===id?`${c.color}20`:"#111",
              border:`1px solid ${selectedConductor===id?c.color+"60":"#1a1a1a"}`,borderRadius:3,
              cursor:"pointer",fontFamily:"inherit",fontSize:10,color:selectedConductor===id?c.color:"#555",
            }}>{c.name}</button>
          ))}
        </div>

        {/* 4 Conductor Performance Cards */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:12}}>
          {Object.entries(CONDUCTORS).map(([cId,c])=>{
            const p = portfolios[cId]; if (!p) return null;
            const totalVal = p.pnlHistory[p.pnlHistory.length-1]?.v || startCapital;
            const pnlPct = (totalVal-startCapital)/startCapital;
            return (
              <div key={cId} onClick={()=>setSelectedConductor(cId)} style={{
                padding:"10px 12px",background:selectedConductor===cId?"#111118":"#0c0c10",
                border:`1px solid ${selectedConductor===cId?c.color+"40":"#161618"}`,borderRadius:4,cursor:"pointer",
                position:"relative",overflow:"hidden"
              }}>
                {p.circuitBreaker&&<div style={{position:"absolute",inset:0,background:"#ef444420",display:"flex",alignItems:"center",justifyContent:"center",zIndex:5}}>
                  <span style={{fontSize:8,fontWeight:700,color:"#ef4444",letterSpacing:2}}>⚠ BREAKER</span></div>}
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:c.color}}/>
                    <span style={{fontSize:10,fontWeight:600,color:"#eee"}}>{c.name}</span>
                  </div>
                  <span style={{fontSize:12,fontWeight:700,color:pnlPct>=0?"#22c55e":"#ef4444"}}>{pct(pnlPct)}</span>
                </div>
                {p.pnlHistory.length>2&&<div style={{height:24,margin:"0 -8px"}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={p.pnlHistory.slice(-30)}><Line type="monotone" dataKey="v" stroke={c.color} strokeWidth={1} dot={false}/></LineChart>
                  </ResponsiveContainer>
                </div>}
                <div style={{display:"flex",gap:8,fontSize:7,color:"#444",marginTop:4}}>
                  <span>${fmt(totalVal,0)}</span>
                  <span>DD {(p.drawdown*100).toFixed(1)}%</span>
                  <span>{p.tradeCount||0} trades</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Conductor Detail */}
        {selPort && (
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:12}}>
            {/* Agent Cards */}
            <div style={{background:"#0c0c10",border:"1px solid #1a1a1a",borderRadius:4,padding:12}}>
              <div style={{fontSize:9,fontWeight:700,color:"#555",letterSpacing:2,marginBottom:8}}>
                {sel.name.toUpperCase()} AGENTS · {openPosCount} open positions
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:3}}>
                {sel.agents.map(aId=>{
                  const ag=AGENTS[aId]; const st=selPort.agents?.[aId]; if(!ag||!st) return null;
                  const isActive = st.lastSignal!=="HOLD"&&st.lastSignal!=="Warming up";
                  const wr = st.trades>0 ? (st.wins/st.trades*100).toFixed(0) : "—";
                  return (
                    <div key={aId} style={{
                      display:"grid",gridTemplateColumns:"28px 1fr 80px 60px",gap:6,
                      padding:"6px 8px",background:isActive?`${ag.color}08`:"#08080c",
                      border:`1px solid ${isActive?ag.color+"30":"#141416"}`,borderRadius:3,alignItems:"center"
                    }}>
                      <span style={{fontSize:14,textAlign:"center"}}>{ag.icon}</span>
                      <div>
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <span style={{fontSize:10,fontWeight:600,color:ag.color}}>{ag.name}</span>
                          <span style={{fontSize:7,padding:"1px 4px",borderRadius:2,
                            background:st.lastSignal==="LONG"?"#22c55e18":st.lastSignal==="SHORT"?"#ef444418":"transparent",
                            color:st.lastSignal==="LONG"?"#22c55e":st.lastSignal==="SHORT"?"#ef4444":"#333",
                            fontWeight:600}}>{st.lastSignal}</span>
                          {st.lastPair&&<span style={{fontSize:7,color:"#333"}}>{st.lastPair}</span>}
                        </div>
                        <div style={{fontSize:7,color:"#444",marginTop:1,maxWidth:200,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{st.lastReason}</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:10,fontWeight:600,color:st.pnl>=0?"#22c55e":"#ef4444"}}>{st.pnl>=0?"+":""}{fmt(st.pnl,0)}</div>
                        <div style={{fontSize:7,color:"#333"}}>{st.trades} trades</div>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{fontSize:9,color:"#555"}}>{wr}%</div>
                        <div style={{fontSize:7,color:"#333"}}>win rate</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Equity Curve + Stats */}
            <div style={{display:"flex",flexDirection:"column",gap:8}}>
              <div style={{background:"#0c0c10",border:"1px solid #1a1a1a",borderRadius:4,padding:12,flex:1}}>
                <div style={{fontSize:9,fontWeight:700,color:"#555",letterSpacing:2,marginBottom:8}}>EQUITY CURVE</div>
                {selPort.pnlHistory.length>2&&<div style={{height:100}}>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={selPort.pnlHistory}>
                      <defs><linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={sel.color} stopOpacity={0.3}/>
                        <stop offset="100%" stopColor={sel.color} stopOpacity={0}/>
                      </linearGradient></defs>
                      <Area type="monotone" dataKey="v" stroke={sel.color} fill="url(#eq)" strokeWidth={1.5} dot={false}/>
                    </AreaChart>
                  </ResponsiveContainer>
                </div>}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginTop:8}}>
                  {[
                    {label:"Capital",value:`$${fmt(selPort.pnlHistory[selPort.pnlHistory.length-1]?.v||startCapital,0)}`},
                    {label:"Drawdown",value:`${(selPort.drawdown*100).toFixed(2)}%`},
                    {label:"Trades",value:selPort.tradeCount||0},
                    {label:"Breaker",value:`${(sel.drawdownBreaker*100).toFixed(0)}%`},
                  ].map((s,i)=>(
                    <div key={i} style={{textAlign:"center"}}>
                      <div style={{fontSize:12,fontWeight:700,color:"#eee"}}>{s.value}</div>
                      <div style={{fontSize:7,color:"#444",letterSpacing:1}}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Open Positions */}
              <div style={{background:"#0c0c10",border:"1px solid #1a1a1a",borderRadius:4,padding:12}}>
                <div style={{fontSize:9,fontWeight:700,color:"#555",letterSpacing:2,marginBottom:6}}>OPEN POSITIONS</div>
                {Object.entries(positions).filter(([k])=>k.startsWith(selectedConductor)).length===0
                  ? <div style={{fontSize:9,color:"#333",padding:"4px 0"}}>No open positions</div>
                  : Object.entries(positions).filter(([k])=>k.startsWith(selectedConductor)).map(([k,p])=>{
                    const parts=k.split("_"); const pair=parts[2]; const agId=parts[1];
                    const currentPrice=candleData[pair]?.[candleData[pair].length-1]?.close;
                    const pnlPct=currentPrice?(p.dir==="long"?(currentPrice-p.entry)/p.entry:(p.entry-currentPrice)/p.entry):0;
                    return (
                      <div key={k} style={{display:"grid",gridTemplateColumns:"60px 50px 1fr 60px",gap:6,padding:"3px 0",fontSize:9,alignItems:"center",borderBottom:"1px solid #111"}}>
                        <span style={{color:AGENTS[agId]?.color||"#888"}}>{AGENTS[agId]?.icon} {AGENTS[agId]?.name}</span>
                        <span style={{color:p.dir==="long"?"#22c55e":"#ef4444",fontWeight:600}}>{p.dir.toUpperCase()}</span>
                        <span style={{color:"#555"}}>{PAIR_LABELS[pair]} @ {fmt(p.entry,2)}</span>
                        <span style={{textAlign:"right",fontWeight:600,color:pnlPct>=0?"#22c55e":"#ef4444"}}>{(pnlPct*100).toFixed(2)}%</span>
                      </div>
                    );
                  })
                }
              </div>
            </div>
          </div>
        )}

        {/* Trade Log */}
        <div style={{background:"#0c0c10",border:"1px solid #1a1a1a",borderRadius:4,padding:12}}>
          <div style={{fontSize:9,fontWeight:700,color:"#555",letterSpacing:2,marginBottom:6}}>TRADE LOG (ALL CONDUCTORS)</div>
          <div style={{maxHeight:180,overflow:"hidden"}}>
            {tradeLog.length===0
              ? <div style={{fontSize:9,color:"#333",padding:"4px 0"}}>Waiting for signals... agents need ~50 candles (≈4h of 5m data) to warm up. Data loaded at init.</div>
              : tradeLog.slice(0,15).map((l,i)=>{
                const c=CONDUCTORS[l.conductor]; const ag=AGENTS[l.agent];
                return (
                  <div key={i} style={{display:"grid",gridTemplateColumns:"50px 60px 40px 40px 50px 1fr 50px",gap:4,padding:"3px 4px",fontSize:8,alignItems:"center",opacity:1-i*0.04,background:i===0?"#111115":"transparent",borderRadius:2}}>
                    <span style={{color:c?.color}}>{c?.name}</span>
                    <span style={{color:ag?.color}}>{ag?.icon} {ag?.name}</span>
                    <span style={{color:l.action==="OPEN"?"#3b82f6":"#a855f7",fontWeight:600}}>{l.action}</span>
                    <span style={{color:l.dir==="long"?"#22c55e":"#ef4444"}}>{l.dir?.toUpperCase()}</span>
                    <span style={{color:"#444"}}>{PAIR_LABELS[l.pair]}</span>
                    <span style={{color:"#333",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.reason}</span>
                    <span style={{textAlign:"right",color:l.pnl!=null?(l.pnl>=0?"#22c55e":"#ef4444"):"#444",fontWeight:l.pnl!=null?600:400}}>
                      {l.pnl!=null?`${l.pnl>=0?"+":""}$${Math.abs(l.pnl).toFixed(0)}`:(`$${l.size?.toFixed(0)||""}`)}
                    </span>
                  </div>
                );
              })
            }
          </div>
        </div>

        {/* Asset Prices Grid */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:4,marginTop:8}}>
          {PAIRS.map(pair=>{
            const candles = candleData[pair];
            const price = prices[pair];
            const prev = candles?.length>1 ? candles[candles.length-2]?.close : price;
            const chg = prev ? (price-prev)/prev : 0;
            return (
              <div key={pair} style={{padding:"6px 8px",background:"#0c0c10",borderRadius:3,border:"1px solid #141416",textAlign:"center"}}>
                <div style={{fontSize:8,color:"#555",fontWeight:600}}>{PAIR_LABELS[pair]}</div>
                <div style={{fontSize:11,fontWeight:700,color:"#eee"}}>{price?fmt(price,price<1?4:price<100?2:0):"—"}</div>
                <div style={{fontSize:8,color:chg>=0?"#22c55e":"#ef4444"}}>{chg>=0?"+":""}{(chg*100).toFixed(2)}%</div>
              </div>
            );
          })}
        </div>

        <div style={{marginTop:12,textAlign:"center",fontSize:7,color:"#222",letterSpacing:2}}>
          PAPER TRADING ONLY · BINANCE SPOT USDT PAIRS · 5M CANDLES · REAL INDICATORS · 15s CYCLES · NOT FINANCIAL ADVICE
        </div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
    </div>
  );
}
