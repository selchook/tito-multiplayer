"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { createSeededRandom, generateSeed } from "../lib/seededRandom";

const WORLD_W = 2400;
const VIEW_W = 800;
const H = 500;
const GRAVITY = 0.15;
const EXPLOSION_RADIUS = 35;
const MAX_HP = 100;
const DAMAGE = 35;
const NEAR_DAMAGE = 18;
const WIN_SCORE = 3;
const DESTROY_FRAMES = 55;

// Level 1 = flat/close (both visible in viewport), Level 5 = full rugged terrain
const LEVEL_PARAMS = [
  { ampScale: 0.15, minSep: 370, maxSep: 410 },  // L1: flat, ~390px apart → both in 800px view
  { ampScale: 0.40, minSep: 560, maxSep: 620 },  // L2
  { ampScale: 0.65, minSep: 840, maxSep: 980 },  // L3
  { ampScale: 0.82, minSep: 1100, maxSep: 1350 }, // L4
  { ampScale: 1.0,  minSep: 1600, maxSep: 1900 }, // L5: full terrain
];

// ─── SOUND ENGINE ───────────────────────────────────────────
const AC = typeof window !== "undefined" ? (window.AudioContext || window.webkitAudioContext) : null;
let actx = null;
function ctx() { if (!actx && AC) actx = new AC(); if (actx?.state === "suspended") actx.resume(); return actx; }

function sfxExplosion() { const c = ctx(); if (!c) return; const b = c.createBuffer(1, c.sampleRate * 0.6, c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) { const t = i / c.sampleRate; const e = Math.exp(-t * 6); d[i] = (Math.random() * 2 - 1) * e * 0.7 + Math.sin(t * 80 * Math.PI * 2) * e * 0.5 * Math.exp(-t * 10); } const s = c.createBufferSource(); s.buffer = b; const g = c.createGain(); g.gain.value = 0.45; s.connect(g).connect(c.destination); s.start(); }
function sfxDestroy() { const c = ctx(); if (!c) return; const b = c.createBuffer(1, c.sampleRate * 1.5, c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) { const t = i / c.sampleRate; d[i] = (Math.random() * 2 - 1) * Math.exp(-t * 3) * 0.6 + Math.sin(t * 50 * Math.PI * 2) * Math.exp(-t * 3) * 0.4 + (Math.random() * 2 - 1) * Math.exp(-(t - 0.2) * 4) * (t > 0.2 ? 0.5 : 0) + Math.sin(t * 30 * Math.PI * 2) * Math.exp(-(t - 0.5) * 5) * (t > 0.5 ? 0.3 : 0); } const s = c.createBufferSource(); s.buffer = b; const g = c.createGain(); g.gain.value = 0.6; s.connect(g).connect(c.destination); s.start(); setTimeout(() => { for (let k = 0; k < 4; k++) setTimeout(() => { if (!c) return; const o = c.createOscillator(); const gg = c.createGain(); o.type = "triangle"; o.frequency.value = 400 + Math.random() * 2000; gg.gain.setValueAtTime(0.08, c.currentTime); gg.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.15); o.connect(gg).connect(c.destination); o.start(); o.stop(c.currentTime + 0.15); }, k * 80); }, 200); }
function sfxFire() { 
  const c = ctx(); 
  if (!c) return; 
  const boom = c.createOscillator();
  const boomGain = c.createGain();
  boom.type = "sine";
  boom.frequency.setValueAtTime(60, c.currentTime);
  boom.frequency.exponentialRampToValueAtTime(30, c.currentTime + 0.15);
  boomGain.gain.setValueAtTime(0.8, c.currentTime);
  boomGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.4);
  boom.connect(boomGain).connect(c.destination);
  boom.start();
  boom.stop(c.currentTime + 0.4);
  const punch = c.createOscillator();
  const punchGain = c.createGain();
  punch.type = "triangle";
  punch.frequency.setValueAtTime(180, c.currentTime);
  punch.frequency.exponentialRampToValueAtTime(80, c.currentTime + 0.2);
  punchGain.gain.setValueAtTime(0.6, c.currentTime);
  punchGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.25);
  punch.connect(punchGain).connect(c.destination);
  punch.start();
  punch.stop(c.currentTime + 0.25);
  const crack = c.createOscillator();
  const crackGain = c.createGain();
  crack.type = "sawtooth";
  crack.frequency.setValueAtTime(800, c.currentTime);
  crack.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.08);
  crackGain.gain.setValueAtTime(0.5, c.currentTime);
  crackGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.1);
  crack.connect(crackGain).connect(c.destination);
  crack.start();
  crack.stop(c.currentTime + 0.1);
  const noiseBuffer = c.createBuffer(1, c.sampleRate * 0.3, c.sampleRate);
  const noiseData = noiseBuffer.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) {
    const t = i / c.sampleRate;
    const envelope = Math.exp(-t * 12);
    noiseData[i] = (Math.random() * 2 - 1) * envelope * 0.7;
  }
  const noiseSource = c.createBufferSource();
  noiseSource.buffer = noiseBuffer;
  const noiseGain = c.createGain();
  noiseGain.gain.value = 0.6;
  noiseSource.connect(noiseGain).connect(c.destination);
  noiseSource.start();
  setTimeout(() => {
    if (!c) return;
    const rumble = c.createOscillator();
    const rumbleGain = c.createGain();
    rumble.type = "sine";
    rumble.frequency.setValueAtTime(45, c.currentTime);
    rumble.frequency.exponentialRampToValueAtTime(25, c.currentTime + 0.5);
    rumbleGain.gain.setValueAtTime(0.3, c.currentTime);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.6);
    rumble.connect(rumbleGain).connect(c.destination);
    rumble.start();
    rumble.stop(c.currentTime + 0.6);
  }, 100);
  setTimeout(() => {
    if (!c) return;
    const ring = c.createOscillator();
    const ringGain = c.createGain();
    ring.type = "sine";
    ring.frequency.value = 1200;
    ringGain.gain.setValueAtTime(0.15, c.currentTime);
    ringGain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.4);
    ring.connect(ringGain).connect(c.destination);
    ring.start();
    ring.stop(c.currentTime + 0.4);
  }, 50);
}
function sfxTick(p) { const c = ctx(); if (!c) return; const o = c.createOscillator(); const g = c.createGain(); o.type = "sine"; o.frequency.value = 220 + p * 660; g.gain.setValueAtTime(0.07, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.06); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.06); }
function sfxOuch() { const c = ctx(); if (!c) return; const o = c.createOscillator(); const g = c.createGain(); o.type = "sine"; o.frequency.setValueAtTime(620, c.currentTime); o.frequency.exponentialRampToValueAtTime(150, c.currentTime + 0.45); g.gain.setValueAtTime(0.25, c.currentTime); g.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.5); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.5); setTimeout(() => { if (!c) return; const o2 = c.createOscillator(); const g2 = c.createGain(); o2.type = "sawtooth"; o2.frequency.setValueAtTime(300, c.currentTime); o2.frequency.exponentialRampToValueAtTime(160, c.currentTime + 0.3); g2.gain.setValueAtTime(0.12, c.currentTime); g2.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.35); o2.connect(g2).connect(c.destination); o2.start(); o2.stop(c.currentTime + 0.35); }, 90); }
function sfxSplash() { const c = ctx(); if (!c) return; const b = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) { const t = i / c.sampleRate; d[i] = (Math.random() * 2 - 1) * (t < 0.02 ? t / 0.02 : Math.exp(-(t - 0.02) * 5)) * 0.4; } const s = c.createBufferSource(); s.buffer = b; const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(3000, c.currentTime); f.frequency.exponentialRampToValueAtTime(400, c.currentTime + 0.5); const g = c.createGain(); g.gain.value = 0.5; s.connect(f).connect(g).connect(c.destination); s.start(); }
function sfxGlass() { const c = ctx(); if (!c) return; for (let k = 0; k < 6; k++) setTimeout(() => { if (!c) return; const o = c.createOscillator(); const g = c.createGain(); o.type = "square"; o.frequency.value = 2000 + Math.random() * 4000; g.gain.setValueAtTime(0.06, c.currentTime); g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.08); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.08); }, (k * 40 + Math.random() * 30)); }
function sfxHit() { const c = ctx(); if (!c) return; const o = c.createOscillator(); const g = c.createGain(); o.type = "triangle"; o.frequency.setValueAtTime(800, c.currentTime); o.frequency.exponentialRampToValueAtTime(200, c.currentTime + 0.2); g.gain.setValueAtTime(0.2, c.currentTime); g.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.25); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.25); }
function sfxFanfare() { const c = ctx(); if (!c) return; [523, 587, 659, 784, 659, 784, 1047].forEach((f, i) => { const delays = [0, 150, 300, 450, 750, 900, 1050]; setTimeout(() => { if (!c) return; const o = c.createOscillator(); const g = c.createGain(); o.type = i === 6 ? "sine" : "triangle"; o.frequency.value = f; g.gain.setValueAtTime(0.18, c.currentTime); g.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.35); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.35); }, delays[i]); }); }
function sfxRoundWin() { const c = ctx(); if (!c) return; [523, 659, 784].forEach((f, i) => setTimeout(() => { if (!c) return; const o = c.createOscillator(); const g = c.createGain(); o.type = "sine"; o.frequency.value = f; g.gain.setValueAtTime(0.12, c.currentTime); g.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.25); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.25); }, i * 120)); }
function sfxNextLevel() { const c = ctx(); if (!c) return; const o = c.createOscillator(); const g = c.createGain(); o.type = "sine"; o.frequency.setValueAtTime(400, c.currentTime); o.frequency.exponentialRampToValueAtTime(800, c.currentTime + 0.3); g.gain.setValueAtTime(0.1, c.currentTime); g.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.35); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + 0.35); }

// ─── TERRAIN (SEEDED) ──────────────────────────────────────
function genTerrain(rng, ampScale = 1) {
  const r = rng || Math.random;
  const pts = new Array(WORLD_W).fill(0), base = H * 0.45;
  const a1 = (80 + r() * 60) * ampScale, a2 = (40 + r() * 30) * ampScale, a3 = (15 + r() * 15) * ampScale;
  const f1 = 0.003 + r() * 0.004, f2 = 0.008 + r() * 0.006, f3 = 0.02 + r() * 0.015;
  const o = r() * 1000;
  for (let x = 0; x < WORLD_W; x++) pts[x] = base + Math.sin((x + o) * f1) * a1 + Math.sin((x + o) * f2) * a2 + Math.sin((x + o) * f3) * a3;
  return pts;
}

function createPlain(terrain, centerX, width = 50) {
  const halfWidth = Math.floor(width / 2);
  const startX = Math.max(0, centerX - halfWidth);
  const endX = Math.min(WORLD_W - 1, centerX + halfWidth);
  const avgY = terrain[centerX];
  for (let x = startX; x <= endX; x++) terrain[x] = avgY;
  return terrain;
}

function genEnvironment(terrain, rng) {
  const r = rng || Math.random;
  const objects = [];
  const treeCount = 30 + Math.floor(r() * 11);
  for (let i = 0; i < treeCount; i++) {
    const x = 100 + r() * (WORLD_W - 200);
    const y = terrain[Math.floor(x)];
    const size = 15 + r() * 20;
    const type = r() > 0.5 ? 'pine' : 'round';
    const hue = 100 + r() * 40;
    objects.push({ type: 'tree', x, y, size, treeType: type, hue });
  }
  return objects;
}

function tY(t, x) { return t[Math.floor(Math.max(0, Math.min(x, t.length - 1)))]; }
function tPath(t) { 
  const bottomY = H * 3;
  let d = `M 0 ${bottomY}`;
  d += ` L 0 ${t[0]}`;
  for (let x = 0; x < t.length; x += 2) d += ` L ${x} ${t[x]}`;
  d += ` L ${t.length} ${bottomY}`;
  return d + ` Z`;
}
function crater(terrain, cx, r) {
  const n = [...terrain];
  for (let x = Math.max(0, Math.floor(cx - r)); x < Math.min(terrain.length, Math.ceil(cx + r)); x++) {
    const dx = x - cx, md = Math.sqrt(Math.max(0, r * r - dx * dx));
    const bot = tY(terrain, cx) + md * 0.6;
    if (n[x] < bot) n[x] = Math.min(bot, 490);
  }
  return n;
}

const P1 = { main: "#06b6d4", accent: "#22d3ee", glow: "rgba(6,182,212,0.3)" };
const P2 = { main: "#f43f5e", accent: "#fb7185", glow: "rgba(244,63,94,0.3)" };

// ─── PRE-SIMULATE TRAJECTORY (deterministic, frame-rate independent) ────
// Runs the EXACT same physics loop as fly() but synchronously.
// Returns the authoritative impact point that both sides must use.
function simulateTrajectory(startProj, wind, terrain, tanks) {
  let pr = { x: startProj.x, y: startProj.y, vx: startProj.vx, vy: startProj.vy };
  for (let i = 0; i < 15000; i++) {
    pr.vx += wind;
    pr.vy += GRAVITY;
    pr.x += pr.vx;
    pr.y += pr.vy;
    // Out of bounds
    if (pr.x < -50 || pr.x > WORLD_W + 50 || pr.y > H + 50) {
      return { hit: false, x: pr.x, y: pr.y };
    }
    // Terrain collision
    const ty = tY(terrain, pr.x);
    if (pr.y >= ty) {
      // Determine which tank is destroyed (if any)
      let destroyedIdx = null;
      if (tanks) {
        for (let ti = 0; ti < tanks.length; ti++) {
          const dist = Math.sqrt((tanks[ti].x - pr.x) ** 2 + (tanks[ti].y - ty) ** 2);
          if (dist < EXPLOSION_RADIUS * 0.6) { destroyedIdx = ti; break; }
          else if (dist < EXPLOSION_RADIUS * 1.1) { destroyedIdx = ti; }
        }
      }
      return { hit: true, x: pr.x, y: ty, destroyedIdx };
    }
  }
  return { hit: false, x: pr.x, y: pr.y }; // safety fallback
}

const DEBRIS = Array.from({ length: 14 }, (_, i) => ({
  angle: (i * Math.PI * 2) / 14 + (Math.random() - 0.5) * 0.5,
  speed: 40 + Math.random() * 50,
  size: 3 + Math.random() * 5,
  rot: (Math.random() - 0.5) * 8,
  ci: i % 6,
}));

// ═══════════════════════════════════════════════════════════
export default function TitoGame({ isMultiplayer, myPlayer, seed: initialSeed, conn, peer, isHost, onDisconnect, myName: myNameProp }) {
  // ─── MULTIPLAYER STATE ────────────────────────────────────
  const [connected, setConnected] = useState(true);
  const myName = myNameProp || (myPlayer === 0 ? "P1" : "P2");
  const [opponentName, setOpponentName] = useState(null);
  const currentSeedRef = useRef(initialSeed);
  const connRef = useRef(conn);
  connRef.current = conn;

  // Exchange names on connect
  useEffect(() => {
    if (!isMultiplayer || !conn) return;
    // Send our name to peer
    try { conn.send({ type: "name", name: myName }); } catch (e) {}
  }, [isMultiplayer, conn, myName]);

  // Send message to peer
  const sendMsg = useCallback((data) => {
    try {
      if (connRef.current?.open) {
        connRef.current.send(data);
      }
    } catch (e) {
      console.error("Send error:", e);
    }
  }, []);

  // ─── CORE STATE ───────────────────────────────────────────
  const [terrain, setTerrain] = useState(() => {
    const rng = createSeededRandom(initialSeed);
    return genTerrain(rng);
  });
  const [envObjects, setEnvObjects] = useState(() => {
    const rng = createSeededRandom(initialSeed);
    const t = genTerrain(rng);
    return genEnvironment(t, rng);
  });
  const [p1, setP1] = useState({ x: 0, y: 0, angle: 60, power: 50, hp: MAX_HP });
  const [p2, setP2] = useState({ x: 0, y: 0, angle: 60, power: 50, hp: MAX_HP });
  const [p1Plain, setP1Plain] = useState({ minX: 0, maxX: 50 });
  const [p2Plain, setP2Plain] = useState({ minX: 2350, maxX: 2400 });
  const [turn, setTurn] = useState(0);
  const [scores, setScores] = useState([0, 0]);
  const [level, setLevel] = useState(1);
  const [wind, setWind] = useState(0);
  const [snd, setSnd] = useState(true);

  const [phase, setPhase] = useState("aiming");
  const [proj, setProj] = useState(null);
  const [trail, setTrail] = useState([]);
  const [boom, setBoom] = useState(null);
  const [killData, setKillData] = useState(null);
  const [transData, setTransData] = useState(null);
  const [matchWinner, setMatchWinner] = useState(null);
  const [msg, setMsg] = useState("PLAYER 1 — HOLD 🔥 TO CHARGE!");
  const [floats, setFloats] = useState([]);
  const [charging, setCharging] = useState(false);
  const [chargeProg, setChargeProg] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [viewportX, setViewportX] = useState(0);
  const [viewportY, setViewportY] = useState(0);
  const [cameraDragging, setCameraDragging] = useState(false);
  const [minimapDragging, setMinimapDragging] = useState(false);
  const [tankMoving, setTankMoving] = useState(0);
  const [firingEffect, setFiringEffect] = useState(null);
  const [cameraZoom, setCameraZoom] = useState(1);
  const [cameraIntro, setCameraIntro] = useState(null); // { myX, oppX, oppTankX, oppTankY }
  const [introArrow, setIntroArrow] = useState(null); // { x, y } | null

  const projRef = useRef(null);
  const animRef = useRef(null);
  const chargeRef = useRef(null);
  const chargeStart = useRef(0);
  const chargingRef = useRef(false);
  const svgRef = useRef(null);
  const dragSY = useRef(0);
  const dragSA = useRef(0);
  const cameraDragStartX = useRef(0);
  const cameraStartViewportX = useRef(0);
  const nextWindRef = useRef(null); // Pre-computed wind for next turn (multiplayer sync)
  const turnCounterRef = useRef(0); // Deterministic turn counter for wind seeds
  const impactRef = useRef(null); // Authoritative impact point (multiplayer sync)
  const S = useRef({});
  S.current = { terrain, p1, p2, turn, scores, level, wind, snd, phase, cameraZoom, envObjects, cameraIntro };
  chargingRef.current = charging;

  const [clouds] = useState(() => {
    const rng = createSeededRandom(initialSeed + 999);
    return Array.from({ length: 15 }, () => ({ x: rng() * WORLD_W, y: 20 + rng() * 60, s: 0.5 + rng() * 0.8 }));
  });

  // ─── MULTIPLAYER: IS IT MY TURN? ─────────────────────────
  const isMyTurn = !isMultiplayer || turn === myPlayer;

  // ─── HELPERS ──────────────────────────────────────────────
  const addFloat = useCallback((x, y, text, color) => {
    const id = Date.now() + Math.random();
    setFloats(f => [...f, { id, x, y, text, color }]);
    setTimeout(() => setFloats(f => f.filter(v => v.id !== id)), 1300);
  }, []);

  const getPowerMultiplier = useCallback(() => 0.245, []);

  // ─── GENERATE LEVEL STATE (pure function, returns data) ───
  const generateLevelState = useCallback((seed, lv = 1) => {
    const rng = createSeededRandom(seed);
    const lp = LEVEL_PARAMS[Math.min(lv - 1, LEVEL_PARAMS.length - 1)];
    let t = genTerrain(rng, lp.ampScale);
    const sep = lp.minSep + Math.floor(rng() * (lp.maxSep - lp.minSep));
    // Always center both tanks in the world — separation grows each level
    const x1 = Math.floor(WORLD_W / 2 - sep / 2);
    const x2 = Math.floor(WORLD_W / 2 + sep / 2);
    t = createPlain(t, x1, 80);
    t = createPlain(t, x2, 80);
    const env = genEnvironment(t, rng);
    const w = (rng() - 0.5) * 0.08;
    return {
      terrain: t,
      envObjects: env,
      p1: { x: x1, y: t[x1], angle: 60, power: 50, hp: MAX_HP },
      p2: { x: x2, y: t[x2], angle: 60, power: 50, hp: MAX_HP },
      p1Plain: { minX: x1 - 40, maxX: x1 + 40 },
      p2Plain: { minX: x2 - 40, maxX: x2 + 40 },
      wind: w,
      seed,
    };
  }, []);

  // ─── APPLY LEVEL STATE (sets all React state from data) ───
  const applyLevelState = useCallback((state, startingTurn = 0) => {
    setTerrain(state.terrain);
    setEnvObjects(state.envObjects);
    setP1(state.p1);
    setP2(state.p2);
    setP1Plain(state.p1Plain);
    setP2Plain(state.p2Plain);
    setWind(state.wind);
    setTurn(startingTurn);
    setPhase("aiming");
    setProj(null); setTrail([]); setBoom(null); setKillData(null); setTransData(null);
    setMsg(isMultiplayer ? (startingTurn === myPlayer ? "YOUR TURN — HOLD 🔥 TO CHARGE!" : "OPPONENT'S TURN — WAIT...") : `PLAYER ${startingTurn + 1} — HOLD 🔥 TO CHARGE!`);
    setFloats([]); setCharging(false); setChargeProg(0);
    setCameraZoom(1);
    setViewportY(0);
    turnCounterRef.current = 0;
    nextWindRef.current = null;
    impactRef.current = null;
    currentSeedRef.current = state.seed || 0;
    // Camera intro: hold at active player → pan to opponent → pan back
    const myTank = (!isMultiplayer || myPlayer === 0) ? state.p1 : state.p2;
    const oppTank = (!isMultiplayer || myPlayer === 0) ? state.p2 : state.p1;
    const myX = Math.max(0, Math.min(WORLD_W - VIEW_W, myTank.x - VIEW_W / 2));
    const oppX = Math.max(0, Math.min(WORLD_W - VIEW_W, oppTank.x - VIEW_W / 2));
    setViewportX(myX);
    setCameraIntro({ myX, oppX, oppTankX: oppTank.x, oppTankY: oppTank.y });
  }, [isMultiplayer, myPlayer]);

  // ─── SETUP + SYNC LEVEL ───────────────────────────────────
  // Host generates and sends full state to guest. Guest never generates terrain.
  const setupAndSyncLevel = useCallback((seed, msgType = "levelState", lv = 1, scores = null, startingTurn = 0) => {
    const state = generateLevelState(seed, lv);
    applyLevelState(state, startingTurn);
    // Host sends the actual terrain data to guest — no independent generation
    if (isMultiplayer && isHost) {
      sendMsg({ type: msgType, state, level: lv, startingTurn, ...(scores && { scores }) });
    }
  }, [generateLevelState, applyLevelState, isMultiplayer, isHost, sendMsg]);

  const startNewMatch = useCallback(() => {
    if (isMultiplayer && !isHost) {
      sendMsg({ type: "requestNewMatch" });
      return;
    }
    const newSeed = generateSeed();
    setScores([0, 0]); setLevel(1); setMatchWinner(null);
    setupAndSyncLevel(newSeed, "newMatch", 1);
  }, [setupAndSyncLevel, isMultiplayer, isHost, sendMsg]);

  // Init — host generates terrain, guest waits for host's levelState message
  useEffect(() => {
    if (!isMultiplayer || isHost) {
      setupAndSyncLevel(initialSeed, "levelState", 1);
    }
    // Guest: apply a temporary blank state, will be overwritten by levelState message
    if (isMultiplayer && !isHost) {
      const fallback = generateLevelState(initialSeed, 1);
      applyLevelState(fallback);
    }
  }, []);

  // ─── MULTIPLAYER: LISTEN FOR PEER MESSAGES ────────────────
  useEffect(() => {
    if (!isMultiplayer || !conn) return;

    const handleData = (data) => {
      switch (data.type) {
        case "name":
          // Opponent sent their name
          setOpponentName(data.name);
          // Reply with our name in case they connected after us
          try { connRef.current?.send({ type: "name", name: myName }); } catch (e) {}
          break;
        case "fire":
          // Remote player fired — use their EXACT projectile state
          handleRemoteFire(data);
          break;
        case "move":
          // Remote player moved their tank
          if (data.player === 0) {
            setP1(v => {
              const ter = S.current.terrain;
              return { ...v, x: data.x, y: ter[Math.floor(data.x)] };
            });
          } else {
            setP2(v => {
              const ter = S.current.terrain;
              return { ...v, x: data.x, y: ter[Math.floor(data.x)] };
            });
          }
          break;
        case "angle":
          if (data.player === 0) {
            setP1(v => ({ ...v, angle: data.angle }));
          } else {
            setP2(v => ({ ...v, angle: data.angle }));
          }
          break;
        case "levelState":
          // Host sent authoritative terrain + positions — apply directly
          setLevel(data.level ?? 1);
          if (data.scores) setScores(data.scores);
          applyLevelState(data.state, data.startingTurn ?? 0);
          break;
        case "newMatch":
          // Host started new match with full state
          setScores([0, 0]); setLevel(1); setMatchWinner(null);
          applyLevelState(data.state);
          break;
        case "requestNewMatch":
          // Guest requested new match — host generates terrain and sends full state
          if (isHost) {
            const newSeed = generateSeed();
            setScores([0, 0]); setLevel(1); setMatchWinner(null);
            setupAndSyncLevel(newSeed, "newMatch", 1);
          }
          break;
      }
    };

    conn.on("data", handleData);
    conn.on("close", () => {
      setConnected(false);
    });
    conn.on("error", () => {
      setConnected(false);
    });

    return () => {
      conn.off("data", handleData);
    };
  }, [isMultiplayer, conn, applyLevelState, setupAndSyncLevel]);

  // ─── REMOTE FIRE HANDLER ──────────────────────────────────
  // Uses the EXACT projectile state from the firing player — no local recomputation
  const handleRemoteFire = useCallback((data) => {
    const { turn: t, snd: sd } = S.current;
    const { proj: exactProj, angle, power, tankX, tankY, nextWind, impact } = data;

    // Sync the remote tank's position/angle/power exactly
    if (t === 0) setP1(v => ({ ...v, x: tankX, y: tankY, angle, power }));
    else setP2(v => ({ ...v, x: tankX, y: tankY, angle, power }));

    // Store authoritative data from firing player
    nextWindRef.current = nextWind;
    impactRef.current = impact; // { hit, x, y, destroyedIdx }

    // Use the exact projectile physics from the firing player
    const p = { x: exactProj.x, y: exactProj.y, vx: exactProj.vx, vy: exactProj.vy };

    const fr = t === 0;
    const rad = ((fr ? -angle : -(180 - angle)) * Math.PI) / 180;
    setFiringEffect({ tankIdx: t, frame: 0, barrelX: exactProj.x, barrelY: exactProj.y, angle: rad });
    projRef.current = { ...p };
    setProj(p); setTrail([]); setChargeProg(0);
    setPhase("flying");
    setMsg("💥 INCOMING!");
    if (sd) sfxFire();
  }, []);

  // ─── CAMERA CENTERING ON TURN START ──────────────────────
  useEffect(() => {
    if (phase === "aiming" && !charging) {
      const tank = turn === 0 ? p1 : p2;
      const targetX = Math.max(0, Math.min(WORLD_W - VIEW_W, tank.x - VIEW_W / 2));
      setViewportX(targetX);
      setViewportY(0);
      
      // Update message for multiplayer
      if (isMultiplayer) {
        if (turn === myPlayer) {
          setMsg("YOUR TURN — HOLD 🔥 TO CHARGE!");
        } else {
          setMsg("OPPONENT'S TURN — WAIT...");
        }
      }
    }
  }, [phase, turn, charging]);

  // ─── CAMERA INTRO PAN ─────────────────────────────────────
  // Sequence: hold on player 2s → pan to opp 1.3s → show arrow 1.5s → pan back 1.3s
  useEffect(() => {
    if (!cameraIntro) return;
    const { myX, oppX, oppTankX, oppTankY } = cameraIntro;
    const timers = [];
    let rAFId = null;
    const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    const pan = (fromV, toV, duration, onDone) => {
      const start = Date.now();
      const step = () => {
        const prog = Math.min(1, (Date.now() - start) / duration);
        setViewportX(Math.round(fromV + (toV - fromV) * easeInOut(prog)));
        if (prog < 1) { rAFId = requestAnimationFrame(step); }
        else onDone();
      };
      rAFId = requestAnimationFrame(step);
    };

    // Phase 1: hold on active player for 1s
    timers.push(setTimeout(() => {
      // Phase 2: pan to opponent in 1.3s
      pan(myX, oppX, 1300, () => {
        // Phase 3: show arrow for 1.5s
        setIntroArrow({ x: oppTankX, y: oppTankY });
        timers.push(setTimeout(() => {
          setIntroArrow(null);
          // Phase 4: pan back to player in 1.3s
          pan(oppX, myX, 1300, () => setCameraIntro(null));
        }, 1500));
      });
    }, 1000));

    return () => {
      timers.forEach(clearTimeout);
      if (rAFId) cancelAnimationFrame(rAFId);
      setIntroArrow(null);
    };
  }, [cameraIntro]);

  // ─── FIRING EFFECT ANIMATION ──────────────────────────────
  useEffect(() => {
    if (!firingEffect || firingEffect.frame > 0) return;
    let f = 0;
    const ani = () => {
      f++;
      setFiringEffect(prev => prev ? { ...prev, frame: f } : null);
      if (f < 15) requestAnimationFrame(ani);
      else setFiringEffect(null);
    };
    requestAnimationFrame(ani);
  }, [firingEffect ? `${firingEffect.tankIdx}-fire` : null]);

  const startCharge = useCallback(() => {
    if (phase !== "aiming" || chargingRef.current) return;
    if (isMultiplayer && !isMyTurn) return;
    ctx();
    setCharging(true); setChargeProg(0);
    chargeStart.current = Date.now();
    let lastTick = 0;
    const tick = () => {
      if (!chargingRef.current) return;
      const el = Date.now() - chargeStart.current;
      const p = Math.min(1, el / 2000);
      setChargeProg(p);
      const tn = Math.floor(p * 15);
      if (tn > lastTick && S.current.snd) { sfxTick(p); lastTick = tn; }
      if (p < 1) chargeRef.current = requestAnimationFrame(tick);
    };
    chargeRef.current = requestAnimationFrame(tick);
  }, [phase, isMultiplayer, isMyTurn]);

  const releaseCharge = useCallback(() => {
    if (!chargingRef.current) return;
    if (chargeRef.current) cancelAnimationFrame(chargeRef.current);
    setCharging(false);

    const power = Math.max(10, Math.min(100, Math.floor(((Date.now() - chargeStart.current) / 2000) * 100)));
    const { turn: t, p1: a, p2: b, snd: sd, terrain: ter, wind: w } = S.current;
    const tank = t === 0 ? a : b;
    const fr = t === 0;
    const rad = ((fr ? -tank.angle : -(180 - tank.angle)) * Math.PI) / 180;
    const powerMultiplier = getPowerMultiplier();
    const spd = power * powerMultiplier;
    const barrelX = tank.x + Math.cos(rad) * 24;
    const barrelY = tank.y - 13 + Math.sin(rad) * 24;
    const p = {
      x: barrelX, y: barrelY,
      vx: Math.cos(rad) * spd, vy: Math.sin(rad) * spd,
    };

    // Pre-compute the next wind value deterministically
    turnCounterRef.current++;
    const windSeed = currentSeedRef.current + turnCounterRef.current * 7919;
    const nextWind = (createSeededRandom(windSeed)() - 0.5) * 0.08;
    nextWindRef.current = nextWind;

    // ═══ PRE-SIMULATE: find authoritative impact point ═══
    const impact = simulateTrajectory(p, w, ter, [a, b]);
    impactRef.current = impact;

    setFiringEffect({ tankIdx: t, frame: 0, barrelX, barrelY, angle: rad });
    if (t === 0) setP1(v => ({ ...v, power })); else setP2(v => ({ ...v, power }));
    projRef.current = { ...p };
    setProj(p); setTrail([]); setChargeProg(0);
    setPhase("flying");
    setMsg("💥 INCOMING!");
    if (sd) sfxFire();

    // Send EXACT projectile state + authoritative impact + next wind to peer
    if (isMultiplayer) {
      sendMsg({
        type: "fire",
        proj: { x: p.x, y: p.y, vx: p.vx, vy: p.vy },
        angle: tank.angle,
        power,
        tankX: tank.x,
        tankY: tank.y,
        nextWind,
        impact, // authoritative landing point
      });
    }
  }, [isMultiplayer, sendMsg]);

  // ─── PROJECTILE FLIGHT ────────────────────────────────────
  // Animation runs per-frame (visual), but game logic uses authoritative impact.
  useEffect(() => {
    if (phase !== "flying" || !projRef.current) return;
    let pr = { ...projRef.current };
    let pts = [], fc = 0;

    const fly = () => {
      const { terrain: ter, p1: a, p2: b, turn: t, wind: w, snd: sd } = S.current;
      pr.vx += w; pr.vy += GRAVITY; pr.x += pr.vx; pr.y += pr.vy; fc++;
      if (fc % 3 === 0) { pts = [...pts, { x: pr.x, y: pr.y }].slice(-30); setTrail([...pts]); }
      projRef.current = { ...pr };
      setProj({ ...pr });

      // ═══ CAMERA ZOOM ═══
      const terrainY = tY(ter, pr.x);
      const heightAboveTerrain = terrainY - pr.y;
      const distanceToGround = Math.max(0, heightAboveTerrain);
      let targetZoom;
      if (fc < 30) targetZoom = 1 + (fc / 30);
      else if (distanceToGround < 150) targetZoom = 1 + (distanceToGround / 150);
      else targetZoom = 2;
      setCameraZoom(targetZoom);
      const effectiveViewWidth = VIEW_W * targetZoom;
      setViewportX(Math.max(0, Math.min(WORLD_W - effectiveViewWidth, pr.x - effectiveViewWidth / 2)));
      setViewportY(-80);

      // ═══ RESOLVE: use authoritative impact if available ═══
      const auth = impactRef.current; // pre-simulated impact from firing player

      // Determine if the visual projectile should resolve this frame
      let shouldResolveOOB = false;
      let shouldResolveTerrain = false;

      if (auth) {
        // MULTIPLAYER or LOCAL with pre-sim: use authoritative result
        if (auth.hit) {
          // Resolve when visual projectile physically hits terrain (min 3 frames so it's always visible)
          if (fc > 3 && pr.y >= tY(ter, pr.x)) {
            shouldResolveTerrain = true;
          }
        } else {
          // Auth says OOB
          if (pr.x < -50 || pr.x > WORLD_W + 50 || pr.y > H + 50) {
            shouldResolveOOB = true;
          }
        }
      } else {
        // No auth data (shouldn't happen but safety fallback)
        if (pr.x < -50 || pr.x > WORLD_W + 50 || pr.y > H + 50) shouldResolveOOB = true;
        else if (pr.y >= tY(ter, pr.x)) shouldResolveTerrain = true;
      }

      // ═══ HANDLE MISS (OOB) ═══
      if (shouldResolveOOB) {
        setProj(null); setTrail([]);
        setViewportY(0); setCameraZoom(1);
        impactRef.current = null;
        if (sd) [sfxSplash, sfxOuch, sfxGlass][Math.floor(Math.random() * 3)]();
        addFloat(Math.max(40, Math.min(WORLD_W - 40, pr.x)), 100,
          ["MISS!", "WHOOSH!", "OUCHHHH!", "💨", "NOPE!"][Math.floor(Math.random() * 5)], "#f59e0b");
        const nextTank = t === 0 ? S.current.p2 : S.current.p1;
        setViewportX(Math.max(0, Math.min(WORLD_W - VIEW_W, nextTank.x - VIEW_W / 2)));

        // Apply pre-computed wind
        if (nextWindRef.current !== null) {
          setWind(nextWindRef.current);
          nextWindRef.current = null;
        } else {
          turnCounterRef.current++;
          const windSeed = currentSeedRef.current + turnCounterRef.current * 7919;
          setWind((createSeededRandom(windSeed)() - 0.5) * 0.08);
        }

        setTurn(1 - t); setPhase("aiming");
        if (isMultiplayer) {
          setMsg(1 - t === myPlayer ? "YOUR TURN — HOLD 🔥 TO CHARGE!" : "OPPONENT'S TURN — WAIT...");
        } else {
          setMsg(`Missed! P${t === 0 ? "2" : "1"}'s turn`);
        }
        return;
      }

      // ═══ HANDLE TERRAIN HIT ═══
      if (shouldResolveTerrain) {
        // Use AUTHORITATIVE impact coordinates — identical on both sides
        const impX = auth ? auth.x : pr.x;
        const impY = auth ? auth.y : tY(ter, pr.x);

        setProj(null);
        setViewportY(0); setCameraZoom(1);
        setPhase("impact");
        setBoom({ x: impX, y: impY, frame: 0 });
        if (sd) sfxExplosion();

        // Crater at authoritative position
        const newT = crater(ter, impX, EXPLOSION_RADIUS);
        setTerrain(newT);

        // Tree destruction at authoritative position
        const treesBeforeExplosion = S.current.envObjects || [];
        const treesAfterExplosion = treesBeforeExplosion.filter(obj => {
          if (obj.type !== 'tree') return true;
          const dist = Math.sqrt((obj.x - impX) ** 2 + (obj.y - impY) ** 2);
          return dist > EXPLOSION_RADIUS * 1.2;
        });
        if (treesAfterExplosion.length < treesBeforeExplosion.length) setEnvObjects(treesAfterExplosion);

        // ═══ DAMAGE CHECK at authoritative position ═══
        let hitAny = false;
        let destroyedIdx = auth ? auth.destroyedIdx : null;

        // If no auth data, compute locally (single-player fallback)
        if (!auth) {
          const tanks = [a, b];
          tanks.forEach((tk, i) => {
            const dist = Math.sqrt((tk.x - impX) ** 2 + (tk.y - impY) ** 2);
            if (dist < EXPLOSION_RADIUS * 0.6 || dist < EXPLOSION_RADIUS * 1.1) {
              hitAny = true;
              destroyedIdx = i;
            }
          });
        } else {
          hitAny = destroyedIdx !== null;
        }

        const tanks = [a, b];
        const newTanks = tanks.map((tk, i) => {
          if (i === destroyedIdx) {
            if (i === t) addFloat(tk.x, tk.y - 30, `💀 SELF-DESTRUCT!`, "#ef4444");
            else addFloat(tk.x, tk.y - 30, `💀 DESTROYED!`, "#ef4444");
            if (sd) { sfxHit(); sfxOuch(); }
            return { ...tk, y: newT[Math.floor(tk.x)], hp: 0 };
          }
          return { ...tk, y: newT[Math.floor(tk.x)] };
        });

        setP1(newTanks[0]); setP2(newTanks[1]);
        impactRef.current = null;

        if (destroyedIdx !== null) {
          const deadIdx = destroyedIdx;
          const winner = 1 - deadIdx;
          const deadTank = newTanks[deadIdx];
          const isSelfHit = deadIdx === t;
          setMsg(isSelfHit ? `💀 P${deadIdx + 1} SELF-DESTRUCTED!` : `💀 P${deadIdx + 1} DESTROYED!`);
          setKillData({ deadIdx, winner, x: deadTank.x, y: deadTank.y, frame: 0 });
        } else {
          if (!hitAny) {
            if (sd) [sfxSplash, sfxGlass][Math.floor(Math.random() * 2)]();
            addFloat(impX, impY - 20, "BOOM!", "#f59e0b");
          }

          // Apply pre-computed wind
          if (nextWindRef.current !== null) {
            setWind(nextWindRef.current);
            nextWindRef.current = null;
          } else {
            turnCounterRef.current++;
            const windSeed = currentSeedRef.current + turnCounterRef.current * 7919;
            setWind((createSeededRandom(windSeed)() - 0.5) * 0.08);
          }

          if (isMultiplayer) {
            setMsg(1 - t === myPlayer ? "YOUR TURN — HOLD 🔥 TO CHARGE!" : "OPPONENT'S TURN — WAIT...");
          } else {
            setMsg(hitAny ? `💥 HIT! P${t === 0 ? "2" : "1"}'s turn` : `BOOM! P${t === 0 ? "2" : "1"}'s turn`);
          }

          const nextTank = newTanks[1 - t];
          setTimeout(() => {
            setViewportX(Math.max(0, Math.min(WORLD_W - VIEW_W, nextTank.x - VIEW_W / 2)));
          }, 500);

          setTurn(1 - t);
        }
        return;
      }

      animRef.current = requestAnimationFrame(fly);
    };
    animRef.current = requestAnimationFrame(fly);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [phase === "flying" ? 1 : 0]);

  // ─── BOOM ANIMATION ───────────────────────────────────────
  useEffect(() => {
    if (!boom) return;
    let f = 0;
    const ani = () => {
      f++;
      setBoom(b => b ? { ...b, frame: f } : null);
      if (f < 30) {
        requestAnimationFrame(ani);
      } else {
        setBoom(null); setTrail([]);
        if (!S.current.phase || S.current.phase === "impact") {
          setTimeout(() => setPhase(prev => prev === "impact" ? "aiming" : prev), 50);
        }
      }
    };
    requestAnimationFrame(ani);
  }, [boom ? 1 : 0]);

  // ─── KILL → DESTROY ANIMATION ─────────────────────────────
  useEffect(() => {
    if (!killData || killData.frame > 0) return;
    setPhase("destroying");
    if (S.current.snd) sfxDestroy();

    let f = 0;
    const ani = () => {
      f++;
      setKillData(k => k ? { ...k, frame: f } : null);
      if (f < DESTROY_FRAMES) {
        requestAnimationFrame(ani);
      } else {
        const { scores: sc, snd: sd, level: lv } = S.current;
        const winner = killData.winner;
        const ns = [...sc]; ns[winner]++;
        setScores(ns);

        if (ns[winner] >= WIN_SCORE) {
          setMatchWinner(winner);
          setPhase("celebration");
          if (sd) sfxFanfare();
        } else {
          if (sd) sfxRoundWin();
          setTransData({ winner, level: lv + 1, frame: 0 });
          setPhase("transition");
        }
      }
    };
    requestAnimationFrame(ani);
  }, [killData ? `${killData.deadIdx}-start` : null]);

  // ─── TRANSITION ANIMATION ─────────────────────────────────
  useEffect(() => {
    if (phase !== "transition" || !transData) return;
    let f = 0;
    const ani = () => {
      f++;
      setTransData(t => t ? { ...t, frame: f } : null);
      if (f < 120) {
        requestAnimationFrame(ani);
      } else {
        if (S.current.snd) sfxNextLevel();
        if (!isMultiplayer || isHost) {
          // Host or single-player: generate new level + send terrain to guest
          const newSeed = generateSeed();
          const nextLv = S.current.level + 1;
          const currentScores = S.current.scores;
          const winner = transData?.winner ?? 0;
          setLevel(nextLv);
          setupAndSyncLevel(newSeed, "levelState", nextLv, currentScores, winner);
        }
        // Multiplayer GUEST: do nothing, wait for "levelState" from host
      }
    };
    requestAnimationFrame(ani);
  }, [phase === "transition" ? 1 : 0, setupAndSyncLevel]);

  // ─── BARREL & CAMERA DRAG ─────────────────────────────────
  const handleSvgDown = useCallback((e) => {
    if (phase !== "aiming" || chargingRef.current || S.current.cameraIntro) return;
    const rect = svgRef.current?.getBoundingClientRect(); if (!rect) return;
    const mx = (e.clientX - rect.left) * (VIEW_W / rect.width) + viewportX;
    const my = (e.clientY - rect.top) * (H / rect.height);
    const tk = S.current.turn === 0 ? S.current.p1 : S.current.p2;

    if (Math.sqrt((mx - tk.x) ** 2 + (my - tk.y) ** 2) < 65) {
      if (isMultiplayer && !isMyTurn) return; // Can't drag opponent's barrel
      setDragging(true);
      dragSY.current = e.clientY;
      dragSA.current = tk.angle;
      e.preventDefault();
    } else {
      setCameraDragging(true);
      cameraDragStartX.current = e.clientX;
      cameraStartViewportX.current = viewportX;
      e.preventDefault();
    }
  }, [phase, viewportX, isMultiplayer, isMyTurn]);

  useEffect(() => {
    const onMove = (e) => {
      if (dragging) {
        const dy = dragSY.current - e.clientY;
        const newA = Math.round(Math.max(5, Math.min(90, dragSA.current + dy * 0.5)));
        const { turn: t } = S.current;
        if (t === 0) setP1(v => ({ ...v, angle: newA }));
        else setP2(v => ({ ...v, angle: newA }));
        if (isMultiplayer) sendMsg({ type: "angle", player: t, angle: newA });
      } else if (cameraDragging) {
        const dx = cameraDragStartX.current - e.clientX;
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect) {
          const worldDx = dx * (VIEW_W / rect.width);
          const newViewportX = Math.max(0, Math.min(WORLD_W - VIEW_W, cameraStartViewportX.current + worldDx));
          setViewportX(newViewportX);
        }
      }
    };
    const onUp = () => { setDragging(false); setCameraDragging(false); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
  }, [dragging, cameraDragging, isMultiplayer, sendMsg]);

  const nudgeAngle = (d) => {
    if (phase !== "aiming") return;
    if (isMultiplayer && !isMyTurn) return;
    const { turn: t } = S.current;
    if (t === 0) setP1(v => {
      const newA = Math.max(5, Math.min(90, v.angle + d));
      if (isMultiplayer) sendMsg({ type: "angle", player: 0, angle: newA });
      return { ...v, angle: newA };
    });
    else setP2(v => {
      const newA = Math.max(5, Math.min(90, v.angle + d));
      if (isMultiplayer) sendMsg({ type: "angle", player: 1, angle: newA });
      return { ...v, angle: newA };
    });
  };

  const moveTank = (direction) => {
    if (phase !== "aiming") return;
    if (isMultiplayer && !isMyTurn) return;
    const { turn: t, terrain: ter } = S.current;
    const moveDistance = 2;
    if (t === 0) {
      setP1(v => {
        const newX = Math.max(p1Plain.minX, Math.min(p1Plain.maxX, v.x + direction * moveDistance));
        if (isMultiplayer) sendMsg({ type: "move", player: 0, x: newX });
        return { ...v, x: newX, y: ter[Math.floor(newX)] };
      });
    } else {
      setP2(v => {
        const newX = Math.max(p2Plain.minX, Math.min(p2Plain.maxX, v.x + direction * moveDistance));
        if (isMultiplayer) sendMsg({ type: "move", player: 1, x: newX });
        return { ...v, x: newX, y: ter[Math.floor(newX)] };
      });
    }
  };

  useEffect(() => {
    if (tankMoving === 0) return;
    const interval = setInterval(() => moveTank(tankMoving), 50);
    return () => clearInterval(interval);
  }, [tankMoving, phase, p1Plain, p2Plain]);

  useEffect(() => {
    if (phase !== "aiming") setTankMoving(0);
  }, [phase]);

  // ─── KEYBOARD CONTROLS ────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      if (phase !== "aiming") return;
      if (e.key === "ArrowLeft") { setViewportX(v => Math.max(0, v - 50)); e.preventDefault(); }
      else if (e.key === "ArrowRight") { setViewportX(v => Math.min(WORLD_W - VIEW_W, v + 50)); e.preventDefault(); }
      else if (e.key === "Home") {
        const tank = turn === 0 ? p1 : p2;
        setViewportX(Math.max(0, Math.min(WORLD_W - VIEW_W, tank.x - VIEW_W / 2)));
        e.preventDefault();
      } else if (e.key === "End") {
        const oppTank = turn === 0 ? p2 : p1;
        setViewportX(Math.max(0, Math.min(WORLD_W - VIEW_W, oppTank.x - VIEW_W / 2)));
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, turn, p1, p2]);

  // ─── RENDER HELPERS ───────────────────────────────────────
  const tank = turn === 0 ? p1 : p2;
  const aC = turn === 0 ? P1 : P2;
  const chgColor = chargeProg < 0.33 ? "#ef4444" : chargeProg < 0.66 ? "#f59e0b" : "#22c55e";
  const chgPow = Math.max(10, Math.min(100, Math.floor(chargeProg * 100)));
  const canAct = phase === "aiming" && matchWinner === null && (!isMultiplayer || isMyTurn) && !cameraIntro;
  const dColors = killData ? (killData.deadIdx === 0 ? [P1.main, P1.accent] : [P2.main, P2.accent]) : ["#fff", "#fff"];

  // Player labels for multiplayer
  const oppDisplay = opponentName || (myPlayer === 0 ? "P2" : "P1");
  const p1Name = isMultiplayer ? (myPlayer === 0 ? myName : oppDisplay) : "P1";
  const p2Name = isMultiplayer ? (myPlayer === 1 ? myName : oppDisplay) : "P2";

  // Wind display helpers
  const windPct = Math.abs(wind) / 0.04;
  const windColor = windPct < 0.05 ? "#475569" : "#06b6d4";

  // View buttons — ME/OPP labels and colors
  const myBtnLabel  = isMultiplayer ? (myPlayer === 0 ? "P1" : "P2") : (turn === 0 ? "P1" : "P2");
  const oppBtnLabel = isMultiplayer ? (myPlayer === 0 ? "P2" : "P1") : (turn === 0 ? "P2" : "P1");
  const myBtnColor  = myPlayer === 0 ? P1.accent : P2.accent;
  const oppBtnColor = myPlayer === 0 ? P2.accent : P1.accent;
  const oppBtnName  = isMultiplayer ? oppDisplay.slice(0, 7) : oppBtnLabel;


  return (
    <div style={{ background: "#0a0a1a", minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", fontFamily: "'JetBrains Mono','SF Mono',monospace", color: "#e2e8f0", userSelect: "none", touchAction: "none" }}>
      
      {/* MULTIPLAYER CONNECTION STATUS BAR */}
      {isMultiplayer && (
        <div style={{ width: "100%", maxWidth: 820, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 12px", boxSizing: "border-box", background: connected ? "rgba(34,197,94,0.1)" : "rgba(239,68,68,0.1)", borderBottom: `1px solid ${connected ? "#166534" : "#991b1b"}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: connected ? "#22c55e" : "#ef4444" }} />
            <span style={{ fontSize: 10, color: connected ? "#22c55e" : "#ef4444" }}>
              {connected ? "CONNECTED" : "DISCONNECTED"}
            </span>
          </div>
          <span style={{ fontSize: 10, color: "#64748b" }}>
            YOU: <span style={{ color: myPlayer === 0 ? P1.accent : P2.accent, fontWeight: 700 }}>{myName}</span>
          </span>
          <button onClick={onDisconnect} style={{ fontSize: 9, color: "#64748b", background: "none", border: "1px solid #334155", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontFamily: "monospace" }}>
            EXIT
          </button>
        </div>
      )}

      {/* HEADER — mobile-friendly stacked layout */}
      <div style={{ width: "100%", maxWidth: 820, padding: "6px 12px", boxSizing: "border-box" }}>
        {/* Top row: title + sound */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: 3, background: "linear-gradient(135deg,#06b6d4,#f43f5e)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", whiteSpace: "nowrap" }}>TITO'NUN TANKI</div>
            <span style={{ fontSize: 9, color: "#475569", whiteSpace: "nowrap" }}>LVL {level}</span>
          </div>
          <button onClick={() => setSnd(s => !s)} style={{ background: "none", border: "1px solid #334155", borderRadius: 6, padding: "3px 8px", color: snd ? "#22d3ee" : "#475569", cursor: "pointer", fontSize: 14, flexShrink: 0 }}>{snd ? "🔊" : "🔇"}</button>
        </div>

        {/* Scoreboard row: P1 score | vs | P2 score — full width */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, background: "rgba(15,23,42,0.6)", borderRadius: 8, padding: "6px 8px", border: "1px solid #1e293b" }}>
          {/* P1 side */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-end" }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 1 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: P1.accent, maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{p1Name}</span>
              {isMultiplayer && myPlayer === 0 && <span style={{ fontSize: 7, color: P1.main, letterSpacing: 1 }}>YOU</span>}
            </div>
            <div style={{ fontSize: 20, fontWeight: 900, color: P1.accent, minWidth: 20, textAlign: "center" }}>{scores[0]}</div>
            <div style={{ display: "flex", gap: 2 }}>{Array.from({ length: WIN_SCORE }, (_, i) => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: i < scores[0] ? P1.accent : "#1e293b", border: `1px solid ${i < scores[0] ? P1.main : "#334155"}`, flexShrink: 0 }} />)}</div>
          </div>

          {/* Divider */}
          <div style={{ padding: "0 8px", fontSize: 10, color: "#475569", fontWeight: 700 }}>VS</div>

          {/* P2 side */}
          <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 5, justifyContent: "flex-start" }}>
            <div style={{ display: "flex", gap: 2 }}>{Array.from({ length: WIN_SCORE }, (_, i) => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: i < scores[1] ? P2.accent : "#1e293b", border: `1px solid ${i < scores[1] ? P2.main : "#334155"}`, flexShrink: 0 }} />)}</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: P2.accent, minWidth: 20, textAlign: "center" }}>{scores[1]}</div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1 }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: P2.accent, maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>{p2Name}</span>
              {isMultiplayer && myPlayer === 1 && <span style={{ fontSize: 7, color: P2.main, letterSpacing: 1 }}>YOU</span>}
            </div>
          </div>
        </div>
      </div>

      {/* WIND BAR */}
      <div style={{ width: "100%", maxWidth: 820, display: "flex", alignItems: "center", gap: 8, padding: "5px 12px", boxSizing: "border-box", background: "rgba(10,10,26,0.95)", borderTop: "1px solid #1e293b" }}>
        <span style={{ fontSize: 9, color: "#64748b", letterSpacing: 2, whiteSpace: "nowrap" }}>WIND</span>
        <div style={{ flex: 1, position: "relative", height: 10, background: "#0f172a", borderRadius: 5, border: "1px solid #1e293b", overflow: "hidden" }}>
          <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#334155" }} />
          {windPct >= 0.05 && (
            <div style={{
              position: "absolute", top: 2, bottom: 2, borderRadius: 3,
              width: `${windPct * 50}%`,
              background: windColor,
              boxShadow: `0 0 6px ${windColor}88`,
              ...(wind > 0 ? { left: "50%" } : { right: "50%" }),
            }} />
          )}
        </div>
        <span style={{ fontSize: 20, lineHeight: 1, color: windColor, width: 20, textAlign: "center" }}>
          {windPct < 0.05 ? "·" : wind > 0 ? "▶" : "◀"}
        </span>
        <span style={{ fontSize: 11, fontWeight: 800, color: windColor, minWidth: 38, textAlign: "right", fontFamily: "monospace" }}>
          {windPct < 0.05 ? "CALM" : `${Math.round(windPct * 100)}%`}
        </span>
      </div>

      <div style={{ width: "100%", maxWidth: 820, textAlign: "center", padding: "5px 0", fontSize: 12, fontWeight: 700, letterSpacing: 2, color: aC.accent, background: `linear-gradient(90deg,transparent,${aC.glow},transparent)` }}>{msg}</div>

      {/* SVG CANVAS */}
      <div style={{ border: "1px solid #1e293b", borderRadius: 8, overflow: "hidden", marginTop: 4, maxWidth: "100%" }}>
        <svg ref={svgRef} width={VIEW_W} height={H} viewBox={`${viewportX} ${viewportY} ${VIEW_W * cameraZoom} ${H * cameraZoom}`} onPointerDown={handleSvgDown}
          style={{ display: "block", background: "linear-gradient(180deg,#0f172a 0%,#1e1b4b 40%,#312e81 70%,#1e1b4b 100%)", touchAction: "none", maxWidth: "100%", height: "auto" }}>
          <defs>
            <linearGradient id="tG" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#065f46" /><stop offset="40%" stopColor="#064e3b" /><stop offset="100%" stopColor="#1a1a2e" /></linearGradient>
            <filter id="glow"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>

          {[...Array(120)].map((_, i) => <circle key={i} cx={(i * 137.5) % WORLD_W} cy={(i * 73.3) % (H * 0.4)} r={i % 5 === 0 ? 1.5 : 0.8} fill="#fff" opacity={0.2 + (i % 5) * 0.08} />)}
          {clouds.map((c, i) => <g key={i} transform={`translate(${c.x},${c.y}) scale(${c.s})`} opacity="0.07"><ellipse cx="0" cy="0" rx="40" ry="15" fill="#fff" /><ellipse cx="-20" cy="5" rx="25" ry="12" fill="#fff" /><ellipse cx="20" cy="3" rx="30" ry="13" fill="#fff" /></g>)}

<path d={tPath(terrain)} fill="url(#tG)" />
          <path d={tPath(terrain)} fill="none" stroke="#10b981" strokeWidth="2" opacity="0.3" />

          {envObjects.map((obj, i) => {
            if (obj.type === 'tree') {
              const baseY = obj.y;
              const trunkWidth = obj.size * 0.15;
              const trunkHeight = obj.size * 0.4;
              const canopySize = obj.size * 0.6;
              if (obj.treeType === 'pine') {
                return (
                  <g key={`env-${i}`} opacity="0.7">
                    <rect x={obj.x - trunkWidth / 2} y={baseY - trunkHeight} width={trunkWidth} height={trunkHeight} fill="#654321" />
                    <polygon points={`${obj.x},${baseY - obj.size} ${obj.x - canopySize * 0.7},${baseY - obj.size * 0.6} ${obj.x + canopySize * 0.7},${baseY - obj.size * 0.6}`} fill={`hsl(${obj.hue}, 50%, 35%)`} />
                    <polygon points={`${obj.x},${baseY - obj.size * 0.75} ${obj.x - canopySize * 0.8},${baseY - obj.size * 0.4} ${obj.x + canopySize * 0.8},${baseY - obj.size * 0.4}`} fill={`hsl(${obj.hue}, 45%, 30%)`} />
                    <polygon points={`${obj.x},${baseY - obj.size * 0.5} ${obj.x - canopySize},${baseY - trunkHeight} ${obj.x + canopySize},${baseY - trunkHeight}`} fill={`hsl(${obj.hue}, 40%, 25%)`} />
                  </g>
                );
              } else {
                return (
                  <g key={`env-${i}`} opacity="0.7">
                    <rect x={obj.x - trunkWidth / 2} y={baseY - trunkHeight} width={trunkWidth} height={trunkHeight} fill="#654321" />
                    <circle cx={obj.x - canopySize * 0.3} cy={baseY - trunkHeight - canopySize * 0.3} r={canopySize * 0.6} fill={`hsl(${obj.hue}, 50%, 30%)`} />
                    <circle cx={obj.x + canopySize * 0.3} cy={baseY - trunkHeight - canopySize * 0.3} r={canopySize * 0.6} fill={`hsl(${obj.hue}, 45%, 28%)`} />
                    <circle cx={obj.x} cy={baseY - trunkHeight - canopySize * 0.5} r={canopySize * 0.7} fill={`hsl(${obj.hue}, 55%, 32%)`} />
                  </g>
                );
              }
            }
            return null;
          })}

          {canAct && !charging && !cameraDragging && (
            <g>
              <circle cx={tank.x} cy={tank.y - 13} r="30" fill="transparent" stroke={aC.accent} strokeWidth="1" strokeDasharray="4 4" opacity="0.25"><animate attributeName="opacity" values="0.15;0.4;0.15" dur="2s" repeatCount="indefinite" /></circle>
              <text x={tank.x} y={tank.y - 50} textAnchor="middle" fill={aC.accent} fontSize="8" fontFamily="monospace" opacity="0.5">↕ DRAG</text>
            </g>
          )}

          {cameraDragging && (
            <g>
              <rect x={viewportX} y={viewportY} width={VIEW_W} height={H} fill="rgba(100,200,255,0.05)" stroke="rgba(100,200,255,0.3)" strokeWidth="2" strokeDasharray="10 5" />
              <text x={viewportX + VIEW_W / 2} y={viewportY + 30} textAnchor="middle" fill="#64c8ff" fontSize="12" fontWeight="bold" fontFamily="monospace">🔍 SCOUTING...</text>
            </g>
          )}

          {cameraZoom > 1.1 && phase === "flying" && (
            <g>
              {cameraZoom > 1.5 && (
                <g stroke="#fbbf24" strokeWidth="2" opacity="0.3">
                  <polyline points={`${viewportX + 10},${viewportY + 10} ${viewportX},${viewportY + 10} ${viewportX},${viewportY + 20}`} fill="none" />
                  <polyline points={`${viewportX + VIEW_W * cameraZoom - 10},${viewportY + 10} ${viewportX + VIEW_W * cameraZoom},${viewportY + 10} ${viewportX + VIEW_W * cameraZoom},${viewportY + 20}`} fill="none" />
                  <polyline points={`${viewportX + 10},${viewportY + H * cameraZoom - 10} ${viewportX},${viewportY + H * cameraZoom - 10} ${viewportX},${viewportY + H * cameraZoom - 20}`} fill="none" />
                  <polyline points={`${viewportX + VIEW_W * cameraZoom - 10},${viewportY + H * cameraZoom - 10} ${viewportX + VIEW_W * cameraZoom},${viewportY + H * cameraZoom - 10} ${viewportX + VIEW_W * cameraZoom},${viewportY + H * cameraZoom - 20}`} fill="none" />
                </g>
              )}
            </g>
          )}

          {trail.map((t, i) => <circle key={i} cx={t.x} cy={t.y} r={3 * cameraZoom} fill="#fff" opacity={((i + 1) / trail.length) * 0.5} />)}

          {p1.hp > 0 && <TankG t={p1} c={P1} name={p1Name} active={turn === 0 && canAct} fr={true} recoil={firingEffect?.tankIdx === 0 ? firingEffect.frame : 0} />}
          {p2.hp > 0 && <TankG t={p2} c={P2} name={p2Name} active={turn === 1 && canAct} fr={false} recoil={firingEffect?.tankIdx === 1 ? firingEffect.frame : 0} />}

          {/* INTRO ARROW — red target indicator on opponent tank */}
          {introArrow && (() => {
            const ax = introArrow.x, ay = introArrow.y;
            return (
              <g>
                {/* Pulsing ring */}
                <circle cx={ax} cy={ay - 10} r={28} fill="none" stroke="#ef4444" strokeWidth={2.5} opacity={0.6}>
                  <animate attributeName="r" values="22;34;22" dur="0.9s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.7;0.2;0.7" dur="0.9s" repeatCount="indefinite" />
                </circle>
                {/* Arrow shaft */}
                <rect x={ax - 4} y={ay - 90} width={8} height={42} rx={3} fill="#ef4444">
                  <animate attributeName="y" values={`${ay - 90};${ay - 78};${ay - 90}`} dur="0.6s" repeatCount="indefinite" />
                </rect>
                {/* Arrow head */}
                <polygon points={`${ax},${ay - 30} ${ax - 14},${ay - 54} ${ax + 14},${ay - 54}`} fill="#ef4444">
                  <animate attributeName="points"
                    values={`${ax},${ay - 30} ${ax - 14},${ay - 54} ${ax + 14},${ay - 54};${ax},${ay - 18} ${ax - 14},${ay - 42} ${ax + 14},${ay - 42};${ax},${ay - 30} ${ax - 14},${ay - 54} ${ax + 14},${ay - 54}`}
                    dur="0.6s" repeatCount="indefinite" />
                </polygon>
                {/* Label */}
                <text x={ax} y={ay - 96} textAnchor="middle" fill="#ef4444" fontSize="11" fontWeight="900" fontFamily="monospace" letterSpacing="2">
                  <animate attributeName="y" values={`${ay - 96};${ay - 84};${ay - 96}`} dur="0.6s" repeatCount="indefinite" />
                  ENEMY
                </text>
              </g>
            );
          })()}

          {firingEffect && (() => {
            const p = Math.min(1, firingEffect.frame / 15);
            const flash = 1 - p;
            const spread = p * 25;
            const bx = firingEffect.barrelX;
            const by = firingEffect.barrelY;
            const angle = firingEffect.angle;
            return (
              <g>
                <circle cx={bx} cy={by} r={8 + spread} fill="#ffcc00" opacity={flash * 0.9} />
                <circle cx={bx} cy={by} r={5 + spread * 0.7} fill="#ff9500" opacity={flash} />
                <circle cx={bx} cy={by} r={3 + spread * 0.5} fill="#fff" opacity={flash * 1.2} />
                {[...Array(8)].map((_, i) => {
                  const rayAngle = angle + (i * Math.PI / 4) - Math.PI / 2;
                  const len = (8 + spread) * (0.8 + Math.random() * 0.4);
                  const x2 = bx + Math.cos(rayAngle) * len;
                  const y2 = by + Math.sin(rayAngle) * len;
                  return <line key={i} x1={bx} y1={by} x2={x2} y2={y2} stroke="#ffcc00" strokeWidth={2 - p * 2} opacity={flash * 0.6} />;
                })}
                {firingEffect.frame > 5 && [...Array(4)].map((_, i) => {
                  const puffAngle = angle + (Math.random() - 0.5) * 0.3;
                  const puffDist = (firingEffect.frame - 5) * 2 + i * 3;
                  const px = bx + Math.cos(puffAngle) * puffDist;
                  const py = by + Math.sin(puffAngle) * puffDist;
                  const puffSize = 3 + i;
                  const puffOp = Math.max(0, 0.4 - (firingEffect.frame - 5) * 0.04);
                  return <circle key={i} cx={px} cy={py} r={puffSize} fill="#666" opacity={puffOp} />;
                })}
              </g>
            );
          })()}

          {proj && <g filter="url(#glow)"><circle cx={proj.x} cy={proj.y} r={7 * cameraZoom} fill={aC.accent} /><circle cx={proj.x} cy={proj.y} r={4 * cameraZoom} fill="#fff" opacity="0.9" /><circle cx={proj.x} cy={proj.y} r={12 * cameraZoom} fill={aC.accent} opacity="0.3"><animate attributeName="r" values={`${8*cameraZoom};${16*cameraZoom};${8*cameraZoom}`} dur="0.3s" repeatCount="indefinite" /></circle></g>}

          {boom && (() => { const p = boom.frame / 30, r = EXPLOSION_RADIUS * (0.3 + p * 0.7), op = 1 - p; return (<g><circle cx={boom.x} cy={boom.y} r={r * 1.2} fill="#ff6b00" opacity={op * 0.3} /><circle cx={boom.x} cy={boom.y} r={r} fill="#ff9500" opacity={op * 0.5} /><circle cx={boom.x} cy={boom.y} r={r * 0.6} fill="#ffcc00" opacity={op * 0.7} /><circle cx={boom.x} cy={boom.y} r={r * 0.3} fill="#fff" opacity={op * 0.9} />{[...Array(8)].map((_, i) => { const a = (i * Math.PI * 2) / 8; return <circle key={i} cx={boom.x + Math.cos(a) * r * 1.1 * p} cy={boom.y + Math.sin(a) * r * 1.1 * p} r={3 * (1 - p)} fill="#ffcc00" opacity={op} />; })}</g>); })()}

          {floats.map(f => <text key={f.id} x={f.x} y={f.y} textAnchor="middle" fill={f.color} fontSize="16" fontWeight="900" fontFamily="monospace"><animate attributeName="y" from={f.y} to={f.y - 50} dur="1.2s" fill="freeze" /><animate attributeName="opacity" from="1" to="0" dur="1.2s" fill="freeze" />{f.text}</text>)}

          {phase === "destroying" && killData && (() => {
            const p = Math.min(1, killData.frame / DESTROY_FRAMES);
            const kx = killData.x, ky = killData.y;
            const cols = [dColors[0], dColors[1], "#ff9500", "#ffcc00", "#1a1a2e", "#fff"];
            return (
              <g>
                {p < 0.1 && <rect x="0" y="0" width={WORLD_W} height={H} fill="#fff" opacity={(1 - p / 0.1) * 0.35} />}
                {p < 0.4 && <circle cx={kx} cy={ky} r={p * 200} fill="none" stroke="#fff" strokeWidth={4 * (1 - p / 0.4)} opacity={(1 - p / 0.4) * 0.7} />}
                {p > 0.08 && p < 0.5 && <circle cx={kx} cy={ky} r={(p - 0.08) * 160} fill="none" stroke="#ffcc00" strokeWidth={3 * (1 - (p - 0.08) / 0.42)} opacity={(1 - (p - 0.08) / 0.42) * 0.5} />}
                <circle cx={kx} cy={ky - 5} r={15 + p * 55} fill="#ff4500" opacity={(1 - p) * 0.35} />
                <circle cx={kx} cy={ky - 5} r={12 + p * 40} fill="#ff6b00" opacity={(1 - p) * 0.5} />
                <circle cx={kx} cy={ky - 5} r={8 + p * 25} fill="#ff9500" opacity={(1 - p) * 0.7} />
                <circle cx={kx} cy={ky - 5} r={5 + p * 15} fill="#ffcc00" opacity={(1 - p) * 0.85} />
                <circle cx={kx} cy={ky - 5} r={3 + p * 8} fill="#fff" opacity={(1 - p)} />
                {DEBRIS.map((db, i) => {
                  const dx = Math.cos(db.angle) * db.speed * p;
                  const dy = Math.sin(db.angle) * db.speed * p * 0.7 - 50 * p + 80 * p * p;
                  const op = Math.max(0, 1 - p * 1.3);
                  if (op <= 0) return null;
                  return <g key={i} transform={`translate(${kx + dx},${ky - 5 + dy}) rotate(${db.rot * p * 360})`}><rect x={-db.size / 2} y={-db.size / 3} width={db.size} height={db.size * 0.6} rx="1" fill={cols[db.ci]} opacity={op} /></g>;
                })}
                {[...Array(10)].map((_, i) => { const a = (i * Math.PI * 2) / 10 + i * 0.7; const sp = 60 + i * 8; const sx = Math.cos(a) * sp * p; const sy = Math.sin(a) * sp * p * 0.6 - 30 * p + 50 * p * p; const op = Math.max(0, 1 - p * 1.5); if (op <= 0) return null; return <circle key={`s${i}`} cx={kx + sx} cy={ky + sy} r={2} fill="#ffcc00" opacity={op} />; })}
                {[0, 0.15, 0.3].map((delay, i) => { const sp = Math.max(0, Math.min(1, (p - delay) / (1 - delay))); if (sp <= 0) return null; return <circle key={`sm${i}`} cx={kx + (i - 1) * 18} cy={ky - 15 - sp * 60} r={6 + sp * 22} fill="#444" opacity={(1 - sp) * 0.35} />; })}
                {p > 0.15 && p < 0.85 && <text x={kx} y={ky - 55 - p * 30} textAnchor="middle" fill="#ff4444" fontSize="18" fontWeight="900" fontFamily="monospace" opacity={Math.min(1, (p - 0.15) * 4) * Math.max(0, 1 - (p - 0.5) * 3)} stroke="#000" strokeWidth="0.5">💀 DESTROYED!</text>}
              </g>
            );
          })()}

{phase === "transition" && transData && (() => {
            const p = Math.min(1, transData.frame / 90);
            const wc = transData.winner === 0 ? "#22d3ee" : "#fb7185";
            return (
              <g>
                <rect x={viewportX} y="0" width={VIEW_W} height={H} fill="#0a0a1a" opacity={p < 0.5 ? p * 2 * 0.85 : (1 - (p - 0.5) * 2) * 0.85} />
                {p > 0.15 && p < 0.85 && (<>
                  <text x={viewportX + VIEW_W / 2} y={H / 2 - 30} textAnchor="middle" fill={wc} fontSize="20" fontWeight="900" fontFamily="monospace" opacity={Math.min(1, (p - 0.15) * 5)}>+1 POINT TO {isMultiplayer ? (transData.winner === myPlayer ? "YOU!" : "OPPONENT!") : `PLAYER ${transData.winner + 1}!`}</text>
                  <text x={viewportX + VIEW_W / 2} y={H / 2 + 20} textAnchor="middle" fill="#94a3b8" fontSize="28" fontWeight="900" fontFamily="monospace" opacity={Math.min(1, (p - 0.25) * 5)}>⚔️ LEVEL {transData.level}</text>
                  <text x={viewportX + VIEW_W / 2} y={H / 2 + 55} textAnchor="middle" fill="#475569" fontSize="12" fontFamily="monospace" opacity={Math.min(1, (p - 0.35) * 5)}>New battlefield incoming...</text>
                </>)}
              </g>
            );
          })()}

          {phase === "celebration" && matchWinner !== null && <CelebrationG winner={matchWinner} scores={scores} onNew={startNewMatch} viewportX={viewportX} isMultiplayer={isMultiplayer} myPlayer={myPlayer} p1Name={p1Name} p2Name={p2Name} />}
        </svg>
      </div>

      {/* CONTROLS */}
      <div style={{ width: "100%", maxWidth: 820, display: "flex", justifyContent: "center", alignItems: "center", padding: "8px 10px", boxSizing: "border-box", gap: 8, flexWrap: "wrap" }}>
        {canAct && (
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => { const tk = isMultiplayer ? (myPlayer === 0 ? p1 : p2) : (turn === 0 ? p1 : p2); setViewportX(Math.max(0, Math.min(WORLD_W - VIEW_W, tk.x - VIEW_W / 2))); }} style={{ padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${myBtnColor}`, background: "rgba(15,23,42,0.9)", color: myBtnColor, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "monospace", letterSpacing: 1 }}>ME</button>
            <button onClick={() => { const tk = isMultiplayer ? (myPlayer === 0 ? p2 : p1) : (turn === 0 ? p2 : p1); setViewportX(Math.max(0, Math.min(WORLD_W - VIEW_W, tk.x - VIEW_W / 2))); }} style={{ padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${oppBtnColor}`, background: "rgba(15,23,42,0.9)", color: oppBtnColor, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "monospace", letterSpacing: 1 }}>{oppBtnName}</button>
          </div>
        )}

        {/* Show waiting indicator when not your turn in multiplayer */}
        {isMultiplayer && !isMyTurn && phase === "aiming" && matchWinner === null && (
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={() => { const tk = myPlayer === 0 ? p1 : p2; setViewportX(Math.max(0, Math.min(WORLD_W - VIEW_W, tk.x - VIEW_W / 2))); }} style={{ padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${myBtnColor}`, background: "rgba(15,23,42,0.9)", color: myBtnColor, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "monospace", letterSpacing: 1 }}>ME</button>
            <button onClick={() => { const tk = myPlayer === 0 ? p2 : p1; setViewportX(Math.max(0, Math.min(WORLD_W - VIEW_W, tk.x - VIEW_W / 2))); }} style={{ padding: "8px 14px", borderRadius: 8, border: `1.5px solid ${oppBtnColor}`, background: "rgba(15,23,42,0.9)", color: oppBtnColor, fontSize: 11, fontWeight: 800, cursor: "pointer", fontFamily: "monospace", letterSpacing: 1 }}>{oppBtnName}</button>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <span style={{ fontSize: 9, color: "#64748b", letterSpacing: 2 }}>POSITION</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button
              onPointerDown={() => canAct && setTankMoving(-1)}
              onPointerUp={() => setTankMoving(0)}
              onPointerLeave={() => setTankMoving(0)}
              disabled={!canAct}
              style={{...btn, opacity: canAct ? 1 : 0.3, userSelect: "none"}}
            >⬅</button>
            <div style={{ width: 50, textAlign: "center", fontSize: 10, color: aC.accent }}>MOVE</div>
            <button
              onPointerDown={() => canAct && setTankMoving(1)}
              onPointerUp={() => setTankMoving(0)}
              onPointerLeave={() => setTankMoving(0)}
              disabled={!canAct}
              style={{...btn, opacity: canAct ? 1 : 0.3, userSelect: "none"}}
            >➡</button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <span style={{ fontSize: 9, color: "#64748b", letterSpacing: 2 }}>ANGLE</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => nudgeAngle(-5)} disabled={!canAct} style={{...btn, opacity: canAct ? 1 : 0.3}}>◀</button>
            <div style={{ width: 50, textAlign: "center", fontSize: 20, fontWeight: 900, color: aC.accent }}>{tank.angle}°</div>
            <button onClick={() => nudgeAngle(5)} disabled={!canAct} style={{...btn, opacity: canAct ? 1 : 0.3}}>▶</button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 150 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 9, color: "#64748b", letterSpacing: 2 }}>POWER</span>
          </div>
          <div style={{ position: "relative", width: 150, height: 18, background: "#1e293b", borderRadius: 9, overflow: "hidden", border: charging ? `2px solid ${chgColor}` : "2px solid #334155" }}>
            <div style={{ height: "100%", width: charging ? `${chargeProg * 100}%` : `${tank.power}%`, borderRadius: 7, background: charging ? `linear-gradient(90deg,#ef4444,${chgColor})` : `linear-gradient(90deg,${aC.main},${aC.accent})`, transition: charging ? "none" : "width 0.3s", boxShadow: charging ? `0 0 16px ${chgColor}` : "none" }} />
            <span style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: 12, fontWeight: 900, color: "#fff", textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}>{charging ? chgPow : tank.power}%</span>
          </div>
          {charging && (
            <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
              {["LOW", "MED", "MAX"].map((l, i) => <span key={i} style={{ fontSize: 8, fontWeight: 700, color: i === 0 && chargeProg < 0.33 ? "#ef4444" : i === 1 && chargeProg >= 0.33 && chargeProg < 0.66 ? "#f59e0b" : i === 2 && chargeProg >= 0.66 ? "#22c55e" : "#334155" }}>{l}</span>)}
            </div>
          )}
          {!charging && (
            <span style={{ fontSize: 7, color: "#64748b" }}>Range: {Math.round((tank.power * 0.245) ** 2 / GRAVITY)}px</span>
          )}
        </div>

        {matchWinner !== null ? (
          <button onClick={startNewMatch} style={{ padding: "16px 24px", borderRadius: 12, border: "2px solid #a855f7", background: "linear-gradient(135deg,#7c3aed,#a855f7)", color: "#fff", fontSize: 15, fontWeight: 900, fontFamily: "monospace", letterSpacing: 2, cursor: "pointer", boxShadow: "0 0 25px rgba(168,85,247,0.4)", minWidth: 160 }}>🏆 NEW MATCH</button>
        ) : (
          <button
            onPointerDown={startCharge} onPointerUp={releaseCharge}
            onPointerLeave={() => { if (chargingRef.current) releaseCharge(); }}
            onContextMenu={e => e.preventDefault()}
            disabled={!canAct}
            style={{
              padding: "16px 24px", borderRadius: 12, border: "2px solid",
              borderColor: !canAct ? "#334155" : charging ? chgColor : aC.main,
              background: !canAct ? "#1e293b" : charging ? `linear-gradient(135deg,#ef4444,${chgColor})` : `linear-gradient(135deg,${aC.main},${aC.accent})`,
              color: !canAct ? "#475569" : "#fff", fontSize: 15, fontWeight: 900, fontFamily: "monospace", letterSpacing: 2,
              cursor: !canAct ? "not-allowed" : "pointer",
              boxShadow: charging ? `0 0 30px ${chgColor}` : !canAct ? "none" : `0 0 20px ${aC.glow}`,
              transform: charging ? "scale(1.1)" : "scale(1)", transition: "all 0.15s", touchAction: "none", width: 160,
            }}
          >{charging ? `⚡ ${chgPow}%` : isMultiplayer && !isMyTurn ? "⏳ WAITING..." : "🔥 HOLD TO FIRE"}</button>
        )}
      </div>


      <div style={{ fontSize: 11, color: "#64748b", marginTop: 4, letterSpacing: 1, textAlign: "center", padding: "0 16px", fontWeight: 600 }}>
        💀 ANY HIT = INSTANT DEATH &nbsp;•&nbsp; 🏆 FIRST TO {WIN_SCORE} WINS!
      </div>

      {/* World Position Indicator */}
      <div style={{ width: "100%", maxWidth: 820, padding: "8px 16px", boxSizing: "border-box" }}>
        <div
          style={{ position: "relative", width: "100%", height: 16, background: "#1e293b", borderRadius: 4, overflow: "hidden", cursor: "grab", userSelect: "none" }}
          onPointerDown={(e) => {
            if (phase !== "aiming") return;
            setMinimapDragging(true);
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickPercent = clickX / rect.width;
            const targetWorldX = clickPercent * WORLD_W;
            const newViewportX = Math.max(0, Math.min(WORLD_W - VIEW_W, targetWorldX - VIEW_W / 2));
            setViewportX(newViewportX);
          }}
          onPointerMove={(e) => {
            if (!minimapDragging || phase !== "aiming") return;
            const rect = e.currentTarget.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickPercent = Math.max(0, Math.min(1, clickX / rect.width));
            const targetWorldX = clickPercent * WORLD_W;
            const newViewportX = Math.max(0, Math.min(WORLD_W - VIEW_W, targetWorldX - VIEW_W / 2));
            setViewportX(newViewportX);
          }}
          onPointerUp={() => setMinimapDragging(false)}
          onPointerLeave={() => setMinimapDragging(false)}
        >
          <div style={{ position: "absolute", left: `${Math.min(p1.x, p2.x) / WORLD_W * 100}%`, width: `${Math.abs(p2.x - p1.x) / WORLD_W * 100}%`, top: "50%", height: 1, background: "rgba(250,204,21,0.3)", transform: "translateY(-50%)" }} />
          <div style={{ position: "absolute", left: `${(p1.x / WORLD_W) * 100}%`, top: 0, width: 3, height: "100%", background: P1.accent, boxShadow: `0 0 8px ${P1.accent}` }} />
          <div style={{ position: "absolute", left: `${(p2.x / WORLD_W) * 100}%`, top: 0, width: 3, height: "100%", background: P2.accent, boxShadow: `0 0 8px ${P2.accent}` }} />
          <div style={{ position: "absolute", left: `${(viewportX / WORLD_W) * 100}%`, top: 0, width: `${(VIEW_W / WORLD_W) * 100}%`, height: "100%", background: cameraDragging ? "rgba(100,200,255,0.2)" : "rgba(255,255,255,0.1)", border: cameraDragging ? "1px solid #64c8ff" : "1px solid rgba(255,255,255,0.3)" }} />
        </div>
      </div>

      {/* Disconnected overlay */}
      {isMultiplayer && !connected && (
        <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.8)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ fontSize: 24, color: "#ef4444", fontWeight: 900, fontFamily: "monospace", marginBottom: 16 }}>⚠️ DISCONNECTED</div>
          <div style={{ fontSize: 14, color: "#94a3b8", marginBottom: 24 }}>Your opponent has left the game.</div>
          <button onClick={onDisconnect} style={{ padding: "14px 28px", borderRadius: 10, border: "2px solid #f43f5e", background: "linear-gradient(135deg,#e11d48,#f43f5e)", color: "#fff", fontSize: 14, fontWeight: 900, fontFamily: "monospace", cursor: "pointer" }}>BACK TO LOBBY</button>
        </div>
      )}
    </div>
  );
}

// ─── TANK SVG COMPONENT ─────────────────────────────────────
function TankG({ t, c, name, active, fr, recoil = 0 }) {
  const rad = ((fr ? -t.angle : -(180 - t.angle)) * Math.PI) / 180;
  const bx = t.x + Math.cos(rad) * 22, by = t.y - 8 + Math.sin(rad) * 22;
  const recoilProgress = Math.max(0, 1 - recoil / 15);
  const recoilDist = recoil > 0 ? Math.sin((1 - recoilProgress) * Math.PI) * 5 : 0;
  const recoilX = -Math.cos(rad) * recoilDist;
  const recoilY = -Math.sin(rad) * recoilDist;
  const shake = recoil > 0 && recoil < 8 ? Math.sin(recoil * 3) * 0.5 : 0;
  return (
    <g transform={`translate(${recoilX},${recoilY + shake})`}>
      {active && (<><circle cx={t.x} cy={t.y - 40} r={18} fill="none" stroke={c.accent} strokeWidth="2" opacity="0.4"><animate attributeName="r" values="16;22;16" dur="1.5s" repeatCount="indefinite" /></circle><text x={t.x} y={t.y - 55} textAnchor="middle" fill={c.accent} fontSize="11" fontWeight="bold" fontFamily="monospace">▼</text></>)}
      <rect x={t.x - 17} y={t.y - 4} width="34" height="8" rx="4" fill="#1a1a2e" stroke={c.main} strokeWidth="1.5" />
      {[-12, 0, 12].map(dx => <ellipse key={dx} cx={t.x + dx} cy={t.y} rx="4" ry="3.5" fill="#2a2a4e" stroke={c.main} strokeWidth="0.8" />)}
      <rect x={t.x - 14} y={t.y - 12} width="28" height="10" rx="3" fill={c.main} />
      <rect x={t.x - 12} y={t.y - 10} width="24" height="6" rx="2" fill={c.accent} opacity="0.3" />
      <ellipse cx={t.x} cy={t.y - 13} rx="9" ry="7" fill={c.main} />
      <ellipse cx={t.x} cy={t.y - 14} rx="6" ry="4" fill={c.accent} opacity="0.4" />
      <line x1={t.x} y1={t.y - 13} x2={bx} y2={by} stroke={c.main} strokeWidth="4" strokeLinecap="round" />
      <line x1={t.x} y1={t.y - 13} x2={bx} y2={by} stroke={c.accent} strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      {active && <circle cx={bx} cy={by} r="3" fill={c.accent} opacity="0.6"><animate attributeName="opacity" values="0.3;0.8;0.3" dur="1s" repeatCount="indefinite" /></circle>}
      <text x={t.x} y={t.y + 18} textAnchor="middle" fill="#fff" fontSize="10" fontWeight="bold" fontFamily="monospace" opacity="0.9">{name}</text>
    </g>
  );
}

// ─── CELEBRATION COMPONENT ──────────────────────────────────
function CelebrationG({ winner, scores, onNew, viewportX, isMultiplayer, myPlayer, p1Name, p2Name }) {
  const [conf] = useState(() => Array.from({ length: 60 }, (_, i) => ({ x: Math.random() * VIEW_W, dl: Math.random() * 2, sp: 1 + Math.random() * 2, sz: 4 + Math.random() * 8, cl: ["#06b6d4", "#f43f5e", "#22c55e", "#f59e0b", "#a855f7", "#ec4899", "#fff"][i % 7], wb: Math.random() * 4 - 2, rt: Math.random() * 360 })));
  const [fr, setFr] = useState(0);
  useEffect(() => { let f = 0; const a = () => { f++; setFr(f); if (f < 300) requestAnimationFrame(a); }; requestAnimationFrame(a); }, []);
  const wc = winner === 0 ? "#22d3ee" : "#fb7185";
  const wa = winner === 0 ? "#06b6d4" : "#f43f5e";
  const centerX = viewportX + VIEW_W / 2;
  const winnerText = isMultiplayer
    ? (winner === myPlayer ? "YOU WIN!" : `${(winner === 0 ? p1Name : p2Name) || "OPPONENT"} WINS!`)
    : `${winner === 0 ? (p1Name || "P1") : (p2Name || "P2")} CHAMPION!`;
  return (
    <g>
      <rect x={viewportX} y="0" width={VIEW_W} height={H} fill="#000" opacity="0.75" />
      {conf.map((c, i) => { const t = Math.max(0, (fr / 60) - c.dl); const cy = -20 + t * c.sp * 60; const cx = viewportX + c.x + Math.sin(t * 2 + i) * 30 * c.wb; if (cy > H + 20) return null; return <g key={i} transform={`translate(${cx},${cy}) rotate(${c.rt + fr * (i % 2 === 0 ? 3 : -3)})`}><rect x={-c.sz / 2} y={-c.sz / 4} width={c.sz} height={c.sz / 2} rx="1" fill={c.cl} opacity={0.9} /></g>; })}
      <text x={centerX} y={140} textAnchor="middle" fontSize="60" opacity={Math.min(1, fr / 30)}>🏆</text>
      <text x={centerX} y={200} textAnchor="middle" fill={wc} fontSize="30" fontWeight="900" fontFamily="monospace" opacity={Math.min(1, Math.max(0, (fr - 15) / 20))}>{winnerText}</text>
      <text x={centerX} y={240} textAnchor="middle" fill="#94a3b8" fontSize="16" fontFamily="monospace" opacity={Math.min(1, Math.max(0, (fr - 30) / 20))}>Final: {scores[0]} — {scores[1]}</text>
      {[...Array(8)].map((_, i) => { const a = (i * Math.PI * 2) / 8; const p = Math.min(1, Math.max(0, (fr - 20) / 40)); return <text key={i} x={centerX + Math.cos(a) * (60 + p * 80)} y={180 + Math.sin(a) * (60 + p * 80) * 0.6} textAnchor="middle" fontSize="20" opacity={(1 - p) * 0.8}>{["⭐", "🎉", "✨", "🎊", "💥", "🌟", "🎆", "🎇"][i]}</text>; })}
      <g transform={`translate(${centerX},280)`} opacity={Math.min(1, Math.max(0, (fr - 40) / 20))}>
        <rect x="-80" y="-16" width="160" height="32" rx="16" fill={wa} opacity="0.3" /><rect x="-78" y="-14" width="156" height="28" rx="14" fill="none" stroke={wc} strokeWidth="2" />
        <text x="0" y="6" textAnchor="middle" fill={wc} fontSize="14" fontWeight="900" fontFamily="monospace">🎯 {WIN_SCORE} POINTS!</text>
      </g>
      {fr > 60 && <g style={{ cursor: "pointer" }} onClick={onNew}><rect x={centerX - 100} y={330} width="200" height="50" rx="12" fill="#059669" stroke="#10b981" strokeWidth="2" /><text x={centerX} y={362} textAnchor="middle" fill="#fff" fontSize="16" fontWeight="900" fontFamily="monospace">🔄 NEW MATCH</text></g>}
    </g>
  );
}

const btn = { width: 34, height: 34, borderRadius: 7, border: "1px solid #334155", background: "#1e293b", color: "#94a3b8", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "monospace" };
