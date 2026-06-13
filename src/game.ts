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
  y: number; // 0 (top, spawn) -> canvasHeight (bottom, player line)
  width: number;
  height: number;
}

interface Obstacle extends Entity {
  type: ObstacleType;
}

interface MysteryBox extends Entity {
  type: BoxType;
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
const BASE_SPEED = 220; // px per second
const MAX_SPEED = 620;
const SPEED_RAMP_PER_SEC = 4; // how quickly base difficulty ramps up

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

  private obstacles: Obstacle[] = [];
  private boxes: MysteryBox[] = [];

  private lastTimestamp = 0;
  private spawnTimer = 0;
  private elapsedSeconds = 0;
  private animationFrameId: number | null = null;

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
    if (!ctx) {
      throw new Error('Canvas 2D context not available');
    }
    this.ctx = ctx;
    this.callbacks = callbacks;

    this.resize();
    this.playerX = this.laneCenter(this.playerLane);
    this.playerTargetX = this.playerX;
    this.playerY = this.height - 90;

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
    }
  }

  public moveRight(): void {
    if (this.state.isGameOver || this.state.isPaused) return;
    if (this.playerLane < LANE_COUNT - 1) {
      this.playerLane = (this.playerLane + 1) as LaneIndex;
      this.playerTargetX = this.laneCenter(this.playerLane);
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
    this.spawnTimer = 0;
    this.elapsedSeconds = 0;
    this.playerLane = 1;
    this.playerTargetX = this.laneCenter(this.playerLane);
    this.playerX = this.playerTargetX;

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
    if (now < this.state.speedBoostUntil) {
      speed *= 1.6;
    }
    if (now < this.state.slowUntil) {
      speed *= 0.5;
    }
    if (now < this.state.freezeUntil) {
      speed = 0;
    }
    return speed;
  }

  private loop = (timestamp: number): void => {
    if (this.state.isGameOver || this.state.isPaused) {
      return;
    }

    const delta = Math.min((timestamp - this.lastTimestamp) / 1000, 0.05);
    this.lastTimestamp = timestamp;
    this.elapsedSeconds += delta;

    this.update(delta);
    this.render();

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  private update(delta: number): void {
    const speed = this.currentSpeed();

    // Smoothly move player toward target lane.
    const lerpSpeed = 10;
    this.playerX += (this.playerTargetX - this.playerX) * Math.min(1, lerpSpeed * delta);

    // Move obstacles and boxes downward.
    for (const ob of this.obstacles) {
      ob.y += speed * delta;
    }
    for (const box of this.boxes) {
      box.y += speed * delta;
    }

    // Spawn new entities periodically. Spawn rate increases with difficulty.
    this.spawnTimer += delta;
    const spawnInterval = Math.max(0.45, 1.1 - this.elapsedSeconds * 0.01);
    if (this.spawnTimer >= spawnInterval) {
      this.spawnTimer = 0;
      this.spawnEntity();
    }

    // Score increases over time (survival score).
    this.state.score += Math.round(speed * delta * 0.1);

    // Magnet effect: pull nearby boxes into the player's lane.
    const now = performance.now();
    if (now < this.state.magnetUntil) {
      for (const box of this.boxes) {
        if (box.y > this.height * 0.4 && box.y < this.height * 0.95) {
          box.lane = this.playerLane;
        }
      }
    }

    this.handleCollisions();

    // Remove off-screen entities.
    this.obstacles = this.obstacles.filter((ob) => ob.y < this.height + ob.height);
    this.boxes = this.boxes.filter((box) => box.y < this.height + box.height);

    this.emitState();
  }

  private spawnEntity(): void {
    const lane = Math.floor(Math.random() * LANE_COUNT) as LaneIndex;
    const roll = Math.random();

    // ~55% obstacle, ~45% mystery box
    if (roll < 0.55) {
      const type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
      this.obstacles.push({
        lane,
        y: -60,
        width: this.laneWidth * 0.6,
        height: 50,
        type
      });
    } else {
      const positiveChance = 0.65;
      const pool = Math.random() < positiveChance ? POSITIVE_BOXES : NEGATIVE_BOXES;
      const type = pool[Math.floor(Math.random() * pool.length)] ?? ALL_BOXES[0];
      this.boxes.push({
        lane,
        y: -60,
        width: this.laneWidth * 0.5,
        height: 40,
        type
      });
    }
  }

  private handleCollisions(): void {
    const playerTop = this.playerY - 40;
    const playerBottom = this.playerY + 40;

    // Obstacles
    for (const ob of this.obstacles) {
      if (ob.lane !== this.playerLane) continue;
      const obTop = ob.y - ob.height / 2;
      const obBottom = ob.y + ob.height / 2;

      if (obBottom >= playerTop && obTop <= playerBottom) {
        this.onObstacleHit(ob);
        ob.y = this.height + ob.height; // mark for removal
      }
    }

    // Mystery boxes
    for (const box of this.boxes) {
      if (box.lane !== this.playerLane) continue;
      const boxTop = box.y - box.height / 2;
      const boxBottom = box.y + box.height / 2;

      if (boxBottom >= playerTop && boxTop <= playerBottom) {
        this.onBoxCollected(box);
        box.y = this.height + box.height; // mark for removal
      }
    }
  }

  private onObstacleHit(obstacle: Obstacle): void {
    if (this.state.hasShield) {
      this.state.hasShield = false;
      return;
    }

    // Different obstacles could have slightly different penalties.
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

    // Background (ocean gradient)
    const gradient = ctx.createLinearGradient(0, 0, 0, this.height);
    gradient.addColorStop(0, '#0ea5e9');
    gradient.addColorStop(1, '#0369a1');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.width, this.height);

    // Lane separators
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    for (let i = 1; i < LANE_COUNT; i++) {
      const x = this.laneWidth * i;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.height);
      ctx.stroke();
    }

    // Obstacles
    for (const ob of this.obstacles) {
      ctx.fillStyle = this.obstacleColor(ob.type);
      const x = this.laneCenter(ob.lane) - ob.width / 2;
      ctx.fillRect(x, ob.y - ob.height / 2, ob.width, ob.height);
    }

    // Mystery boxes
    for (const box of this.boxes) {
      ctx.fillStyle = this.boxColor(box.type);
      const x = this.laneCenter(box.lane) - box.width / 2;
      ctx.fillRect(x, box.y - box.height / 2, box.width, box.height);
    }

    // Player (surfboard)
    ctx.fillStyle = this.state.hasShield ? '#facc15' : '#ffffff';
    ctx.beginPath();
    ctx.ellipse(this.playerX, this.playerY, 28, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(this.playerX - 4, this.playerY - 22, 8, 22);

    // Pause overlay
    if (this.state.isPaused) {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 28px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('PAUSED', this.width / 2, this.height / 2);
    }
  }

  private obstacleColor(type: ObstacleType): string {
    switch (type) {
      case 'rock':
        return '#6b7280';
      case 'shark':
        return '#374151';
      case 'jellyfish':
        return '#a855f7';
      case 'wave':
        return '#1d4ed8';
    }
  }

  private boxColor(type: BoxType): string {
    switch (type) {
      case 'coins':
        return '#fbbf24';
      case 'shield':
        return '#22d3ee';
      case 'magnet':
        return '#f97316';
      case 'speed':
        return '#10b981';
      case 'combo':
        return '#ec4899';
      case 'coinCut':
        return '#ef4444';
      case 'freeze':
        return '#60a5fa';
      case 'slowWave':
        return '#0f766e';
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
    // ignore storage errors (e.g. private browsing)
  }

  return updated;
}
