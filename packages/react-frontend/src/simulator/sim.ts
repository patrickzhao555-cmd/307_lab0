import type { PhysParams, Weather, Surface } from "./physics";
import { stepLongitudinal, pickPhysParamsFromEnv, kph2mps, mps2mph, clamp } from "./physics";

export type Light = "daylight" | "night";
export type CCRKind = "CCRs" | "CCRm" | "CCRb" | "Custom";

export interface SimConfig {
  surface: Surface;
  kind: CCRKind;
  weather: Weather;
  light: Light;
  muOverride?: number | null;
  e: number;
  reactionDelayS: number;
  ttcTriggerS: number;
  leadDecel1: number;          // L1 的“恒定制动”指令（负值）
  fps: number;
  durationS: number;

  vE0: number; vL10: number; vL20: number;
  gap1: number; gap2: number;
  cars: number;
  grade_deg: number;

  mE: number;  m1: number;  m2: number;
  CdAE: number; CdA1: number; CdA2: number;

  lenE: number; len1: number; len2: number;
  zoom: number;
  surfaceRoughness: number;
  treadDepth_mm: number;
  tirePressure_psi: number;
  waterFilm_mm: number;
  headwind_mps: number;
  altitude_m: number;
  airTempC: number;
}

export interface SimState {
  t: number; dt: number;
  xE: number; vE: number; aE:number;
  x1: number; v1: number;
  x2: number; v2: number;
  lenE: number; len1: number; len2: number;
  collided: boolean;
  impactLog: Array<{pair:string,t:number,vRel:number,e:number,dvA:number,dvB:number}>;
  phys: PhysParams;
}

export function applyCCRTemplate(cfg: SimConfig){
  const pick = <T,>(arr:T[]) => arr[Math.floor(Math.random()*arr.length)];
  if (cfg.kind === "CCRs"){
    const vE = pick([10,15,20,25,30,35,40,45,50,55,60,65,70,75,80]);
    cfg.vE0 = kph2mps(vE); cfg.vL10 = 0; cfg.vL20 = 0;
    cfg.gap1 = Math.max(12, cfg.vE0*4*0.9);
    cfg.gap2 = cfg.gap1 + 10;
    cfg.leadDecel1 = 0;
  } else if (cfg.kind === "CCRm"){
    const vE = pick([30,35,40,45,50,55,60,65,70,75,80]);
    cfg.vE0 = kph2mps(vE); cfg.vL10 = kph2mps(20); cfg.vL20 = cfg.vL10;
    cfg.gap1 = Math.max(12, (cfg.vE0 - cfg.vL10)*4*0.9);
    cfg.gap2 = cfg.gap1 + 10;
    cfg.leadDecel1 = 0;
  } else if (cfg.kind === "CCRb"){
    cfg.vE0 = kph2mps(50); cfg.vL10 = kph2mps(50); cfg.vL20 = cfg.vL10;
    cfg.gap1 = [12,40][Math.floor(Math.random()*2)];
    cfg.gap2 = cfg.gap1 + 10;
    cfg.leadDecel1 = [-2.0, -6.0][Math.floor(Math.random()*2)];
  }
}

export function createInitialState(cfg:SimConfig): SimState {
  if (cfg.kind!=="Custom") applyCCRTemplate(cfg);
  const phys = pickPhysParamsFromEnv(cfg.weather, cfg.surface, cfg.grade_deg, 1500, 0.65, cfg.airTempC, cfg.altitude_m, cfg.surfaceRoughness, cfg.headwind_mps, cfg.waterFilm_mm, cfg.tirePressure_psi, cfg.treadDepth_mm);
  if (cfg.muOverride!=null) phys.mu0 = cfg.muOverride;

  return {
    t:0, dt:1/cfg.fps,
    xE:0, vE:cfg.vE0, aE:0,
    x1:cfg.gap1, v1:cfg.vL10,
    x2:cfg.gap1 + cfg.gap2, v2:cfg.vL20,
    lenE: cfg.lenE, len1: cfg.len1, len2: cfg.len2,
    collided:false,
    impactLog: [],
    phys
  };
}

function estimateE(eBase:number, vRel:number){
  const mph = mps2mph(Math.max(0,vRel));
  if (mph<=5)  return clamp(eBase+0.05, 0.05, 0.6);
  if (mph<=15) return clamp(eBase,       0.05, 0.5);
  return clamp(Math.min(eBase,0.2),      0.05, 0.3);
}

function resolveImpact1D(uA:number,uB:number,mA:number,mB:number,e:number){
  const vA = (-e*mB*(uA - uB) + mA*uA + mB*uB) / (mA + mB);
  const vB = ( e*mA*(uA - uB) + mA*uA + mB*uB) / (mA + mB);
  return { vA, vB };
}

export function stepOnce(state:SimState, cfg:SimConfig){
  const s = state, dt = s.dt;

  // 每辆车各自的物理参数（包含 CdA、m、μ、坡度、滚阻等）
  const pE:PhysParams  = { ...s.phys, m: cfg.mE,  CdA: cfg.CdAE };
  const p1:PhysParams  = { ...s.phys, m: cfg.m1,  CdA: cfg.CdA1 };
  const p2:PhysParams  = { ...s.phys, m: cfg.m2,  CdA: cfg.CdA2 };

  // AEB 触发判定：使用“车长占位”的 TTC
  const centerGap1 = s.x1 - s.xE;
  const centerGap2 = s.x2 - s.xE;
  let centerGapAhead = Infinity, relVAhead = 0, combLenAhead = 0;
  if (cfg.cars>=2){ centerGapAhead = centerGap1; relVAhead = s.vE - s.v1; combLenAhead = (s.lenE + s.len1)/2; }
  if (cfg.cars>=3 && centerGap2 < centerGapAhead){ centerGapAhead = centerGap2; relVAhead = s.vE - s.v2; combLenAhead = (s.lenE + s.len2)/2; }
  const TTC = relVAhead>0 ? ((centerGapAhead - combLenAhead)/relVAhead) : Infinity;
  const brakeOnEgo = TTC < cfg.ttcTriggerS;

  // ★ 统一用 stepLongitudinal 推进三辆车（之前 L1/L2 没有空气/滚阻，是不对的）
  const stE = stepLongitudinal(s.vE, s.aE, dt, pE, brakeOnEgo);
  s.vE = stE.vNext; s.aE = stE.aCmdNext;

  const leadBraking = cfg.leadDecel1 < 0;
  // 这里把 “恒定制动” 作为 aCmd 传入（stepLongitudinal 内会做 μ 限幅与合力计算）
const st1 = stepLongitudinal(s.v1, cfg.leadDecel1, dt, { ...p1, jerk: 1e9, aebTargetG: Math.abs(cfg.leadDecel1)/9.81 }, true);
  
  s.v1 = st1.vNext;

  const st2 = stepLongitudinal(s.v2, 0, dt, p2, false);
  s.v2 = st2.vNext;

  // 积分位置
  s.xE += s.vE * dt;
  s.x1 += s.v1 * dt;
  s.x2 += s.v2 * dt;

  // 碰撞与分离（基于各自车长）
  const eps = 1e-3;
  let iter=0, changed=false;
  do{
    changed=false;
    if (cfg.cars>=3){
      const gap12 = (s.x2 - s.x1) - (s.len1 + s.len2)/2;
      if (gap12 <= 0){
        const uA=s.v1, uB=s.v2, e = estimateE(cfg.e, Math.max(0,uA-uB));
        const out = resolveImpact1D(uA,uB,cfg.m1,cfg.m2,e);
        s.v1 = out.vA; s.v2 = out.vB;
        const mid = (s.x1 + s.x2)/2;
        const d  = (s.len1 + s.len2)/2 + eps;
        s.x1 = mid - d/2; s.x2 = mid + d/2;
        s.collided = true; changed=true;
        state.impactLog.push({pair:"L1-L2", t:s.t, vRel:Math.max(0,uA-uB), e, dvA:uA-out.vA, dvB:out.vB-uB});
      }
    }
    if (cfg.cars>=2){
      const gapE1 = (s.x1 - s.xE) - (s.lenE + s.len1)/2;
      if (gapE1 <= 0){
        const uA=s.vE, uB=s.v1, e = estimateE(cfg.e, Math.max(0,uA-uB));
        const out = resolveImpact1D(uA,uB,cfg.mE,cfg.m1,e);
        s.vE = out.vA; s.v1 = out.vB;
        const mid = (s.xE + s.x1)/2;
        const d  = (s.lenE + s.len1)/2 + eps;
        s.xE = mid - d/2; s.x1 = mid + d/2;
        s.collided = true; changed=true;
        state.impactLog.push({pair:"E-L1", t:s.t, vRel:Math.max(0,uA-uB), e, dvA:uA-out.vA, dvB:out.vB-uB});
      }
    }
  } while(changed && ++iter<3);

  s.t += dt;
  return { TTC, brakeOn: brakeOnEgo };
}

function drawCarSprite(ctx:CanvasRenderingContext2D, x:number, y:number, w:number, isTruck:boolean, color:string){
  const h = isTruck ? 34 : 26;
  const r = 6;
  ctx.fillStyle = "rgba(0,0,0,0.12)"; ctx.fillRect(x-2, y+2, w, h);
  if (isTruck){
    const cabW = Math.max(0.28*w, 36);
    const boxW = w - cabW;
    ctx.fillStyle = color; ctx.fillRect(x, y, boxW, h);
    ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.fillRect(x+4, y+4, boxW-8, h-8);
    ctx.fillStyle = "#444"; roundRect(ctx, x+boxW, y, cabW, h, r); ctx.fill();
    drawWheels(ctx, x, y, w, h);
  }else{
    ctx.fillStyle = color; roundRect(ctx, x, y, w, h, r); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 1; roundRect(ctx, x, y, w, h, r); ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.22)"; roundRect(ctx, x+4, y+4, w-8, h-8, 4); ctx.fill();
    drawWheels(ctx, x, y, w, h);
  }
}
function drawWheels(ctx:CanvasRenderingContext2D, x:number, y:number, w:number, h:number){
  ctx.fillStyle = "#111";
  const t = Math.max(3, Math.floor(h*0.17));
  const wWidth = Math.max(4, Math.floor(w*0.07));
  ctx.fillRect(x+w*0.18, y-2, wWidth, t);
  ctx.fillRect(x+w*0.72, y-2, wWidth, t);
  ctx.fillRect(x+w*0.18, y+h-t+2, wWidth, t);
  ctx.fillRect(x+w*0.72, y+h-t+2, wWidth, t);
}
function roundRect(ctx:CanvasRenderingContext2D, x:number,y:number,w:number,h:number,r:number){
  ctx.beginPath();
  const rr = Math.min(r, w/2, h/2);
  ctx.moveTo(x+rr,y);
  ctx.arcTo(x+w,y,x+w,y+h,rr);
  ctx.arcTo(x+w,y+h,x,y+h,rr);
  ctx.arcTo(x,y+h,x,y,rr);
  ctx.arcTo(x,y,x+w,y,rr);
  ctx.closePath();
}

export function drawFrame(ctx:CanvasRenderingContext2D, s:SimState, cfg:SimConfig){
  const W=1280, H=560;
  const topHUD=96;
  const laneY=H*0.62;
  const scale = 20 * (cfg.zoom ?? 1);
  const carY   = laneY - 26/2;
  const worldXtoScreen=(x:number)=> 80 + x*scale;

  ctx.fillStyle = cfg.light==="night" ? "#0b0f14" : "#faf4dc"; ctx.fillRect(0,0,W,H);
  ctx.fillStyle = "#fff8d6"; ctx.fillRect(0,0,W,topHUD);
  ctx.fillStyle = "#cfcfca"; ctx.fillRect(0, laneY-80, W, 160);
  ctx.setLineDash([18,18]); ctx.lineWidth=4; ctx.strokeStyle="#fff";
  ctx.beginPath(); ctx.moveTo(0, laneY); ctx.lineTo(W, laneY); ctx.stroke(); ctx.setLineDash([]);

  const wE = Math.max(20, Math.round(s.lenE*scale));
  const w1 = Math.max(20, Math.round(s.len1*scale));
  const w2 = Math.max(20, Math.round(s.len2*scale));
  const isTruckE = s.lenE >= 6.0;
  const isTruck1 = s.len1 >= 6.0;
  const isTruck2 = s.len2 >= 6.0;

  drawCarSprite(ctx, worldXtoScreen(s.xE)-wE/2, carY, wE, isTruckE, "#3a7afe");
  if (cfg.cars>=2) drawCarSprite(ctx, worldXtoScreen(s.x1)-w1/2, carY, w1, isTruck1, "#fe4b4b");
  if (cfg.cars>=3) drawCarSprite(ctx, worldXtoScreen(s.x2)-w2/2, carY, w2, isTruck2, "#7c828a");

  ctx.fillStyle = "#222"; ctx.font = "14px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(`t=${s.t.toFixed(2)}s  模板:${cfg.kind}  天气:${cfg.weather}  光照:${cfg.light}  collided=${s.collided}`, 12, 22);
  ctx.fillText(`E len=${s.lenE.toFixed(2)}m v=${s.vE.toFixed(1)} m/s  m=${cfg.mE}kg  CdA=${cfg.CdAE.toFixed(2)}  zoom=${(cfg.zoom??1).toFixed(2)}x`, 12, 44);
  if (cfg.cars>=2) ctx.fillText(`L1 len=${s.len1.toFixed(2)}m v=${s.v1.toFixed(1)} m/s  m=${cfg.m1}kg  CdA=${cfg.CdA1.toFixed(2)}`, 12, 66);
  if (cfg.cars>=3) ctx.fillText(`L2 len=${s.len2.toFixed(2)}m v=${s.v2.toFixed(1)} m/s  m=${cfg.m2}kg  CdA=${cfg.CdA2.toFixed(2)}`, 12, 88);
}
