export type Weather = "clear" | "raining" | "snowing" | "fog";
export type Surface = "asphalt" | "concrete" | "gravel" | "ice";
export interface PhysParams {
  m: number; rho: number; CdA: number; Crr: number;
  grade: number; mu0: number; muSpeedDecay: number;
  jerk: number; aebTargetG: number;
  headwind_mps: number;
  waterFilm_mm: number;
  tirePressure_psi: number;
  treadDepth_mm: number;
}


function airDensity(airTempC:number, altitude_m:number){
  const T = airTempC + 273.15;
  const rho0 = 1.225;            // 15°C @ sea level
  const scaleH = 8500;
  const rhoAlt = rho0 * Math.exp(-altitude_m/scaleH);
  return rhoAlt * (288.15 / Math.max(200, T));
}

function hydroplaneSpeed_mps(psi:number){
  // V_hydro_mph ≈ 9 * sqrt(psi)
  return 0.44704 * 9 * Math.sqrt(Math.max(psi, 1));
}

function waterMuFactor(v:number, water_mm:number, psi:number, tread_mm:number){
  if (water_mm <= 0.1) return 1;
  const Vh = hydroplaneSpeed_mps(psi) * (1 + 0.03 * (tread_mm - 3));
  if (v <= 0.6*Vh) return 1;
  const over = (v - 0.6*Vh) / (0.8*Vh);
  const k = Math.min(1, Math.max(0, over)) * (water_mm/2.0);
  return Math.max(0.2, 1 - 0.8*k);
}
export function pickPhysParamsFromEnv(
  weather: Weather,
  surface: Surface = "asphalt",
  grade_deg = 0,
  mass_kg = 1500,
  CdA = 0.65,
  airTempC = 20,
  altitude_m = 0,
  surfaceRoughness = 0.3,
  headwind_mps = 0,
  waterFilm_mm = 0,
  tirePressure_psi = 35,
  treadDepth_mm = 6
): PhysParams {
  const baseMuBySurface: Record<Surface, number> = {
    asphalt: 0.85, concrete: 0.90, gravel: 0.65, ice: 0.20
  };
  let mu0 = baseMuBySurface[surface];
  if (weather === "raining") mu0 *= 0.70;
  else if (weather === "snowing") mu0 *= (surface==="ice" ? 1.0 : 0.35);
  else if (weather === "fog") mu0 *= 0.95;
  const CrrBaseBySurface: Record<Surface, number> = {
    asphalt: 0.012, concrete: 0.011, gravel: 0.028, ice: 0.010
  };
  let Crr = CrrBaseBySurface[surface] * (1 + 0.5*surfaceRoughness);
  if (weather === "raining") Crr *= 1.15;
  const muSpeedDecay =
    weather === "raining" ? 0.25 : 0.10;

  return {
    m: mass_kg, rho: 1.225, CdA,
    Crr, grade: grade_deg * Math.PI/180,
    mu0, muSpeedDecay,
    jerk: 80, aebTargetG: 0.95
  };
}

export function clamp(x:number, a:number, b:number){ return Math.max(a, Math.min(b, x)); }
export function kph2mps(k:number){ return k/3.6; }
export function mps2mph(v:number){ return v*2.23693629; }

export function stepLongitudinal(
  v:number, aCmdPrev:number, dt:number, p:PhysParams, brakeOn:boolean
){
  const g = 9.81;
  let muEff = clamp(p.mu0 * (1 - p.muSpeedDecay * (v/30)), 0.05, 1.1);
  muEff *= waterMuFactor(v, p.waterFilm_mm, p.tirePressure_psi, p.treadDepth_mm);
  const muEffClamped = clamp(muEff, 0.05, 1.1);
  const aMax  = muEffClamped * g;
  
  const aTarget = brakeOn ? -Math.min(p.aebTargetG*g, aMax) : 0;

  const aCmdNext =
    (aTarget > aCmdPrev)
      ? Math.min(aTarget, aCmdPrev + p.jerk*dt)
      : Math.max(aTarget, aCmdPrev - p.jerk*dt);

  const v_air  = Math.max(0, v + (p.headwind_mps||0));
  const drag   = 0.5 * p.rho * p.CdA * v_air*v_air / p.m;
  const roll   = p.Crr * g * Math.cos(p.grade);
  const gradeA = g * Math.sin(p.grade);
  const aRes   = -drag - roll - gradeA;

  const vNext = Math.max(0, v + (aCmdNext + aRes) * dt);
  return { vNext, aCmdNext, muEff: (typeof muEffClamped!=="undefined"? muEffClamped : muEff), aMax };
}
