// Core game engine for Surf Rush.
// Self-contained canvas-based endless surfing game.
// The React component only creates the engine, mounts the canvas,
// and reacts to callbacks — it never drives the render loop itself.

export type LaneIndex = 0 | 1 | 2;

export type ObstacleType = 'rock' | 'shark' | 'jellyfish' | 'wave';

export type BoxType =
  | 'coins'
  | 'shield'
  | 'magnet'
  | 'speed'
  | 'combo'
  | 'coinCut'
  | 'freeze'
  | 'slowWave';

interface Entity {
  lane: LaneIndex;
  y: number;
  width: number;
  height: number;
}

interface Obstacle extends Entity {
  type: ObstacleType;
  wobble: number;
  /** true once the obstacle has passed the player without hitting */
  passed: boolean;
}

interface MysteryBox extends Entity {
  type: BoxType;
  pulse: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: string;
  size: number;
  type: 'spark' | 'splash' | 'coin' | 'trail';
}

interface WaveLayer {
  offset: number;
  speed: number;
  amplitude: number;
  color: string;
  y: number;
}

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
}

export interface GameCallbacks {
  onStateChange: (state: GameState) => void;
  onGameOver: (finalScore: number, finalCoins: number, obstaclesAvoided: number) => void;
}

const POSITIVE_BOXES: BoxType[] = ['coins', 'shield', 'magnet', 'speed', 'combo'];
const NEGATIVE_BOXES: BoxType[] = ['coinCut', 'freeze', 'slowWave'];
const ALL_BOXES: BoxType[]      = [...POSITIVE_BOXES, ...NEGATIVE_BOXES];
const OBSTACLE_TYPES: ObstacleType[] = ['rock', 'shark', 'jellyfish', 'wave'];

const LANE_COUNT        = 3;
const BASE_SPEED        = 220;
const MAX_SPEED         = 620;
const SPEED_RAMP_PER_SEC = 4;

// Grace period: collisions are ignored for the first 3 seconds.
const SAFE_START_SECONDS = 3;

// Difficulty ramps smoothly over this many seconds.
const DIFFICULTY_RAMP_SECONDS = 20;

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: GameCallbacks;

  private width  = 360;
  private height = 640;
  private laneWidth = this.width / LANE_COUNT;

  // Player
  private playerLane: LaneIndex = 1;
  private playerTargetX: number = 0;
  private playerX: number       = 0;
  private playerY: number       = 0;
  private playerTilt            = 0;

  // Entities
  private obstacles: Obstacle[]   = [];
  private boxes: MysteryBox[]     = [];
  private particles: Particle[]   = [];

  // Background
  private waveLayers: WaveLayer[] = [];
  private waveTime   = 0;
  private bubbles: { x: number; y: number; r: number; speed: number; opacity: number }[] = [];
  private foamParticles: { x: number; y: number; life: number; maxLife: number; r: number }[] = [];

  // Timing
  private lastTimestamp  = 0;
  private spawnTimer     = 0;
  private elapsedSeconds = 0;
  private animationFrameId: number | null = null;

  // Effect pulses
  private shieldPulse = 0;
  private magnetPulse = 0;

  private bgGradientCache: CanvasGradient | null = null;

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
      this.resize();
      this.initBubbles();
      this.renderIdleBackground();
    });

    window.addEventListener('resize', this.resize);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  public start(): void {
    this.cancelLoop();
    this.resize();
    if (this.waveLayers.length === 0) this.initWaveLayers();
    if (this.bubbles.length === 0)    this.initBubbles();
    this.reset();
    this.lastTimestamp = performance.now();
    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  public stop(): void {
    this.cancelLoop();
    window.removeEventListener('resize', this.resize);
  }

  public togglePause(): void {
    if (this.state.isGameOver) return;
    this.state.isPaused = !this.state.isPaused;
    this.emitState();
    if (!this.state.isPaused) {
      this.lastTimestamp    = performance.now();
      this.animationFrameId = requestAnimationFrame(this.loop);
    }
  }

  public moveLeft(): void {
    if (this.state.isGameOver || this.state.isPaused) return;
    if (this.playerLane > 0) {
      this.playerLane     = (this.playerLane - 1) as LaneIndex;
      this.playerTargetX  = this.laneCenter(this.playerLane);
      this.playerTilt     = -0.25;
      this.spawnTrail();
    }
  }

  public moveRight(): void {
    if (this.state.isGameOver || this.state.isPaused) return;
    if (this.playerLane < LANE_COUNT - 1) {
      this.playerLane    = (this.playerLane + 1) as LaneIndex;
      this.playerTargetX = this.laneCenter(this.playerLane);
      this.playerTilt    = 0.25;
      this.spawnTrail();
    }
  }

  public restart(): void {
    this.cancelLoop();
    this.resize();
    if (this.waveLayers.length === 0) this.initWaveLayers();
    if (this.bubbles.length === 0)    this.initBubbles();
    this.reset();
    this.lastTimestamp    = performance.now();
    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  /**
   * Continue the run after purchasing an extra life.
   * Clears game-over state, restores shield, clears all active obstacles
   * (so player isn't immediately hit again), and resumes the loop.
   */
  public addLife(coinsSpent: number): void {
    if (!this.state.isGameOver) return;
    // Deduct coins from in-game balance
    this.state.coins      = Math.max(0, this.state.coins - coinsSpent);
    this.state.isGameOver = false;
    this.state.isPaused   = false;
    // Give temporary shield so the respawn feels fair
    this.state.hasShield  = true;
    // Clear active obstacles — the player spawns on a clear lane
    this.obstacles = [];
    this.spawnTimer = 0;
    this.emitState();
    this.lastTimestamp    = performance.now();
    this.animationFrameId = requestAnimationFrame(this.loop);
  }

  public getState(): GameState {
    return { ...this.state };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────────────────

  private defaultState(): GameState {
    return {
      score:            0,
      coins:            0,
      combo:            1,
      isGameOver:       false,
      isPaused:         false,
      hasShield:        false,
      speedBoostUntil:  0,
      freezeUntil:      0,
      slowUntil:        0,
      magnetUntil:      0,
      obstaclesAvoided: 0,
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
      { offset: 0,              speed: 0.4, amplitude: 8,  color: 'rgba(255,255,255,0.04)', y: 0.25 },
      { offset: Math.PI,        speed: 0.6, amplitude: 6,  color: 'rgba(255,255,255,0.06)', y: 0.45 },
      { offset: Math.PI * 0.7,  speed: 0.5, amplitude: 10, color: 'rgba(255,255,255,0.05)', y: 0.60 },
      { offset: Math.PI * 1.3,  speed: 0.8, amplitude: 5,  color: 'rgba(14,165,233,0.15)',  y: 0.75 },
    ];
  }

  private initBubbles(): void {
    const count = this.isLowPower ? 12 : 22;
    this.bubbles = Array.from({ length: count }, () => ({
      x:       Math.random() * this.width,
      y:       Math.random() * this.height,
      r:       Math.random() * 3 + 1,
      speed:   Math.random() * 0.4 + 0.15,
      opacity: Math.random() * 0.35 + 0.1,
    }));
  }

  private spawnTrail(): void {
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        x:       this.playerX + (Math.random() - 0.5) * 20,
        y:       this.playerY + Math.random() * 10,
        vx:      (Math.random() - 0.5) * 60,
        vy:      Math.random() * 80 + 20,
        life:    0.4,
        maxLife: 0.4,
        color:   'rgba(255,255,255,0.7)',
        size:    Math.random() * 4 + 2,
        type:    'splash',
      });
    }
  }

  private spawnCollectEffect(x: number, y: number, color: string, type: 'spark' | 'coin'): void {
    const count = type === 'coin' ? 10 : 8;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = Math.random() * 100 + 60;
      this.particles.push({
        x, y,
        vx:      Math.cos(angle) * speed,
        vy:      Math.sin(angle) * speed,
        life:    0.6,
        maxLife: 0.6,
        color,
        size:    Math.random() * 5 + 3,
        type,
      });
    }
  }

  private resize = (): void => {
    const parent = this.canvas.parentElement;

    const rawW = parent ? parent.clientWidth  : 360;
    const rawH = parent ? parent.clientHeight : 640;

    this.width = Math.max(280, Math.min(rawW, 480));

    const MIN_PLAYABLE_HEIGHT = 500;
    this.height    = Math.max(rawH, MIN_PLAYABLE_HEIGHT);
    this.laneWidth = this.width / LANE_COUNT;

    this.canvas.width  = this.width;
    this.canvas.height = this.height;
    this.bgGradientCache = null;

    this.playerX       = this.laneCenter(this.playerLane);
    this.playerTargetX = this.playerX;
    this.playerY       = this.height - 90;

    if (this.bubbles.length > 0) {
      for (const b of this.bubbles) {
        b.x = Math.random() * this.width;
        b.y = Math.random() * this.height;
      }
    }
  };

  private laneCenter(lane: LaneIndex): number {
    return this.laneWidth * lane + this.laneWidth / 2;
  }

  private reset(): void {
    this.obstacles      = [];
    this.boxes          = [];
    this.particles      = [];
    this.foamParticles  = [];
    this.spawnTimer     = 0;
    this.elapsedSeconds = 0;
    this.playerLane     = 1;
    this.playerTargetX  = this.laneCenter(this.playerLane);
    this.playerX        = this.playerTargetX;
    this.playerTilt     = 0;
    this.waveTime       = 0;
    this.state          = this.defaultState();
    this.emitState();
  }

  private currentSpeed(): number {
    const rampedAddition = this.elapsedSeconds * SPEED_RAMP_PER_SEC * (0.5 + 0.5 * this.difficultyRamp());
    let speed = Math.min(BASE_SPEED + rampedAddition, MAX_SPEED);
    const now = performance.now();
    if (now < this.state.speedBoostUntil) speed *= 1.6;
    if (now < this.state.slowUntil)       speed *= 0.5;
    if (now < this.state.freezeUntil)     speed  = 0;
    return speed;
  }

  private difficultyRamp(): number {
    const sinceRiskStarted = Math.max(0, this.elapsedSeconds - SAFE_START_SECONDS);
    const t = Math.min(1, sinceRiskStarted / DIFFICULTY_RAMP_SECONDS);
    return t * t * (3 - 2 * t);
  }

  private blur(amount: number): number {
    return this.isLowPower ? amount * 0.4 : amount;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Game loop
  // ─────────────────────────────────────────────────────────────────────────

  private loop = (timestamp: number): void => {
    if (this.state.isGameOver || this.state.isPaused) return;

    const delta = Math.min((timestamp - this.lastTimestamp) / 1000, 0.05);
    this.lastTimestamp   = timestamp;
    this.elapsedSeconds += delta;
    this.waveTime       += delta;

    this.update(delta);
    this.render();

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  private update(delta: number): void {
    const speed = this.currentSpeed();

    this.playerX    += (this.playerTargetX - this.playerX) * Math.min(1, 10 * delta);
    this.playerTilt *= Math.pow(0.05, delta);

    this.shieldPulse += delta * 3;
    this.magnetPulse += delta * 4;

    for (const wl of this.waveLayers) {
      wl.offset += wl.speed * delta;
    }

    for (const ob of this.obstacles) {
      ob.y      += speed * delta;
      ob.wobble += delta * 3;
    }
    for (const box of this.boxes) {
      box.y     += speed * delta;
      box.pulse += delta * 4;
    }

    for (const p of this.particles) {
      p.x    += p.vx * delta;
      p.y    += p.vy * delta;
      p.vy   += 120 * delta;
      p.life -= delta;
    }
    this.particles = this.particles.filter(p => p.life > 0);

    for (const b of this.bubbles) {
      b.y -= b.speed;
      if (b.y < -10) {
        b.y = this.height + 5;
        b.x = Math.random() * this.width;
      }
    }

    for (const f of this.foamParticles) {
      f.life -= delta;
    }
    this.foamParticles = this.foamParticles.filter(f => f.life > 0);
    if (Math.random() < delta * 3) {
      this.foamParticles.push({
        x:       Math.random() * this.width,
        y:       Math.random() * this.height,
        life:    0.8 + Math.random() * 0.5,
        maxLife: 1.3,
        r:       Math.random() * 6 + 2,
      });
    }

    this.spawnTimer += delta;
    const introInterval = 1.6;
    const baseInterval  = Math.max(0.45, 1.1 - this.elapsedSeconds * 0.01);
    const spawnInterval = introInterval + (baseInterval - introInterval) * this.difficultyRamp();
    if (this.spawnTimer >= spawnInterval) {
      this.spawnTimer = 0;
      this.spawnEntity();
    }

    this.state.score += Math.round(speed * delta * 0.1);

    const now = performance.now();
    if (now < this.state.magnetUntil) {
      for (const box of this.boxes) {
        if (box.y > this.height * 0.4 && box.y < this.height * 0.95) {
          box.lane = this.playerLane;
        }
      }
    }

    this.handleCollisions();

    // Count obstacles that successfully passed the player
    for (const ob of this.obstacles) {
      if (!ob.passed && ob.y > this.playerY + 60) {
        ob.passed = true;
        this.state.obstaclesAvoided += 1;
      }
    }

    this.obstacles = this.obstacles.filter(ob  => ob.y  < this.height + ob.height);
    this.boxes     = this.boxes.filter(    box => box.y < this.height + box.height);

    this.emitState();
  }

  private spawnEntity(): void {
    const lane = Math.floor(Math.random() * LANE_COUNT) as LaneIndex;
    const roll = Math.random();
    const spawnY = -80;

    const introObstacleChance = 0.25;
    const baseObstacleChance  = 0.55;
    const obstacleChance = introObstacleChance + (baseObstacleChance - introObstacleChance) * this.difficultyRamp();

    if (roll < obstacleChance) {
      const type  = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
      const sizeT = 0.8 + 0.2 * this.difficultyRamp();
      this.obstacles.push({
        lane, y: spawnY,
        width:  this.laneWidth * 0.6 * sizeT,
        height: 50 * sizeT,
        type,
        wobble: 0,
        passed: false,
      });
    } else {
      const pool = Math.random() < 0.65 ? POSITIVE_BOXES : NEGATIVE_BOXES;
      const type = pool[Math.floor(Math.random() * pool.length)] ?? ALL_BOXES[0];
      this.boxes.push({
        lane, y: spawnY,
        width:  this.laneWidth * 0.5,
        height: 40,
        type,
        pulse: 0,
      });
    }
  }

  private handleCollisions(): void {
    if (this.elapsedSeconds < SAFE_START_SECONDS) return;
    if (this.playerY < 50) return;

    const COLLISION_FORGIVENESS = 0.6;
    const playerHalfW  = (this.laneWidth * 0.5) * COLLISION_FORGIVENESS;
    const playerTop    = this.playerY - 40;
    const playerBottom = this.playerY + 40;

    for (const ob of this.obstacles) {
      if (ob.lane !== this.playerLane) continue;
      const verticalOverlap = ob.y + ob.height / 2 >= playerTop && ob.y - ob.height / 2 <= playerBottom;
      if (!verticalOverlap) continue;
      const obHalfW = (ob.width / 2) * COLLISION_FORGIVENESS;
      const obX     = this.laneCenter(ob.lane);
      const horizontalOverlap = Math.abs(obX - this.playerX) <= (obHalfW + playerHalfW);
      if (horizontalOverlap) {
        this.onObstacleHit(ob);
        ob.y = this.height + ob.height;
      }
    }

    for (const box of this.boxes) {
      if (box.lane !== this.playerLane) continue;
      const verticalOverlap = box.y + box.height / 2 >= playerTop && box.y - box.height / 2 <= playerBottom;
      if (!verticalOverlap) continue;
      this.spawnCollectEffect(
        this.laneCenter(box.lane),
        box.y,
        this.boxGlowColor(box.type),
        box.type === 'coins' ? 'coin' : 'spark'
      );
      this.onBoxCollected(box);
      box.y = this.height + box.height;
    }
  }

  private onObstacleHit(_obstacle: Obstacle): void {
    if (this.state.hasShield) {
      this.state.hasShield = false;
      this.spawnCollectEffect(this.playerX, this.playerY, '#22d3ee', 'spark');
      return;
    }
    this.endGame();
  }

  private onBoxCollected(box: MysteryBox): void {
    const now = performance.now();
    switch (box.type) {
      case 'coins': {
        const amount = 10 * this.state.combo;
        this.state.coins += amount;
        this.state.score += amount;
        break;
      }
      case 'shield':    this.state.hasShield        = true;            break;
      case 'magnet':    this.state.magnetUntil       = now + 6000;     break;
      case 'speed':     this.state.speedBoostUntil   = now + 5000;     break;
      case 'combo':     this.state.combo             = Math.min(this.state.combo + 1, 8); break;
      case 'coinCut':
        this.state.coins = Math.max(0, this.state.coins - 20);
        this.state.combo = 1;
        break;
      case 'freeze':
        this.state.freezeUntil = now + 1200;
        this.state.combo       = 1;
        break;
      case 'slowWave':
        this.state.slowUntil = now + 4000;
        this.state.combo     = 1;
        break;
    }
  }

  private endGame(): void {
    this.state.isGameOver = true;
    this.emitState();
    this.cancelLoop();
    this.callbacks.onGameOver(this.state.score, this.state.coins, this.state.obstaclesAvoided);
  }

  private emitState(): void {
    this.callbacks.onStateChange({ ...this.state });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  private renderIdleBackground(): void {
    this.drawBackground();
  }

  private render(): void {
    this.drawBackground();
    this.drawFoam();
    this.drawBubbles();
    this.drawLaneLines();
    this.drawParticles();
    for (const box of this.boxes)      this.drawMysteryBox(box);
    for (const ob  of this.obstacles)  this.drawObstacle(ob);
    this.drawPlayer();
    if (this.state.isPaused) this.drawPauseOverlay();
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
      ctx.beginPath();
      ctx.moveTo(0, yBase);
      const segs = this.isLowPower ? 8 : 20;
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
    const ctx = this.ctx;
    for (const f of this.foamParticles) {
      const alpha = (f.life / f.maxLife) * 0.18;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fill();
    }
  }

  private drawBubbles(): void {
    if (this.isLowPower) return;
    const ctx = this.ctx;
    for (const b of this.bubbles) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${b.opacity})`;
      ctx.fill();
    }
  }

  private drawLaneLines(): void {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth   = 1;
    ctx.setLineDash([12, 18]);
    ctx.lineDashOffset = -(this.elapsedSeconds * 80 % 30);
    for (let i = 1; i < LANE_COUNT; i++) {
      const x = this.laneWidth * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }

  private drawParticles(): void {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      if (p.type === 'coin') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
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
    ctx.font      = `bold 28px 'Orbitron', monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('PAUSED', this.width / 2, this.height / 2);
    ctx.font      = `14px 'Inter', sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('Press Space / P to resume', this.width / 2, this.height / 2 + 36);
  }

  private drawPlayer(): void {
    const ctx = this.ctx;

    // Shield glow
    if (this.state.hasShield) {
      const pulse = Math.sin(this.shieldPulse) * 0.3 + 0.7;
      ctx.save();
      ctx.translate(this.playerX, this.playerY);
      ctx.globalAlpha = pulse * 0.6;
      const sg = ctx.createRadialGradient(0, 0, 10, 0, 0, 50);
      sg.addColorStop(0,   'rgba(34,211,238,0.6)');
      sg.addColorStop(0.5, 'rgba(34,211,238,0.2)');
      sg.addColorStop(1,   'rgba(34,211,238,0)');
      ctx.fillStyle = sg;
      ctx.beginPath();
      ctx.arc(0, 0, 50, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    // Magnet aura
    const now = performance.now();
    if (now < this.state.magnetUntil) {
      ctx.save();
      ctx.translate(this.playerX, this.playerY);
      ctx.globalAlpha = 0.3 + Math.sin(this.magnetPulse) * 0.15;
      const mg = ctx.createRadialGradient(0, 0, 10, 0, 0, 60);
      mg.addColorStop(0,   'rgba(249,115,22,0.5)');
      mg.addColorStop(1,   'rgba(249,115,22,0)');
      ctx.fillStyle = mg;
      ctx.beginPath();
      ctx.arc(0, 0, 60, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    ctx.save();
    ctx.translate(this.playerX, this.playerY);
    ctx.rotate(this.playerTilt);

    // Board
    const boardGrad = ctx.createLinearGradient(-24, 20, 24, 28);
    boardGrad.addColorStop(0,   '#38bdf8');
    boardGrad.addColorStop(0.5, '#0284c7');
    boardGrad.addColorStop(1,   '#1e40af');
    ctx.fillStyle = boardGrad;
    ctx.beginPath();
    ctx.moveTo(-22, 20);
    ctx.bezierCurveTo(-24, 30, -16, 36, 0, 36);
    ctx.bezierCurveTo(16,  36,  24, 30, 22, 20);
    ctx.bezierCurveTo(20,  10,  -5, 20, 0, 20);
    ctx.lineTo(-5, 28);
    ctx.lineTo( 5, 28);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#1e3a8a';
    ctx.beginPath();
    ctx.ellipse(0, -8, 5, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, -20, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#fde68a';
    ctx.fill();

    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth   = 2.5;
    ctx.lineCap     = 'round';
    ctx.beginPath();
    ctx.moveTo(-5, -10);
    ctx.lineTo(-14, -5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(5, -10);
    ctx.lineTo(14, -5);
    ctx.stroke();

    ctx.restore();
  }

  private drawObstacle(ob: Obstacle): void {
    const ctx    = this.ctx;
    const x      = this.laneCenter(ob.lane);
    const wobble = Math.sin(ob.wobble) * 3;

    ctx.save();
    ctx.translate(x, ob.y + wobble);

    switch (ob.type) {
      case 'rock': {
        ctx.beginPath();
        ctx.ellipse(0, 20, 22, 6, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fill();
        const rGrad = ctx.createRadialGradient(-5, -8, 2, 0, 0, 22);
        rGrad.addColorStop(0,   '#9ca3af');
        rGrad.addColorStop(0.5, '#6b7280');
        rGrad.addColorStop(1,   '#374151');
        ctx.fillStyle = rGrad;
        ctx.beginPath();
        ctx.moveTo( 0, -22);
        ctx.bezierCurveTo( 14, -20,  22, -8, 20,  6);
        ctx.bezierCurveTo( 18,  18, -18, 18, -20,  6);
        ctx.bezierCurveTo(-22,  -8, -14, -20,  0, -22);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.ellipse(-4, -10, 7, 4, -0.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.font          = '20px serif';
        ctx.textAlign     = 'center';
        ctx.textBaseline  = 'middle';
        ctx.fillText('\uD83E\uDEA8', 0, -2);
        break;
      }

      case 'shark': {
        ctx.shadowColor = '#374151';
        ctx.shadowBlur  = 10;
        const sGrad = ctx.createLinearGradient(-20, -15, 20, 15);
        sGrad.addColorStop(0, '#4b5563');
        sGrad.addColorStop(1, '#1f2937');
        ctx.fillStyle = sGrad;
        ctx.beginPath();
        ctx.ellipse(0, 5, 20, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#374151';
        ctx.beginPath();
        ctx.moveTo(-4, -14);
        ctx.lineTo( 6, -28);
        ctx.lineTo(12, -14);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(10, 2, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1f2937';
        ctx.beginPath();
        ctx.arc(11, 2, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.font         = '22px serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\uD83E\uDD88', 0, -2);
        ctx.shadowBlur = 0;
        break;
      }

      case 'jellyfish': {
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur  = 15;
        const jGrad = ctx.createRadialGradient(0, -5, 2, 0, -5, 20);
        jGrad.addColorStop(0,   'rgba(192,132,252,0.9)');
        jGrad.addColorStop(0.6, 'rgba(168,85,247,0.75)');
        jGrad.addColorStop(1,   'rgba(147,51,234,0.5)');
        ctx.fillStyle = jGrad;
        ctx.beginPath();
        ctx.arc(0, -5, 20, Math.PI, 0);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(192,132,252,0.7)';
        ctx.lineWidth   = 1.5;
        for (let t = -3; t <= 3; t++) {
          const tx = t * 5;
          ctx.beginPath();
          ctx.moveTo(tx, 12);
          for (let seg = 0; seg < 4; seg++) {
            ctx.quadraticCurveTo(
              tx + (seg % 2 === 0 ? 4 : -4),
              12 + seg * 5 + 3,
              tx,
              12 + (seg + 1) * 5
            );
          }
          ctx.stroke();
        }
        ctx.font         = '22px serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\uD83E\uDEBC', 0, -5);
        ctx.shadowBlur = 0;
        break;
      }

      case 'wave': {
        ctx.shadowColor = '#1d4ed8';
        ctx.shadowBlur  = 12;
        const wGrad = ctx.createLinearGradient(-25, -18, 25, 20);
        wGrad.addColorStop(0,   '#93c5fd');
        wGrad.addColorStop(0.4, '#3b82f6');
        wGrad.addColorStop(1,   '#1d4ed8');
        ctx.fillStyle = wGrad;
        ctx.beginPath();
        ctx.moveTo(-28, 18);
        ctx.bezierCurveTo(-28, -10, -10, -24,  0, -20);
        ctx.bezierCurveTo( 12, -16,  22,  -4, 28,  18);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.ellipse(-6, -18, 12, 4, -0.3, 0, Math.PI * 2);
        ctx.fill();
        ctx.font         = '22px serif';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('\uD83C\uDF0A', 0, -2);
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
    const emoji    = this.boxEmoji(box.type);
    const glowColor = this.boxGlowColor(box.type);

    ctx.save();
    ctx.translate(x, box.y + floatY);
    ctx.scale(pulse, pulse);

    const glowGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, 28);
    const r = parseInt(glowColor.slice(1, 3), 16);
    const g = parseInt(glowColor.slice(3, 5), 16);
    const b = parseInt(glowColor.slice(5, 7), 16);
    glowGrad.addColorStop(0, `rgba(${r},${g},${b},0.5)`);
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle  = glowColor;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur  = 14;
    ctx.beginPath();
    ctx.roundRect(-18, -18, 36, 36, 8);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.roundRect(-14, -14, 28, 14, 5);
    ctx.fill();

    ctx.font         = '20px serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 0, 1);

    ctx.restore();
  }

  private boxEmoji(type: BoxType): string {
    const map: Record<BoxType, string> = {
      coins:    '\uD83E\uDE99',  // 🪙
      shield:   '\uD83D\uDEE1\uFE0F',  // 🛡️
      magnet:   '\uD83E\uDDF2',  // 🧲
      speed:    '\u26A1',         // ⚡
      combo:    '\uD83D\uDD25',   // 🔥
      coinCut:  '\uD83D\uDC80',   // 💀
      freeze:   '\u2744\uFE0F',   // ❄️
      slowWave: '\uD83C\uDF00',   // 🌀
    };
    return map[type];
  }

  private boxGlowColor(type: BoxType): string {
    const map: Record<BoxType, string> = {
      coins:    '#f59e0b',
      shield:   '#06b6d4',
      magnet:   '#f97316',
      speed:    '#10b981',
      combo:    '#ec4899',
      coinCut:  '#ef4444',
      freeze:   '#60a5fa',
      slowWave: '#0d9488',
    };
    return map[type];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Local leaderboard (localStorage)
// ─────────────────────────────────────────────────────────────────────────────

const LEADERBOARD_KEY = 'surfRushLeaderboard';
const MAX_ENTRIES     = 10;

export interface LeaderboardEntry {
  name:  string;
  score: number;
  coins: number;
  date:  string;
}

export function getLeaderboard(): LeaderboardEntry[] {
  try {
    const raw    = localStorage.getItem(LEADERBOARD_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LeaderboardEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveToLeaderboard(entry: LeaderboardEntry): LeaderboardEntry[] {
  const updated = [...getLeaderboard(), entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(updated));
  } catch {
    // storage unavailable — ignore
  }
  return updated;
}

// ─────────────────────────────────────────────────────────────────────────────
// Player Profile (localStorage)
// ─────────────────────────────────────────────────────────────────────────────

export interface PlayerProfile {
  totalGames: number;
  highScore: number;
  totalCoinsEarned: number;
  dailyRewardsClaimed: number;
  coinBalance: number;
  totalObstaclesAvoided: number;
  totalScoreSum: number; // for average score calculation
}

const PROFILE_KEY = 'surfRushProfile';

export function getProfile(): PlayerProfile {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return defaultProfile();
    const p = JSON.parse(raw) as PlayerProfile;
    return { ...defaultProfile(), ...p };
  } catch {
    return defaultProfile();
  }
}

function defaultProfile(): PlayerProfile {
  return {
    totalGames: 0,
    highScore: 0,
    totalCoinsEarned: 0,
    dailyRewardsClaimed: 0,
    coinBalance: 0,
    totalObstaclesAvoided: 0,
    totalScoreSum: 0,
  };
}

export function saveProfile(p: PlayerProfile): void {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Achievements (localStorage)
// ─────────────────────────────────────────────────────────────────────────────

export type AchievementId =
  | 'first_run'
  | 'score_100'
  | 'score_500'
  | 'coins_100'
  | 'daily_claim'
  | 'buy_extra_life';

export interface Achievement {
  id: AchievementId;
  title: string;
  desc: string;
  icon: string; // icon name from ICON_COMPONENTS
  color: string;
  unlocked: boolean;
  unlockedAt?: string;
}

const ACHIEVEMENTS_KEY = 'surfRushAchievements';

const ACHIEVEMENT_DEFS: Omit<Achievement, 'unlocked' | 'unlockedAt'>[] = [
  { id: 'first_run',       title: 'First Wave',      desc: 'Complete your first run',          icon: 'surf',    color: '#22d3ee' },
  { id: 'score_100',       title: 'Scoring!',         desc: 'Reach a score of 100',             icon: 'star',    color: '#f59e0b' },
  { id: 'score_500',       title: 'Wave Rider',       desc: 'Reach a score of 500',             icon: 'trophy',  color: '#f59e0b' },
  { id: 'coins_100',       title: 'Treasure Diver',   desc: 'Collect 100 coins in one run',     icon: 'coin',    color: '#f59e0b' },
  { id: 'daily_claim',     title: 'Daily Grind',      desc: 'Claim your daily reward',          icon: 'gift',    color: '#10b981' },
  { id: 'buy_extra_life',  title: 'Second Chance',    desc: 'Buy an extra life',                icon: 'heart',   color: '#ec4899' },
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
  const achievements = getAchievements();
  const target = achievements.find(a => a.id === id);
  if (!target || target.unlocked) return false;
  const saved: Record<string, { unlocked: boolean; unlockedAt: string }> = {};
  for (const a of achievements) {
    if (a.unlocked || a.id === id) {
      saved[a.id] = { unlocked: true, unlockedAt: a.unlockedAt ?? new Date().toISOString() };
    }
  }
  try {
    localStorage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(saved));
  } catch {}
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily Missions (localStorage)
// ─────────────────────────────────────────────────────────────────────────────

export interface Mission {
  id: string;
  title: string;
  desc: string;
  icon: string;
  target: number;
  progress: number;
  reward: number;
  completed: boolean;
  claimed: boolean;
}

const MISSIONS_KEY    = 'surfRushMissions';
const MISSIONS_DATE_KEY = 'surfRushMissionsDate';

const MISSION_TEMPLATES: Omit<Mission, 'progress' | 'completed' | 'claimed'>[] = [
  { id: 'collect_coins', title: 'Coin Hunter',   desc: 'Collect 20 coins in total today',   icon: 'coin',   target: 20,  reward: 50  },
  { id: 'play_games',    title: 'Dedicated',      desc: 'Play 3 games today',                icon: 'surf',   target: 3,   reward: 75  },
  { id: 'reach_score',   title: 'High Scorer',    desc: 'Reach a score of 200 in one run',   icon: 'star',   target: 200, reward: 100 },
  { id: 'use_extra_life',title: 'Never Give Up',  desc: 'Use an extra life',                 icon: 'heart',  target: 1,   reward: 60  },
];

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getMissions(): Mission[] {
  try {
    const savedDate = localStorage.getItem(MISSIONS_DATE_KEY);
    if (savedDate !== todayDateStr()) {
      // New day — reset missions
      resetMissions();
      return getMissions();
    }
    const raw = localStorage.getItem(MISSIONS_KEY);
    if (!raw) return resetMissions();
    return JSON.parse(raw) as Mission[];
  } catch {
    return resetMissions();
  }
}

function resetMissions(): Mission[] {
  const missions: Mission[] = MISSION_TEMPLATES.map(t => ({
    ...t,
    progress: 0,
    completed: false,
    claimed: false,
  }));
  try {
    localStorage.setItem(MISSIONS_KEY,      JSON.stringify(missions));
    localStorage.setItem(MISSIONS_DATE_KEY, todayDateStr());
  } catch {}
  return missions;
}

export function saveMissions(missions: Mission[]): void {
  try {
    localStorage.setItem(MISSIONS_KEY, JSON.stringify(missions));
  } catch {}
}

// ─────────────────────────────────────────────────────────────────────────────
// Streak System (localStorage)
// ─────────────────────────────────────────────────────────────────────────────

export interface StreakData {
  currentStreak: number;
  lastPlayDate: string | null;
}

const STREAK_KEY = 'surfRushStreak';

export function getStreak(): StreakData {
  try {
    const raw = localStorage.getItem(STREAK_KEY);
    if (!raw) return { currentStreak: 0, lastPlayDate: null };
    return JSON.parse(raw) as StreakData;
  } catch {
    return { currentStreak: 0, lastPlayDate: null };
  }
}

export function updateStreak(): { streak: StreakData; bonusCoins: number; isNewDay: boolean } {
  const today = todayDateStr();
  const data = getStreak();
  const last = data.lastPlayDate;

  let newStreak = data.currentStreak;
  let bonusCoins = 0;
  let isNewDay = false;

  if (last === today) {
    // Same day — no change
    return { streak: data, bonusCoins: 0, isNewDay: false };
  }

  isNewDay = true;
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().slice(0, 10);

  if (last === yesterdayStr) {
    newStreak += 1;
  } else {
    newStreak = 1;
  }

  if      (newStreak >= 7)  bonusCoins = 250;
  else if (newStreak >= 3)  bonusCoins = 100;
  else if (newStreak >= 1)  bonusCoins = 50;

  const updated: StreakData = { currentStreak: newStreak, lastPlayDate: today };
  try {
    localStorage.setItem(STREAK_KEY, JSON.stringify(updated));
  } catch {}

  return { streak: updated, bonusCoins, isNewDay };
}

// ─────────────────────────────────────────────────────────────────────────────
// Power-Up Shop purchases (localStorage)
// ─────────────────────────────────────────────────────────────────────────────

export interface ShopPurchase {
  shield: number;
  magnet: number;
  multiplier: number;
}

const SHOP_KEY = 'surfRushShopPurchases';

export function getShopPurchases(): ShopPurchase {
  try {
    const raw = localStorage.getItem(SHOP_KEY);
    if (!raw) return { shield: 0, magnet: 0, multiplier: 0 };
    return { shield: 0, magnet: 0, multiplier: 0, ...JSON.parse(raw) };
  } catch {
    return { shield: 0, magnet: 0, multiplier: 0 };
  }
}

export function saveShopPurchases(p: ShopPurchase): void {
  try {
    localStorage.setItem(SHOP_KEY, JSON.stringify(p));
  } catch {}
}