import { useState, useEffect } from "react";
import { AreaChart, Area, ResponsiveContainer, LineChart, Line } from "recharts";

const API = "https://al-conductor-backend-production.up.railway.app";
const PL = {BTCUSDT:"BTC",ETHUSDT:"ETH",BNBUSDT:"BNB",SOLUSDT:"SOL",XRPUSDT:"XRP",DOGEUSDT:"DOGE",ADAUSDT:"ADA",AVAXUSDT:"AVAX"};
const REG = {bull:{l:"BULLISH",c:"#4ADE80"},bear:{l:"BEARISH",c:"#EF4444"},ranging:{l:"RANGING",c:"#F59E0B"},crash:{l:"CRASH",c:"#EF4444"}};
const fmt = (n,d=2)=>n?.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d})??"—";
const pct = n=>(n>=0?"+":"")+(n*100).toFixed(2)+"%";

export default function Dashboard(){
  const[data,setData]=useState(null);
  const[error,setError]=useState(null);
  const[selC,setSelC]=useState("atlas");
  const[view,setView]=useState("dashboard");
  const[expLog,setExpLog]=useState(null);

  useEffect(()=>{
    const load=async()=>{try{const r=await fetch(API+"/api/state");const j=await r.json();setData(j);setError(null);}catch(e){setError(e.message);}};
    load();const iv=setInterval(load,30000);return()=>clearInterval(iv);
  },[]);

  const T={bg:"#0A0A0B",card:"#111113",border:"#1E1E22",text:"#E8E6E1",sub:"#888",dim:"#555",mute:"#444",green:"#4ADE80",orange:"#F59E0B",red:"#EF4444",blue:"#60a5fa",fontH:"'Bebas Neue',sans-serif",fontB:"'Outfit',sans-serif",fontM:"'JetBrains Mono',monospace"};
  const Badge=({text,color})=>(<span style={{fontSize:10,fontFamily:T.fontM,fontWeight:600,padding:"2px 8px",borderRadius:3,background:color+"20",color,letterSpacing:.5}}>{text}</span>);

  if(!data)return(<div style={{background:T.bg,color:T.text,minHeight:"100vh",padding:"40px 20px",display:"flex",alignItems:"center",justifyContent:"center"}}>
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
    <div style={{textAlign:"center"}}><div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:32,marginBottom:8}}>{error?"CONNECTION ERROR":"CONNECTING TO BACKEND..."}</div><div style={{fontFamily:"'JetBrains Mono',monospace",fontSize:11,color:T.dim}}>{error||API}</div></div>
  </div>);

  const{portfolios,positions,regime,tick,lastCycleTime,prices,agents:AG,conductors:CD,tradeLog,status}=data;
  const rd=REG[regime]||REG.ranging;const sel=CD?.[selC];const sp=portfolios?.[selC];
  const cLogs=(tradeLog||[]).filter(l=>l.cId===selC);const startCap=10000;

  return(<div style={{background:T.bg,color:T.text,minHeight:"100vh",padding:"40px 20px"}}>
    <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
    <div style={{maxWidth:880,margin:"0 auto"}}>
      <div style={{marginBottom:32}}>
        <div style={{fontFamily:T.fontM,fontSize:10,letterSpacing:4,color:T.dim}}>LIVE BACKEND · MULTI-TIMEFRAME · {new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div>
        <h1 style={{fontFamily:T.fontH,fontSize:48,fontWeight:700,color:T.text,margin:0,letterSpacing:2}}>AGENT LEAGUE — PAPER TRADING</h1>
        <p style={{fontFamily:T.fontB,fontSize:13,color:T.sub,margin:"8px 0 0",lineHeight:1.6}}>24/7 simulation on Railway. Structural trading on 1h, 4h, daily, weekly. Last cycle: {lastCycleTime?new Date(lastCycleTime).toLocaleTimeString():"—"}</p>
      </div>

      <div style={{background:T.card,padding:"14px 18px",marginBottom:24,borderLeft:"3px solid "+T.orange}}>
        <div style={{fontFamily:T.fontM,fontSize:9,letterSpacing:2,color:T.dim,marginBottom:8}}>AGENT TIMEFRAME MAP</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
          {[{tf:"1h",ag:"Razor, Blitz",htf:"4h filter",col:"#fbbf24"},{tf:"4h",ag:"Titan, Phantom, Reversal, Breakout, Grokker, Pulse, Shield",htf:"Daily filter",col:"#60a5fa"},{tf:"Daily",ag:"Fortress, Comet",htf:"Weekly filter",col:"#4ADE80"},{tf:"REGIME",ag:"BTC 4h",htf:"EMA(8/21)+RSI",col:rd?.c}].map((g,i)=>(
            <div key={i}><div style={{fontFamily:T.fontH,fontSize:18,color:g.col}}>{g.tf}</div><div style={{fontFamily:T.fontB,fontSize:10,color:T.sub,lineHeight:1.4}}>{g.ag}</div><div style={{fontFamily:T.fontM,fontSize:9,color:T.mute}}>{g.htf}</div></div>))}
        </div>
      </div>

      {CD&&<div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:1,background:T.border,marginBottom:24}}>
        {Object.entries(CD).map(([cId,c])=>{const p=portfolios?.[cId];if(!p)return null;const tv=p.hist?.[p.hist.length-1]?.v||startCap;const pp=(tv-startCap)/startCap;
          return(<div key={cId} onClick={()=>setSelC(cId)} style={{background:T.bg,padding:"16px 20px",cursor:"pointer",borderBottom:selC===cId?"2px solid "+(c.c||"#888"):"2px solid transparent"}}>
            <div style={{fontFamily:T.fontM,fontSize:10,letterSpacing:2,color:T.dim}}>{c.n}</div>
            <div style={{fontFamily:T.fontH,fontSize:32,color:T.text}}>{pct(pp)}</div>
            <div style={{fontFamily:T.fontM,fontSize:10,color:T.mute}}>${fmt(tv,0)} · {p.tc||0} trades · DD {((p.dd||0)*100).toFixed(1)}%</div>
            {p.hist?.length>3&&<div style={{height:24,marginTop:8}}><ResponsiveContainer width="100%" height="100%"><LineChart data={p.hist.slice(-30)}><Line type="monotone" dataKey="v" stroke={c.c||"#888"} strokeWidth={1.2} dot={false}/></LineChart></ResponsiveContainer></div>}
          </div>);})}
      </div>}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
        <div style={{display:"flex",gap:12,alignItems:"center"}}>
          <Badge text={rd?.l||"—"} color={rd?.c||"#888"}/>
          <span style={{fontFamily:T.fontM,fontSize:10,color:T.mute}}>4h BTC · Tick {tick} · {status}</span>
          <span style={{width:6,height:6,borderRadius:"50%",background:status==="LIVE"?T.green:T.orange,boxShadow:status==="LIVE"?"0 0 6px "+T.green:"none"}}/>
        </div>
        <div style={{display:"flex",gap:8}}>
          {prices&&Object.entries(prices).slice(0,5).map(([p,pr])=>(<span key={p} style={{fontFamily:T.fontM,fontSize:10,color:T.sub}}>{PL[p]} <span style={{color:T.text}}>${fmt(pr,pr<1?4:pr<100?2:0)}</span></span>))}
        </div>
      </div>

      <div style={{display:"flex",gap:0,marginBottom:24,borderBottom:"1px solid "+T.border}}>
        {[{id:"dashboard",l:"Dashboard"},{id:"logbook",l:"Order Log ("+cLogs.length+")"},{id:"strategies",l:"Strategies"}].map(v=>(
          <button key={v.id} onClick={()=>{setView(v.id);setExpLog(null);}} style={{fontFamily:T.fontM,fontSize:11,letterSpacing:1,padding:"10px 20px",background:"transparent",color:view===v.id?T.text:T.dim,cursor:"pointer",border:"none",borderBottom:view===v.id?"2px solid "+(sel?.c||"#888"):"2px solid transparent"}}>{v.l}</button>
        ))}
      </div>

      {view==="dashboard"&&sp&&sel&&(<>
        <div style={{borderLeft:"3px solid "+(sel.c||"#888"),paddingLeft:16,marginBottom:28}}>
          <h2 style={{fontFamily:T.fontH,fontSize:24,color:T.text,margin:0}}>{(sel.n||"").toUpperCase()} AGENTS</h2>
          <div style={{fontFamily:T.fontM,fontSize:10,color:T.dim}}>{sel.ag?.length||0} agents · Multi-TF · 24/7</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:2,marginBottom:28}}>
          {(sel.ag||[]).map(aId=>{const ag=AG?.[aId];const st=sp.agents?.[aId];if(!ag||!st)return null;const act=st.ls!=="HOLD";const wr=st.trades>0?(st.wins/st.trades*100).toFixed(0):"—";
            return(<div key={aId} style={{display:"grid",gridTemplateColumns:"24px 1fr 60px 60px 55px",gap:8,padding:"10px 14px",background:T.card,borderLeft:"3px solid "+(act?ag.c||"#888":T.border),alignItems:"center"}}>
              <span style={{fontSize:14}}>{ag.i||""}</span>
              <div><div style={{display:"flex",alignItems:"center",gap:6}}><span style={{fontFamily:T.fontB,fontSize:13,fontWeight:500,color:T.text}}>{ag.n}</span>{st.ls!=="HOLD"?<Badge text={st.ls} color={st.ls==="LONG"?T.green:st.ls==="SHORT"?T.red:T.orange}/>:<span style={{fontFamily:T.fontM,fontSize:10,color:T.mute}}>HOLD</span>}<span style={{fontFamily:T.fontM,fontSize:9,padding:"1px 6px",background:T.border,borderRadius:2,color:T.dim}}>{ag.tf}{ag.htf?"+"+ag.htf:""}</span>{st.lp&&<span style={{fontFamily:T.fontM,fontSize:9,color:T.mute}}>{st.lp}</span>}</div>
                <div style={{fontFamily:T.fontB,fontSize:11,color:T.sub,marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:420}}>{st.lr}</div></div>
              <div style={{textAlign:"right"}}><div style={{fontFamily:T.fontM,fontSize:12,fontWeight:600,color:(st.pnl||0)>=0?T.green:T.red}}>{(st.pnl||0)>=0?"+":""}{fmt(st.pnl||0,0)}</div><div style={{fontFamily:T.fontM,fontSize:9,color:T.mute}}>{st.trades}t</div></div>
              <div style={{textAlign:"right",fontFamily:T.fontM,fontSize:10,color:T.sub}}>{wr}%</div>
              <div style={{textAlign:"right",fontFamily:T.fontM,fontSize:9,color:T.dim}}>{ag.tf==="1d"||ag.tf==="1w"?"weeks":ag.tf==="4h"?"days":"hours"}</div>
            </div>);})}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:28}}>
          <div><div style={{borderLeft:"3px solid "+(sel.c||"#888"),paddingLeft:16,marginBottom:12}}><h2 style={{fontFamily:T.fontH,fontSize:24,color:T.text,margin:0}}>EQUITY</h2></div>
            <div style={{background:T.card,padding:16}}>{sp.hist?.length>3&&<div style={{height:100}}><ResponsiveContainer width="100%" height="100%"><AreaChart data={sp.hist}><defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={sel.c||"#888"} stopOpacity={.3}/><stop offset="100%" stopColor={sel.c||"#888"} stopOpacity={0}/></linearGradient></defs><Area type="monotone" dataKey="v" stroke={sel.c||"#888"} fill="url(#eg)" strokeWidth={1.5} dot={false}/></AreaChart></ResponsiveContainer></div>}
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginTop:12}}>{[{l:"Capital",v:"$"+fmt(sp.hist?.[sp.hist.length-1]?.v||startCap,0)},{l:"DD",v:((sp.dd||0)*100).toFixed(2)+"%"},{l:"Trades",v:sp.tc||0},{l:"Breaker",v:((sel.db||0)*100).toFixed(0)+"%"}].map((s,i)=>(<div key={i} style={{textAlign:"center"}}><div style={{fontFamily:T.fontH,fontSize:20,color:T.text}}>{s.v}</div><div style={{fontFamily:T.fontM,fontSize:9,color:T.dim}}>{s.l}</div></div>))}</div>
            </div></div>
          <div><div style={{borderLeft:"3px solid "+T.border,paddingLeft:16,marginBottom:12}}><h2 style={{fontFamily:T.fontH,fontSize:24,color:T.text,margin:0}}>POSITIONS</h2></div>
            <div style={{background:T.card,padding:16}}>{!positions||Object.entries(positions).filter(([k])=>k.startsWith(selC)).length===0?<div style={{fontFamily:T.fontB,fontSize:12,color:T.dim,padding:"16px 0",textAlign:"center"}}>No open positions</div>:Object.entries(positions).filter(([k])=>k.startsWith(selC)).map(([k,p])=>{const pts=k.split("_");const pair=pts[2];const agId=pts[1];const cp2=prices?.[pair];const pp2=cp2?(p.dir==="long"?(cp2-p.entry)/p.entry:(p.entry-cp2)/p.entry):0;
              return(<div key={k} style={{display:"grid",gridTemplateColumns:"70px 40px 35px 1fr 50px",gap:6,padding:"8px 0",borderBottom:"1px solid "+T.border,alignItems:"center"}}><span style={{fontFamily:T.fontB,fontSize:11,color:AG?.[agId]?.c||"#888"}}>{AG?.[agId]?.n||agId}</span><Badge text={p.dir.toUpperCase()} color={p.dir==="long"?T.green:T.red}/><span style={{fontFamily:T.fontM,fontSize:9,color:T.dim}}>{AG?.[agId]?.tf}</span><span style={{fontFamily:T.fontM,fontSize:10,color:T.sub}}>{PL[pair]} @ {fmt(p.entry,p.entry<1?4:2)}</span><span style={{textAlign:"right",fontFamily:T.fontM,fontSize:11,fontWeight:600,color:pp2>=0?T.green:T.red}}>{(pp2*100).toFixed(2)}%</span></div>);})}</div></div>
        </div>
        <div style={{borderLeft:"3px solid "+T.border,paddingLeft:16,marginBottom:12,display:"flex",justifyContent:"space-between"}}><h2 style={{fontFamily:T.fontH,fontSize:24,color:T.text,margin:0}}>RECENT</h2><button onClick={()=>setView("logbook")} style={{fontFamily:T.fontM,fontSize:10,color:sel.c||"#888",background:"transparent",border:"none",cursor:"pointer"}}>Full log →</button></div>
        {cLogs.slice(0,5).map((l,i)=>{const ag=AG?.[l.aId];return(<div key={i} style={{display:"grid",gridTemplateColumns:"80px 50px 35px 30px 40px 1fr 60px",gap:6,padding:"8px 14px",background:i===0?T.card:"transparent",borderLeft:"3px solid "+(l.act==="OPEN"?T.blue:"#a855f7"),alignItems:"center",fontFamily:T.fontM,fontSize:10}}><span style={{color:ag?.c||"#888"}}>{ag?.n||l.aId}</span><Badge text={l.act} color={l.act==="OPEN"?T.blue:"#a855f7"}/><span style={{color:l.dir==="long"?T.green:T.red}}>{l.dir?.toUpperCase()}</span><span style={{color:T.orange}}>{l.tf}</span><span style={{color:T.sub}}>{PL[l.pair]}</span><span style={{color:T.dim,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.reason?.slice(0,50)}</span><span style={{textAlign:"right",fontWeight:600,color:l.pnl!=null?(l.pnl>=0?T.green:T.red):T.sub}}>{l.pnl!=null?(l.pnl>=0?"+":"")+("$"+Math.abs(l.pnl).toFixed(0)):("$"+(l.size?.toFixed(0)||""))}</span></div>);})}
      </>)}

      {view==="logbook"&&(<div>
        <div style={{borderLeft:"3px solid "+(sel?.c||"#888"),paddingLeft:16,marginBottom:20}}><h2 style={{fontFamily:T.fontH,fontSize:24,color:T.text,margin:0}}>{(sel?.n||"").toUpperCase()} ORDER LOG</h2><div style={{fontFamily:T.fontB,fontSize:13,color:T.sub,marginTop:4}}>Multi-TF trades from 24/7 backend. Click to expand.</div></div>
        {cLogs.length===0?<div style={{fontFamily:T.fontB,fontSize:13,color:T.dim,padding:"40px 0",textAlign:"center",background:T.card}}>No trades yet. Structural signals are rare but high quality.</div>
        :cLogs.map((l,i)=>{const ag=AG?.[l.aId];const isE=expLog===i;return(<div key={i} style={{marginBottom:1}}>
          <div onClick={()=>setExpLog(isE?null:i)} style={{display:"grid",gridTemplateColumns:"20px 70px 50px 35px 30px 40px 1fr 60px 45px",gap:4,padding:"10px 14px",background:isE?"#161618":T.card,borderLeft:"3px solid "+(l.act==="OPEN"?T.blue:"#a855f7"),cursor:"pointer",alignItems:"center"}}>
            <span style={{fontSize:12}}>{ag?.i||""}</span><span style={{fontFamily:T.fontB,fontSize:12,color:ag?.c||"#888"}}>{ag?.n||l.aId}</span><Badge text={l.act} color={l.act==="OPEN"?T.blue:"#a855f7"}/><span style={{fontFamily:T.fontM,fontSize:10,color:l.dir==="long"?T.green:T.red,fontWeight:600}}>{l.dir?.toUpperCase()}</span><span style={{fontFamily:T.fontM,fontSize:9,color:T.orange}}>{l.tf}</span><span style={{fontFamily:T.fontM,fontSize:10,color:T.sub}}>{PL[l.pair]}</span><span style={{fontFamily:T.fontB,fontSize:11,color:T.dim,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.reason?.slice(0,40)}...</span><span style={{textAlign:"right",fontFamily:T.fontM,fontSize:11,fontWeight:600,color:l.pnl!=null?(l.pnl>=0?T.green:T.red):T.blue}}>{l.pnl!=null?(l.pnl>=0?"+":"")+("$"+Math.abs(l.pnl).toFixed(2)):("$"+(l.size?.toFixed(0)))}</span><span style={{textAlign:"right",fontFamily:T.fontM,fontSize:9,color:T.mute}}>{new Date(l.t).toLocaleTimeString("en-US",{hour12:false})}</span>
          </div>
          {isE&&(<div style={{padding:"16px 20px 16px 37px",background:"#0D0D0E",borderLeft:"3px solid "+T.border}}>
            <div style={{marginBottom:8,display:"flex",gap:12,alignItems:"center"}}>{l.strat&&<><span style={{fontFamily:T.fontM,fontSize:9,color:T.dim}}>STRATEGY</span><span style={{fontFamily:T.fontB,fontSize:13,color:ag?.c||"#888"}}>{l.strat}</span></>}<span style={{fontFamily:T.fontM,fontSize:10,padding:"2px 8px",background:T.orange+"20",color:T.orange,borderRadius:2}}>{l.tf}{l.htf?" + "+l.htf:""}</span>{l.hold&&<span style={{fontFamily:T.fontM,fontSize:10,color:T.dim}}>Hold: {l.hold}</span>}</div>
            <div style={{fontFamily:T.fontB,fontSize:13,color:"#aaa",lineHeight:1.8,marginBottom:12}}>{l.reason}</div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:12}}>{[{l:"Entry",v:"$"+fmt(l.price,l.price<1?4:2)},l.sl&&{l:"SL",v:"$"+fmt(l.sl,l.sl<1?4:2),c:T.red},l.tp&&{l:"TP",v:"$"+fmt(l.tp,l.tp<1?4:2),c:T.green},l.size&&{l:"Size",v:"$"+fmt(l.size,0)},l.conf!=null&&{l:"Conf",v:(l.conf*100).toFixed(0)+"%"},l.pnl!=null&&{l:"P&L",v:(l.pnl>=0?"+":"")+"$"+fmt(l.pnl,2),c:l.pnl>=0?T.green:T.red},l.dur&&{l:"Duration",v:Math.floor(l.dur/3600000)+"h "+Math.floor((l.dur%3600000)/60000)+"m"}].filter(Boolean).map((s,j)=>(<div key={j}><div style={{fontFamily:T.fontM,fontSize:9,color:T.dim}}>{s.l}</div><div style={{fontFamily:T.fontM,fontSize:13,color:s.c||T.text}}>{s.v}</div></div>))}</div>
            {l.ind&&Object.keys(l.ind).length>0&&<div><div style={{fontFamily:T.fontM,fontSize:9,color:T.dim,letterSpacing:2,marginBottom:6}}>INDICATORS</div><div style={{display:"flex",flexWrap:"wrap",gap:4}}>{Object.entries(l.ind).map(([k,v])=>(<span key={k} style={{fontFamily:T.fontM,fontSize:10,padding:"3px 10px",background:T.card,border:"1px solid "+T.border,borderRadius:2}}><span style={{color:T.dim}}>{k}: </span><span style={{color:T.text}}>{v}</span></span>))}</div></div>}
          </div>)}
        </div>);})}
      </div>)}

      {view==="strategies"&&AG&&sel&&(<div>
        <div style={{borderLeft:"3px solid "+(sel.c||"#888"),paddingLeft:16,marginBottom:24}}><h2 style={{fontFamily:T.fontH,fontSize:24,color:T.text,margin:0}}>{(sel.n||"").toUpperCase()} STRATEGIES</h2></div>
        {(sel.ag||[]).map(aId=>{const ag=AG[aId];if(!ag)return null;return(<div key={aId} style={{background:T.card,borderLeft:"3px solid "+(ag.c||"#888"),padding:"20px 24px",marginBottom:8}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}><span style={{fontSize:20}}>{ag.i||""}</span><div><div style={{fontFamily:T.fontH,fontSize:20,color:ag.c||"#888"}}>{(ag.n||"").toUpperCase()}</div><div style={{fontFamily:T.fontB,fontSize:12,color:T.sub}}>{ag.s}</div></div><div style={{flex:1}}/><div style={{display:"flex",gap:4}}><span style={{fontFamily:T.fontM,fontSize:10,padding:"3px 8px",background:T.orange+"20",color:T.orange,borderRadius:2}}>{ag.tf}</span>{ag.htf&&<span style={{fontFamily:T.fontM,fontSize:10,padding:"3px 8px",background:T.blue+"20",color:T.blue,borderRadius:2}}>+{ag.htf}</span>}</div></div>
          <div style={{fontFamily:T.fontM,fontSize:11,color:T.dim}}>Hold: {ag.tf==="1d"||ag.tf==="1w"?"weeks-months":ag.tf==="4h"?"days":"hours"}</div>
        </div>);})}
      </div>)}

      {prices&&<div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:1,background:T.border,marginTop:28}}>
        {Object.entries(prices).map(([p,pr])=>(<div key={p} style={{background:T.bg,padding:"8px",textAlign:"center"}}><div style={{fontFamily:T.fontM,fontSize:9,color:T.dim}}>{PL[p]||p}</div><div style={{fontFamily:T.fontM,fontSize:11,fontWeight:600,color:T.text}}>{pr?fmt(pr,pr<1?4:pr<100?2:0):"—"}</div></div>))}
      </div>}
      <div style={{fontFamily:T.fontM,fontSize:9,color:T.mute,textAlign:"center",marginTop:20,letterSpacing:2}}>24/7 BACKEND · MULTI-TF PAPER TRADING · NOT FINANCIAL ADVICE</div>
    </div>
  </div>);
}
