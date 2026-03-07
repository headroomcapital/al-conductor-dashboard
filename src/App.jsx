import { useState, useEffect, useRef, useCallback } from "react";
import { AreaChart, Area, ResponsiveContainer, LineChart, Line } from "recharts";

/* ═══════════════════════════════════════════════════
   BINANCE UNIVERSE
   ═══════════════════════════════════════════════════ */
const PAIRS = ["BTCUSDT","ETHUSDT","BNBUSDT","SOLUSDT","XRPUSDT","DOGEUSDT","ADAUSDT","AVAXUSDT"];
const PL = { BTCUSDT:"BTC", ETHUSDT:"ETH", BNBUSDT:"BNB", SOLUSDT:"SOL", XRPUSDT:"XRP", DOGEUSDT:"DOGE", ADAUSDT:"ADA", AVAXUSDT:"AVAX" };

/* ═══════════════════════════════════════════════════
   INDICATOR MATH
   ═══════════════════════════════════════════════════ */
const ema=(d,p)=>{if(!d.length)return[];const k=2/(p+1);let e=d[0];return d.map(v=>(e=v*k+e*(1-k)));};
const sma=(d,p)=>d.map((_,i)=>{if(i<p-1)return null;let s=0;for(let j=i-p+1;j<=i;j++)s+=d[j];return s/p;});
function rsi(c,p=14){if(c.length<p+1)return Array(c.length).fill(50);const r=Array(c.length).fill(50);let ag=0,al=0;for(let i=1;i<=p;i++){const d=c[i]-c[i-1];if(d>0)ag+=d;else al-=d;}ag/=p;al/=p;r[p]=al===0?100:100-100/(1+ag/al);for(let i=p+1;i<c.length;i++){const d=c[i]-c[i-1];ag=(ag*(p-1)+(d>0?d:0))/p;al=(al*(p-1)+(d<0?-d:0))/p;r[i]=al===0?100:100-100/(1+ag/al);}return r;}
function bb(c,p=20,m=2){const s=sma(c,p);return s.map((v,i)=>{if(v===null)return{u:null,m:null,l:null};let sum=0;for(let j=i-p+1;j<=i;j++)sum+=(c[j]-v)**2;const sd=Math.sqrt(sum/p);return{u:v+m*sd,m:v,l:v-m*sd,sd};});}
function atr(cn,p=14){if(cn.length<2)return Array(cn.length).fill(0);const tr=cn.map((c,i)=>{if(i===0)return c.high-c.low;return Math.max(c.high-c.low,Math.abs(c.high-cn[i-1].close),Math.abs(c.low-cn[i-1].close));});return ema(tr,p);}
function adx(cn,p=14){if(cn.length<p*2)return{adx:Array(cn.length).fill(20),pDI:Array(cn.length).fill(25),mDI:Array(cn.length).fill(25)};const pDM=[],mDM=[],tr=[];for(let i=0;i<cn.length;i++){if(i===0){pDM.push(0);mDM.push(0);tr.push(cn[i].high-cn[i].low);continue;}const u=cn[i].high-cn[i-1].high,d=cn[i-1].low-cn[i].low;pDM.push(u>d&&u>0?u:0);mDM.push(d>u&&d>0?d:0);tr.push(Math.max(cn[i].high-cn[i].low,Math.abs(cn[i].high-cn[i-1].close),Math.abs(cn[i].low-cn[i-1].close)));}const a=ema(tr,p),sp=ema(pDM,p),sm=ema(mDM,p);const pD=sp.map((v,i)=>a[i]?v/a[i]*100:0),mD=sm.map((v,i)=>a[i]?v/a[i]*100:0);const dx=pD.map((v,i)=>{const s=v+mD[i];return s?Math.abs(v-mD[i])/s*100:0;});return{adx:ema(dx,p),pDI:pD,mDI:mD};}
function cci(cn,p=20){return cn.map((c,i)=>{if(i<p-1)return 0;const t=[];for(let j=i-p+1;j<=i;j++)t.push((cn[j].high+cn[j].low+cn[j].close)/3);const mn=t.reduce((a,b)=>a+b,0)/p;const md=t.reduce((a,b)=>a+Math.abs(b-mn),0)/p;return md?((c.high+c.low+c.close)/3-mn)/(0.015*md):0;});}

/* ═══════════════════════════════════════════════════
   AGENT DEFINITIONS
   ═══════════════════════════════════════════════════ */
const AG = {
  titan:{n:"Titan",i:"▲",c:"#60a5fa",d:"long",s:"Bollinger Band + EMA + RSI Hybrid",tf:"5m candles",ind:["BB(20,2)","EMA(50)","RSI(14)"],eL:"Price touches lower BB while above EMA50, RSI < 40 rising",eS:"Price touches upper BB while below EMA50, RSI > 60 falling",ex:"TP: BB midline (50%), opposite BB. SL: 1.5×ATR.",edge:"Multi-indicator consensus. Only when BB, EMA, RSI align."},
  phantom:{n:"Phantom",i:"▼",c:"#f87171",d:"short",s:"Dedicated Short Seller",tf:"5m + 15m confirmation",ind:["EMA(9)","EMA(21)","EMA(50)","RSI(14)"],eL:"N/A — shorts only",eS:"EMA9<EMA21, price<EMA50, RSI<45. Failed bounce at EMA21.",ex:"TP: 1.5×ATR / 3×ATR staged. SL: 1.5×ATR above entry.",edge:"Only trades confirmed downtrends. Shorts failed bounces."},
  reversal:{n:"Reversal",i:"☯",c:"#a78bfa",d:"neutral",s:"Z-Score Mean Reversion",tf:"5m, 50-period lookback",ind:["SMA(50)","Z-Score","EMA(100)"],eL:"Z-score < -2.0 and reverting upward",eS:"Z-score > 2.0 and reverting downward",ex:"Exit at z=0. SL: z reaches ±3.0. Time: 30 candles.",edge:"2+ std dev deviations revert 80%+ in ranges."},
  shield:{n:"Shield",i:"🛡",c:"#94a3b8",d:"hedge",s:"Portfolio Hedge Overlay",tf:"Conductor cycle",ind:["Net exposure","ATR(14)","Funding"],eL:"Opens inverse of portfolio net direction",eS:"—",ex:"Rebalances each cycle. Closes when balanced.",edge:"Reduces portfolio beta 30-50%."},
  razor:{n:"Razor",i:"⚡",c:"#fbbf24",d:"long",s:"EMA Crossover + RSI Scalp",tf:"5m, holds 5-40min",ind:["EMA(5)","EMA(13)","RSI(9)"],eL:"EMA5 crosses above EMA13, RSI 50-75",eS:"EMA5 crosses below EMA13, RSI 25-50",ex:"TP: 1.5×ATR. SL: 1.0×ATR. Recross = close.",edge:"Best Sharpe (8.7). Avoids chop via crossover filter."},
  grokker:{n:"Grokker",i:"◑",c:"#34d399",d:"contrarian",s:"Contrarian Sentiment (RSI + Volume)",tf:"5m, contrarian timing",ind:["RSI(14)","Vol/20avg","Spike detect"],eL:"RSI<25 + vol>1.5×avg + RSI rising",eS:"RSI>75 + vol>1.5×avg + RSI falling",ex:"Sentiment flip at RSI 50. SL: 2×ATR.",edge:"Buys blood, sells euphoria. Volume confirms capitulation."},
  breakout:{n:"Breakout",i:"💥",c:"#fb923c",d:"long",s:"20-Period Range Escape + Volume",tf:"5m candles",ind:["20P High/Low","ATR(14)","Vol/20avg"],eL:"Close > 20P high, vol>1.3×avg, ATR expanding",eS:"Close < 20P low, vol>1.3×avg, ATR expanding",ex:"TP: range height projected. SL: re-enter range.",edge:"Volume + ATR filter kills ~60% of false breakouts."},
  fortress:{n:"Fortress",i:"🏰",c:"#7dd3fc",d:"long",s:"ADX Trend Strength",tf:"5m, strong trends only",ind:["ADX(14)","+DI(14)","-DI(14)","EMA(50)"],eL:"ADX>25, +DI>-DI, price>EMA50, ADX rising",eS:"ADX>25, -DI>+DI, price<EMA50, ADX rising",ex:"ADX<20 = close. DI reversal = close. Trail 1.5×ATR.",edge:"Only trades ADX>25. Ignores 70% of market."},
  comet:{n:"Comet",i:"☄",c:"#c084fc",d:"long",s:"Smart Dollar-Cost Averaging",tf:"Every 20 cycles (~5min)",ind:["RSI(14)","BB position"],eL:"Scheduled buy, RSI multiplier: <30=1.5×, >70=0.5×",eS:"N/A — accumulates only",ex:"No exits. Conductor controls via breaker.",edge:"Removes timing risk. +8-12% vs naive DCA."},
  pulse:{n:"Pulse",i:"📊",c:"#2dd4bf",d:"neutral",s:"CCI Cycle Detection",tf:"5m candles",ind:["CCI(20)","EMA(50) slope"],eL:"CCI crosses above -100, EMA slope positive",eS:"CCI crosses below +100, EMA slope negative",ex:"CCI opposite extreme. SL: 1.5×ATR.",edge:"CCI transition zones capture 60-70% of range moves."},
  blitz:{n:"Blitz",i:"🎯",c:"#f472b6",d:"long",s:"Meme Coin Momentum Scanner",tf:"5m, scans every cycle",ind:["Vol spike(3×)","ROC(5)","Body ratio"],eL:"Vol>3×avg, ROC 2-10%, strong body",eS:"N/A — momentum up only",ex:"TP: +5%/+10% staged. SL: -3%. Vol fade = close.",edge:"Speed — detects in first 2-5 candles before crowd."},
};

/* ═══════════════════════════════════════════════════
   SIGNAL FUNCTIONS (with detailed rationale)
   ═══════════════════════════════════════════════════ */
function sigTitan(cn,cl){const n=cl.length-1;if(n<50)return{s:"HOLD",c:0,r:"Warming up — need 50 candles",ind:{}};const b=bb(cl),e50=ema(cl,50),rs=rsi(cl),at=atr(cn);const bn=b[n];if(!bn?.m)return{s:"HOLD",c:0,r:"BB not ready",ind:{}};const ind={RSI:rs[n].toFixed(1),EMA50:e50[n].toFixed(2),BB_U:bn.u.toFixed(2),BB_M:bn.m.toFixed(2),BB_L:bn.l.toFixed(2),ATR:at[n].toFixed(2)};if(cl[n]<=bn.l&&cl[n]>e50[n]&&rs[n]<40&&rs[n]>rs[n-1])return{s:"LONG",c:Math.min(.9,(e50[n]-bn.l)/cl[n]*100),r:`Price ${cl[n].toFixed(2)} touched BB lower (${bn.l.toFixed(2)}) while above EMA50 (${e50[n].toFixed(2)}). RSI at ${rs[n].toFixed(1)} oversold but turning up from ${rs[n-1].toFixed(1)}. Mean reversion to BB mid expected.`,sl:cl[n]-1.5*at[n],tp:bn.m,ind};if(cl[n]>=bn.u&&cl[n]<e50[n]&&rs[n]>60&&rs[n]<rs[n-1])return{s:"SHORT",c:Math.min(.9,(bn.u-e50[n])/cl[n]*100),r:`Price ${cl[n].toFixed(2)} hit BB upper (${bn.u.toFixed(2)}) below EMA50 (${e50[n].toFixed(2)}). RSI ${rs[n].toFixed(1)} overbought, turning down. Reversion expected.`,sl:cl[n]+1.5*at[n],tp:bn.m,ind};return{s:"HOLD",c:0,r:`No setup. Price mid-band at ${cl[n].toFixed(2)}, RSI ${rs[n].toFixed(1)}, EMA50 ${e50[n].toFixed(2)}.`,ind};}
function sigPhantom(cn,cl){const n=cl.length-1;if(n<50)return{s:"HOLD",c:0,r:"Warming up",ind:{}};const e9=ema(cl,9),e21=ema(cl,21),e50=ema(cl,50),rs=rsi(cl),at=atr(cn);const ind={RSI:rs[n].toFixed(1),EMA9:e9[n].toFixed(2),EMA21:e21[n].toFixed(2),EMA50:e50[n].toFixed(2)};if(e9[n]<e21[n]&&cl[n]<e50[n]&&rs[n]<45){const h3=cn.slice(-3).map(c=>c.high);if(Math.max(...h3)>e21[n]&&cl[n]<e21[n])return{s:"SHORT",c:.75,r:`Failed bounce — 3-candle high ${Math.max(...h3).toFixed(2)} pierced EMA21 (${e21[n].toFixed(2)}) but close fell back. Bearish: EMA9<EMA21<EMA50. RSI ${rs[n].toFixed(1)}.`,sl:e21[n]+at[n],tp:cl[n]-2*at[n],ind};return{s:"SHORT",c:.6,r:`Bearish structure: EMA9 (${e9[n].toFixed(2)}) < EMA21 (${e21[n].toFixed(2)}), price below EMA50 (${e50[n].toFixed(2)}). RSI ${rs[n].toFixed(1)}.`,sl:e50[n],tp:cl[n]-1.5*at[n],ind};}return{s:"HOLD",c:0,r:`No bearish setup. EMA structure: ${e9[n]>e21[n]?"bullish":"mixed"}.`,ind};}
function sigReversal(cn,cl){const n=cl.length-1;if(n<50)return{s:"HOLD",c:0,r:"Warming up",ind:{}};const sm=sma(cl,50);if(!sm[n])return{s:"HOLD",c:0,r:"SMA loading",ind:{}};let sum=0;for(let i=n-49;i<=n;i++)sum+=(cl[i]-sm[n])**2;const sd=Math.sqrt(sum/50);if(!sd)return{s:"HOLD",c:0,r:"No volatility",ind:{}};const z=(cl[n]-sm[n])/sd,pz=n>0?(cl[n-1]-(sm[n-1]||sm[n]))/(sd||1):z;const at2=atr(cn);const ind={Z:z.toFixed(2),SMA50:sm[n].toFixed(2),StdDev:sd.toFixed(2)};if(z<-2&&z>pz)return{s:"LONG",c:Math.min(1,Math.abs(z)/3),r:`Z-score ${z.toFixed(2)} — ${Math.abs(z).toFixed(1)} std devs below mean (${sm[n].toFixed(2)}). Was ${pz.toFixed(2)}, now reverting up. Statistical mean reversion expected.`,sl:sm[n]-3*sd,tp:sm[n],ind};if(z>2&&z<pz)return{s:"SHORT",c:Math.min(1,Math.abs(z)/3),r:`Z-score ${z.toFixed(2)} — ${z.toFixed(1)} std devs above mean. Starting to revert. Target: ${sm[n].toFixed(2)}.`,sl:sm[n]+3*sd,tp:sm[n],ind};return{s:"HOLD",c:0,r:`Z-score ${z.toFixed(2)} within ±2.0. No extreme.`,ind};}
function sigRazor(cn,cl){const n=cl.length-1;if(n<20)return{s:"HOLD",c:0,r:"Warming up",ind:{}};const e5=ema(cl,5),e13=ema(cl,13),rs=rsi(cl,9),at2=atr(cn);const ind={EMA5:e5[n].toFixed(2),EMA13:e13[n].toFixed(2),RSI9:rs[n].toFixed(1)};if(n>0&&e5[n]>e13[n]&&e5[n-1]<=e13[n-1]&&rs[n]>50&&rs[n]<75)return{s:"LONG",c:.7,r:`Bull crossover: EMA5 (${e5[n].toFixed(2)}) crossed above EMA13 (${e13[n].toFixed(2)}). RSI(9) ${rs[n].toFixed(1)} confirms momentum. Scalping long.`,sl:cl[n]-at2[n],tp:cl[n]+1.5*at2[n],ind};if(n>0&&e5[n]<e13[n]&&e5[n-1]>=e13[n-1]&&rs[n]<50&&rs[n]>25)return{s:"SHORT",c:.7,r:`Bear crossover: EMA5 below EMA13. RSI(9) ${rs[n].toFixed(1)} confirms. Scalping short.`,sl:cl[n]+at2[n],tp:cl[n]-1.5*at2[n],ind};return{s:"HOLD",c:0,r:`No crossover. EMA5 ${e5[n]>e13[n]?"above":"below"} EMA13. RSI ${rs[n].toFixed(1)}.`,ind};}
function sigBreakout(cn,cl){const n=cl.length-1;if(n<25)return{s:"HOLD",c:0,r:"Warming up",ind:{}};const hi=cn.slice(n-20,n).map(c=>c.high),lo=cn.slice(n-20,n).map(c=>c.low);const up=Math.max(...hi),low=Math.min(...lo);const at2=atr(cn),vol=cn[n].volume,avgV=cn.slice(n-20,n).reduce((a,c)=>a+c.volume,0)/20,vr=(vol/avgV).toFixed(1);const ind={"20P_Hi":up.toFixed(2),"20P_Lo":low.toFixed(2),Vol:vr+"×"};if(cl[n]>up&&vol>avgV*1.3&&at2[n]>at2[n-1])return{s:"LONG",c:.7,r:`Breakout above 20P high (${up.toFixed(2)}). Vol ${vr}× confirms. ATR expanding. Target: ${(cl[n]+(up-low)).toFixed(2)}.`,sl:up-.5*at2[n],tp:cl[n]+(up-low),ind};if(cl[n]<low&&vol>avgV*1.3&&at2[n]>at2[n-1])return{s:"SHORT",c:.7,r:`Breakdown below 20P low (${low.toFixed(2)}). Vol ${vr}×. Shorting.`,sl:low+.5*at2[n],tp:cl[n]-(up-low),ind};return{s:"HOLD",c:0,r:`In range [${low.toFixed(2)}-${up.toFixed(2)}]. Vol ${vr}×.`,ind};}
function sigFortress(cn,cl){const n=cl.length-1;if(n<30)return{s:"HOLD",c:0,r:"Warming up",ind:{}};const{adx:ax,pDI,mDI}=adx(cn);const e50=ema(cl,50),at2=atr(cn);const ind={ADX:ax[n].toFixed(1),"+DI":pDI[n].toFixed(1),"-DI":mDI[n].toFixed(1)};if(ax[n]>25&&pDI[n]>mDI[n]&&cl[n]>e50[n]&&ax[n]>ax[n-1])return{s:"LONG",c:Math.min(1,ax[n]/50),r:`Strong uptrend: ADX ${ax[n].toFixed(1)} (>25) rising. +DI ${pDI[n].toFixed(1)} > -DI ${mDI[n].toFixed(1)}. Above EMA50.`,sl:cl[n]-2*at2[n],tp:cl[n]+3*at2[n],ind};if(ax[n]>25&&mDI[n]>pDI[n]&&cl[n]<e50[n]&&ax[n]>ax[n-1])return{s:"SHORT",c:Math.min(1,ax[n]/50),r:`Strong downtrend: ADX ${ax[n].toFixed(1)} rising. -DI dominates. Below EMA50.`,sl:cl[n]+2*at2[n],tp:cl[n]-3*at2[n],ind};return{s:"HOLD",c:0,r:`ADX ${ax[n].toFixed(1)} — ${ax[n]<25?"too weak":"DI not aligned"}.`,ind};}
function sigPulse(cn,cl){const n=cl.length-1;if(n<25)return{s:"HOLD",c:0,r:"Warming up",ind:{}};const cc=cci(cn),e50=ema(cl,50),sl2=e50[n]-e50[Math.max(0,n-3)],at2=atr(cn);const ind={CCI:cc[n].toFixed(0),Slope:sl2>0?"Up":"Down"};if(cc[n]>-100&&cc[n-1]<=-100&&sl2>0)return{s:"LONG",c:.65,r:`CCI crossed above -100 (${cc[n].toFixed(0)} from ${cc[n-1].toFixed(0)}). EMA slope positive. Cycle turning bull.`,sl:cl[n]-1.5*at2[n],tp:cl[n]+2*at2[n],ind};if(cc[n]<100&&cc[n-1]>=100&&sl2<0)return{s:"SHORT",c:.65,r:`CCI below +100 (${cc[n].toFixed(0)} from ${cc[n-1].toFixed(0)}). EMA slope negative. Cycle turning bear.`,sl:cl[n]+1.5*at2[n],tp:cl[n]-2*at2[n],ind};return{s:"HOLD",c:0,r:`CCI ${cc[n].toFixed(0)} — no cycle transition.`,ind};}
function sigGrokker(cn,cl){const n=cl.length-1;if(n<20)return{s:"HOLD",c:0,r:"Warming up",ind:{}};const rs=rsi(cl),vol=cn[n].volume,avgV=cn.slice(Math.max(0,n-20),n).reduce((a,c)=>a+c.volume,0)/20,vr=(vol/avgV).toFixed(1),at2=atr(cn);const ind={RSI:rs[n].toFixed(1),Vol:vr+"×",Mood:rs[n]<30?"Fear":rs[n]>70?"Greed":"Neutral"};if(rs[n]<25&&vol>avgV*1.5&&rs[n]>rs[n-1])return{s:"LONG",c:.7,r:`CONTRARIAN BUY — Extreme fear. RSI ${rs[n].toFixed(1)} with ${vr}× vol spike. RSI turning up. Capitulation buy.`,sl:cl[n]-2*at2[n],tp:cl[n]+2.5*at2[n],ind};if(rs[n]>75&&vol>avgV*1.5&&rs[n]<rs[n-1])return{s:"SHORT",c:.7,r:`CONTRARIAN SELL — Euphoria. RSI ${rs[n].toFixed(1)} with ${vr}× vol. Fading greed.`,sl:cl[n]+2*at2[n],tp:cl[n]-2.5*at2[n],ind};return{s:"HOLD",c:0,r:`Sentiment neutral. RSI ${rs[n].toFixed(1)}, vol ${vr}×. Need RSI < 25 or > 75 with spike.`,ind};}
function sigComet(cn,cl,tick){if(tick%20!==0)return{s:"HOLD",c:0,r:`DCA: ${20-tick%20} ticks to next buy`,ind:{}};const n=cl.length-1;if(n<14)return{s:"HOLD",c:0,r:"Warming up",ind:{}};const rs=rsi(cl);let m=1;if(rs[n]<30)m=1.5;else if(rs[n]<40)m=1.25;else if(rs[n]>70)m=.5;else if(rs[n]>60)m=.75;return{s:"LONG",c:.3*m,r:`Scheduled DCA. RSI ${rs[n].toFixed(1)} → ${m}× multiplier. ${m>1?"Buying more — cheap":""}${m<1?"Buying less — expensive":""}${m===1?"Normal buy":""}`,ind:{RSI:rs[n].toFixed(1),Mult:m+"×"}};}
function sigBlitz(cn,cl){const n=cl.length-1;if(n<10)return{s:"HOLD",c:0,r:"Warming up",ind:{}};const vol=cn[n].volume,avgV=cn.slice(Math.max(0,n-10),n).reduce((a,c)=>a+c.volume,0)/10,vr=(vol/avgV).toFixed(1),roc=(cl[n]-cl[Math.max(0,n-5)])/cl[Math.max(0,n-5)]*100,body=Math.abs(cn[n].close-cn[n].open)/(cn[n].high-cn[n].low||1);const ind={Vol:vr+"×",ROC:roc.toFixed(2)+"%",Body:(body*100).toFixed(0)+"%"};if(vol>avgV*3&&roc>2&&roc<10&&body>.6)return{s:"LONG",c:.6,r:`Momentum! Vol ${vr}× avg. Price +${roc.toFixed(2)}% in 5 candles. Body ${(body*100).toFixed(0)}% — strong buying.`,sl:cl[n]*.97,tp:cl[n]*1.05,ind};return{s:"HOLD",c:0,r:`No momentum. Vol ${vr}× (need 3×), ROC ${roc.toFixed(2)}%.`,ind};}
const SIG={titan:sigTitan,phantom:sigPhantom,reversal:sigReversal,razor:sigRazor,breakout:sigBreakout,fortress:sigFortress,pulse:sigPulse,grokker:sigGrokker,comet:sigComet,blitz:sigBlitz,shield:()=>({s:"HEDGE",c:.5,r:"Auto-hedge based on net exposure",ind:{}})};

/* ═══════════════════════════════════════════════════
   CONDUCTORS v2.0
   ═══════════════════════════════════════════════════ */
const CD = {
  aegis:{n:"Aegis",r:"The Guardian",c:"#4A6FA5",rk:"Conservative",me:.5,vf:.5,db:-.08,ct:.75,ag:["titan","reversal","comet","shield","fortress","pulse"],w:{titan:.15,reversal:.12,comet:.08,shield:.08,fortress:.05,pulse:.05}},
  atlas:{n:"Atlas",r:"The Strategist",c:"#1B8A6B",rk:"Balanced",me:.75,vf:.25,db:-.15,ct:.55,ag:["titan","phantom","reversal","grokker","shield","razor"],w:{titan:.20,phantom:.15,reversal:.12,grokker:.10,shield:.10,razor:.08}},
  apex_c:{n:"Apex",r:"The Opportunist",c:"#E85D26",rk:"Aggressive",me:.9,vf:.1,db:-.25,ct:.45,ag:["titan","phantom","grokker","breakout","razor","blitz"],w:{titan:.22,phantom:.18,grokker:.15,breakout:.12,razor:.12,blitz:.11}},
  phantom_edge:{n:"Phantom Edge",r:"The Degen Whisperer",c:"#9B30FF",rk:"Degen",me:1,vf:0,db:-.35,ct:.35,ag:["titan","phantom","grokker","razor","breakout","blitz"],w:{titan:.22,phantom:.20,grokker:.18,razor:.15,breakout:.13,blitz:.12}},
};

const REG={bull:{l:"BULLISH",c:"#4ADE80",i:"▲"},bear:{l:"BEARISH",c:"#EF4444",i:"▼"},ranging:{l:"RANGING",c:"#F59E0B",i:"◆"},crash:{l:"CRASH",c:"#EF4444",i:"⚠"}};
const fmt=(n,d=2)=>n?.toLocaleString("en-US",{minimumFractionDigits:d,maximumFractionDigits:d})??"—";
const pct=n=>(n>=0?"+":"")+(n*100).toFixed(2)+"%";

/* ═══════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════ */
export default function Dashboard(){
  const[candleData,setCandleData]=useState({});const[prices,setPrices]=useState({});const[regime,setRegime]=useState("ranging");
  const[portfolios,setPortfolios]=useState({});const[positions,setPositions]=useState({});const[tradeLog,setTradeLog]=useState([]);
  const[tick,setTick]=useState(0);const[status,setStatus]=useState("INITIALIZING");const[selC,setSelC]=useState("atlas");
  const[view,setView]=useState("dashboard");const[expLog,setExpLog]=useState(null);const startCap=10000;
  const cRef=useRef({});const pRef=useRef({});const posRef=useRef({});const logRef=useRef([]);

  useEffect(()=>{const init={};Object.entries(CD).forEach(([id,c])=>{const as={};c.ag.forEach(a=>{as[a]={pnl:0,trades:0,wins:0,ls:"HOLD",lr:"",op:0};});init[id]={cap:startCap,peak:startCap,agents:as,hist:[{t:Date.now(),v:startCap}],dd:0,cb:false,tc:0};});setPortfolios(init);pRef.current=init;},[]);

  const fetchInit=useCallback(async()=>{setStatus("LOADING");const d={};for(const p of PAIRS){try{const r=await fetch(`https://api.binance.com/api/v3/klines?symbol=${p}&interval=5m&limit=100`);const raw=await r.json();d[p]=raw.map(k=>({time:k[0],open:+k[1],high:+k[2],low:+k[3],close:+k[4],volume:+k[5]}));}catch(e){d[p]=[];}await new Promise(r=>setTimeout(r,100));}cRef.current=d;setCandleData({...d});const pr={};PAIRS.forEach(p=>{if(d[p]?.length)pr[p]=d[p][d[p].length-1].close;});setPrices(pr);setStatus("LIVE");return d;},[]);

  const fetchLatest=useCallback(async()=>{const d={...cRef.current};const pr={};for(const p of PAIRS){try{const r=await fetch(`https://api.binance.com/api/v3/klines?symbol=${p}&interval=5m&limit=2`);const raw=await r.json();if(!raw.length)continue;const l={time:raw[raw.length-1][0],open:+raw[raw.length-1][1],high:+raw[raw.length-1][2],low:+raw[raw.length-1][3],close:+raw[raw.length-1][4],volume:+raw[raw.length-1][5]};if(!d[p])d[p]=[];if(d[p].length&&d[p][d[p].length-1].time===l.time)d[p][d[p].length-1]=l;else{d[p].push(l);if(d[p].length>150)d[p].shift();}pr[p]=l.close;}catch(e){}}cRef.current=d;setCandleData({...d});setPrices(prev=>({...prev,...pr}));return{data:d};},[]);

  const detectReg=useCallback((btc)=>{if(!btc||btc.length<20)return"ranging";const cl=btc.map(c=>c.close);const n=cl.length-1;const e8=ema(cl,8),e21=ema(cl,21),rs=rsi(cl);const pc=(cl[n]-cl[Math.max(0,n-12)])/cl[Math.max(0,n-12)];if(pc<-.04)return"crash";if(e8[n]>e21[n]&&rs[n]>50)return"bull";if(e8[n]<e21[n]&&rs[n]<50)return"bear";return"ranging";},[]);

  const runCycle=useCallback((all,t)=>{if(!all?.BTCUSDT?.length)return;const r=detectReg(all.BTCUSDT);setRegime(r);const ports={...pRef.current};const pos={...posRef.current};const nl=[];const em=r==="crash"?.2:r==="bear"?.6:r==="bull"?1.2:1;
    Object.entries(CD).forEach(([cId,cond])=>{if(!ports[cId])return;const port={...ports[cId]};const ags={...port.agents};if(port.cb)return;
      cond.ag.forEach(aId=>{if(!ags[aId])return;const agent=AG[aId];const sigFn=SIG[aId];if(!sigFn)return;
        const ps=PAIRS.map(pair=>{const cn=all[pair];if(!cn?.length)return{pair,sc:0};const cl=cn.map(c=>c.close);const sig=aId==="comet"?sigFn(cn,cl,t):sigFn(cn,cl);return{pair,sc:sig.c,sig,cn,cl};}).sort((a,b)=>b.sc-a.sc);
        const best=ps[0];if(!best?.sig)return;const pk=`${cId}_${aId}_${best.pair}`;const ex=pos[pk];const cp=best.cl[best.cl.length-1];const wt=cond.w[aId]||.1;
        ags[aId]={...ags[aId],ls:best.sig.s,lr:best.sig.r,lp:PL[best.pair]||best.pair};
        if(aId==="shield")return;
        if(ex){const pp=ex.dir==="long"?(cp-ex.entry)/ex.entry:(ex.entry-cp)/ex.entry;let sc=false,cr="";
          if(pp<-.015){sc=true;cr=`Stop loss at ${cp.toFixed(2)}. Entry ${ex.entry.toFixed(2)}, ${(pp*100).toFixed(2)}%.`;}
          if(pp>.025){sc=true;cr=`Take profit at ${cp.toFixed(2)}. Entry ${ex.entry.toFixed(2)}, +${(pp*100).toFixed(2)}%.`;}
          if(best.sig.s==="HOLD"&&pp>.01){sc=true;cr=`Signal faded, locking +${(pp*100).toFixed(2)}% at ${cp.toFixed(2)}.`;}
          if((ex.dir==="long"&&best.sig.s==="SHORT")||(ex.dir==="short"&&best.sig.s==="LONG")){sc=true;cr=`Signal reversed. Closing ${ex.dir} at ${cp.toFixed(2)} before flip.`;}
          if(sc){const rp=pp*ex.size;port.cap+=rp;ags[aId].pnl+=rp;ags[aId].trades++;if(rp>0)ags[aId].wins++;ags[aId].op--;delete pos[pk];nl.push({t:Date.now(),cId,aId,pair:best.pair,act:"CLOSE",dir:ex.dir,pnl:rp,pp,reason:cr,price:cp,entry:ex.entry,size:ex.size,dur:Date.now()-ex.ot,ind:best.sig.ind||{}});}return;}
        if(best.sig.s==="HOLD"||best.sig.s==="HEDGE"||best.sig.s==="PAUSED")return;if(best.sig.c<cond.ct)return;
        const ap=Object.keys(pos).filter(k=>k.startsWith(`${cId}_${aId}`)).length;if(ap>=2)return;
        const dir=best.sig.s==="LONG"?"long":"short";const sz=port.cap*wt*em;if(sz<10)return;
        pos[pk]={entry:cp,size:sz,dir,ot:Date.now(),sl:best.sig.sl,tp:best.sig.tp};ags[aId].op=(ags[aId].op||0)+1;port.tc=(port.tc||0)+1;
        nl.push({t:Date.now(),cId,aId,pair:best.pair,act:"OPEN",dir,size:sz,reason:best.sig.r,price:cp,conf:best.sig.c,sl:best.sig.sl,tp:best.sig.tp,ind:best.sig.ind||{},strat:AG[aId]?.s,tf:AG[aId]?.tf});
      });
      let up=0;Object.entries(pos).forEach(([k,p])=>{if(!k.startsWith(cId))return;const pair=k.split("_")[2];const cp2=all[pair]?.[all[pair].length-1]?.close;if(!cp2)return;up+=p.dir==="long"?(cp2-p.entry)/p.entry*p.size:(p.entry-cp2)/p.entry*p.size;});
      const tv=port.cap+up;port.peak=Math.max(port.peak,tv);port.dd=(tv-port.peak)/port.peak;port.cb=port.dd<=cond.db;port.agents=ags;port.hist=[...port.hist.slice(-80),{t:Date.now(),v:tv}];ports[cId]=port;
    });pRef.current=ports;posRef.current=pos;setPortfolios({...ports});setPositions({...pos});
    if(nl.length){logRef.current=[...nl,...logRef.current].slice(0,200);setTradeLog([...logRef.current]);}
  },[detectReg]);

  useEffect(()=>{fetchInit().then(d=>{if(d)runCycle(d,0);});},[fetchInit,runCycle]);
  useEffect(()=>{if(status!=="LIVE")return;const iv=setInterval(async()=>{const{data}=await fetchLatest();setTick(t=>{const nt=t+1;runCycle(data,nt);return nt;});},15000);return()=>clearInterval(iv);},[status,fetchLatest,runCycle]);

  const rd=REG[regime];const sel=CD[selC];const sp=portfolios[selC];const cLogs=tradeLog.filter(l=>l.cId===selC);

  // ── Design tokens matching agent-league-audit ──
  const T = {
    bg:"#0A0A0B", card:"#111113", border:"#1E1E22", text:"#E8E6E1", sub:"#888", dim:"#555", mute:"#444",
    green:"#4ADE80", orange:"#F59E0B", red:"#EF4444", blue:"#60a5fa",
    fontH:"'Bebas Neue',sans-serif", fontB:"'Outfit',sans-serif", fontM:"'JetBrains Mono',monospace",
  };

  const Badge=({text,color})=>(<span style={{fontSize:10,fontFamily:T.fontM,fontWeight:600,padding:"2px 8px",borderRadius:3,background:color+"20",color,letterSpacing:.5}}>{text}</span>);

  return(
    <div style={{background:T.bg,color:T.text,minHeight:"100vh",padding:"40px 20px"}}>
      {/* Google Fonts */}
      <link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Outfit:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
      <div style={{maxWidth:880,margin:"0 auto"}}>

        {/* ── HEADER ── */}
        <div style={{marginBottom:32}}>
          <div style={{fontFamily:T.fontM,fontSize:10,letterSpacing:4,color:T.dim,textTransform:"uppercase",marginBottom:4}}>
            Conductor Simulation · {new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}
          </div>
          <h1 style={{fontFamily:T.fontH,fontSize:48,fontWeight:700,color:T.text,margin:0,letterSpacing:2,lineHeight:1}}>
            AGENT LEAGUE — PAPER TRADING
          </h1>
          <p style={{fontFamily:T.fontB,fontSize:13,color:T.sub,margin:"8px 0 0",lineHeight:1.6}}>
            Live simulation of {Object.keys(CD).length} Conductor portfolios trading {PAIRS.length} Binance USDT pairs.
            Real 5-minute candle data. Real indicator calculations. Paper positions with entry/exit tracking.
          </p>
        </div>

        {/* ── STAT CARDS ── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:1,background:T.border,marginBottom:24}}>
          {Object.entries(CD).map(([cId,c])=>{const p=portfolios[cId];if(!p)return null;const tv=p.hist[p.hist.length-1]?.v||startCap;const pp=(tv-startCap)/startCap;
            return(<div key={cId} onClick={()=>setSelC(cId)} style={{background:T.bg,padding:"16px 20px",cursor:"pointer",borderBottom:selC===cId?`2px solid ${c.c}`:"2px solid transparent",transition:"border .2s"}}>
              <div style={{fontFamily:T.fontM,fontSize:10,letterSpacing:2,color:T.dim,textTransform:"uppercase",marginBottom:4}}>{c.n}</div>
              <div style={{display:"flex",alignItems:"baseline",gap:8}}>
                <span style={{fontFamily:T.fontH,fontSize:32,color:T.text}}>{pct(pp)}</span>
              </div>
              <div style={{fontFamily:T.fontM,fontSize:10,color:T.mute,marginTop:4}}>${fmt(tv,0)} · {p.tc||0} trades · DD {(p.dd*100).toFixed(1)}%</div>
              {p.hist.length>3&&<div style={{height:24,marginTop:8,marginLeft:-4,marginRight:-4}}>
                <ResponsiveContainer width="100%" height="100%"><LineChart data={p.hist.slice(-30)}><Line type="monotone" dataKey="v" stroke={c.c} strokeWidth={1.2} dot={false}/></LineChart></ResponsiveContainer>
              </div>}
            </div>);
          })}
        </div>

        {/* ── REGIME + STATUS BAR ── */}
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <div style={{display:"flex",gap:12,alignItems:"center"}}>
            <Badge text={`${rd.i} ${rd.l}`} color={rd.c}/>
            <span style={{fontFamily:T.fontM,fontSize:10,color:T.mute}}>BTC regime on 5m · Tick {tick}</span>
            <span style={{width:6,height:6,borderRadius:"50%",background:status==="LIVE"?T.green:T.orange,boxShadow:status==="LIVE"?`0 0 6px ${T.green}`:"none"}}/>
          </div>
          <div style={{display:"flex",gap:8}}>
            {Object.entries(prices).slice(0,5).map(([p,pr])=>(<span key={p} style={{fontFamily:T.fontM,fontSize:10,color:T.sub}}>{PL[p]} <span style={{color:T.text}}>${fmt(pr,pr<1?4:pr<100?2:0)}</span></span>))}
          </div>
        </div>

        {/* ── NAVIGATION TABS ── */}
        <div style={{display:"flex",gap:0,marginBottom:24,borderBottom:`1px solid ${T.border}`}}>
          {[{id:"dashboard",l:"Dashboard"},{id:"logbook",l:`Order Log (${cLogs.length})`},{id:"strategies",l:"Strategies"}].map(v=>(
            <button key={v.id} onClick={()=>{setView(v.id);setExpLog(null);}} style={{
              fontFamily:T.fontM,fontSize:11,letterSpacing:1,padding:"10px 20px",
              background:"transparent",color:view===v.id?T.text:T.dim,cursor:"pointer",
              border:"none",borderBottom:view===v.id?`2px solid ${sel.c}`:"2px solid transparent",
              transition:"all .2s",
            }}>{v.l}</button>
          ))}
        </div>

        {/* ═══ DASHBOARD ═══ */}
        {view==="dashboard"&&sp&&(<>
          {/* Section: Agents */}
          <div style={{borderLeft:`3px solid ${sel.c}`,paddingLeft:16,marginBottom:28}}>
            <h2 style={{fontFamily:T.fontH,fontSize:24,color:T.text,margin:0,letterSpacing:1}}>{sel.n.toUpperCase()} AGENTS</h2>
            <div style={{fontFamily:T.fontM,fontSize:10,color:T.dim}}>{sel.ag.length} agents · {Object.entries(positions).filter(([k])=>k.startsWith(selC)).length} open positions · {sel.rk}</div>
          </div>

          <div style={{display:"flex",flexDirection:"column",gap:2,marginBottom:28}}>
            {sel.ag.map(aId=>{const ag=AG[aId];const st=sp.agents?.[aId];if(!ag||!st)return null;
              const act=st.ls!=="HOLD"&&!st.ls?.includes("Warm");const wr=st.trades>0?(st.wins/st.trades*100).toFixed(0):"—";
              return(<div key={aId} style={{display:"grid",gridTemplateColumns:"24px 120px 60px 1fr 80px 60px",gap:8,padding:"10px 14px",background:T.card,borderLeft:`3px solid ${act?ag.c:T.border}`,alignItems:"center"}}>
                <span style={{fontSize:14}}>{ag.i}</span>
                <div><div style={{fontFamily:T.fontB,fontSize:13,fontWeight:500,color:T.text}}>{ag.n}</div><div style={{fontFamily:T.fontM,fontSize:9,color:T.dim}}>{ag.s.split(" ").slice(0,3).join(" ")}</div></div>
                <div>{st.ls!=="HOLD"?<Badge text={st.ls} color={st.ls==="LONG"?T.green:st.ls==="SHORT"?T.red:T.orange}/>:<span style={{fontFamily:T.fontM,fontSize:10,color:T.mute}}>HOLD</span>}</div>
                <div style={{fontFamily:T.fontB,fontSize:11,color:T.sub,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{st.lr}{st.lp?` · ${st.lp}`:""}</div>
                <div style={{textAlign:"right"}}><div style={{fontFamily:T.fontM,fontSize:12,fontWeight:600,color:st.pnl>=0?T.green:T.red}}>{st.pnl>=0?"+":""}{fmt(st.pnl,0)}</div><div style={{fontFamily:T.fontM,fontSize:9,color:T.mute}}>{st.trades} trades</div></div>
                <div style={{textAlign:"right",fontFamily:T.fontM,fontSize:11,color:T.sub}}>{wr}% WR</div>
              </div>);
            })}
          </div>

          {/* Equity + Positions */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:28}}>
            <div>
              <div style={{borderLeft:`3px solid ${sel.c}`,paddingLeft:16,marginBottom:12}}>
                <h2 style={{fontFamily:T.fontH,fontSize:24,color:T.text,margin:0}}>EQUITY CURVE</h2>
              </div>
              <div style={{background:T.card,padding:16}}>
                {sp.hist.length>3&&<div style={{height:120}}>
                  <ResponsiveContainer width="100%" height="100%"><AreaChart data={sp.hist}><defs><linearGradient id="eg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={sel.c} stopOpacity={.3}/><stop offset="100%" stopColor={sel.c} stopOpacity={0}/></linearGradient></defs><Area type="monotone" dataKey="v" stroke={sel.c} fill="url(#eg)" strokeWidth={1.5} dot={false}/></AreaChart></ResponsiveContainer>
                </div>}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8,marginTop:12}}>
                  {[{l:"Capital",v:`$${fmt(sp.hist[sp.hist.length-1]?.v||startCap,0)}`},{l:"Drawdown",v:`${(sp.dd*100).toFixed(2)}%`},{l:"Trades",v:sp.tc||0},{l:"Breaker",v:`${(sel.db*100).toFixed(0)}%`}].map((s,i)=>(
                    <div key={i} style={{textAlign:"center"}}><div style={{fontFamily:T.fontH,fontSize:20,color:T.text}}>{s.v}</div><div style={{fontFamily:T.fontM,fontSize:9,color:T.dim,letterSpacing:1}}>{s.l}</div></div>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <div style={{borderLeft:`3px solid ${T.border}`,paddingLeft:16,marginBottom:12}}>
                <h2 style={{fontFamily:T.fontH,fontSize:24,color:T.text,margin:0}}>OPEN POSITIONS</h2>
              </div>
              <div style={{background:T.card,padding:16}}>
                {Object.entries(positions).filter(([k])=>k.startsWith(selC)).length===0
                  ?<div style={{fontFamily:T.fontB,fontSize:12,color:T.dim,padding:"20px 0",textAlign:"center"}}>No open positions</div>
                  :Object.entries(positions).filter(([k])=>k.startsWith(selC)).map(([k,p])=>{
                    const pts=k.split("_");const pair=pts[2];const agId=pts[1];const cp2=candleData[pair]?.[candleData[pair].length-1]?.close;
                    const pp2=cp2?(p.dir==="long"?(cp2-p.entry)/p.entry:(p.entry-cp2)/p.entry):0;
                    return(<div key={k} style={{display:"grid",gridTemplateColumns:"70px 50px 1fr 60px",gap:8,padding:"8px 0",borderBottom:`1px solid ${T.border}`,alignItems:"center"}}>
                      <span style={{fontFamily:T.fontB,fontSize:12,color:AG[agId]?.c}}>{AG[agId]?.i} {AG[agId]?.n}</span>
                      <Badge text={p.dir.toUpperCase()} color={p.dir==="long"?T.green:T.red}/>
                      <span style={{fontFamily:T.fontM,fontSize:10,color:T.sub}}>{PL[pair]} @ ${fmt(p.entry,p.entry<1?4:2)}</span>
                      <span style={{textAlign:"right",fontFamily:T.fontM,fontSize:12,fontWeight:600,color:pp2>=0?T.green:T.red}}>{(pp2*100).toFixed(2)}%</span>
                    </div>);
                  })
                }
              </div>
            </div>
          </div>

          {/* Recent signals mini */}
          <div style={{borderLeft:`3px solid ${T.border}`,paddingLeft:16,marginBottom:12,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <h2 style={{fontFamily:T.fontH,fontSize:24,color:T.text,margin:0}}>RECENT SIGNALS</h2>
            <button onClick={()=>setView("logbook")} style={{fontFamily:T.fontM,fontSize:10,color:sel.c,background:"transparent",border:"none",cursor:"pointer"}}>View full log →</button>
          </div>
          <div style={{marginBottom:28}}>
            {cLogs.slice(0,5).map((l,i)=>{const ag=AG[l.aId];return(
              <div key={i} style={{display:"grid",gridTemplateColumns:"80px 50px 45px 50px 1fr 70px",gap:8,padding:"8px 14px",background:i===0?T.card:"transparent",borderLeft:`3px solid ${l.act==="OPEN"?T.blue:"#a855f7"}`,alignItems:"center",fontFamily:T.fontM,fontSize:10}}>
                <span style={{color:ag?.c}}>{ag?.i} {ag?.n}</span>
                <Badge text={l.act} color={l.act==="OPEN"?T.blue:"#a855f7"}/>
                <span style={{color:l.dir==="long"?T.green:T.red}}>{l.dir?.toUpperCase()}</span>
                <span style={{color:T.sub}}>{PL[l.pair]}</span>
                <span style={{color:T.dim,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.reason?.slice(0,55)}</span>
                <span style={{textAlign:"right",fontWeight:600,color:l.pnl!=null?(l.pnl>=0?T.green:T.red):T.sub}}>{l.pnl!=null?`${l.pnl>=0?"+":""}$${Math.abs(l.pnl).toFixed(0)}`:`$${l.size?.toFixed(0)||""}`}</span>
              </div>
            );})}
          </div>
        </>)}

        {/* ═══ ORDER LOGBOOK ═══ */}
        {view==="logbook"&&(<div>
          <div style={{borderLeft:`3px solid ${sel.c}`,paddingLeft:16,marginBottom:20}}>
            <h2 style={{fontFamily:T.fontH,fontSize:24,color:T.text,margin:0}}>{sel.n.toUpperCase()} — ORDER LOG</h2>
            <div style={{fontFamily:T.fontB,fontSize:13,color:T.sub,marginTop:4}}>Every trade with indicator snapshot, entry/exit reasoning, and P&L. Click to expand.</div>
          </div>
          {cLogs.length===0?<div style={{fontFamily:T.fontB,fontSize:13,color:T.dim,padding:"40px 0",textAlign:"center",background:T.card}}>No trades yet. Agents are warming up on 5m candle data — signals appear as indicators trigger.</div>
          :cLogs.map((l,i)=>{const ag=AG[l.aId];const isExp=expLog===i;return(<div key={i} style={{marginBottom:1}}>
            <div onClick={()=>setExpLog(isExp?null:i)} style={{display:"grid",gridTemplateColumns:"20px 80px 50px 45px 50px 1fr 70px 60px",gap:6,padding:"10px 14px",background:isExp?"#161618":T.card,borderLeft:`3px solid ${l.act==="OPEN"?T.blue:"#a855f7"}`,cursor:"pointer",alignItems:"center"}}>
              <span style={{fontSize:12}}>{ag?.i}</span>
              <span style={{fontFamily:T.fontB,fontSize:12,fontWeight:500,color:ag?.c}}>{ag?.n}</span>
              <Badge text={l.act} color={l.act==="OPEN"?T.blue:"#a855f7"}/>
              <span style={{fontFamily:T.fontM,fontSize:10,color:l.dir==="long"?T.green:T.red,fontWeight:600}}>{l.dir?.toUpperCase()}</span>
              <span style={{fontFamily:T.fontM,fontSize:10,color:T.sub}}>{PL[l.pair]}</span>
              <span style={{fontFamily:T.fontB,fontSize:11,color:T.dim,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{l.reason?.slice(0,50)}...</span>
              <span style={{textAlign:"right",fontFamily:T.fontM,fontSize:11,fontWeight:600,color:l.pnl!=null?(l.pnl>=0?T.green:T.red):T.blue}}>{l.pnl!=null?`${l.pnl>=0?"+":""}$${Math.abs(l.pnl).toFixed(2)}`:`$${l.size?.toFixed(0)}`}</span>
              <span style={{textAlign:"right",fontFamily:T.fontM,fontSize:9,color:T.mute}}>{new Date(l.t).toLocaleTimeString("en-US",{hour12:false})}</span>
            </div>
            {isExp&&(<div style={{padding:"16px 20px 16px 37px",background:"#0D0D0E",borderLeft:`3px solid ${T.border}`}}>
              {l.strat&&<div style={{marginBottom:8}}><span style={{fontFamily:T.fontM,fontSize:9,letterSpacing:2,color:T.dim}}>STRATEGY </span><span style={{fontFamily:T.fontB,fontSize:13,color:ag?.c}}>{l.strat}</span>{l.tf&&<span style={{fontFamily:T.fontM,fontSize:10,color:T.mute}}> · {l.tf}</span>}</div>}
              <div style={{fontFamily:T.fontB,fontSize:13,color:"#aaa",lineHeight:1.8,marginBottom:12}}>{l.reason}</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:12}}>
                {[{l:"Entry",v:`$${fmt(l.price,l.price<1?4:2)}`},l.sl&&{l:"Stop Loss",v:`$${fmt(l.sl,l.sl<1?4:2)}`,c:T.red},l.tp&&{l:"Take Profit",v:`$${fmt(l.tp,l.tp<1?4:2)}`,c:T.green},l.size&&{l:"Size",v:`$${fmt(l.size,0)}`},l.conf!=null&&{l:"Confidence",v:`${(l.conf*100).toFixed(0)}%`},l.pnl!=null&&{l:"P&L",v:`${l.pnl>=0?"+":""}$${fmt(l.pnl,2)}`,c:l.pnl>=0?T.green:T.red},l.pp!=null&&{l:"Return",v:`${(l.pp*100).toFixed(2)}%`,c:l.pp>=0?T.green:T.red},l.dur&&{l:"Duration",v:`${Math.floor(l.dur/60000)}m ${Math.floor((l.dur%60000)/1000)}s`}].filter(Boolean).map((s,j)=>(
                  <div key={j}><div style={{fontFamily:T.fontM,fontSize:9,color:T.dim,letterSpacing:1}}>{s.l}</div><div style={{fontFamily:T.fontM,fontSize:13,fontWeight:500,color:s.c||T.text}}>{s.v}</div></div>
                ))}
              </div>
              {l.ind&&Object.keys(l.ind).length>0&&(<div>
                <div style={{fontFamily:T.fontM,fontSize:9,color:T.dim,letterSpacing:2,marginBottom:6}}>INDICATOR SNAPSHOT</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4}}>{Object.entries(l.ind).map(([k,v])=>(<span key={k} style={{fontFamily:T.fontM,fontSize:10,padding:"3px 10px",background:T.card,border:`1px solid ${T.border}`,borderRadius:2}}><span style={{color:T.dim}}>{k}: </span><span style={{color:T.text}}>{v}</span></span>))}</div>
              </div>)}
            </div>)}
          </div>);})}
        </div>)}

        {/* ═══ STRATEGIES ═══ */}
        {view==="strategies"&&(<div>
          <div style={{borderLeft:`3px solid ${sel.c}`,paddingLeft:16,marginBottom:24}}>
            <h2 style={{fontFamily:T.fontH,fontSize:24,color:T.text,margin:0}}>{sel.n.toUpperCase()} — STRATEGY REFERENCE</h2>
            <div style={{fontFamily:T.fontB,fontSize:13,color:T.sub,marginTop:4}}>Full specification of each agent's trading logic, indicators, entry/exit rules, and edge.</div>
          </div>
          {sel.ag.map(aId=>{const ag=AG[aId];if(!ag)return null;return(<div key={aId} style={{background:T.card,borderLeft:`3px solid ${ag.c}`,padding:"20px 24px",marginBottom:8}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <span style={{fontSize:20}}>{ag.i}</span>
              <div><div style={{fontFamily:T.fontH,fontSize:20,color:ag.c,letterSpacing:1}}>{ag.n.toUpperCase()}</div><div style={{fontFamily:T.fontB,fontSize:12,color:T.sub}}>{ag.s}</div></div>
              <div style={{flex:1}}/><Badge text={ag.tf} color={T.dim}/>
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:16}}>
              {ag.ind.map((ind,j)=>(<span key={j} style={{fontFamily:T.fontM,fontSize:10,padding:"3px 10px",background:`${ag.c}10`,border:`1px solid ${ag.c}30`,borderRadius:2,color:ag.c}}>{ind}</span>))}
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20,fontFamily:T.fontB,fontSize:12,lineHeight:1.7}}>
              <div>
                <div style={{fontFamily:T.fontM,fontSize:9,letterSpacing:2,color:T.dim,marginBottom:4}}>ENTRY — LONG</div>
                <div style={{color:"#aaa",marginBottom:12}}>{ag.eL}</div>
                <div style={{fontFamily:T.fontM,fontSize:9,letterSpacing:2,color:T.dim,marginBottom:4}}>ENTRY — SHORT</div>
                <div style={{color:"#aaa"}}>{ag.eS}</div>
              </div>
              <div>
                <div style={{fontFamily:T.fontM,fontSize:9,letterSpacing:2,color:T.dim,marginBottom:4}}>EXIT RULES</div>
                <div style={{color:"#aaa",marginBottom:12}}>{ag.ex}</div>
                <div style={{fontFamily:T.fontM,fontSize:9,letterSpacing:2,color:T.dim,marginBottom:4}}>EDGE</div>
                <div style={{color:T.text,fontStyle:"italic"}}>{ag.edge}</div>
              </div>
            </div>
          </div>);})}
        </div>)}

        {/* ── ASSET BAR ── */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(8,1fr)",gap:1,background:T.border,marginTop:28}}>
          {PAIRS.map(pair=>{const price=prices[pair];const cn=candleData[pair];const prev=cn?.length>1?cn[cn.length-2]?.close:price;const chg=prev?(price-prev)/prev:0;
            return(<div key={pair} style={{background:T.bg,padding:"8px",textAlign:"center"}}>
              <div style={{fontFamily:T.fontM,fontSize:9,color:T.dim,fontWeight:600}}>{PL[pair]}</div>
              <div style={{fontFamily:T.fontM,fontSize:11,fontWeight:600,color:T.text}}>{price?fmt(price,price<1?4:price<100?2:0):"—"}</div>
              <div style={{fontFamily:T.fontM,fontSize:9,color:chg>=0?T.green:T.red}}>{chg>=0?"+":""}{(chg*100).toFixed(2)}%</div>
            </div>);})}
        </div>

        {/* Footer */}
        <div style={{fontFamily:T.fontM,fontSize:9,color:T.mute,textAlign:"center",marginTop:20,letterSpacing:2}}>
          PAPER TRADING ONLY · BINANCE SPOT · 5M CANDLES · REAL INDICATORS · 15S CYCLES · NOT FINANCIAL ADVICE
        </div>
      </div>
    </div>
  );
}
