import { useEffect, useRef, useState } from "react";
import { createInitialState, stepOnce, drawFrame } from "./sim";
import type { SimConfig, CCRKind } from "./sim";
import { kph2mps } from "./physics";

const defaultCfg: SimConfig = {
  kind:"CCRm",
  weather:"clear",
  light:"daylight",
  surface:"asphalt",
  airTempC:20,
  altitude_m:0,
  headwind_mps:0,
  waterFilm_mm:0,
  tirePressure_psi:35,
  treadDepth_mm:6,
  surfaceRoughness:0.3,
  muOverride:null,
  e:0.20,
  reactionDelayS:0.0,
  ttcTriggerS:1.6,
  leadDecel1:0,
  fps:20,
  durationS:6,
  vE0:kph2mps(50),
  vL10:kph2mps(20),
  vL20:0,
  gap1:25,
  gap2:12,
  cars:2,
  grade_deg:0,
  mE:1500, m1:1500, m2:1500,
  CdAE:0.65, CdA1:0.65, CdA2:0.65,
  // 新增：车长（米），>=6.0 自动画卡车
  lenE:4.5, len1:4.5, len2:4.5,
  zoom:1.0
};

type RandSpec = { en:boolean; min:number; max:number };
type RandMap = Record<string, RandSpec>;

const defaultRand: RandMap = {
  "vE0_kph":   { en:true,  min:20,  max:80 },
  "v1_0_kph":  { en:true,  min:0,   max:70 },
  "v2_0_kph":  { en:false, min:0,   max:70 },
  "gap1":      { en:true,  min:10,  max:60 },
  "gap2":      { en:true,  min:10,  max:60 },
  "mE":        { en:false, min:1100,max:2200 },
  "m1":        { en:false, min:1100,max:2200 },
  "m2":        { en:false, min:1100,max:2200 },
  "CdAE":      { en:false, min:0.5, max:0.9 },
  "CdA1":      { en:false, min:0.5, max:0.9 },
  "CdA2":      { en:false, min:0.5, max:0.9 },
  "e":         { en:false, min:0.05,max:0.5 },
  "ttc":       { en:false, min:1.2, max:2.6 },
  "leadDec":   { en:false, min:-7,  max:-1 },
  "grade":     { en:false, min:-6,  max:6 }
};

function rnd(min:number,max:number){ return min + Math.random()*(max-min); }
function clamp(x:number, a:number, b:number){ return Math.max(a, Math.min(b,x)); }
function Tip({text}:{text:string}){ return <span className="tip" title={text}>?</span>; }

export default function App(){
  const [cfg, setCfg] = useState<SimConfig>(defaultCfg);
  const [running, setRunning] = useState(false);
  const [state, setState] = useState(()=>createInitialState({...defaultCfg}));
  const [rand, setRand] = useState<RandMap>(defaultRand);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  function reset(){
    const c = {...cfg};                  // clone
    const s = createInitialState(c);     // 会在 c 上套用模板并随机
    setCfg(c);                           // 把随机结果写回 UI
    setState(s);
    setRunning(false);
  }

  useEffect(()=>{ reset(); /* eslint-disable-next-line */ },
    [cfg.kind, cfg.weather, cfg.light, cfg.cars, cfg.zoom, cfg.fps, cfg.lenE, cfg.len1, cfg.len2, cfg.grade_deg, cfg.surface, cfg.airTempC, cfg.altitude_m, cfg.headwind_mps, cfg.waterFilm_mm, cfg.tirePressure_psi, cfg.treadDepth_mm, cfg.surfaceRoughness]);

  // 固定步长 + 时间累积器
  const rafRef = useRef<number|undefined>(undefined);
  const lastRef = useRef<number>(0);
  const accRef  = useRef<number>(0);

  useEffect(()=>{
    if (!running){
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawFrame(ctx, state, cfg);
      return;
    }
    lastRef.current = performance.now();
    accRef.current  = 0;

    const loop = ()=>{
      const now = performance.now();
      accRef.current += (now - lastRef.current)/1000;
      lastRef.current = now;
      const fixedDt = 1 / cfg.fps;
      while (accRef.current >= fixedDt){
        state.dt = fixedDt;
        stepOnce(state, cfg);
        accRef.current -= fixedDt;
      }
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) drawFrame(ctx, state, cfg);
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return ()=>{ if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [running, cfg.fps, cfg.ttcTriggerS, cfg.leadDecel1, cfg.muOverride, cfg.weather, cfg.grade_deg]);


  // 滚轮缩放（Ctrl/Shift）
  useEffect(()=>{
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e:WheelEvent)=>{
      if (!e.ctrlKey && !e.shiftKey) return;
      e.preventDefault();
      const f = e.deltaY > 0 ? 0.9 : 1.1;
      setCfg(prev=>({...prev, zoom: clamp(Number((prev.zoom*f).toFixed(2)), 0.5, 2.5)}));
    };
    el.addEventListener("wheel", onWheel, {passive:false});
    return ()=> el.removeEventListener("wheel", onWheel);
  }, [canvasRef.current]);

  const onChange = (patch:Partial<SimConfig>) => setCfg(prev=>({...prev, ...patch}));

  function randomizeOnce(){
    const r = rand; const patch: Partial<SimConfig> = {};
    if (r["vE0_kph"].en)  patch.vE0  = kph2mps(rnd(r["vE0_kph"].min,  r["vE0_kph"].max));
    if (r["v1_0_kph"].en) patch.vL10 = kph2mps(rnd(r["v1_0_kph"].min, r["v1_0_kph"].max));
    if (cfg.cars>=3 && r["v2_0_kph"].en) patch.vL20 = kph2mps(rnd(r["v2_0_kph"].min, r["v2_0_kph"].max));
    if (r["gap1"].en) patch.gap1 = rnd(r["gap1"].min, r["gap1"].max);
    if (cfg.cars>=3 && r["gap2"].en) patch.gap2 = rnd(r["gap2"].min, r["gap2"].max);
    if (r["mE"].en)  patch.mE  = Math.round(rnd(r["mE"].min,  r["mE"].max));
    if (r["m1"].en)  patch.m1  = Math.round(rnd(r["m1"].min,  r["m1"].max));
    if (cfg.cars>=3 && r["m2"].en)  patch.m2  = Math.round(rnd(r["m2"].min,  r["m2"].max));
    if (r["CdAE"].en) patch.CdAE = rnd(r["CdAE"].min, r["CdAE"].max);
    if (r["CdA1"].en) patch.CdA1 = rnd(r["CdA1"].min, r["CdA1"].max);
    if (cfg.cars>=3 && r["CdA2"].en) patch.CdA2 = rnd(r["CdA2"].min, r["CdA2"].max);
    if (r["e"].en)     patch.e = rnd(r["e"].min, r["e"].max);
    if (r["ttc"].en)   patch.ttcTriggerS = rnd(r["ttc"].min, r["ttc"].max);
    if (r["leadDec"].en) patch.leadDecel1 = rnd(r["leadDec"].min, r["leadDec"].max);
    if (r["grade"].en) patch.grade_deg = Math.round(rnd(r["grade"].min, r["grade"].max));
    setCfg(prev=>({...prev, ...patch}));
    setRunning(false); setTimeout(()=>reset(),0);
  }

  function toggleAllRandom(force?: boolean){
    setRand(prev=>{
      const keys = Object.keys(prev);
      const anyUnchecked = keys.some(k => !prev[k].en);
      const to = (typeof force === "boolean") ? force : anyUnchecked;
      const next: RandMap = {} as any;
      for (const k of keys) next[k] = { ...prev[k], en: to };
      return next;
    });
  }
  const RandRow = (key:string, label:string, unit:string, step=1, digits=0) => {
    const spec = rand[key];
    const set = (patch:Partial<RandSpec>) => setRand(prev=>({...prev, [key]:{...prev[key], ...patch}}));
    return (
      <div className="rand-row" key={key}>
        <input type="checkbox" checked={spec.en} onChange={e=>set({en:e.target.checked})}/>
        <span>{label}</span>
        <input type="number" step={step} value={spec.min.toFixed(digits)} onChange={e=>set({min:Number(e.target.value)})}/>
        <input type="number" step={step} value={spec.max.toFixed(digits)} onChange={e=>set({max:Number(e.target.value)})}/>
        <span style={{opacity:.7}}>{unit}</span>
      </div>
    );
  };
  const allSelected = Object.values(rand).every(s=>s.en);

  return (
    <div className="page">
      <div className="left">
        <div className="card">
          <h3>场景模板 / 环境</h3>
          <div className="row2">
            <label><span className="cap">模板<Tip text="欧 NCAP 纵向追尾工况：CCRs 静止、CCRm 低速、CCRb 前车刹车；或自定义"/></span>
              <select value={cfg.kind} onChange={e=>onChange({kind:e.target.value as CCRKind})}>
                <option>CCRs</option><option>CCRm</option><option>CCRb</option><option>Custom</option>
              </select>
            </label>
            <label><span className="cap">车辆数</span>
              <select value={cfg.cars} onChange={e=>onChange({cars:Number(e.target.value)})}>
                <option value={2}>2</option><option value={3}>3</option>
              </select>
            </label>
          </div>
          <div className="row3">
            <label><span className="cap">天气</span>
              <select value={cfg.weather} onChange={e=>onChange({weather:e.target.value as any})}>
                <option>clear</option><option>raining</option><option>snowing</option><option>fog</option>
              </select>
            </label>
            <label><span className="cap">光照</span>
              <select value={cfg.light} onChange={e=>onChange({light:e.target.value as any})}>
                <option>daylight</option><option>night</option>
              </select>
            </label>
            <label><span className="cap">坡度 (deg)</span>
              <input type="number" step={1} min={-8} max={8} value={cfg.grade_deg}
                onChange={e=>onChange({grade_deg:Number(e.target.value)})}/>
            </label>
          </div>
          <div className="row3">
            <label><span className="cap">恢复系数 e<Tip text="碰撞回弹系数：0=塑性，1=弹性"/></span>
              <input type="number" step="0.01" min="0.05" max="0.6" value={cfg.e}
                onChange={e=>onChange({e:Number(e.target.value)})}/>
            </label>
            <label><span className="cap">AEB 触发 TTC(s)</span>
              <input type="number" step="0.1" min="1.0" max="3.0" value={cfg.ttcTriggerS}
                onChange={e=>onChange({ttcTriggerS:Number(e.target.value)})}/>
            </label>
            <label><span className="cap">视图缩放</span>
              <div style={{display:"grid", gridTemplateColumns:"1fr 60px 60px", gap:6}}>
                <input type="range" min="0.5" max="2.5" step="0.1" value={cfg.zoom}
                  onChange={e=>onChange({zoom:Number(e.target.value)})}/>
                <button className="ghost" onClick={()=>onChange({zoom: clamp(cfg.zoom-0.1,0.5,2.5)})}>-</button>
                <button className="ghost" onClick={()=>onChange({zoom: clamp(cfg.zoom+0.1,0.5,2.5)})}>+</button>
              </div>
            </label>
          </div>
          <div className="row3">
            <label><span className="cap">FPS</span>
              <input type="number" step={1} min={5} max={60} value={cfg.fps}
                onChange={e=>onChange({fps: clamp(Number(e.target.value),5,60)})}/>
            </label>
            <label><span className="cap">时长 (s)</span>
              <input type="number" step={0.5} min={2} max={20} value={cfg.durationS}
                onChange={e=>onChange({durationS: clamp(Number(e.target.value),2,20)})}/>
            </label>
          </div>
          <div className="actions">
            <button className="primary" onClick={()=>setRunning(true)}>播放</button>
            <button onClick={()=>setRunning(false)}>暂停</button>
            <button onClick={()=>{ setRunning(false); reset(); }}>重置</button>
          </div>
        </div>

        <div className="card">
          <h3>初始条件</h3>
          <div className="row3">
            <label><span className="cap">自车初速 (km/h)</span>
              <input type="number" value={(cfg.vE0*3.6).toFixed(0)} onChange={e=>onChange({vE0: Number(e.target.value)/3.6})}/>
            </label>
            <label><span className="cap">前车初速 (km/h)</span>
              <input type="number" value={(cfg.vL10*3.6).toFixed(0)} onChange={e=>onChange({vL10: Number(e.target.value)/3.6})}/>
            </label>
            {cfg.cars>=3 && (
              <label><span className="cap">第二辆初速 (km/h)</span>
                <input type="number" value={(cfg.vL20*3.6).toFixed(0)} onChange={e=>onChange({vL20: Number(e.target.value)/3.6})}/>
              </label>
            )}
            <label><span className="cap">自车→前车间距 (m)</span>
              <input type="number" value={cfg.gap1} onChange={e=>onChange({gap1: Number(e.target.value)})}/>
            </label>
            {cfg.cars>=3 && (
              <label><span className="cap">前车→第二辆间距 (m)</span>
                <input type="number" value={cfg.gap2} onChange={e=>onChange({gap2: Number(e.target.value)})}/>
              </label>
            )}
            <label><span className="cap">前车制动 (m/s²)</span>
              <input type="number" step="0.1" value={cfg.leadDecel1} onChange={e=>onChange({leadDecel1: Number(e.target.value)})}/>
            </label>
          </div>
        </div>

        <div className="card">
          <h3>车辆参数</h3>
          <div className="row3">
            <label><span className="cap">自车质量 (kg)</span>
              <input type="number" value={cfg.mE} onChange={e=>onChange({mE: Number(e.target.value)})}/>
            </label>
            <label><span className="cap">前车质量 (kg)</span>
              <input type="number" value={cfg.m1} onChange={e=>onChange({m1: Number(e.target.value)})}/>
            </label>
            {cfg.cars>=3 && (
              <label><span className="cap">第二辆质量 (kg)</span>
                <input type="number" value={cfg.m2} onChange={e=>onChange({m2: Number(e.target.value)})}/>
              </label>
            )}
            <label><span className="cap">自车 CdA (m²)<Tip text="空气阻力系数×正投影面积"/></span>
              <input type="number" step="0.01" value={cfg.CdAE} onChange={e=>onChange({CdAE: Number(e.target.value)})}/>
            </label>
            <label><span className="cap">前车 CdA (m²)</span>
              <input type="number" step="0.01" value={cfg.CdA1} onChange={e=>onChange({CdA1: Number(e.target.value)})}/>
            </label>
            {cfg.cars>=3 && (
              <label><span className="cap">第二辆 CdA (m²)</span>
                <input type="number" step="0.01" value={cfg.CdA2} onChange={e=>onChange({CdA2: Number(e.target.value)})}/>
              </label>
            )}
            {/* 新增：车长（米），>=6.0 将绘制卡车 */}
            <label><span className="cap">自车 车长 (m)<Tip text="≥ 6.0 m 自动渲染为卡车外形（仅渲染，不影响质量/CdA）"/></span>
              <input type="number" step="0.1" min="2" max="18" value={cfg.lenE}
                onChange={e=>onChange({lenE: Number(e.target.value)})}/>
            </label>
            <label><span className="cap">前车 车长 (m)</span>
              <input type="number" step="0.1" min="2" max="18" value={cfg.len1}
                onChange={e=>onChange({len1: Number(e.target.value)})}/>
            </label>
            {cfg.cars>=3 && (
              <label><span className="cap">第二辆 车长 (m)</span>
                <input type="number" step="0.1" min="2" max="18" value={cfg.len2}
                  onChange={e=>onChange({len2: Number(e.target.value)})}/>
              </label>
            )}
          </div>
        </div>

        <div className="card">
          <h3>随机参数（勾选 + 设范围 → 点击生成）</h3>
          <div className="rand-head"><span></span><span>参数</span><span>最小</span><span>最大</span><span>单位</span></div>
          {RandRow("vE0_kph","自车初速","km/h", 1,0)}
          {RandRow("v1_0_kph","前车初速","km/h", 1,0)}
          {cfg.cars>=3 && RandRow("v2_0_kph","第二辆初速","km/h", 1,0)}
          {RandRow("gap1","自→前距离","m", 1,0)}
          {cfg.cars>=3 && RandRow("gap2","前→第二距离","m", 1,0)}
          {RandRow("mE","自车质量","kg", 10,0)}
          {RandRow("m1","前车质量","kg", 10,0)}
          {cfg.cars>=3 && RandRow("m2","第二辆质量","kg", 10,0)}
          {RandRow("CdAE","自车 CdA","m²", 0.01,2)}
          {RandRow("CdA1","前车 CdA","m²", 0.01,2)}
          {cfg.cars>=3 && RandRow("CdA2","第二辆 CdA","m²", 0.01,2)}
          {RandRow("e","恢复系数 e","", 0.01,2)}
          {RandRow("ttc","AEB 触发 TTC","s", 0.1,1)}
          {RandRow("leadDec","前车减速度","m/s²", 0.1,1)}
          {RandRow("grade","坡度","deg", 1,0)}
          <div className="actions" style={{marginTop:8}}>
            <button className="ghost" onClick={()=>toggleAllRandom()}>
              {Object.values(rand).every(s=>s.en) ? "取消全选" : "全选"}
            </button>
            <button onClick={randomizeOnce}>Randomize</button>
            <button className="primary" onClick={()=>setRunning(true)}>播放</button>
            <button onClick={()=>setRunning(false)}>暂停</button>
            <button onClick={()=>{ setRunning(false); reset(); }}>重置</button>
          </div>
        </div>
      </div>

      
      <div className="card">
        <div className="row">
          <div className="col">
            <label>路面</label>
            <select value={cfg.surface} onChange={e=>onChange({surface: e.target.value as any})}>
              <option value="asphalt">沥青</option>
              <option value="concrete">混凝土</option>
              <option value="gravel">碎石</option>
              <option value="ice">冰面</option>
            </select>
          </div>
          <div className="col">
            <label>水膜厚度 (mm)</label>
            <input type="number" step="0.1" value={cfg.waterFilm_mm}
              onChange={e=>onChange({waterFilm_mm: Number(e.target.value)})}/>
          </div>
          <div className="col">
            <label>胎压 (psi)</label>
            <input type="number" step="1" value={cfg.tirePressure_psi}
              onChange={e=>onChange({tirePressure_psi: Number(e.target.value)})}/>
          </div>
          <div className="col">
            <label>花纹深 (mm)</label>
            <input type="number" step="0.5" value={cfg.treadDepth_mm}
              onChange={e=>onChange({treadDepth_mm: Number(e.target.value)})}/>
          </div>
        </div>
        <div className="row">
          <div className="col">
            <label>气温 (°C)</label>
            <input type="number" step="1" value={cfg.airTempC}
              onChange={e=>onChange({airTempC: Number(e.target.value)})}/>
          </div>
          <div className="col">
            <label>海拔 (m)</label>
            <input type="number" step="50" value={cfg.altitude_m}
              onChange={e=>onChange({altitude_m: Number(e.target.value)})}/>
          </div>
          <div className="col">
            <label>顺/逆风 (m/s)</label>
            <input type="number" step="0.5" value={cfg.headwind_mps}
              onChange={e=>onChange({headwind_mps: Number(e.target.value)})}/>
          </div>
          <div className="col">
            <label>路面粗糙度 (0–1)</label>
            <input type="number" step="0.05" min="0" max="1" value={cfg.surfaceRoughness}
              onChange={e=>onChange({surfaceRoughness: Math.max(0, Math.min(1, Number(e.target.value)))})}/>
          </div>
        </div>
      </div>
<div className="card canvas-card">
        <div className="canvas-wrap">
          <canvas ref={canvasRef} width={1280} height={560}/>
        </div>
      </div>
    </div>
  );
}
