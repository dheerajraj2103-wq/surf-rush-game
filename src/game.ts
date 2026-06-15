// Core game engine for Surf Rush.
// This is a self-contained, canvas-based endless surfing game.
// It is driven by a single GameEngine class that owns the game loop,
// state, input handling, and rendering. The React component (App.tsx)
// only creates the engine, mounts the canvas, and reacts to callbacks.

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
  wobble?: number;
}

interface MysteryBox extends Entity {
  type: BoxType;
  pulse?: number;
  collected?: boolean;
  collectAnim?: number;
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
}

export interface GameCallbacks {
  onStateChange: (state: GameState) => void;
  onGameOver: (finalScore: number, finalCoins: number) => void;
}

const POSITIVE_BOXES: BoxType[] = ['coins', 'shield', 'magnet', 'speed', 'combo'];
const NEGATIVE_BOXES: BoxType[] = ['coinCut', 'freeze', 'slowWave'];
const ALL_BOXES: BoxType[] = [...POSITIVE_BOXES, ...NEGATIVE_BOXES];
const OBSTACLE_TYPES: ObstacleType[] = ['rock', 'shark', 'jellyfish', 'wave'];

const LANE_COUNT = 3;
const BASE_SPEED = 220;
const MAX_SPEED = 620;
const SPEED_RAMP_PER_SEC = 4;

export class GameEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private callbacks: GameCallbacks;

  private width = 360;
  private height = 640;
  private laneWidth = this.width / LANE_COUNT;

  private playerLane: LaneIndex = 1;
  private playerTargetX: number;
  private playerX: number;
  private playerY: number;
  private playerTilt = 0;

  private obstacles: Obstacle[] = [];
  private boxes: MysteryBox[] = [];
  private particles: Particle[] = [];

  private waveLayers: WaveLayer[] = [];
  private waveTime = 0;
  private bubbles: { x: number; y: number; r: number; speed: number; opacity: number }[] = [];
  private foamParticles: { x: number; y: number; life: number; maxLife: number; r: number }[] = [];

  private lastTimestamp = 0;
  private spawnTimer = 0;
  private elapsedSeconds = 0;
  private animationFrameId: number | null = null;

  private shieldPulse = 0;
  private magnetPulse = 0;

  private state: GameState = {
    score: 0,
    coins: 0,
    combo: 1,
    isGameOver: false,
    isPaused: false,
    hasShield: false,
    speedBoostUntil: 0,
    freezeUntil: 0,
    slowUntil: 0,
    magnetUntil: 0
  };

  constructor(canvas: HTMLCanvasElement, callbacks: GameCallbacks) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    this.ctx = ctx;
    this.callbacks = callbacks;

    this.resize();
    this.playerX = this.laneCenter(this.playerLane);
    this.playerTargetX = this.playerX;
    this.playerY = this.height - 90;

    this.initWaveLayers();
    this.initBubbles();

    window.addEventListener('resize', this.resize);
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  public start(): void {
    this.reset();
    this.lastTimestamp = performance.now();
    this.loop(this.lastTimestamp);
  }

  public stop(): void {
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    window.removeEventListener('resize', this.resize);
  }

  public togglePause(): void {
    if (this.state.isGameOver) return;
    this.state.isPaused = !this.state.isPaused;
    this.emitState();
    if (!this.state.isPaused) {
      this.lastTimestamp = performance.now();
      this.loop(this.lastTimestamp);
    }
  }

  public moveLeft(): void {
    if (this.state.isGameOver || this.state.isPaused) return;
    if (this.playerLane > 0) {
      this.playerLane = (this.playerLane - 1) as LaneIndex;
      this.playerTargetX = this.laneCenter(this.playerLane);
      this.playerTilt = -0.25;
      this.spawnTrail();
    }
  }

  public moveRight(): void {
    if (this.state.isGameOver || this.state.isPaused) return;
    if (this.playerLane < LANE_COUNT - 1) {
      this.playerLane = (this.playerLane + 1) as LaneIndex;
      this.playerTargetX = this.laneCenter(this.playerLane);
      this.playerTilt = 0.25;
      this.spawnTrail();
    }
  }

  public restart(): void {
    this.reset();
    this.lastTimestamp = performance.now();
    this.loop(this.lastTimestamp);
  }

  public getState(): GameState {
    return { ...this.state };
  }

  // ---------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------

  private initWaveLayers(): void {
    this.waveLayers = [
      { offset: 0, speed: 0.4, amplitude: 8, color: 'rgba(255,255,255,0.04)', y: 0.25 },
      { offset: Math.PI, speed: 0.6, amplitude: 6, color: 'rgba(255,255,255,0.06)', y: 0.45 },
      { offset: Math.PI * 0.7, speed: 0.5, amplitude: 10, color: 'rgba(255,255,255,0.05)', y: 0.6 },
      { offset: Math.PI * 1.3, speed: 0.8, amplitude: 5, color: 'rgba(14,165,233,0.15)', y: 0.75 },
    ];
  }

  private initBubbles(): void {
    this.bubbles = [];
    for (let i = 0; i < 18; i++) {
      this.bubbles.push({
        x: Math.random() * 400,
        y: Math.random() * 700,
        r: Math.random() * 3 + 1,
        speed: Math.random() * 0.4 + 0.15,
        opacity: Math.random() * 0.35 + 0.1
      });
    }
  }

  private spawnTrail(): void {
    for (let i = 0; i < 5; i++) {
      this.particles.push({
        x: this.playerX + (Math.random() - 0.5) * 20,
        y: this.playerY + Math.random() * 10,
        vx: (Math.random() - 0.5) * 60,
        vy: Math.random() * 80 + 20,
        life: 0.4,
        maxLife: 0.4,
        color: 'rgba(255,255,255,0.7)',
        size: Math.random() * 4 + 2,
        type: 'splash'
      });
    }
  }

  private spawnCollectEffect(x: number, y: number, color: string, type: 'spark' | 'coin'): void {
    const count = type === 'coin' ? 10 : 8;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = Math.random() * 100 + 60;
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.6,
        maxLife: 0.6,
        color,
        size: Math.random() * 5 + 3,
        type
      });
    }
  }

  private resize = (): void => {
    const parent = this.canvas.parentElement;
    const width = parent ? parent.clientWidth : 360;
    const height = parent ? parent.clientHeight : 640;

    this.width = Math.max(280, Math.min(width, 480));
    this.height = Math.max(480, height);
    this.laneWidth = this.width / LANE_COUNT;

    this.canvas.width = this.width;
    this.canvas.height = this.height;

    this.playerX = this.laneCenter(this.playerLane);
    this.playerTargetX = this.playerX;
    this.playerY = this.height - 90;
  };

  private laneCenter(lane: LaneIndex): number {
    return this.laneWidth * lane + this.laneWidth / 2;
  }

  private reset(): void {
    this.obstacles = [];
    this.boxes = [];
    this.particles = [];
    this.foamParticles = [];
    this.spawnTimer = 0;
    this.elapsedSeconds = 0;
    this.playerLane = 1;
    this.playerTargetX = this.laneCenter(this.playerLane);
    this.playerX = this.playerTargetX;
    this.playerTilt = 0;
    this.waveTime = 0;

    this.state = {
      score: 0,
      coins: 0,
      combo: 1,
      isGameOver: false,
      isPaused: false,
      hasShield: false,
      speedBoostUntil: 0,
      freezeUntil: 0,
      slowUntil: 0,
      magnetUntil: 0
    };

    this.emitState();
  }

  private currentSpeed(): number {
    let speed = BASE_SPEED + this.elapsedSeconds * SPEED_RAMP_PER_SEC;
    speed = Math.min(speed, MAX_SPEED);

    const now = performance.now();
    if (now < this.state.speedBoostUntil) speed *= 1.6;
    if (now < this.state.slowUntil) speed *= 0.5;
    if (now < this.state.freezeUntil) speed = 0;
    return speed;
  }

  private loop = (timestamp: number): void => {
    if (this.state.isGameOver || this.state.isPaused) return;

    const delta = Math.min((timestamp - this.lastTimestamp) / 1000, 0.05);
    this.lastTimestamp = timestamp;
    this.elapsedSeconds += delta;
    this.waveTime += delta;

    this.update(delta);
    this.render();

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  private update(delta: number): void {
    const speed = this.currentSpeed();

    // Player lerp + tilt decay
    const lerpSpeed = 10;
    this.playerX += (this.playerTargetX - this.playerX) * Math.min(1, lerpSpeed * delta);
    this.playerTilt *= Math.pow(0.05, delta);

    this.shieldPulse += delta * 3;
    this.magnetPulse += delta * 4;

    // Animate wave layers
    for (const wl of this.waveLayers) {
      wl.offset += wl.speed * delta;
    }

    // Move entities
    for (const ob of this.obstacles) {
      ob.y += speed * delta;
      ob.wobble = (ob.wobble ?? 0) + delta * 3;
    }
    for (const box of this.boxes) {
      box.y += speed * delta;
      box.pulse = (box.pulse ?? 0) + delta * 4;
    }

    // Particles
    for (const p of this.particles) {
      p.x += p.vx * delta;
      p.y += p.vy * delta;
      p.vy += 120 * delta;
      p.life -= delta;
    }
    this.particles = this.particles.filter(p => p.life > 0);

    // Bubbles
    for (const b of this.bubbles) {
      b.y -= b.speed;
      if (b.y < -10) {
        b.y = this.height + 5;
        b.x = Math.random() * this.width;
      }
    }

    // Foam
    for (const f of this.foamParticles) {
      f.life -= delta;
    }
    this.foamParticles = this.foamParticles.filter(f => f.life > 0);

    // Spawn foam
    if (Math.random() < delta * 3) {
      this.foamParticles.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        life: 0.8 + Math.random() * 0.5,
        maxLife: 1.3,
        r: Math.random() * 6 + 2
      });
    }

    // Spawn entities
    this.spawnTimer += delta;
    const spawnInterval = Math.max(0.45, 1.1 - this.elapsedSeconds * 0.01);
    if (this.spawnTimer >= spawnInterval) {
      this.spawnTimer = 0;
      this.spawnEntity();
    }

    // Score
    this.state.score += Math.round(speed * delta * 0.1);

    // Magnet
    const now = performance.now();
    if (now < this.state.magnetUntil) {
      for (const box of this.boxes) {
        if (box.y > this.height * 0.4 && box.y < this.height * 0.95) {
          box.lane = this.playerLane;
        }
      }
    }

    this.handleCollisions();

    this.obstacles = this.obstacles.filter(ob => ob.y < this.height + ob.height);
    this.boxes = this.boxes.filter(box => box.y < this.height + box.height);

    this.emitState();
  }

  private spawnEntity(): void {
    const lane = Math.floor(Math.random() * LANE_COUNT) as LaneIndex;
    const roll = Math.random();

    if (roll < 0.55) {
      const type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
      this.obstacles.push({ lane, y: -60, width: this.laneWidth * 0.6, height: 50, type, wobble: 0 });
    } else {
      const positiveChance = 0.65;
      const pool = Math.random() < positiveChance ? POSITIVE_BOXES : NEGATIVE_BOXES;
      const type = pool[Math.floor(Math.random() * pool.length)] ?? ALL_BOXES[0];
      this.boxes.push({ lane, y: -60, width: this.laneWidth * 0.5, height: 40, type, pulse: 0 });
    }
  }

  private handleCollisions(): void {
    const playerTop = this.playerY - 40;
    const playerBottom = this.playerY + 40;

    for (const ob of this.obstacles) {
      if (ob.lane !== this.playerLane) continue;
      const obTop = ob.y - ob.height / 2;
      const obBottom = ob.y + ob.height / 2;

      if (obBottom >= playerTop && obTop <= playerBottom) {
        this.onObstacleHit(ob);
        ob.y = this.height + ob.height;
      }
    }

    for (const box of this.boxes) {
      if (box.lane !== this.playerLane) continue;
      const boxTop = box.y - box.height / 2;
      const boxBottom = box.y + box.height / 2;

      if (boxBottom >= playerTop && boxTop <= playerBottom) {
        const cx = this.laneCenter(box.lane);
        this.spawnCollectEffect(cx, box.y, this.boxGlowColor(box.type), box.type === 'coins' ? 'coin' : 'spark');
        this.onBoxCollected(box);
        box.y = this.height + box.height;
      }
    }
  }

  private onObstacleHit(obstacle: Obstacle): void {
    if (this.state.hasShield) {
      this.state.hasShield = false;
      this.spawnCollectEffect(this.playerX, this.playerY, '#22d3ee', 'spark');
      return;
    }

    switch (obstacle.type) {
      case 'rock':
      case 'shark':
      case 'jellyfish':
      case 'wave':
      default:
        this.endGame();
        break;
    }
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
      case 'shield': {
        this.state.hasShield = true;
        break;
      }
      case 'magnet': {
        this.state.magnetUntil = now + 6000;
        break;
      }
      case 'speed': {
        this.state.speedBoostUntil = now + 5000;
        break;
      }
      case 'combo': {
        this.state.combo = Math.min(this.state.combo + 1, 8);
        break;
      }
      case 'coinCut': {
        this.state.coins = Math.max(0, this.state.coins - 20);
        this.state.combo = 1;
        break;
      }
      case 'freeze': {
        this.state.freezeUntil = now + 1200;
        this.state.combo = 1;
        break;
      }
      case 'slowWave': {
        this.state.slowUntil = now + 4000;
        this.state.combo = 1;
        break;
      }
    }
  }

  private endGame(): void {
    this.state.isGameOver = true;
    this.emitState();
    this.callbacks.onGameOver(this.state.score, this.state.coins);
  }

  private emitState(): void {
    this.callbacks.onStateChange({ ...this.state });
  }

  // ---------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------

  private render(): void {
    const ctx = this.ctx;
    const now = performance.now();

    // ── Background deep ocean gradient ──
    const bgGrad = ctx.createLinearGradient(0, 0, 0, this.height);
    bgGrad.addColorStop(0, '#0c1445');
    bgGrad.addColorStop(0.35, '#0a3566');
    bgGrad.addColorStop(0.7, '#0369a1');
    bgGrad.addColorStop(1, '#0ea5e9');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, this.width, this.height);

    // ── Underwater light rays ──
    ctx.save();
    for (let r = 0; r < 5; r++) {
      const rx = (this.width / 5) * r + this.width / 10;
      const rayGrad = ctx.createLinearGradient(rx, 0, rx + 15, this.height * 0.6);
      rayGrad.addColorStop(0, 'rgba(255,255,255,0.04)');
      rayGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = rayGrad;
      ctx.beginPath();
      ctx.moveTo(rx - 10, 0);
      ctx.lineTo(rx + 10, 0);
      ctx.lineTo(rx + 25 + Math.sin(this.waveTime * 0.5 + r) * 5, this.height * 0.6);
      ctx.lineTo(rx - 5 + Math.sin(this.waveTime * 0.5 + r) * 5, this.height * 0.6);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // ── Bubbles ──
    ctx.save();
    for (const b of this.bubbles) {
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255,255,255,${b.opacity})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
    ctx.restore();

    // ── Animated wave layers ──
    for (const wl of this.waveLayers) {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, this.height * wl.y);
      for (let x = 0; x <= this.width; x += 4) {
        const y = this.height * wl.y + Math.sin(x * 0.025 + wl.offset) * wl.amplitude;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(this.width, this.height);
      ctx.lineTo(0, this.height);
      ctx.closePath();
      ctx.fillStyle = wl.color;
      ctx.fill();
      ctx.restore();
    }

    // ── Foam specks ──
    ctx.save();
    for (const f of this.foamParticles) {
      const alpha = (f.life / f.maxLife) * 0.25;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fill();
    }
    ctx.restore();

    // ── Lane separators (neon glow) ──
    for (let i = 1; i < LANE_COUNT; i++) {
      const x = this.laneWidth * i;
      const laneGrad = ctx.createLinearGradient(0, 0, 0, this.height);
      laneGrad.addColorStop(0, 'rgba(56,189,248,0)');
      laneGrad.addColorStop(0.3, 'rgba(56,189,248,0.3)');
      laneGrad.addColorStop(0.7, 'rgba(56,189,248,0.3)');
      laneGrad.addColorStop(1, 'rgba(56,189,248,0)');
      ctx.strokeStyle = laneGrad;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([12, 8]);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // ── Speed lines when boosting ──
    if (now < this.state.speedBoostUntil) {
      ctx.save();
      ctx.globalAlpha = 0.15;
      for (let i = 0; i < 8; i++) {
        const sx = Math.random() * this.width;
        const sy = (this.waveTime * 300 * (i + 1) * 0.3) % this.height;
        ctx.strokeStyle = '#7dd3fc';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx, sy + 30);
        ctx.stroke();
      }
      ctx.restore();
    }

    // ── Obstacles ──
    for (const ob of this.obstacles) {
      this.drawObstacle(ob);
    }

    // ── Mystery boxes ──
    for (const box of this.boxes) {
      this.drawMysteryBox(box);
    }

    // ── Particles ──
    ctx.save();
    for (const p of this.particles) {
      const alpha = p.life / p.maxLife;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      const sz = p.size * alpha;
      if (p.type === 'coin') {
        ctx.beginPath();
        ctx.arc(p.x, p.y, sz, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    // ── Magnet field effect ──
    if (now < this.state.magnetUntil) {
      ctx.save();
      const mGrad = ctx.createRadialGradient(this.playerX, this.playerY, 10, this.playerX, this.playerY, 80);
      mGrad.addColorStop(0, 'rgba(249,115,22,0)');
      mGrad.addColorStop(0.7, 'rgba(249,115,22,0.08)');
      mGrad.addColorStop(1, 'rgba(249,115,22,0)');
      ctx.fillStyle = mGrad;
      const mp = Math.sin(this.magnetPulse) * 0.5 + 0.5;
      ctx.beginPath();
      ctx.arc(this.playerX, this.playerY, 70 + mp * 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // ── Player (surfboard) ──
    this.drawPlayer(now);

    // ── Pause overlay ──
    if (this.state.isPaused) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, this.width, this.height);

      ctx.save();
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur = 20;
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 32px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', this.width / 2, this.height / 2 - 10);
      ctx.restore();

      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '16px "Segoe UI", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Tap ⏸ to continue', this.width / 2, this.height / 2 + 24);
    }
  }

  private drawPlayer(now: number): void {
    const ctx = this.ctx;
    const px = this.playerX;
    const py = this.playerY;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(this.playerTilt);

    // Wake / water spray behind board
    for (let s = 0; s < 3; s++) {
      const sx = (s - 1) * 12;
      const wakeGrad = ctx.createLinearGradient(sx, 0, sx, 30);
      wakeGrad.addColorStop(0, 'rgba(255,255,255,0.4)');
      wakeGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = wakeGrad;
      ctx.beginPath();
      ctx.moveTo(sx - 4, 0);
      ctx.lineTo(sx + 4, 0);
      ctx.lineTo(sx + 6, 32);
      ctx.lineTo(sx - 6, 32);
      ctx.closePath();
      ctx.fill();
    }

    // Shield glow
    if (this.state.hasShield) {
      const sp = Math.sin(this.shieldPulse) * 0.4 + 0.6;
      const shieldGrad = ctx.createRadialGradient(0, 0, 10, 0, 0, 45);
      shieldGrad.addColorStop(0, `rgba(34,211,238,0)`);
      shieldGrad.addColorStop(0.6, `rgba(34,211,238,${sp * 0.2})`);
      shieldGrad.addColorStop(1, `rgba(34,211,238,${sp * 0.5})`);
      ctx.fillStyle = shieldGrad;
      ctx.beginPath();
      ctx.arc(0, 0, 45, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = `rgba(34,211,238,${sp * 0.9})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 40, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Speed boost aura
    if (now < this.state.speedBoostUntil) {
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 18;
    } else {
      ctx.shadowColor = 'rgba(56,189,248,0.6)';
      ctx.shadowBlur = 12;
    }

    // Surfboard body
    const boardGrad = ctx.createLinearGradient(-28, -10, 28, 14);
    boardGrad.addColorStop(0, '#f0f9ff');
    boardGrad.addColorStop(0.4, '#e0f2fe');
    boardGrad.addColorStop(1, '#7dd3fc');
    ctx.fillStyle = boardGrad;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.bezierCurveTo(14, -14, 30, -4, 28, 8);
    ctx.bezierCurveTo(26, 18, -26, 18, -28, 8);
    ctx.bezierCurveTo(-30, -4, -14, -14, 0, -18);
    ctx.closePath();
    ctx.fill();

    // Board stripe
    ctx.shadowBlur = 0;
    const stripeGrad = ctx.createLinearGradient(-20, 0, 20, 0);
    stripeGrad.addColorStop(0, 'transparent');
    stripeGrad.addColorStop(0.2, '#0ea5e9');
    stripeGrad.addColorStop(0.8, '#0ea5e9');
    stripeGrad.addColorStop(1, 'transparent');
    ctx.strokeStyle = stripeGrad;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(-20, 2);
    ctx.lineTo(20, 2);
    ctx.stroke();

    // Board fin
    ctx.fillStyle = '#0369a1';
    ctx.beginPath();
    ctx.moveTo(0, 10);
    ctx.lineTo(-5, 28);
    ctx.lineTo(5, 28);
    ctx.closePath();
    ctx.fill();

    // Surfer silhouette
    ctx.fillStyle = '#1e3a8a';
    // Body
    ctx.beginPath();
    ctx.ellipse(0, -8, 5, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // Head
    ctx.beginPath();
    ctx.arc(0, -20, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#fde68a';
    ctx.fill();
    // Arms
    ctx.strokeStyle = '#1e3a8a';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
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
    const ctx = this.ctx;
    const x = this.laneCenter(ob.lane);
    const y = ob.y;
    const wobble = Math.sin(ob.wobble ?? 0) * 3;

    ctx.save();
    ctx.translate(x, y + wobble);

    switch (ob.type) {
      case 'rock': {
        // Shadow
        ctx.beginPath();
        ctx.ellipse(0, 20, 22, 6, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fill();

        // Rock body
        const rGrad = ctx.createRadialGradient(-5, -8, 2, 0, 0, 22);
        rGrad.addColorStop(0, '#9ca3af');
        rGrad.addColorStop(0.5, '#6b7280');
        rGrad.addColorStop(1, '#374151');
        ctx.fillStyle = rGrad;
        ctx.beginPath();
        ctx.moveTo(0, -22);
        ctx.bezierCurveTo(14, -20, 22, -8, 20, 6);
        ctx.bezierCurveTo(18, 18, -18, 18, -20, 6);
        ctx.bezierCurveTo(-22, -8, -14, -20, 0, -22);
        ctx.closePath();
        ctx.fill();

        // Highlight
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.ellipse(-4, -10, 7, 4, -0.5, 0, Math.PI * 2);
        ctx.fill();

        // Emoji label
        ctx.font = '20px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🪨', 0, -2);
        break;
      }

      case 'shark': {
        ctx.shadowColor = '#374151';
        ctx.shadowBlur = 10;

        // Body
        const sGrad = ctx.createLinearGradient(-20, -15, 20, 15);
        sGrad.addColorStop(0, '#4b5563');
        sGrad.addColorStop(1, '#1f2937');
        ctx.fillStyle = sGrad;
        ctx.beginPath();
        ctx.ellipse(0, 5, 20, 14, 0, 0, Math.PI * 2);
        ctx.fill();

        // Dorsal fin
        ctx.fillStyle = '#374151';
        ctx.beginPath();
        ctx.moveTo(-4, -14);
        ctx.lineTo(6, -28);
        ctx.lineTo(12, -14);
        ctx.closePath();
        ctx.fill();

        // Eye
        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(10, 2, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1f2937';
        ctx.beginPath();
        ctx.arc(11, 2, 2, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '22px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🦈', 0, -2);
        ctx.shadowBlur = 0;
        break;
      }

      case 'jellyfish': {
        ctx.shadowColor = '#a855f7';
        ctx.shadowBlur = 15;

        // Bell
        const jGrad = ctx.createRadialGradient(0, -5, 2, 0, -5, 20);
        jGrad.addColorStop(0, 'rgba(192,132,252,0.9)');
        jGrad.addColorStop(0.6, 'rgba(168,85,247,0.75)');
        jGrad.addColorStop(1, 'rgba(147,51,234,0.5)');
        ctx.fillStyle = jGrad;
        ctx.beginPath();
        ctx.arc(0, -5, 20, Math.PI, 0);
        ctx.closePath();
        ctx.fill();

        // Tentacles
        ctx.strokeStyle = 'rgba(192,132,252,0.7)';
        ctx.lineWidth = 1.5;
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

        ctx.font = '22px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🪼', 0, -5);
        ctx.shadowBlur = 0;
        break;
      }

      case 'wave': {
        ctx.shadowColor = '#1d4ed8';
        ctx.shadowBlur = 12;

        const wGrad = ctx.createLinearGradient(-25, -18, 25, 20);
        wGrad.addColorStop(0, '#93c5fd');
        wGrad.addColorStop(0.4, '#3b82f6');
        wGrad.addColorStop(1, '#1d4ed8');
        ctx.fillStyle = wGrad;

        ctx.beginPath();
        ctx.moveTo(-28, 18);
        ctx.bezierCurveTo(-28, -10, -10, -24, 0, -20);
        ctx.bezierCurveTo(12, -16, 22, -4, 28, 18);
        ctx.closePath();
        ctx.fill();

        // Foam crest
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.beginPath();
        ctx.ellipse(-6, -18, 12, 4, -0.3, 0, Math.PI * 2);
        ctx.fill();

        ctx.font = '22px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('🌊', 0, -2);
        ctx.shadowBlur = 0;
        break;
      }
    }

    ctx.restore();
  }

  private drawMysteryBox(box: MysteryBox): void {
    const ctx = this.ctx;
    const x = this.laneCenter(box.lane);
    const y = box.y;
    const pulse = Math.sin(box.pulse ?? 0) * 0.12 + 1;
    const floatY = Math.sin((box.pulse ?? 0) * 0.7) * 4;

    ctx.save();
    ctx.translate(x, y + floatY);
    ctx.scale(pulse, pulse);

    const emoji = this.boxEmoji(box.type);
    const glowColor = this.boxGlowColor(box.type);

    // Glow halo
    const glowGrad = ctx.createRadialGradient(0, 0, 4, 0, 0, 28);
    glowGrad.addColorStop(0, glowColor.replace(')', ',0.5)').replace('rgb', 'rgba'));
    glowGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.fill();

    // Box background
    ctx.fillStyle = glowColor;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.roundRect(-18, -18, 36, 36, 8);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Inner lighter
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.roundRect(-14, -14, 28, 14, 5);
    ctx.fill();

    // Emoji icon
    ctx.font = '20px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 0, 1);

    ctx.restore();
  }

  private boxEmoji(type: BoxType): string {
    switch (type) {
      case 'coins': return '🪙';
      case 'shield': return '🛡️';
      case 'magnet': return '🧲';
      case 'speed': return '⚡';
      case 'combo': return '🔥';
      case 'coinCut': return '💀';
      case 'freeze': return '❄️';
      case 'slowWave': return '🌀';
    }
  }

  private boxGlowColor(type: BoxType): string {
    switch (type) {
      case 'coins': return '#f59e0b';
      case 'shield': return '#06b6d4';
      case 'magnet': return '#f97316';
      case 'speed': return '#10b981';
      case 'combo': return '#ec4899';
      case 'coinCut': return '#ef4444';
      case 'freeze': return '#60a5fa';
      case 'slowWave': return '#0d9488';
    }
  }
}

// ---------------------------------------------------------------------
// Local leaderboard (localStorage based)
// ---------------------------------------------------------------------

const LEADERBOARD_KEY = 'surfRushLeaderboard';
const MAX_ENTRIES = 10;

export interface LeaderboardEntry {
  name: string;
  score: number;
  coins: number;
  date: string;
}

export function getLeaderboard(): LeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(LEADERBOARD_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LeaderboardEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed;
  } catch {
    return [];
  }
}

export function saveToLeaderboard(entry: LeaderboardEntry): LeaderboardEntry[] {
  const current = getLeaderboard();
  const updated = [...current, entry]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_ENTRIES);

  try {
    localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(updated));
  } catch {
    // ignore storage errors
  }

  return updated;
}
