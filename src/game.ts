// ─────────────────────────────────────────────────────────────────────────────
// Surf Rush — Game Engine  (game.ts)
// Self-contained canvas runner. React only mounts the canvas and reacts to
// callbacks — it never drives the render loop itself.
// ─────────────────────────────────────────────────────────────────────────────

export type LaneIndex = 0 | 1 | 2;
export type ObstacleType = 'rock' | 'shark' | 'jellyfish' | 'wave';
export type BoxType =
  | 'coins' | 'shield' | 'magnet' | 'speed' | 'combo'
  | 'coinCut' | 'freeze' | 'slowWave';

interface Entity { lane: LaneIndex; y: number; width: number; height: number; }
interface Obstacle extends Entity { type: ObstacleType; wobble: number; passed: boolean; }
interface MysteryBox extends Entity { type: BoxType; pulse: number; }
interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; color: string; size: number;
  type: 'spark' | 'splash' | 'coin' | 'trail' | 'xp' | 'magnet_pull';
}
interface WaveLayer { offset: number; speed: number; amplitude: number; color: string; y: number; }

export interface GameState {
  score: number;
  coins: number;
  combo: number;
  isGameOver: boolean;
  isPaused: boolean;
  hasShield: boolean;
  speedBoostUntil: number;
  freezeUntil: number;
  slowUntil: number;
  magnetUntil: number;
  obstaclesAvoided: number;
  survivalSeconds: number;
  coinsCollected: number;
  boxesCollected: number;
  shieldUsedThisRun: boolean;
}

export interface GameCallbacks {
  onStateChange: (state: GameState) => void;
  onGameOver: (finalScore: number, finalCoins: number, obstaclesAvoided: number, survivalSeconds: number, coinsCollected: number, boxesCollected: number) => void;
  onCoinCollect?: (x: number, y: number) => void;
  onShieldUsed?: () => void;
  onMagnetCollected?: () => void;
  onXpGain?: (amount: number) => void;
}

export interface GameStartOptions {
  startWithShield?: boolean;
  startWithMagnet?: boolean;
  startWithMultiplier?: boolean;
}

const POSITIVE_BOXES: BoxType[] = ['coins', 'shield', 'magnet', 'speed', 'combo'];
const NEGATIVE_BOXES: BoxType[] = ['coinCut', 'freeze', 'slowWave'];
const OBSTACLE_TYPES: ObstacleType[] = ['rock', 'shark', 'jellyfish', 'wave'];
const LANE_COUNT = 3;
const BASE_SPEED = 220;
const MAX_SPEED  = 620;
const SPEED_RAMP_PER_SEC = 4;
const SAFE_START_SECONDS = 3;
const DIFFICULTY_RAMP_SECONDS = 20;
const OBSTACLE_SPAWN_Y = -140;
const MIN_SAME_LANE_GAP = 280;
const PLAYER_SAFE_ZONE = 180;

// ─────────────────────────────────────────────────────────────────────────────
// Sound Engine — Web Audio API, no external files needed
// ─────────────────────────────────────────────────────────────────────────────
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private enabled = true;

  private getCtx(): AudioContext | null {
    if (!this.enabled) return null;
    if (!this.ctx) {
      try { this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); } catch { return null; }
    }
    if (this.ctx.state === 'suspended') { this.ctx.resume().catch(() => {}); }
    return this.ctx;
  }

  setEnabled(v: boolean): void { this.enabled = v; }

  private playTone(frequency: number, duration: number, type: OscillatorType = 'sine', gainPeak = 0.18, fadeRatio = 0.7): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = type;
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(gainPeak, ctx.currentTime + duration * (1 - fadeRatio));
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch {}
  }

  coin(): void {
    this.playTone(880, 0.08, 'triangle', 0.2, 0.5);
    setTimeout(() => this.playTone(1100, 0.08, 'triangle', 0.15, 0.6), 60);
  }

  obstacle(): void {
    const ctx = this.getCtx();
    if (!ctx) return;
    try {
      const buf = ctx.createBuffer(1, ctx.sampleRate * 0.15, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
      src.connect(gain);
      gain.connect(ctx.destination);
      src.start(ctx.currentTime);
    } catch {}
  }

  shield(): void {
    this.playTone(440, 0.05, 'sawtooth', 0.15, 0.3);
    setTimeout(() => this.playTone(660, 0.1, 'triangle', 0.15, 0.5), 50);
    setTimeout(() => this.playTone(880, 0.1, 'triangle', 0.12, 0.6), 120);
  }

  shieldActivate(): void {
    this.playTone(660, 0.12, 'triangle', 0.2, 0.4);
    setTimeout(() => this.playTone(880, 0.12, 'triangle', 0.18, 0.5), 80);
    setTimeout(() => this.playTone(1100, 0.15, 'triangle', 0.15, 0.6), 160);
  }

  magnet(): void {
    this.playTone(220, 0.12, 'sine', 0.15, 0.4);
    setTimeout(() => this.playTone(330, 0.1, 'sine', 0.12, 0.5), 100);
  }

  magnetActivate(): void {
    this.playTone(180, 0.2, 'sine', 0.18, 0.3);
    setTimeout(() => this.playTone(240, 0.15, 'sine', 0.15, 0.4), 120);
    setTimeout(() => this.playTone(360, 0.12, 'triangle', 0.12, 0.5), 240);
  }

  levelUp(): void {
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.playTone(f, 0.15, 'triangle', 0.2, 0.5), i * 100));
  }

  reward(): void {
    [659, 784, 1047].forEach((f, i) => setTimeout(() => this.playTone(f, 0.12, 'sine', 0.18, 0.5), i * 80));
  }

  powerup(type: BoxType): void {
    const freq: Record<BoxType, number> = {
      coins: 880, shield: 660, magnet: 440, speed: 1000, combo: 750,
      coinCut: 220, freeze: 330, slowWave: 280,
    };
    this.playTone(freq[type] ?? 660, 0.1, type === 'coinCut' || type === 'freeze' ? 'sawtooth' : 'triangle', 0.15, 0.5);
  }

  combo(n: number): void {
    if (n < 2) return;
    this.playTone(440 * Math.pow(1.1, n - 1), 0.08, 'triangle', 0.12, 0.5);
  }
}

export const soundEngine = new SoundEngine();

export const sfx = {
  get enabled() { return (soundEngine as any).enabled as boolean; },
  set enabled(v: boolean) { soundEngine.setEnabled(v); },
  coin: () => soundEngine.coin(),
  obstacle: () => soundEngine.obstacle(),
  shield: () => soundEngine.shield(),
  shieldActivate: () => soundEngine.shieldActivate(),
  magnet: () => soundEngine.magnet(),
  magnetActivate: () => soundEngine.magnetActivate(),
  levelup: () => soundEngine.levelUp(),
  reward: () => soundEngine.reward(),
  powerup: (type: BoxType) => soundEngine.powerup(type),
  combo: (n: number) => soundEngine.combo(n),
};

// ─────────────────────────────────────────────────────────────────────────────
// Game Engine
// ─────────────────────────────────────────────────────────────────────────────

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: GameCallbacks;

  private width  = 360;
  private height = 640;
  private laneWidth = this.width / LANE_COUNT;

  private playerLane: LaneIndex = 1;
  private playerTargetX = 0;
  private playerX = 0;
  private playerY = 0;
  private playerTilt = 0;

  private obstacles: Obstacle[]  = [];
  private boxes: MysteryBox[]    = [];
  private particles: Particle[]  = [];
  private waveLayers: WaveLayer[] = [];
  private waveTime = 0;
  private bubbles: { x: number; y: number; r: number; speed: number; opacity: number }[] = [];
  private foamParticles: { x: number; y: number; life: number; maxLife: number; r: number }[] = [];

  private lastTimestamp  = 0;
  private spawnTimer     = 0;
  private elapsedSeconds = 0;
  private animationFrameId: number | null = null;
  private shieldPulse = 0;
  private magnetPulse = 0;
  private bgGradientCache: CanvasGradient | null = null;

  private shieldHitFlash = 0;
  private shieldSaveAnim = 0;
  private magnetRingPulse = 0;
  private magnetActivateAnim = 0;
  private shieldActivateAnim = 0;
  private rewardFlash: { color: string; life: number } | null = null;
  private xpPopAnim = 0;
  private recentCoinCollects = 0;
  private coinStreakTimer = 0;
  private floatingTexts: { x: number; y: number; text: string; color: string; life: number; maxLife: number; vy: number }[] = [];

  // Run-level stats
  private runCoinsCollected = 0;
  private runBoxesCollected = 0;

  private isLowPower: boolean =
    typeof navigator !== 'undefined' &&
    (((navigator as any).hardwareConcurrency ?? 8) <= 4 ||
      (typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true));

  private state: GameState = this.defaultState();

  constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks) {
    this.canvas    = canvas;
    const ctx      = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D context not available');
    this.ctx       = ctx;
    this.callbacks = callbacks;
    this.initWaveLayers();
    this.initBubbles();
    Promise.resolve().then(() => {
      try {
        this.resize();
        this.initBubbles();
        this.renderIdleBackground();
      } catch (e) {
        console.error('GameEngine init render error:', e);
      }
    });
    window.addEventListener('resize', this.resize);
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  private isDisposed = false;

  private isCanvasUsable(): boolean {
    if (this.isDisposed) return false;
    if (!this.canvas || !this.canvas.isConnected) return false;
    return true;
  }

  public start(opts?: GameStartOptions): void {
    if (this.isDisposed) return;
    try {
      this.cancelLoop();
      this.resize();
      if (!this.waveLayers.length) this.initWaveLayers();
      if (!this.bubbles.length)    this.initBubbles();
      this.reset();

      if (opts?.startWithShield) {
        this.state.hasShield = true;
        this.shieldActivateAnim = 1.0;
        soundEngine.shieldActivate();
        this.spawnFloatingText(this.playerX, this.playerY - 50, '🛡 Shield Active!', '#06b6d4');
      }
      if (opts?.startWithMagnet) {
        this.state.magnetUntil = performance.now() + 6000;
        this.magnetActivateAnim = 1.0;
        soundEngine.magnetActivate();
        this.spawnFloatingText(this.playerX, this.playerY - 50, '🧲 Magnet Active!', '#f97316');
      }
      if (opts?.startWithMultiplier) {
        this.state.combo = 2;
        this.spawnFloatingText(this.playerX, this.playerY - 50, 'x2 Multiplier!', '#f59e0b');
      }

      this.emitState();
      this.lastTimestamp    = performance.now();
      this.animationFrameId = requestAnimationFrame(this.loop);
    } catch (e) {
      console.error('GameEngine.start error:', e);
      this.state = this.defaultState();
      this.emitState();
    }
  }

  public stop(): void {
    this.isDisposed = true;
    this.cancelLoop();
    window.removeEventListener('resize', this.resize);
  }

  public togglePause(): void {
    if (this.isDisposed || this.state.isGameOver) return;
    this.state.isPaused = !this.state.isPaused;
    this.emitState();
    if (!this.state.isPaused) {
      this.lastTimestamp    = performance.now();
      this.animationFrameId = requestAnimationFrame(this.loop);
    }
  }

  public moveLeft(): void {
    if (this.isDisposed || this.state.isGameOver || this.state.isPaused) return;
    if (this.playerLane > 0) {
      this.playerLane    = (this.playerLane - 1) as LaneIndex;
      this.playerTargetX = this.laneCenter(this.playerLane);
      this.playerTilt    = -0.25;
      this.spawnTrail();
    }
  }

  public moveRight(): void {
    if (this.isDisposed || this.state.isGameOver || this.state.isPaused) return;
    if (this.playerLane < LANE_COUNT - 1) {
      this.playerLane    = (this.playerLane + 1) as LaneIndex;
      this.playerTargetX = this.laneCenter(this.playerLane);
      this.playerTilt    = 0.25;
      this.spawnTrail();
    }
  }

  public restart(opts?: GameStartOptions): void {
    if (this.isDisposed) return;
    try {
      this.cancelLoop();
      this.resize();
      if (!this.waveLayers.length) this.initWaveLayers();
      if (!this.bubbles.length)    this.initBubbles();
      this.reset();

      if (opts?.startWithShield) {
        this.state.hasShield = true;
        this.shieldActivateAnim = 1.0;
        soundEngine.shieldActivate();
      }
      if (opts?.startWithMagnet) {
        this.state.magnetUntil = performance.now() + 6000;
        this.magnetActivateAnim = 1.0;
        soundEngine.magnetActivate();
      }
      if (opts?.startWithMultiplier) this.state.combo = 2;

      this.emitState();
      this.lastTimestamp    = performance.now();
      this.animationFrameId = requestAnimationFrame(this.loop);
    } catch (e) {
      console.error('GameEngine.restart error:', e);
      this.state = this.defaultState();
      this.emitState();
    }
  }

  public addLife(coinsSpent: number): void {
    if (this.isDisposed) return;
    if (!this.state.isGameOver) return;
    try {
      const safeCost = Number.isFinite(coinsSpent) ? Math.max(0, coinsSpent) : 0;
      this.state.coins      = Math.max(0, this.state.coins - safeCost);
      this.state.isGameOver = false;
      this.state.isPaused   = false;
      this.state.hasShield  = true;
      this.shieldActivateAnim = 1.0;
      this.obstacles        = [];
      this.boxes            = [];
      this.spawnTimer       = 0;
      this.shieldSaveAnim   = 0;
      soundEngine.shieldActivate();
      this.emitState();
      this.lastTimestamp    = performance.now();
      this.animationFrameId = requestAnimationFrame(this.loop);
    } catch (e) {
      console.error('GameEngine.addLife error:', e);
      this.state.isGameOver = false;
      this.state.isPaused   = false;
      this.emitState();
    }
  }

  public triggerXpAnim(): void {
    if (this.isDisposed) return;
    this.xpPopAnim = 1.0;
    this.spawnXpParticles();
  }

  public getState(): GameState { return this.sanitizeState(this.state); }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private defaultState(): GameState {
    return {
      score: 0, coins: 0, combo: 1,
      isGameOver: false, isPaused: false, hasShield: false,
      speedBoostUntil: 0, freezeUntil: 0, slowUntil: 0, magnetUntil: 0,
      obstaclesAvoided: 0,
      survivalSeconds: 0,
      coinsCollected: 0,
      boxesCollected: 0,
      shieldUsedThisRun: false,
    };
  }

  private sanitizeState(s: Partial<GameState> | null | undefined): GameState {
    const safeNum = (v: unknown, fallback = 0): number => {
      const n = Number(v);
      return Number.isFinite(n) ? n : fallback;
    };
    if (!s) return this.defaultState();
    return {
      score:            Math.max(0, safeNum(s.score)),
      coins:            Math.max(0, safeNum(s.coins)),
      combo:            Math.max(1, safeNum(s.combo, 1)),
      isGameOver:       typeof s.isGameOver === 'boolean' ? s.isGameOver : false,
      isPaused:         typeof s.isPaused   === 'boolean' ? s.isPaused   : false,
      hasShield:        typeof s.hasShield  === 'boolean' ? s.hasShield  : false,
      speedBoostUntil:  Math.max(0, safeNum(s.speedBoostUntil)),
      freezeUntil:      Math.max(0, safeNum(s.freezeUntil)),
      slowUntil:        Math.max(0, safeNum(s.slowUntil)),
      magnetUntil:      Math.max(0, safeNum(s.magnetUntil)),
      obstaclesAvoided: Math.max(0, safeNum(s.obstaclesAvoided)),
      survivalSeconds:  Math.max(0, safeNum(s.survivalSeconds)),
      coinsCollected:   Math.max(0, safeNum(s.coinsCollected)),
      boxesCollected:   Math.max(0, safeNum(s.boxesCollected)),
      shieldUsedThisRun: typeof s.shieldUsedThisRun === 'boolean' ? s.shieldUsedThisRun : false,
    };
  }

  private cancelLoop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private initWaveLayers(): void {
    this.waveLayers = [
      { offset: 0,             speed: 0.4, amplitude: 8,  color: 'rgba(255,255,255,0.04)', y: 0.25 },
      { offset: Math.PI,       speed: 0.6, amplitude: 6,  color: 'rgba(255,255,255,0.06)', y: 0.45 },
      { offset: Math.PI * .7,  speed: 0.5, amplitude: 10, color: 'rgba(255,255,255,0.05)', y: 0.60 },
      { offset: Math.PI * 1.3, speed: 0.8, amplitude: 5,  color: 'rgba(14,165,233,0.15)',  y: 0.75 },
    ];
  }

  private initBubbles(): void {
    const count = this.isLowPower ? 12 : 22;
    this.bubbles = Array.from({ length: count }, () => ({
      x: Math.random() * this.width,
      y: Math.random() * this.height,
      r: Math.random() * 3 + 1,
      speed: Math.random() * 0.4 + 0.15,
      opacity: Math.random() * 0.35 + 0.1,
    }));
  }

  private spawnTrail(): void {
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        x: this.playerX + (Math.random() - 0.5) * 20,
        y: this.playerY + Math.random() * 10,
        vx: (Math.random() - 0.5) * 60,
        vy: Math.random() * 80 + 20,
        life: 0.4, maxLife: 0.4,
        color: 'rgba(255,255,255,0.7)',
        size: Math.random() * 4 + 2,
        type: 'splash',
      });
    }
  }

  private spawnCollectEffect(x: number, y: number, color: string, type: 'spark' | 'coin'): void {
    const intensity = Math.min(3, 1 + this.recentCoinCollects * 0.3);
    const count = Math.round((type === 'coin' ? 12 : 10) * intensity);
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = Math.random() * 120 + 60;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        life: 0.7, maxLife: 0.7,
        color, size: Math.random() * 6 + 3, type,
      });
    }
    if (type === 'coin') {
      for (let i = 0; i < 5; i++) {
        this.particles.push({
          x: x + (Math.random() - 0.5) * 20,
          y: y - 10,
          vx: (Math.random() - 0.5) * 40,
          vy: -Math.random() * 80 - 40,
          life: 0.5, maxLife: 0.5,
          color: '#fde68a',
          size: Math.random() * 4 + 2, type: 'coin',
        });
      }
    }
  }

  private spawnMagnetPullEffect(fromX: number, fromY: number): void {
    const count = 6;
    for (let i = 0; i < count; i++) {
      const angle = Math.atan2(this.playerY - fromY, this.playerX - fromX);
      const jitter = (Math.random() - 0.5) * 0.6;
      const speed = Math.random() * 150 + 80;
      this.particles.push({
        x: fromX + (Math.random() - 0.5) * 10,
        y: fromY + (Math.random() - 0.5) * 10,
        vx: Math.cos(angle + jitter) * speed,
        vy: Math.sin(angle + jitter) * speed,
        life: 0.35, maxLife: 0.35,
        color: '#f97316',
        size: Math.random() * 4 + 2,
        type: 'magnet_pull',
      });
    }
  }

  private spawnShieldBreakEffect(): void {
    const colors = ['#22d3ee', '#06b6d4', '#0ea5e9', '#38bdf8', '#7dd3fc'];
    for (let i = 0; i < 28; i++) {
      const angle = (Math.PI * 2 * i) / 28;
      const speed = Math.random() * 200 + 80;
      this.particles.push({
        x: this.playerX + Math.cos(angle) * 30,
        y: this.playerY + Math.sin(angle) * 30,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0, maxLife: 1.0,
        color: colors[i % colors.length],
        size: Math.random() * 8 + 3,
        type: 'spark',
      });
    }
    this.shieldHitFlash = 1.0;
    this.shieldSaveAnim = 1.0;
  }

  private spawnXpParticles(): void {
    const colors = ['#38bdf8', '#7dd3fc', '#bae6fd', '#22d3ee'];
    for (let i = 0; i < 16; i++) {
      const angle = (Math.PI * 2 * i) / 16;
      const speed = Math.random() * 100 + 50;
      this.particles.push({
        x: this.playerX + (Math.random() - 0.5) * 20,
        y: this.playerY - 20,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 60,
        life: 0.9, maxLife: 0.9,
        color: colors[i % colors.length],
        size: Math.random() * 5 + 2,
        type: 'xp',
      });
    }
  }

  private spawnFloatingText(x: number, y: number, text: string, color: string): void {
    this.floatingTexts.push({ x, y, text, color, life: 1.5, maxLife: 1.5, vy: -45 });
  }

  private resize = (): void => {
    if (!this.canvas) return;
    try {
      const parent = this.canvas.parentElement;
      const rawW = parent && Number.isFinite(parent.clientWidth)  && parent.clientWidth  > 0 ? parent.clientWidth  : 360;
      const rawH = parent && Number.isFinite(parent.clientHeight) && parent.clientHeight > 0 ? parent.clientHeight : 640;
      this.width     = Math.max(280, Math.min(rawW, 480));
      this.height    = Math.max(rawH, 500);
      this.laneWidth = this.width / LANE_COUNT;
      this.canvas.width  = this.width;
      this.canvas.height = this.height;
      this.bgGradientCache = null;
      this.playerX       = this.laneCenter(this.playerLane);
      this.playerTargetX = this.playerX;
      this.playerY       = this.height - 90;
      if (this.bubbles.length) {
        for (const b of this.bubbles) {
          b.x = Math.random() * this.width;
          b.y = Math.random() * this.height;
        }
      }
    } catch (e) {
      console.error('GameEngine.resize error:', e);
    }
  };

  private laneCenter(lane: LaneIndex): number {
    return this.laneWidth * lane + this.laneWidth / 2;
  }

  private reset(): void {
    this.obstacles = []; this.boxes = []; this.particles = []; this.foamParticles = [];
    this.floatingTexts = [];
    this.spawnTimer = 0; this.elapsedSeconds = 0;
    this.playerLane    = 1;
    this.playerTargetX = this.laneCenter(1);
    this.playerX       = this.playerTargetX;
    this.playerTilt    = 0;
    this.waveTime      = 0;
    this.shieldHitFlash = 0;
    this.shieldSaveAnim = 0;
    this.magnetRingPulse = 0;
    this.magnetActivateAnim = 0;
    this.shieldActivateAnim = 0;
    this.rewardFlash = null;
    this.xpPopAnim = 0;
    this.recentCoinCollects = 0;
    this.coinStreakTimer = 0;
    this.runCoinsCollected = 0;
    this.runBoxesCollected = 0;
    this.state         = this.defaultState();
    this.emitState();
  }

  private currentSpeed(): number {
    const ramp = this.elapsedSeconds * SPEED_RAMP_PER_SEC * (0.5 + 0.5 * this.difficultyRamp());
    let speed = Math.min(BASE_SPEED + ramp, MAX_SPEED);
    const now = performance.now();
    if (now < this.state.speedBoostUntil) speed *= 1.6;
    if (now < this.state.slowUntil)       speed *= 0.5;
    if (now < this.state.freezeUntil)     speed  = 0;
    return speed;
  }

  private difficultyRamp(): number {
    const t = Math.min(1, Math.max(0, this.elapsedSeconds - SAFE_START_SECONDS) / DIFFICULTY_RAMP_SECONDS);
    return t * t * (3 - 2 * t);
  }

  // ── Game loop ───────────────────────────────────────────────────────────────

  private loop = (timestamp: number): void => {
    if (this.isDisposed || this.state.isGameOver || this.state.isPaused) return;
    if (!this.isCanvasUsable()) {
      this.cancelLoop();
      return;
    }

    const raw = timestamp - this.lastTimestamp;
    const delta = Math.min(raw > 0 ? raw / 1000 : 0.016, 0.05);
    this.lastTimestamp   = timestamp;
    this.elapsedSeconds += delta;
    this.waveTime       += delta;

    try {
      this.update(delta);
      this.render();
    } catch (e) {
      console.error('GameEngine loop error:', e);
      this.cancelLoop();
      return;
    }

    if (!this.isDisposed && !this.state.isGameOver && !this.state.isPaused) {
      this.animationFrameId = requestAnimationFrame(this.loop);
    }
  };

  private update(delta: number): void {
    const speed = this.currentSpeed();
    this.playerX   += (this.playerTargetX - this.playerX) * Math.min(1, 10 * delta);
    this.playerTilt *= Math.pow(0.05, delta);
    this.shieldPulse += delta * 3;
    this.magnetPulse += delta * 4;
    this.magnetRingPulse += delta * 2;

    if (this.shieldHitFlash > 0)      this.shieldHitFlash = Math.max(0, this.shieldHitFlash - delta * 4);
    if (this.shieldSaveAnim > 0)      this.shieldSaveAnim = Math.max(0, this.shieldSaveAnim - delta * 1.5);
    if (this.magnetActivateAnim > 0)  this.magnetActivateAnim = Math.max(0, this.magnetActivateAnim - delta * 1.2);
    if (this.shieldActivateAnim > 0)  this.shieldActivateAnim = Math.max(0, this.shieldActivateAnim - delta * 1.2);
    if (this.xpPopAnim > 0)           this.xpPopAnim = Math.max(0, this.xpPopAnim - delta * 2);
    if (this.coinStreakTimer > 0) {
      this.coinStreakTimer -= delta;
      if (this.coinStreakTimer <= 0) this.recentCoinCollects = 0;
    }
    if (this.rewardFlash) {
      this.rewardFlash.life -= delta * 3;
      if (this.rewardFlash.life <= 0) this.rewardFlash = null;
    }

    // Update floating texts
    for (const ft of this.floatingTexts) {
      ft.y += ft.vy * delta;
      ft.life -= delta;
    }
    this.floatingTexts = this.floatingTexts.filter(ft => ft.life > 0);

    for (const wl of this.waveLayers) wl.offset += wl.speed * delta;
    for (const ob of this.obstacles)  { ob.y += speed * delta; ob.wobble += delta * 3; }
    for (const box of this.boxes)     { box.y += speed * delta; box.pulse += delta * 4; }

    for (const p of this.particles) {
      p.x += p.vx * delta; p.y += p.vy * delta;
      if (p.type !== 'magnet_pull' && p.type !== 'xp') {
        p.vy += 120 * delta;
      } else if (p.type === 'xp') {
        p.vy -= 20 * delta;
      }
      p.life -= delta;
    }
    this.particles = this.particles.filter(p => p.life > 0);

    for (const b of this.bubbles) {
      b.y -= b.speed;
      if (b.y < -10) { b.y = this.height + 5; b.x = Math.random() * this.width; }
    }
    for (const f of this.foamParticles) f.life -= delta;
    this.foamParticles = this.foamParticles.filter(f => f.life > 0);
    if (Math.random() < delta * 3) {
      this.foamParticles.push({ x: Math.random() * this.width, y: Math.random() * this.height, life: 0.8 + Math.random() * 0.5, maxLife: 1.3, r: Math.random() * 6 + 2 });
    }

    this.spawnTimer += delta;
    const introInterval = 1.6;
    const baseInterval  = Math.max(0.45, 1.1 - this.elapsedSeconds * 0.01);
    const spawnInterval = introInterval + (baseInterval - introInterval) * this.difficultyRamp();
    if (this.spawnTimer >= spawnInterval) { this.spawnTimer = 0; this.spawnEntity(); }

    this.state.score += Math.round(speed * delta * 0.1);
    this.state.survivalSeconds = this.elapsedSeconds;

    const now = performance.now();

    // Magnet: pull ALL boxes toward player lane with visual effect
    if (now < this.state.magnetUntil) {
      const magnetRadius = this.height * 0.6;
      for (const box of this.boxes) {
        const boxX = this.laneCenter(box.lane);
        const distY = Math.abs(box.y - this.playerY);
        if (distY < magnetRadius && box.lane !== this.playerLane) {
          if (box.y > this.height * 0.2 && box.y < this.playerY + 80) {
            if (Math.random() < 0.3) {
              this.spawnMagnetPullEffect(boxX, box.y);
            }
            box.lane = this.playerLane;
          }
        }
      }
    }

    this.handleCollisions();

    for (const ob of this.obstacles) {
      if (!ob.passed && ob.y > this.playerY + 60) { ob.passed = true; this.state.obstaclesAvoided++; }
    }
    this.obstacles = this.obstacles.filter(ob  => ob.y  < this.height + ob.height);
    this.boxes     = this.boxes.filter(    box => box.y < this.height + box.height);
    this.emitState();
  }

  private spawnEntity(): void {
    const lane = Math.floor(Math.random() * LANE_COUNT) as LaneIndex;
    const roll = Math.random();
    const introObstacleChance = 0.25;
    const baseObstacleChance  = 0.55;
    const obstacleChance = introObstacleChance + (baseObstacleChance - introObstacleChance) * this.difficultyRamp();

    if (roll < obstacleChance) {
      const playerSafeTop = this.playerY - PLAYER_SAFE_ZONE;

      const isLaneBlocked = (l: LaneIndex): boolean => {
        return this.obstacles.some(ob => {
          if (ob.lane !== l) return false;
          if (ob.y > 0 && ob.y < playerSafeTop) return true;
          if (ob.y <= 0 && ob.y > OBSTACLE_SPAWN_Y - 20) return true;
          return false;
        });
      };

      const primaryBlocked = isLaneBlocked(lane);

      if (primaryBlocked) {
        const otherLanes = ([0, 1, 2] as LaneIndex[]).filter(l => l !== lane);
        const unblocked = otherLanes.filter(l => !isLaneBlocked(l));
        if (unblocked.length === 0) return;

        const altLane = unblocked[Math.floor(Math.random() * unblocked.length)];
        const type  = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
        const sizeT = 0.8 + 0.2 * this.difficultyRamp();
        this.obstacles.push({
          lane: altLane,
          y: OBSTACLE_SPAWN_Y,
          width: this.laneWidth * 0.6 * sizeT,
          height: 50 * sizeT,
          type, wobble: 0, passed: false,
        });
        return;
      }

      const type  = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
      const sizeT = 0.8 + 0.2 * this.difficultyRamp();
      this.obstacles.push({
        lane, y: OBSTACLE_SPAWN_Y,
        width: this.laneWidth * 0.6 * sizeT,
        height: 50 * sizeT,
        type, wobble: 0, passed: false,
      });
    } else {
      const pool = Math.random() < 0.65 ? POSITIVE_BOXES : NEGATIVE_BOXES;
      const type = pool[Math.floor(Math.random() * pool.length)];
      this.boxes.push({ lane, y: OBSTACLE_SPAWN_Y, width: this.laneWidth * 0.5, height: 40, type, pulse: 0 });
    }
  }

  private handleCollisions(): void {
    if (this.elapsedSeconds < SAFE_START_SECONDS) return;
    if (this.playerY < 80) return;

    const FUDGE = 0.44;
    const playerHalfW  = (this.laneWidth * 0.45) * FUDGE;
    const playerTop    = this.playerY - 28;
    const playerBottom = this.playerY + 22;

    for (const ob of this.obstacles) {
      if (ob.lane !== this.playerLane) continue;
      if (ob.y < 10) continue;

      const obTop    = ob.y - ob.height / 2;
      const obBottom = ob.y + ob.height / 2;

      if (obBottom < playerTop || obTop > playerBottom) continue;

      const obHalfW = (ob.width / 2) * FUDGE;
      const laneOffset = Math.abs(this.laneCenter(ob.lane) - this.playerX);
      if (laneOffset > obHalfW + playerHalfW) continue;

      this.onObstacleHit(ob);
      ob.y = this.height + ob.height + 10;
    }

    for (const box of this.boxes) {
      if (box.lane !== this.playerLane) continue;

      const bTop    = box.y - box.height / 2;
      const bBottom = box.y + box.height / 2;
      if (bBottom < playerTop || bTop > playerBottom) continue;

      const glowColor = this.boxGlowColor(box.type);
      this.spawnCollectEffect(this.laneCenter(box.lane), box.y, glowColor, box.type === 'coins' ? 'coin' : 'spark');
      this.rewardFlash = { color: glowColor, life: 1.0 };
      soundEngine.powerup(box.type);
      this.onBoxCollected(box);
      box.y = this.height + box.height + 10;
    }
  }

  private onObstacleHit(_ob: Obstacle): void {
    if (this.state.hasShield) {
      this.state.hasShield = false;
      this.state.shieldUsedThisRun = true;
      this.spawnShieldBreakEffect();
      soundEngine.shield();
      this.spawnFloatingText(this.playerX, this.playerY - 60, '🛡 Shield Used!', '#06b6d4');
      try { if (this.callbacks.onShieldUsed) this.callbacks.onShieldUsed(); } catch {}
      this.emitState();
      return;
    }
    soundEngine.obstacle();
    this.endGame();
  }

  private onBoxCollected(box: MysteryBox): void {
    const now = performance.now();
    this.runBoxesCollected++;
    this.state.boxesCollected = this.runBoxesCollected;

    switch (box.type) {
      case 'coins': {
        const safeCombo = Number.isFinite(this.state.combo) ? this.state.combo : 1;
        const a = 10 * Math.max(1, safeCombo);
        this.state.coins += a;
        this.state.score += a;
        this.runCoinsCollected++;
        this.state.coinsCollected = this.runCoinsCollected;
        soundEngine.coin();
        soundEngine.combo(safeCombo);
        this.recentCoinCollects++;
        this.coinStreakTimer = 1.5;
        this.spawnFloatingText(this.laneCenter(box.lane), box.y - 20, `+${a} 🪙`, '#f59e0b');
        if (this.callbacks.onCoinCollect) {
          try { this.callbacks.onCoinCollect(this.laneCenter(box.lane), box.y); } catch (e) {
            console.error('onCoinCollect callback error:', e);
          }
        }
        break;
      }
      case 'shield':
        this.state.hasShield = true;
        this.shieldActivateAnim = 1.0;
        soundEngine.shieldActivate();
        this.spawnFloatingText(this.laneCenter(box.lane), box.y - 20, '🛡 Shield!', '#06b6d4');
        break;
      case 'magnet':
        this.state.magnetUntil = now + 6000;
        this.magnetActivateAnim = 1.0;
        soundEngine.magnetActivate();
        this.spawnFloatingText(this.laneCenter(box.lane), box.y - 20, '🧲 Magnet!', '#f97316');
        try { if (this.callbacks.onMagnetCollected) this.callbacks.onMagnetCollected(); } catch {}
        break;
      case 'speed':
        this.state.speedBoostUntil = now + 5000;
        this.spawnFloatingText(this.laneCenter(box.lane), box.y - 20, '⚡ Speed!', '#10b981');
        break;
      case 'combo':
        this.state.combo = Math.min(Math.max(1, this.state.combo) + 1, 8);
        soundEngine.combo(this.state.combo);
        this.spawnFloatingText(this.laneCenter(box.lane), box.y - 20, `x${this.state.combo} Combo!`, '#ec4899');
        break;
      case 'coinCut':
        this.state.coins = Math.max(0, this.state.coins - 20);
        this.state.combo = 1;
        this.spawnFloatingText(this.laneCenter(box.lane), box.y - 20, '-20 Coins!', '#ef4444');
        break;
      case 'freeze':
        this.state.freezeUntil = now + 1200;
        this.state.combo = 1;
        this.spawnFloatingText(this.laneCenter(box.lane), box.y - 20, '❄ Frozen!', '#60a5fa');
        break;
      case 'slowWave':
        this.state.slowUntil = now + 4000;
        this.state.combo = 1;
        this.spawnFloatingText(this.laneCenter(box.lane), box.y - 20, '🌀 Slow!', '#0d9488');
        break;
    }
  }

  private endGame(): void {
    if (this.state.isGameOver) return;
    this.state.isGameOver = true;
    this.emitState();
    this.cancelLoop();
    setTimeout(() => {
      try {
        const safeScore   = Number.isFinite(this.state.score)            ? Math.max(0, this.state.score)            : 0;
        const safeCoins   = Number.isFinite(this.state.coins)            ? Math.max(0, this.state.coins)            : 0;
        const safeAvoided = Number.isFinite(this.state.obstaclesAvoided) ? Math.max(0, this.state.obstaclesAvoided) : 0;
        const safeSurvival = Number.isFinite(this.elapsedSeconds)         ? Math.max(0, this.elapsedSeconds)         : 0;
        const safeCoinsCollected = Math.max(0, this.runCoinsCollected);
        const safeBoxesCollected = Math.max(0, this.runBoxesCollected);
        this.callbacks.onGameOver(safeScore, safeCoins, safeAvoided, safeSurvival, safeCoinsCollected, safeBoxesCollected);
      } catch (e) {
        console.error('onGameOver callback error:', e);
        try { this.callbacks.onGameOver(0, 0, 0, 0, 0, 0); } catch {}
      }
    }, 50);
  }

  private emitState(): void {
    try {
      const snapshot: GameState = this.sanitizeState(this.state);
      this.callbacks.onStateChange(snapshot);
    } catch (e) {
      console.error('onStateChange callback error:', e);
      try { this.callbacks.onStateChange(this.defaultState()); } catch {}
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  private renderIdleBackground(): void { this.drawBackground(); }

  private render(): void {
    this.drawBackground();
    this.drawFoam();
    this.drawBubbles();
    this.drawLaneLines();
    this.drawParticles();

    const now = performance.now();

    // Draw magnet field ring
    if (now < this.state.magnetUntil) {
      this.drawMagnetField();
    }
    // Magnet activation burst
    if (this.magnetActivateAnim > 0) {
      this.drawMagnetActivateBurst();
    }
    // Shield activation burst
    if (this.shieldActivateAnim > 0) {
      this.drawShieldActivateBurst();
    }

    for (const box of this.boxes)     this.drawMysteryBox(box);
    for (const ob  of this.obstacles) this.drawObstacle(ob);
    this.drawPlayer();

    // Shield save ring
    if (this.shieldSaveAnim > 0) {
      this.drawShieldSaveRing();
    }
    // Shield hit flash overlay
    if (this.shieldHitFlash > 0) {
      this.ctx.fillStyle = `rgba(34,211,238,${this.shieldHitFlash * 0.35})`;
      this.ctx.fillRect(0, 0, this.width, this.height);
    }
    // XP pop overlay
    if (this.xpPopAnim > 0) {
      this.ctx.fillStyle = `rgba(56,189,248,${this.xpPopAnim * 0.15})`;
      this.ctx.fillRect(0, 0, this.width, this.height);
    }
    // Reward flash
    if (this.rewardFlash && this.rewardFlash.life > 0) {
      const [r, g, b] = this.hexToRgb(this.rewardFlash.color);
      this.ctx.fillStyle = `rgba(${r},${g},${b},${this.rewardFlash.life * 0.12})`;
      this.ctx.fillRect(0, 0, this.width, this.height);
    }

    // Draw floating texts
    this.drawFloatingTexts();

    // Draw in-game powerup timers HUD
    this.drawPowerupTimersHud();

    if (this.state.isPaused) this.drawPauseOverlay();
  }

  private drawShieldSaveRing(): void {
    const ctx = this.ctx;
    const progress = 1 - this.shieldSaveAnim;
    const radius = 40 + progress * 80;
    const alpha = this.shieldSaveAnim;
    ctx.save();
    ctx.translate(this.playerX, this.playerY);
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(34,211,238,${alpha * 0.9})`;
    ctx.lineWidth = 4 * this.shieldSaveAnim;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.3, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(6,182,212,${alpha * 0.4})`;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  private drawShieldActivateBurst(): void {
    const ctx = this.ctx;
    const alpha = this.shieldActivateAnim;
    const progress = 1 - alpha;
    ctx.save();
    ctx.translate(this.playerX, this.playerY);
    for (let i = 0; i < 12; i++) {
      const angle = (Math.PI * 2 * i) / 12;
      const r = 25 + progress * 65;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 15, Math.sin(angle) * 15);
      ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      ctx.strokeStyle = `rgba(34,211,238,${alpha * 0.9})`;
      ctx.lineWidth = 2.5 * alpha;
      ctx.stroke();
    }
    // Expanding ring
    const ringR = 20 + progress * 60;
    ctx.beginPath();
    ctx.arc(0, 0, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(125,211,252,${alpha * 0.7})`;
    ctx.lineWidth = 3 * alpha;
    ctx.stroke();
    ctx.restore();
  }

  private drawMagnetActivateBurst(): void {
    const ctx = this.ctx;
    const alpha = this.magnetActivateAnim;
    const progress = 1 - alpha;
    ctx.save();
    ctx.translate(this.playerX, this.playerY);
    for (let i = 0; i < 8; i++) {
      const angle = (Math.PI * 2 * i) / 8;
      const r = 30 + progress * 70;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 20, Math.sin(angle) * 20);
      ctx.lineTo(Math.cos(angle) * r, Math.sin(angle) * r);
      ctx.strokeStyle = `rgba(249,115,22,${alpha * 0.8})`;
      ctx.lineWidth = 2.5 * alpha;
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawMagnetField(): void {
    const ctx = this.ctx;
    const cx = this.laneCenter(this.playerLane);
    const cy = this.playerY;
    const r1 = 55 + Math.sin(this.magnetRingPulse) * 8;
    const r2 = 90 + Math.sin(this.magnetRingPulse * 1.3) * 10;

    ctx.save();
    // Inner ring
    ctx.beginPath();
    ctx.arc(cx, cy, r1, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(249,115,22,${0.25 + Math.sin(this.magnetRingPulse) * 0.1})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 6]);
    ctx.stroke();
    ctx.setLineDash([]);
    // Outer ring
    ctx.beginPath();
    ctx.arc(cx, cy, r2, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(249,115,22,${0.12 + Math.sin(this.magnetRingPulse * 0.8) * 0.05})`;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 8]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private drawFloatingTexts(): void {
    const ctx = this.ctx;
    for (const ft of this.floatingTexts) {
      const ratio = ft.life / ft.maxLife;
      const alpha = Math.min(1, ratio * 2);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = "bold 14px 'Orbitron', sans-serif";
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = 'rgba(2,9,22,0.8)';
      ctx.lineWidth = 3;
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    }
  }

  private drawPowerupTimersHud(): void {
    const ctx = this.ctx;
    const now = performance.now();
    const items: { label: string; color: string; remaining: number; total: number }[] = [];

    if (this.state.hasShield) {
      items.push({ label: '🛡', color: '#06b6d4', remaining: 1, total: 1 });
    }
    if (now < this.state.magnetUntil) {
      const rem = (this.state.magnetUntil - now) / 1000;
      items.push({ label: '🧲', color: '#f97316', remaining: rem, total: 6 });
    }
    if (now < this.state.speedBoostUntil) {
      const rem = (this.state.speedBoostUntil - now) / 1000;
      items.push({ label: '⚡', color: '#10b981', remaining: rem, total: 5 });
    }
    if (now < this.state.slowUntil) {
      const rem = (this.state.slowUntil - now) / 1000;
      items.push({ label: '🌀', color: '#0d9488', remaining: rem, total: 4 });
    }
    if (now < this.state.freezeUntil) {
      const rem = (this.state.freezeUntil - now) / 1000;
      items.push({ label: '❄', color: '#60a5fa', remaining: rem, total: 1.2 });
    }

    if (items.length === 0) return;

    const startX = this.width - 12;
    const startY = 12;
    const itemH = 30;
    const barW = 48;

    ctx.save();
    items.forEach((item, i) => {
      const y = startY + i * (itemH + 4);
      const pct = item.total > 1 ? Math.min(1, item.remaining / item.total) : 1;

      // Background pill
      ctx.fillStyle = 'rgba(2,9,22,0.75)';
      ctx.beginPath();
      ctx.roundRect(startX - barW - 22, y, barW + 22, itemH, 6);
      ctx.fill();

      // Emoji label
      ctx.font = '14px serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(item.label, startX - barW - 20, y + itemH / 2);

      // Timer bar bg
      ctx.fillStyle = 'rgba(255,255,255,0.1)';
      ctx.beginPath();
      ctx.roundRect(startX - barW - 2, y + 8, barW, itemH - 16, 3);
      ctx.fill();

      // Timer bar fill
      ctx.fillStyle = item.color;
      ctx.beginPath();
      ctx.roundRect(startX - barW - 2, y + 8, barW * pct, itemH - 16, 3);
      ctx.fill();

      // Timer text for timed items
      if (item.total > 1) {
        ctx.font = "bold 9px 'Inter', sans-serif";
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillText(`${item.remaining.toFixed(1)}s`, startX - barW / 2 - 2, y + itemH / 2);
      }
    });
    ctx.restore();
  }

  private drawBackground(): void {
    const ctx = this.ctx;
    if (!this.bgGradientCache) {
      const g = ctx.createLinearGradient(0, 0, 0, this.height);
      g.addColorStop(0,   '#071a35');
      g.addColorStop(0.4, '#0a2245');
      g.addColorStop(1,   '#020916');
      this.bgGradientCache = g;
    }
    ctx.fillStyle = this.bgGradientCache;
    ctx.fillRect(0, 0, this.width, this.height);
    for (const wl of this.waveLayers) {
      const yBase = wl.y * this.height;
      const segs = this.isLowPower ? 8 : 20;
      ctx.beginPath();
      for (let i = 0; i <= segs; i++) {
        const x = (i / segs) * this.width;
        const y = yBase + Math.sin((i / segs) * Math.PI * 4 + wl.offset) * wl.amplitude;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.lineTo(this.width, this.height);
      ctx.lineTo(0, this.height);
      ctx.closePath();
      ctx.fillStyle = wl.color;
      ctx.fill();
    }
  }

  private drawFoam(): void {
    if (this.isLowPower) return;
    for (const f of this.foamParticles) {
      this.ctx.beginPath();
      this.ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(255,255,255,${(f.life / f.maxLife) * 0.18})`;
      this.ctx.fill();
    }
  }

  private drawBubbles(): void {
    if (this.isLowPower) return;
    for (const b of this.bubbles) {
      this.ctx.beginPath();
      this.ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      this.ctx.fillStyle = `rgba(255,255,255,${b.opacity})`;
      this.ctx.fill();
    }
  }

  private drawLaneLines(): void {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.setLineDash([12, 18]);
    ctx.lineDashOffset = -(this.elapsedSeconds * 80 % 30);
    for (let i = 1; i < LANE_COUNT; i++) {
      ctx.beginPath();
      ctx.moveTo(this.laneWidth * i, 0);
      ctx.lineTo(this.laneWidth * i, this.height);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const ratio = p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0, Math.min(1, ratio));
      if (p.type === 'coin') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * ratio, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x - p.size * 0.3, p.y - p.size * 0.3, p.size * 0.3 * ratio, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,200,0.6)';
        ctx.fill();
      } else if (p.type === 'xp') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(ratio * Math.PI);
        const s = p.size * ratio;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(0, -s); ctx.lineTo(s * 0.3, -s * 0.3);
        ctx.lineTo(s, 0); ctx.lineTo(s * 0.3, s * 0.3);
        ctx.lineTo(0, s); ctx.lineTo(-s * 0.3, s * 0.3);
        ctx.lineTo(-s, 0); ctx.lineTo(-s * 0.3, -s * 0.3);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (p.type === 'magnet_pull') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.7, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (p.type === 'spark' ? ratio : ctx.globalAlpha), 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawPauseOverlay(): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(2,9,22,0.55)';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.font = "bold 28px 'Orbitron',monospace";
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PAUSED', this.width / 2, this.height / 2);
    ctx.font = "14px 'Inter',sans-serif";
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('Press Space / P to resume', this.width / 2, this.height / 2 + 36);
  }

  private drawPlayer(): void {
    const ctx = this.ctx;

    // Shield glow effect (enhanced — clearly visible)
    if (this.state.hasShield) {
      ctx.save();
      ctx.translate(this.playerX, this.playerY);
      const shieldAlpha = Math.sin(this.shieldPulse) * 0.25 + 0.65;
      ctx.globalAlpha = shieldAlpha;
      const sg = ctx.createRadialGradient(0, 0, 8, 0, 0, 56);
      sg.addColorStop(0, 'rgba(34,211,238,0.8)');
      sg.addColorStop(0.5, 'rgba(34,211,238,0.4)');
      sg.addColorStop(1, 'rgba(34,211,238,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(0, 0, 56, 0, Math.PI * 2); ctx.fill();
      // Shield ring — solid glowing ring
      ctx.globalAlpha = shieldAlpha * 0.9;
      ctx.strokeStyle = `rgba(34,211,238,${shieldAlpha})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 44, 0, Math.PI * 2); ctx.stroke();
      // Inner ring flicker
      ctx.globalAlpha = shieldAlpha * 0.5;
      ctx.strokeStyle = `rgba(125,211,252,${shieldAlpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 0, 36, 0, Math.PI * 2); ctx.stroke();
      // Shield icon indicator above player
      ctx.globalAlpha = 0.85;
      ctx.font = '13px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🛡', 0, -54);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Magnet glow effect
    const now = performance.now();
    if (now < this.state.magnetUntil) {
      ctx.save();
      ctx.translate(this.playerX, this.playerY);
      ctx.globalAlpha = 0.3 + Math.sin(this.magnetPulse) * 0.15;
      const mg = ctx.createRadialGradient(0, 0, 10, 0, 0, 60);
      mg.addColorStop(0, 'rgba(249,115,22,0.55)');
      mg.addColorStop(0.5, 'rgba(249,115,22,0.25)');
      mg.addColorStop(1, 'rgba(249,115,22,0)');
      ctx.fillStyle = mg;
      ctx.beginPath(); ctx.arc(0, 0, 60, 0, Math.PI * 2); ctx.fill();
      // Magnet arc timer
      const magnetRemaining = Math.max(0, (this.state.magnetUntil - now) / 6000);
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = 'rgba(249,115,22,0.4)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 48, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * magnetRemaining);
      ctx.stroke();
      // Magnet icon indicator above player
      ctx.globalAlpha = 0.85;
      const iconY = this.state.hasShield ? -66 : -54;
      ctx.font = '13px serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('🧲', 0, iconY);
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Speed boost trail
    if (now < this.state.speedBoostUntil) {
      ctx.save();
      ctx.translate(this.playerX, this.playerY);
      const bg = ctx.createLinearGradient(0, 0, 0, 50);
      bg.addColorStop(0, 'rgba(16,185,129,0.4)');
      bg.addColorStop(1, 'rgba(16,185,129,0)');
      ctx.fillStyle = bg;
      ctx.fillRect(-15, 20, 30, 50);
      ctx.restore();
    }

    // Draw surfer
    ctx.save();
    ctx.translate(this.playerX, this.playerY);
    ctx.rotate(this.playerTilt);
    const boardGrad = ctx.createLinearGradient(-24, 20, 24, 28);
    boardGrad.addColorStop(0,   '#38bdf8');
    boardGrad.addColorStop(0.5, '#0284c7');
    boardGrad.addColorStop(1,   '#1e40af');
    ctx.fillStyle = boardGrad;
    ctx.beginPath();
    ctx.moveTo(-22, 20); ctx.bezierCurveTo(-24, 30, -16, 36, 0, 36);
    ctx.bezierCurveTo(16, 36, 24, 30, 22, 20); ctx.bezierCurveTo(20, 10, -5, 20, 0, 20);
    ctx.lineTo(-5, 28); ctx.lineTo(5, 28); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1e3a8a';
    ctx.beginPath(); ctx.ellipse(0, -8, 5, 9, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -20, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#fde68a'; ctx.fill();
    ctx.strokeStyle = '#1e3a8a'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-5, -10); ctx.lineTo(-14, -5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(5, -10);  ctx.lineTo(14, -5);  ctx.stroke();
    ctx.restore();
  }

  private drawObstacle(ob: Obstacle): void {
    const ctx = this.ctx;
    const x   = this.laneCenter(ob.lane);
    const wob = Math.sin(ob.wobble) * 3;
    ctx.save();
    ctx.translate(x, ob.y + wob);
    switch (ob.type) {
      case 'rock': {
        const g = ctx.createRadialGradient(-5, -8, 2, 0, 0, 22);
        g.addColorStop(0, '#9ca3af'); g.addColorStop(0.5, '#6b7280'); g.addColorStop(1, '#374151');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(0, -22); ctx.bezierCurveTo(14, -20, 22, -8, 20, 6);
        ctx.bezierCurveTo(18, 18, -18, 18, -20, 6); ctx.bezierCurveTo(-22, -8, -14, -20, 0, -22);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath(); ctx.ellipse(-4, -10, 7, 4, -0.5, 0, Math.PI * 2); ctx.fill();
        break;
      }
      case 'shark': {
        ctx.shadowColor = '#374151'; ctx.shadowBlur = 10;
        const sg = ctx.createLinearGradient(-20, -15, 20, 15);
        sg.addColorStop(0, '#4b5563'); sg.addColorStop(1, '#1f2937');
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.ellipse(0, 5, 20, 14, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#374151';
        ctx.beginPath(); ctx.moveTo(-4, -14); ctx.lineTo(6, -28); ctx.lineTo(12, -14); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'white'; ctx.beginPath(); ctx.arc(10, 2, 4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#1f2937'; ctx.beginPath(); ctx.arc(11, 2, 2, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        break;
      }
      case 'jellyfish': {
        ctx.shadowColor = '#a855f7'; ctx.shadowBlur = 15;
        const jg = ctx.createRadialGradient(0, -5, 2, 0, -5, 20);
        jg.addColorStop(0, 'rgba(192,132,252,0.9)'); jg.addColorStop(0.6, 'rgba(168,85,247,0.75)'); jg.addColorStop(1, 'rgba(147,51,234,0.5)');
        ctx.fillStyle = jg;
        ctx.beginPath(); ctx.arc(0, -5, 20, Math.PI, 0); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(192,132,252,0.7)'; ctx.lineWidth = 1.5;
        for (let t = -3; t <= 3; t++) {
          const tx = t * 5;
          ctx.beginPath(); ctx.moveTo(tx, 12);
          for (let seg = 0; seg < 4; seg++) {
            ctx.quadraticCurveTo(tx + (seg % 2 === 0 ? 4 : -4), 12 + seg * 5 + 3, tx, 12 + (seg + 1) * 5);
          }
          ctx.stroke();
        }
        ctx.shadowBlur = 0;
        break;
      }
      case 'wave': {
        ctx.shadowColor = '#1d4ed8'; ctx.shadowBlur = 12;
        const wg = ctx.createLinearGradient(-25, -18, 25, 20);
        wg.addColorStop(0, '#93c5fd'); wg.addColorStop(0.4, '#3b82f6'); wg.addColorStop(1, '#1d4ed8');
        ctx.fillStyle = wg;
        ctx.beginPath();
        ctx.moveTo(-28, 18); ctx.bezierCurveTo(-28, -10, -10, -24, 0, -20);
        ctx.bezierCurveTo(12, -16, 22, -4, 28, 18); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath(); ctx.ellipse(-6, -18, 12, 4, -0.3, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        break;
      }
    }
    ctx.restore();
  }

  private drawMysteryBox(box: MysteryBox): void {
    const ctx      = this.ctx;
    const x        = this.laneCenter(box.lane);
    const pulse    = Math.sin(box.pulse) * 0.12 + 1;
    const floatY   = Math.sin(box.pulse * 0.7) * 4;
    const glowColor = this.boxGlowColor(box.type);
    ctx.save();
    ctx.translate(x, box.y + floatY);
    ctx.scale(pulse, pulse);

    const [r, g, b] = this.hexToRgb(glowColor);
    const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, 28);
    glow.addColorStop(0, `rgba(${r},${g},${b},0.5)`);
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = glowColor; ctx.shadowColor = glowColor; ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.roundRect(-18, -18, 36, 36, 8); ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath(); ctx.roundRect(-14, -14, 28, 14, 5); ctx.fill();

    this.drawBoxLabel(box.type);

    ctx.restore();
  }

  private drawBoxLabel(type: BoxType): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(2,9,22,0.85)';
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    switch (type) {
      case 'coins': {
        ctx.beginPath(); ctx.arc(0, 0, 9, 0, Math.PI * 2);
        ctx.fillStyle = '#020916'; ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 6); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, -2, 4, Math.PI * 0.2, Math.PI * 1.8); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 2, 4, -Math.PI * 0.8, Math.PI * 0.2); ctx.stroke();
        break;
      }
      case 'shield': {
        ctx.fillStyle = '#020916';
        ctx.beginPath();
        ctx.moveTo(0, -10); ctx.lineTo(9, -6); ctx.lineTo(9, 2);
        ctx.bezierCurveTo(9, 8, 0, 12, 0, 12);
        ctx.bezierCurveTo(0, 12, -9, 8, -9, 2);
        ctx.lineTo(-9, -6); ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8; ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(-4, 1); ctx.lineTo(-1, 5); ctx.lineTo(5, -3); ctx.stroke();
        break;
      }
      case 'magnet': {
        ctx.fillStyle = '#020916';
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(0, 2, 8, Math.PI, 0, false);
        ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-8, 2); ctx.lineTo(-8, 9); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(8, 2); ctx.lineTo(8, 9); ctx.stroke();
        break;
      }
      case 'speed': {
        ctx.fillStyle = '#020916';
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(2, -11); ctx.lineTo(-4, 1); ctx.lineTo(1, 1);
        ctx.lineTo(-2, 11); ctx.lineTo(6, -2); ctx.lineTo(1, -2); ctx.closePath();
        ctx.fill(); ctx.stroke();
        break;
      }
      case 'combo': {
        ctx.fillStyle = '#020916';
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.moveTo(0, -11);
        ctx.bezierCurveTo(5, -5, 9, 0, 8, 5);
        ctx.bezierCurveTo(7, 10, 3, 12, 0, 11);
        ctx.bezierCurveTo(-3, 12, -7, 10, -8, 5);
        ctx.bezierCurveTo(-9, 0, -5, -5, 0, -11);
        ctx.fill(); ctx.stroke();
        break;
      }
      case 'coinCut': {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(-7, -7); ctx.lineTo(7, 7); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(7, -7); ctx.lineTo(-7, 7); ctx.stroke();
        break;
      }
      case 'freeze': {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        for (let a = 0; a < 4; a++) {
          ctx.save();
          ctx.rotate(a * Math.PI / 4);
          ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(0, 10); ctx.stroke();
          ctx.restore();
        }
        ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fillStyle = '#fff'; ctx.fill();
        break;
      }
      case 'slowWave': {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 8, 0, Math.PI * 1.7, false);
        ctx.stroke();
        ctx.beginPath(); ctx.moveTo(7, -5); ctx.lineTo(9, -9); ctx.lineTo(11, -3); ctx.stroke();
        break;
      }
    }
    ctx.restore();
  }

  private hexToRgb(hex: string): [number, number, number] {
    if (!hex || hex.length < 7) return [128, 128, 128];
    try {
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      return [
        isNaN(r) ? 128 : r,
        isNaN(g) ? 128 : g,
        isNaN(b) ? 128 : b,
      ];
    } catch {
      return [128, 128, 128];
    }
  }

  private boxGlowColor(type: BoxType): string {
    const map: Record<BoxType, string> = {
      coins: '#f59e0b', shield: '#06b6d4', magnet: '#f97316', speed: '#10b981',
      combo: '#ec4899', coinCut: '#ef4444', freeze: '#60a5fa', slowWave: '#0d9488',
    };
    return map[type] ?? '#ffffff';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Local Leaderboard
// ─────────────────────────────────────────────────────────────────────────────

export interface LeaderboardEntry { name: string; score: number; coins: number; date: string; }

const LEADERBOARD_KEY = 'surfRushLeaderboard';

export function getLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch { return []; }
}

export function saveToLeaderboard(entry: LeaderboardEntry): LeaderboardEntry[] {
  const updated = [...getLeaderboard(), entry].sort((a, b) => b.score - a.score).slice(0, 10);
  try { localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(updated)); } catch {}
  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// Player Profile  —  stored at 'surfRushProfile'
// ─────────────────────────────────────────────────────────────────────────────

export interface PlayerProfile {
  totalGames: number;
  highScore: number;
  totalCoinsEarned: number;
  dailyRewardsClaimed: number;
  coinBalance: number;
  totalObstaclesAvoided: number;
  totalScoreSum: number;
  xp: number;
  level: number;
  lives: number;
}

export function xpForLevel(level: number): number {
  if (!level || level <= 1) return 0;
  return Math.floor(100 * Math.pow(level - 1, 1.5));
}

export function xpForNextLevel(level: number): number {
  return xpForLevel(Math.max(2, level + 1));
}

export function xpForRun(score: number): number {
  if (!score || score <= 0) return 0;
  return Math.floor(Math.sqrt(Math.max(0, score)) * 2);
}

export function levelFromXp(xp: number): number {
  if (!xp || xp <= 0) return 1;
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return Math.max(1, level);
}

export function rankTitle(level: number): string {
  if (level >= 50) return 'Legend';
  if (level >= 30) return 'Master';
  if (level >= 20) return 'Expert';
  if (level >= 10) return 'Veteran';
  if (level >= 5)  return 'Surfer';
  return 'Beginner';
}

const PROFILE_KEY = 'surfRushProfile';

function defaultProfile(): PlayerProfile {
  return { totalGames: 0, highScore: 0, totalCoinsEarned: 0, dailyRewardsClaimed: 0, coinBalance: 0, totalObstaclesAvoided: 0, totalScoreSum: 0, xp: 0, level: 1, lives: 0 };
}

export function getProfile(): PlayerProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return defaultProfile();
    const parsed = JSON.parse(raw);
    const merged = { ...defaultProfile(), ...parsed };
    merged.totalGames           = Math.max(0, Number(merged.totalGames)           || 0);
    merged.highScore            = Math.max(0, Number(merged.highScore)            || 0);
    merged.totalCoinsEarned     = Math.max(0, Number(merged.totalCoinsEarned)     || 0);
    merged.dailyRewardsClaimed  = Math.max(0, Number(merged.dailyRewardsClaimed)  || 0);
    merged.coinBalance          = Math.max(0, Number(merged.coinBalance)          || 0);
    merged.totalObstaclesAvoided= Math.max(0, Number(merged.totalObstaclesAvoided)|| 0);
    merged.totalScoreSum        = Math.max(0, Number(merged.totalScoreSum)        || 0);
    merged.xp                   = Math.max(0, Number(merged.xp)                  || 0);
    merged.level                = Math.max(1, Number(merged.level)                || 1);
    merged.lives                = Math.max(0, Number(merged.lives)                || 0);
    merged.level = levelFromXp(merged.xp);
    return merged;
  } catch { return defaultProfile(); }
}

export function saveProfile(p: PlayerProfile): void {
  if (!p) return;
  try {
    const safe: PlayerProfile = {
      totalGames:            Math.max(0, Number(p.totalGames)            || 0),
      highScore:             Math.max(0, Number(p.highScore)             || 0),
      totalCoinsEarned:      Math.max(0, Number(p.totalCoinsEarned)      || 0),
      dailyRewardsClaimed:   Math.max(0, Number(p.dailyRewardsClaimed)   || 0),
      coinBalance:           Math.max(0, Number(p.coinBalance)           || 0),
      totalObstaclesAvoided: Math.max(0, Number(p.totalObstaclesAvoided) || 0),
      totalScoreSum:         Math.max(0, Number(p.totalScoreSum)         || 0),
      xp:                    Math.max(0, Number(p.xp)                   || 0),
      level:                 Math.max(1, Number(p.level)                 || 1),
      lives:                 Math.max(0, Number(p.lives)                 || 0),
    };
    localStorage.setItem(PROFILE_KEY, JSON.stringify(safe));
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Achievements  —  stored at 'surfRushAchievements'
// ─────────────────────────────────────────────────────────────────────────────

export type AchievementId =
  | 'first_run' | 'score_100' | 'score_500' | 'score_1000'
  | 'coins_100' | 'coins_500' | 'daily_claim' | 'buy_extra_life'
  | 'streak_3' | 'streak_7' | 'level_5' | 'level_10'
  | 'games_10' | 'games_50';

export interface Achievement {
  id: AchievementId;
  title: string;
  desc: string;
  icon: string;
  color: string;
  unlocked: boolean;
  unlockedAt?: string;
}

const ACHIEVEMENTS_KEY = 'surfRushAchievements';

const ACHIEVEMENT_DEFS: Omit<Achievement, 'unlocked' | 'unlockedAt'>[] = [
  { id: 'first_run',    title: 'First Wave',       desc: 'Complete your first run',             icon: 'Surf',    color: '#22d3ee' },
  { id: 'score_100',    title: 'On The Board',      desc: 'Reach score 100',                     icon: 'Star',    color: '#f59e0b' },
  { id: 'score_500',    title: 'Wave Rider',        desc: 'Reach score 500',                     icon: 'Trophy',  color: '#f59e0b' },
  { id: 'score_1000',   title: 'Surf Legend',       desc: 'Reach score 1000',                    icon: 'Trophy',  color: '#a855f7' },
  { id: 'coins_100',    title: 'Treasure Diver',    desc: 'Collect 100 coins in one run',        icon: 'Coin',    color: '#f59e0b' },
  { id: 'coins_500',    title: 'Gold Rush',         desc: 'Collect 500 coins in one run',        icon: 'Coin',    color: '#fcd34d' },
  { id: 'daily_claim',  title: 'Daily Grind',       desc: 'Claim your daily reward',             icon: 'Gift',    color: '#10b981' },
  { id: 'buy_extra_life', title: 'Second Chance',   desc: 'Purchase an extra life',              icon: 'Heart',   color: '#ec4899' },
  { id: 'streak_3',     title: '3-Day Warrior',     desc: 'Maintain a 3-day play streak',        icon: 'Fire',    color: '#f97316' },
  { id: 'streak_7',     title: 'Week Warrior',      desc: 'Maintain a 7-day play streak',        icon: 'Fire',    color: '#ef4444' },
  { id: 'level_5',      title: 'Rookie Surfer',     desc: 'Reach Level 5',                       icon: 'Star',    color: '#10b981' },
  { id: 'level_10',     title: 'Veteran Surfer',    desc: 'Reach Level 10',                      icon: 'Medal',   color: '#38bdf8' },
  { id: 'games_10',     title: 'Regular Rider',     desc: 'Play 10 total games',                 icon: 'Surf',    color: '#22d3ee' },
  { id: 'games_50',     title: 'Surf Addict',       desc: 'Play 50 total games',                 icon: 'Wave',    color: '#a855f7' },
];

export function getAchievements(): Achievement[] {
  try {
    const raw = localStorage.getItem(ACHIEVEMENTS_KEY);
    const saved: Partial<Record<AchievementId, { unlocked: boolean; unlockedAt?: string }>> =
      raw ? JSON.parse(raw) : {};
    return ACHIEVEMENT_DEFS.map(def => ({
      ...def,
      unlocked: saved[def.id]?.unlocked ?? false,
      unlockedAt: saved[def.id]?.unlockedAt,
    }));
  } catch {
    return ACHIEVEMENT_DEFS.map(def => ({ ...def, unlocked: false }));
  }
}

export function unlockAchievement(id: AchievementId): boolean {
  const all    = getAchievements();
  const target = all.find(a => a.id === id);
  if (!target || target.unlocked) return false;
  const saved: Record<string, { unlocked: boolean; unlockedAt: string }> = {};
  for (const a of all) {
    if (a.unlocked || a.id === id)
      saved[a.id] = { unlocked: true, unlockedAt: a.unlockedAt ?? new Date().toISOString() };
  }
  try { localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(saved)); } catch {}
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily Missions  —  stored at 'surfRushMissions' + 'surfRushMissionsDate'
// ─────────────────────────────────────────────────────────────────────────────

export interface Mission {
  id: string; title: string; desc: string; icon: string;
  target: number; progress: number; reward: number;
  completed: boolean; claimed: boolean;
}

const MISSIONS_KEY      = 'surfRushMissions';
const MISSIONS_DATE_KEY = 'surfRushMissionsDate';

const MISSION_TEMPLATES: Omit<Mission, 'progress' | 'completed' | 'claimed'>[] = [
  { id: 'collect_coins',  title: 'Coin Hunter',   desc: 'Collect 20 coins today',           icon: 'Coin',   target: 20,  reward: 50  },
  { id: 'play_games',     title: 'Dedicated',     desc: 'Play 3 games today',               icon: 'Surf',   target: 3,   reward: 75  },
  { id: 'reach_score',    title: 'High Scorer',   desc: 'Reach score 200 in one run',       icon: 'Star',   target: 200, reward: 100 },
  { id: 'use_extra_life', title: 'Never Give Up', desc: 'Use an extra life',                icon: 'Heart',  target: 1,   reward: 60  },
];

function todayDateStr(): string { return new Date().toISOString().slice(0, 10); }

export function getMissions(): Mission[] {
  try {
    if (localStorage.getItem(MISSIONS_DATE_KEY) !== todayDateStr()) return resetMissions();
    const raw = localStorage.getItem(MISSIONS_KEY);
    if (!raw) return resetMissions();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return resetMissions();
    return parsed as Mission[];
  } catch { return resetMissions(); }
}

function resetMissions(): Mission[] {
  const m: Mission[] = MISSION_TEMPLATES.map(t => ({ ...t, progress: 0, completed: false, claimed: false }));
  try {
    localStorage.setItem(MISSIONS_KEY,      JSON.stringify(m));
    localStorage.setItem(MISSIONS_DATE_KEY, todayDateStr());
  } catch {}
  return m;
}

export function saveMissions(missions: Mission[]): void {
  if (!Array.isArray(missions)) return;
  try { localStorage.setItem(MISSIONS_KEY, JSON.stringify(missions)); } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Weekly Challenges  —  stored at 'surfRushWeeklyChallenges'
// ─────────────────────────────────────────────────────────────────────────────

export interface WeeklyChallenge {
  id: string; title: string; desc: string; icon: string;
  target: number; progress: number; reward: number;
  completed: boolean; claimed: boolean;
  type: 'games' | 'coins' | 'score' | 'obstacles';
}

const WEEKLY_KEY      = 'surfRushWeekly';
const WEEKLY_DATE_KEY = 'surfRushWeeklyDate';

function weekStartStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().slice(0, 10);
}

const WEEKLY_TEMPLATES: Omit<WeeklyChallenge, 'progress' | 'completed' | 'claimed'>[] = [
  { id: 'w_play_games',   title: 'Marathon Surfer',  desc: 'Play 20 games this week',               icon: 'Surf',    type: 'games',     target: 20,  reward: 500  },
  { id: 'w_collect',      title: 'Coin Hoarder',     desc: 'Collect 500 coins total this week',     icon: 'Coin',    type: 'coins',     target: 500, reward: 750  },
  { id: 'w_high_score',   title: 'Peak Performance', desc: 'Achieve a score of 800 in one run',     icon: 'Trophy',  type: 'score',     target: 800, reward: 600  },
  { id: 'w_avoid',        title: 'Dodge Master',     desc: 'Avoid 100 obstacles this week',         icon: 'Wave',    type: 'obstacles', target: 100, reward: 400  },
];

export function getWeeklyChallenges(): WeeklyChallenge[] {
  try {
    const ws = weekStartStr();
    if (localStorage.getItem(WEEKLY_DATE_KEY) !== ws) return resetWeekly();
    const raw = localStorage.getItem(WEEKLY_KEY);
    if (!raw) return resetWeekly();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return resetWeekly();
    return parsed as WeeklyChallenge[];
  } catch { return resetWeekly(); }
}

function resetWeekly(): WeeklyChallenge[] {
  const w: WeeklyChallenge[] = WEEKLY_TEMPLATES.map(t => ({ ...t, progress: 0, completed: false, claimed: false }));
  try {
    localStorage.setItem(WEEKLY_KEY,      JSON.stringify(w));
    localStorage.setItem(WEEKLY_DATE_KEY, weekStartStr());
  } catch {}
  return w;
}

export function saveWeeklyChallenges(w: WeeklyChallenge[]): void {
  if (!Array.isArray(w)) return;
  try { localStorage.setItem(WEEKLY_KEY, JSON.stringify(w)); } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Streak  —  stored at 'surfRushStreak'
// ─────────────────────────────────────────────────────────────────────────────

export interface StreakData { currentStreak: number; lastPlayDate: string | null; }

const STREAK_KEY = 'surfRushStreak';

export function getStreak(): StreakData {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (!raw) return { currentStreak: 0, lastPlayDate: null };
    const parsed = JSON.parse(raw);
    return {
      currentStreak: Math.max(0, Number(parsed.currentStreak) || 0),
      lastPlayDate:  typeof parsed.lastPlayDate === 'string' ? parsed.lastPlayDate : null,
    };
  } catch { return { currentStreak: 0, lastPlayDate: null }; }
}

export function updateStreak(): { streak: StreakData; bonusCoins: number; isNewDay: boolean } {
  const today = todayDateStr();
  const data  = getStreak();
  if (data.lastPlayDate === today) return { streak: data, bonusCoins: 0, isNewDay: false };

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yStr = yesterday.toISOString().slice(0, 10);

  const newStreak = data.lastPlayDate === yStr ? data.currentStreak + 1 : 1;
  const bonusCoins = newStreak >= 7 ? 250 : newStreak >= 3 ? 100 : 50;
  const updated: StreakData = { currentStreak: newStreak, lastPlayDate: today };
  try { localStorage.setItem(STREAK_KEY, JSON.stringify(updated)); } catch {}
  return { streak: updated, bonusCoins, isNewDay: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Power-Up Shop  —  stored at 'surfRushShopPurchases'
// ─────────────────────────────────────────────────────────────────────────────

export interface ShopPurchase { shield: number; magnet: number; multiplier: number; }

const SHOP_KEY = 'surfRushShopPurchases';

export function getShopPurchases(): ShopPurchase {
  try {
    const raw = localStorage.getItem(SHOP_KEY);
    if (!raw) return { shield: 0, magnet: 0, multiplier: 0 };
    const parsed = JSON.parse(raw);
    return {
      shield:     Math.max(0, Number(parsed.shield)     || 0),
      magnet:     Math.max(0, Number(parsed.magnet)     || 0),
      multiplier: Math.max(0, Number(parsed.multiplier) || 0),
    };
  } catch { return { shield: 0, magnet: 0, multiplier: 0 }; }
}

export function saveShopPurchases(p: ShopPurchase): void {
  if (!p) return;
  try {
    localStorage.setItem(SHOP_KEY, JSON.stringify({
      shield:     Math.max(0, Number(p.shield)     || 0),
      magnet:     Math.max(0, Number(p.magnet)     || 0),
      multiplier: Math.max(0, Number(p.multiplier) || 0),
    }));
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Mystery Reward Boxes  —  stored at 'surfRushMysteryBoxes'
// ─────────────────────────────────────────────────────────────────────────────

export type MysteryRewardType = 'coins_small' | 'coins_medium' | 'coins_large' | 'shield' | 'magnet' | 'multiplier' | 'life';

export interface MysteryReward {
  type: MysteryRewardType;
  label: string;
  coins?: number;
  description: string;
}

export const MYSTERY_BOX_COST = 200;

const MYSTERY_REWARDS: MysteryReward[] = [
  { type: 'coins_small',  label: '+50 Coins',    coins: 50,  description: 'Small coin reward' },
  { type: 'coins_small',  label: '+50 Coins',    coins: 50,  description: 'Small coin reward' },
  { type: 'coins_medium', label: '+150 Coins',   coins: 150, description: 'Medium coin reward' },
  { type: 'coins_medium', label: '+150 Coins',   coins: 150, description: 'Medium coin reward' },
  { type: 'coins_large',  label: '+400 Coins',   coins: 400, description: 'Jackpot coin reward!' },
  { type: 'shield',       label: 'Shield Boost', description: '1x Shield for next run' },
  { type: 'shield',       label: 'Shield Boost', description: '1x Shield for next run' },
  { type: 'magnet',       label: 'Magnet Boost', description: '1x Magnet for next run' },
  { type: 'multiplier',   label: 'x2 Multiplier', description: '1x Score Multiplier' },
  { type: 'life',         label: 'Extra Life',   description: '1x Free Extra Life' },
];

export function openMysteryBox(): MysteryReward {
  const idx = Math.floor(Math.random() * MYSTERY_REWARDS.length);
  return { ...MYSTERY_REWARDS[Math.max(0, Math.min(idx, MYSTERY_REWARDS.length - 1))] };
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily Reward Store
// ─────────────────────────────────────────────────────────────────────────────

export interface DailyRewardResult {
  success: boolean;
  newCoinBalance: number;
  coinsAdded: number;
  profile: PlayerProfile;
  error?: string;
}

let dailyClaimInFlight = false;

export function claimDailyReward(coinsToAdd: number): DailyRewardResult {
  if (dailyClaimInFlight) {
    const current = getProfile();
    return {
      success: false,
      newCoinBalance: current.coinBalance,
      coinsAdded: 0,
      profile: current,
      error: 'A claim is already in progress',
    };
  }
  dailyClaimInFlight = true;
  try {
    const amount = Number.isFinite(coinsToAdd) ? Math.max(0, coinsToAdd) : 0;
    const profile = getProfile();
    const newBalance = Math.max(0, profile.coinBalance + amount);
    const updatedProfile: PlayerProfile = {
      ...profile,
      coinBalance: newBalance,
      totalCoinsEarned: Math.max(0, profile.totalCoinsEarned + amount),
      dailyRewardsClaimed: Math.max(0, profile.dailyRewardsClaimed + 1),
    };
    saveProfile(updatedProfile);
    const confirmed = getProfile();
    return { success: true, newCoinBalance: confirmed.coinBalance, coinsAdded: amount, profile: confirmed };
  } catch (e) {
    console.error('claimDailyReward error:', e);
    let fallbackProfile = defaultProfile();
    try { fallbackProfile = getProfile(); } catch {}
    return {
      success: false,
      newCoinBalance: fallbackProfile.coinBalance,
      coinsAdded: 0,
      profile: fallbackProfile,
      error: e instanceof Error ? e.message : String(e),
    };
  } finally {
    dailyClaimInFlight = false;
  }
}