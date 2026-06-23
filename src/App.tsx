import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GameEngine, GameState,
  LeaderboardEntry, getLeaderboard, saveToLeaderboard,
  PlayerProfile, getProfile, saveProfile,
  levelFromXp, xpForLevel, xpForNextLevel, xpForRun, rankTitle,
  Achievement, AchievementId, getAchievements, unlockAchievement,
  Mission, getMissions, saveMissions,
  StreakData, getStreak, updateStreak,
  ShopPurchase, getShopPurchases, saveShopPurchases,
} from './game';
import {
  connectWallet, disconnectWallet,
  isInjectedWalletAvailable, isMobileDevice,
  saveScoreOnChain, subscribeToChainChanges,
  WalletState, TxPhase, TX_PHASE_LABEL, REWARD_CONTRACT_DEPLOYED,
} from './wallet';
import { initTelegram, getTelegramUser, shareScore } from './telegram';

// ─── Constants ──────────────────────────────────────────────────────────────
type Screen = 'start' | 'playing' | 'gameover';
const TELEGRAM_BOT_USERNAME = 'your_bot_username';
const EXTRA_LIFE_COST   = 100;
const SHIELD_COST       = 200;
const MAGNET_COST       = 150;
const MULTIPLIER_COST   = 250;
const DAILY_REWARD_COINS = 500;

function shorten(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ─── Pure SVG icons (no emoji, no unicode glyphs in UI) ──────────────────────
interface SvgProps { size?: number; color?: string; }

const Ic = {
  Coin: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2"/>
      <circle cx="12" cy="12" r="5.5" fill={color} opacity="0.2"/>
      <path d="M12 8v8M9.5 10h3a1.5 1.5 0 0 1 0 3H9.5M9.5 13h3.5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  Heart: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
    </svg>
  ),
  Shield: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <path d="M12 2L3 7v6c0 5.25 3.75 10.15 9 11.25C17.25 23.15 21 18.25 21 13V7L12 2z" stroke={color} strokeWidth="2" strokeLinejoin="round" fill={color} fillOpacity="0.15"/>
      <path d="M9 12l2 2 4-4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Magnet: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <path d="M6 4v8a6 6 0 0 0 12 0V4" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M4 4h4M16 4h4" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  ),
  Bolt: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>
  ),
  Flame: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <path d="M12 2c0 0-5 4-5 9a5 5 0 0 0 10 0c0-2-1-4-2-5 0 2-1 3-3 3-1 0-2-1-2-2 0-2 2-5 2-5z"/>
    </svg>
  ),
  Trophy: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <path d="M8 21h8M12 21v-4" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <path d="M7 3H4v4a3 3 0 0 0 3 3M17 3h3v4a3 3 0 0 1-3 3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 3h10v6a5 5 0 0 1-10 0V3z" stroke={color} strokeWidth="2" strokeLinejoin="round" fill={color} fillOpacity="0.15"/>
      <path d="M5 17h14" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Gift: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <rect x="2" y="9" width="20" height="13" rx="2" stroke={color} strokeWidth="2" fill={color} fillOpacity="0.1"/>
      <path d="M12 9v13M2 14h20" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <path d="M12 9a3 3 0 0 0-3-3c-1.5 0-2 1-2 2s.5 2 2 2h3M12 9a3 3 0 0 1 3-3c1.5 0 2 1 2 2s-.5 2-2 2h-3" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Wave: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <path d="M2 12c1.5-2 3-3 5-3s3.5 2 5 2 3.5-2 5-2 3.5 1 5 3" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M2 17c1.5-2 3-3 5-3s3.5 2 5 2 3.5-2 5-2 3.5 1 5 3" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.4"/>
    </svg>
  ),
  Chain: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Cart: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" stroke={color} strokeWidth="2" strokeLinejoin="round" fill={color} fillOpacity="0.1"/>
      <path d="M3 6h18" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <path d="M16 10a4 4 0 0 1-8 0" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Surf: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <circle cx="12" cy="4" r="2" fill={color}/>
      <path d="M8 19l4-8 4 4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M4 17c2-1 4-1.5 8-1s6 1 8 0" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Star: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  ),
  Info: ({ size = 16, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2"/>
      <path d="M12 8v1M12 11v5" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  ),
  Chart: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <rect x="3"  y="12" width="4" height="9" rx="1" fill={color} fillOpacity="0.7"/>
      <rect x="10" y="7"  width="4" height="14" rx="1" fill={color}/>
      <rect x="17" y="4"  width="4" height="17" rx="1" fill={color} fillOpacity="0.5"/>
    </svg>
  ),
  User: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <circle cx="12" cy="8" r="4" stroke={color} strokeWidth="2"/>
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Task: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <rect x="3" y="3" width="18" height="18" rx="3" stroke={color} strokeWidth="2" fill={color} fillOpacity="0.07"/>
      <path d="M8 12l3 3 5-5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Fire: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <path d="M12 2c0 0-5 4-5 9a5 5 0 0 0 10 0c0-2-1-4-2-5 0 2-1 3-3 3-1 0-2-1-2-2 0-2 2-5 2-5z"/>
    </svg>
  ),
  Medal: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <circle cx="12" cy="14" r="6" stroke={color} strokeWidth="2" fill={color} fillOpacity="0.15"/>
      <path d="M8 6l-2-4h12l-2 4" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
      <path d="M9 6h6" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <path d="M12 11v3l1.5 1" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Skull: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <circle cx="12" cy="10" r="7" stroke={color} strokeWidth="2" fill={color} fillOpacity="0.15"/>
      <path d="M9 17v3M15 17v3M9 20h6" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="9.5" cy="10" r="1.5" fill={color}/>
      <circle cx="14.5" cy="10" r="1.5" fill={color}/>
    </svg>
  ),
  Snow: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="12" cy="12" r="2" fill={color}/>
    </svg>
  ),
  Swirl: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <path d="M20 12a8 8 0 1 1-8-8" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M12 4l3-3M12 4l-3-3" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Check: ({ size = 16, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <path d="M5 12l5 5L19 7" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Xp: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2" fill={color} fillOpacity="0.1"/>
      <path d="M8 8l8 8M16 8l-8 8" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  ),
  Bag: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" stroke={color} strokeWidth="2" strokeLinejoin="round" fill={color} fillOpacity="0.1"/>
      <path d="M3 6h18" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <path d="M16 10a4 4 0 0 1-8 0" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
} as const;

type IconKey = keyof typeof Ic;

function Icon({ name, size, color }: { name: IconKey; size?: number; color?: string }) {
  const C = Ic[name];
  return <C size={size} color={color} />;
}

// ─── Toast ───────────────────────────────────────────────────────────────────
interface ToastItem { id: number; msg: string; color: string; icon: IconKey; }
let _toastId = 0;

function ToastStack({ items, dismiss }: { items: ToastItem[]; dismiss: (id: number) => void }) {
  return (
    <div className="toast-stack">
      {items.map(t => (
        <div key={t.id} className="toast" style={{ borderColor: t.color }} onClick={() => dismiss(t.id)}>
          <Icon name={t.icon} size={15} color={t.color} />
          <span>{t.msg}</span>
        </div>
      ))}
    </div>
  );
}

// ─── HUD ─────────────────────────────────────────────────────────────────────
function Hud({ gs, sa, ca, bal }: { gs: GameState; sa: boolean; ca: boolean; bal: number }) {
  return (
    <div className="hud">
      <div className={`hud-card${sa ? ' hud-pop' : ''}`}>
        <span className="hud-label">Score</span>
        <span className="hud-value" style={{ color: '#22d3ee' }}>{gs.score.toLocaleString()}</span>
      </div>
      <div className="hud-card">
        <span className="hud-label">Run Coins</span>
        <span className="hud-value" style={{ color: '#f59e0b', display:'flex', alignItems:'center', gap:4 }}>
          <Icon name="Coin" size={15} color="#f59e0b" />{gs.coins}
        </span>
      </div>
      <div className={`hud-card${ca ? ' hud-pop' : ''}${gs.combo > 3 ? ' hud-hot' : ''}`}>
        <span className="hud-label">Combo</span>
        <span className="hud-value" style={{ color: '#f97316' }}>x{gs.combo}</span>
      </div>
      <div className="hud-card">
        <span className="hud-label">Balance</span>
        <span className="hud-value" style={{ color: '#a855f7', display:'flex', alignItems:'center', gap:4 }}>
          <Icon name="Coin" size={14} color="#a855f7" />{bal}
        </span>
      </div>
    </div>
  );
}

// ─── Section wrapper (collapsible) ───────────────────────────────────────────
function Section({
  icon, iconColor = '#22d3ee', title, badge, highlight, children,
}: {
  icon: IconKey; iconColor?: string; title: string;
  badge?: React.ReactNode; highlight?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`section-card${highlight ? ' section-highlight' : ''}`}>
      <button
        className="section-header-btn"
        onClick={() => setOpen(o => !o)}
        type="button"
        aria-expanded={open}
      >
        <span className="section-icon">
          <Icon name={icon} size={16} color={iconColor} />
        </span>
        <span className="section-title">{title}</span>
        {badge && <span className="section-badge">{badge}</span>}
        <span className="chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

// ─── FEATURE 1: Premium Player Dashboard ─────────────────────────────────────
function PlayerDashboard({ profile, streak }: { profile: PlayerProfile; streak: StreakData }) {
  const level      = profile.level;
  const xpCurrent  = profile.xp - xpForLevel(level);
  const xpNeeded   = xpForNextLevel(level) - xpForLevel(level);
  const xpPct      = xpNeeded > 0 ? Math.min(100, Math.round((xpCurrent / xpNeeded) * 100)) : 100;
  const rank       = rankTitle(level);
  const avgScore   = profile.totalGames > 0
    ? Math.round(profile.totalScoreSum / profile.totalGames) : 0;

  return (
    <Section
      icon="User" iconColor="#22d3ee" title="Player Dashboard"
      badge={<span className="db-rank-badge">{rank} Lv.{level}</span>}
    >
      {/* Level + XP bar */}
      <div className="db-xp-row">
        <div className="db-level-circle">
          <span className="db-level-num">{level}</span>
          <span className="db-level-lbl">LVL</span>
        </div>
        <div className="db-xp-info">
          <div className="db-xp-header">
            <span className="db-rank-label">{rank}</span>
            <span className="db-xp-numbers">{xpCurrent.toLocaleString()} / {xpNeeded.toLocaleString()} XP</span>
          </div>
          <div className="db-xp-bar-track">
            <div className="db-xp-bar-fill" style={{ width: `${xpPct}%` }} />
          </div>
          <span className="db-xp-pct">{xpPct}% to Level {level + 1}</span>
        </div>
      </div>

      {/* Stats grid */}
      <div className="db-stats-grid">
        <div className="db-stat">
          <Icon name="Surf" size={18} color="#22d3ee" />
          <span className="db-stat-val">{profile.totalGames}</span>
          <span className="db-stat-lbl">Total Runs</span>
        </div>
        <div className="db-stat">
          <Icon name="Trophy" size={18} color="#f59e0b" />
          <span className="db-stat-val">{profile.highScore.toLocaleString()}</span>
          <span className="db-stat-lbl">Best Score</span>
        </div>
        <div className="db-stat">
          <Icon name="Chart" size={18} color="#38bdf8" />
          <span className="db-stat-val">{avgScore.toLocaleString()}</span>
          <span className="db-stat-lbl">Avg Score</span>
        </div>
        <div className="db-stat">
          <Icon name="Coin" size={18} color="#f59e0b" />
          <span className="db-stat-val">{profile.totalCoinsEarned.toLocaleString()}</span>
          <span className="db-stat-lbl">Coins Earned</span>
        </div>
        <div className="db-stat">
          <Icon name="Coin" size={18} color="#a855f7" />
          <span className="db-stat-val">{profile.coinBalance}</span>
          <span className="db-stat-lbl">Balance</span>
        </div>
        <div className="db-stat">
          <Icon name="Heart" size={18} color="#f9a8d4" />
          <span className="db-stat-val">{profile.lives}</span>
          <span className="db-stat-lbl">Free Lives</span>
        </div>
      </div>

      {/* Streak */}
      {streak.currentStreak > 0 && (
        <div className="db-streak-row">
          <Icon name="Fire" size={16} color="#f97316" />
          <span className="db-streak-text">
            <strong>{streak.currentStreak}-day streak</strong>
            {' — '}
            {streak.currentStreak >= 7 ? '+250 bonus' : streak.currentStreak >= 3 ? '+100 bonus' : '+50 bonus'} daily
          </span>
          <div className="db-streak-dots">
            {[1, 3, 7].map(m => (
              <span
                key={m}
                className={`db-streak-dot${streak.currentStreak >= m ? ' active' : ''}`}
                title={`Day ${m}`}
              >D{m}</span>
            ))}
          </div>
        </div>
      )}
    </Section>
  );
}

// ─── FEATURE 2: Daily Missions ────────────────────────────────────────────────
function DailyMissions({ missions, onClaim }: { missions: Mission[]; onClaim: (id: string) => void }) {
  const claimable = missions.filter(m => m.completed && !m.claimed).length;
  const done      = missions.filter(m => m.completed).length;

  return (
    <Section
      icon="Task" iconColor="#10b981" title="Daily Missions"
      badge={
        claimable > 0
          ? <span className="badge-green">{claimable} ready</span>
          : <span>{done}/{missions.length}</span>
      }
      highlight={claimable > 0}
    >
      <div className="missions-list">
        {missions.map(m => {
          const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
          const icon: IconKey = (m.icon as IconKey) in Ic ? (m.icon as IconKey) : 'Star';
          return (
            <div
              key={m.id}
              className={`mission-row${m.claimed ? ' mission-claimed' : m.completed ? ' mission-done' : ''}`}
            >
              <div className="mission-icon-wrap">
                <Icon name={icon} size={20} color={m.completed ? '#10b981' : '#475569'} />
                {m.completed && !m.claimed && (
                  <span className="mission-complete-ring" />
                )}
              </div>
              <div className="mission-body">
                <div className="mission-top-row">
                  <span className="mission-title">{m.title}</span>
                  <span className={`mission-status-tag${m.claimed ? ' tag-claimed' : m.completed ? ' tag-done' : ''}`}>
                    {m.claimed ? 'Claimed' : m.completed ? 'Complete' : `${m.progress}/${m.target}`}
                  </span>
                </div>
                <span className="mission-desc">{m.desc}</span>
                <div className="mission-progress-wrap">
                  <div className="mission-bar">
                    <div
                      className={`mission-bar-fill${m.completed ? ' mission-bar-complete' : ''}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="mission-pct">{pct}%</span>
                </div>
              </div>
              <div className="mission-reward-col">
                {m.claimed ? (
                  <span className="mission-claimed-check"><Icon name="Check" size={14} color="#10b981" /></span>
                ) : m.completed ? (
                  <button
                    className="mission-claim-btn"
                    onClick={() => onClaim(m.id)}
                    type="button"
                  >
                    <Icon name="Coin" size={12} color="#020916" />
                    +{m.reward}
                  </button>
                ) : (
                  <span className="mission-reward-preview">
                    <Icon name="Coin" size={12} color="#f59e0b" />
                    {m.reward}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Section>
  );
}

// ─── FEATURE 3: Power-Up Shop ─────────────────────────────────────────────────
interface ShopItem {
  key: 'shield' | 'magnet' | 'multiplier';
  icon: IconKey; color: string; name: string; desc: string; cost: number;
}
const SHOP_ITEMS: ShopItem[] = [
  { key: 'shield',     icon: 'Shield', color: '#06b6d4', name: 'Shield',           desc: 'Start next run with a shield',     cost: SHIELD_COST     },
  { key: 'magnet',     icon: 'Magnet', color: '#f97316', name: 'Magnet Boost',      desc: 'Attract coins for 6 seconds',      cost: MAGNET_COST     },
  { key: 'multiplier', icon: 'Star',   color: '#f59e0b', name: 'Score Multiplier',  desc: 'Start with x2 combo active',       cost: MULTIPLIER_COST },
];

function PowerUpShop({
  coinBalance, shopPurchases, onBuy,
}: {
  coinBalance: number;
  shopPurchases: ShopPurchase;
  onBuy: (key: ShopItem['key']) => void;
}) {
  return (
    <Section
      icon="Cart" iconColor="#22d3ee" title="Power-Up Shop"
      badge={<span className="badge-coins"><Icon name="Coin" size={12} color="#f59e0b" />{coinBalance}</span>}
    >
      <div className="shop-info-bar">
        <Icon name="Info" size={13} color="#94a3b8" />
        <span>Purchased power-ups activate at the start of your next run.</span>
      </div>

      {/* Extra Life — context link only */}
      <div className="shop-item shop-item-life">
        <div className="shop-item-icon-wrap">
          <Icon name="Heart" size={22} color="#f9a8d4" />
        </div>
        <div className="shop-item-details">
          <span className="shop-item-name">Extra Life</span>
          <span className="shop-item-desc">Continue after wipeout — buy on Game Over screen</span>
        </div>
        <span className="shop-item-price">
          <Icon name="Coin" size={13} color="#f59e0b" />{EXTRA_LIFE_COST}
        </span>
      </div>

      {SHOP_ITEMS.map(item => {
        const owned    = shopPurchases[item.key];
        const canAfford = coinBalance >= item.cost;
        return (
          <div
            key={item.key}
            className={`shop-item shop-item-buyable${!canAfford ? ' shop-item-broke' : ''}`}
          >
            <div className="shop-item-icon-wrap">
              <Icon name={item.icon} size={22} color={item.color} />
            </div>
            <div className="shop-item-details">
              <span className="shop-item-name">
                {item.name}
                {owned > 0 && <span className="owned-badge">x{owned} owned</span>}
              </span>
              <span className="shop-item-desc">{item.desc}</span>
            </div>
            <div className="shop-item-action">
              <span className="shop-item-price">
                <Icon name="Coin" size={12} color="#f59e0b" />{item.cost}
              </span>
              <button
                className={`shop-buy-btn${canAfford ? ' buy-enabled' : ' buy-disabled'}`}
                onClick={() => canAfford && onBuy(item.key)}
                disabled={!canAfford}
                type="button"
              >
                {canAfford ? 'Buy' : `${item.cost - coinBalance} short`}
              </button>
            </div>
          </div>
        );
      })}
    </Section>
  );
}

// ─── FEATURE 4: Boost Inventory ──────────────────────────────────────────────
function BoostInventory({
  shopPurchases, profile, onActivate,
}: {
  shopPurchases: ShopPurchase;
  profile: PlayerProfile;
  onActivate: (key: 'shield' | 'magnet' | 'multiplier' | 'life') => void;
}) {
  const totalItems =
    shopPurchases.shield + shopPurchases.magnet + shopPurchases.multiplier + profile.lives;

  const items = [
    { key: 'life'       as const, icon: 'Heart'  as IconKey, color: '#f9a8d4', name: 'Extra Life',       count: profile.lives,          desc: 'Use on Game Over screen' },
    { key: 'shield'     as const, icon: 'Shield' as IconKey, color: '#06b6d4', name: 'Shield',            count: shopPurchases.shield,    desc: 'Activates next run' },
    { key: 'magnet'     as const, icon: 'Magnet' as IconKey, color: '#f97316', name: 'Magnet',            count: shopPurchases.magnet,    desc: 'Activates next run' },
    { key: 'multiplier' as const, icon: 'Star'   as IconKey, color: '#f59e0b', name: 'x2 Multiplier',    count: shopPurchases.multiplier,desc: 'Activates next run' },
  ];

  return (
    <Section
      icon="Bag" iconColor="#a855f7" title="Boost Inventory"
      badge={<span>{totalItems} owned</span>}
    >
      {totalItems === 0 ? (
        <div className="inventory-empty">
          <Icon name="Cart" size={28} color="#334155" />
          <p>No boosts owned yet. Visit the Power-Up Shop above!</p>
        </div>
      ) : (
        <div className="inventory-grid">
          {items.map(item => (
            <div
              key={item.key}
              className={`inv-item${item.count === 0 ? ' inv-item-empty' : ''}`}
            >
              <div className="inv-icon" style={{ background: `${item.color}18`, borderColor: `${item.color}40` }}>
                <Icon name={item.icon} size={24} color={item.count > 0 ? item.color : '#334155'} />
                <span className="inv-count" style={{ color: item.count > 0 ? item.color : '#475569' }}>
                  x{item.count}
                </span>
              </div>
              <span className="inv-name">{item.name}</span>
              <span className="inv-desc">{item.desc}</span>
              {item.count > 0 && item.key !== 'life' && (
                <button
                  className="inv-activate-btn"
                  style={{ borderColor: item.color, color: item.color }}
                  onClick={() => onActivate(item.key)}
                  type="button"
                >
                  Activate
                </button>
              )}
              {item.key === 'life' && item.count > 0 && (
                <span className="inv-life-note">Available on Game Over</span>
              )}
              {item.count === 0 && (
                <span className="inv-empty-label">None</span>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

// ─── FEATURE 5: Post-Game Summary ────────────────────────────────────────────
interface PostGameSummaryProps {
  finalScore: number;
  finalCoins: number;
  coinBalance: number;
  isNewRecord: boolean;
  missionsCompleted: Mission[];
  achievementsUnlocked: Achievement[];
  xpEarned: number;
  newLevel: number | null;
}

function PostGameSummary({
  finalScore, finalCoins, coinBalance, isNewRecord,
  missionsCompleted, achievementsUnlocked, xpEarned, newLevel,
}: PostGameSummaryProps) {
  const [open, setOpen] = useState(true);
  return (
    <div className="pgs-card">
      <button className="pgs-header" onClick={() => setOpen(o => !o)} type="button">
        <Icon name="Chart" size={16} color="#22d3ee" />
        <span>Run Summary</span>
        {isNewRecord && <span className="pgs-new-record">New Record!</span>}
        <span className="chevron" style={{ marginLeft: 'auto' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="pgs-body">
          {/* Core numbers */}
          <div className="pgs-numbers">
            <div className="pgs-num">
              <span className="pgs-num-val" style={{ color: '#22d3ee' }}>
                {finalScore.toLocaleString()}
              </span>
              <span className="pgs-num-lbl">Score (ranking only)</span>
            </div>
            <div className="pgs-num">
              <span className="pgs-num-val" style={{ color: '#f59e0b', display:'flex', alignItems:'center', gap:4 }}>
                <Icon name="Coin" size={18} color="#f59e0b" />{finalCoins}
              </span>
              <span className="pgs-num-lbl">Coins earned this run</span>
            </div>
            <div className="pgs-num">
              <span className="pgs-num-val" style={{ color: '#a855f7', display:'flex', alignItems:'center', gap:4 }}>
                <Icon name="Coin" size={18} color="#a855f7" />{coinBalance}
              </span>
              <span className="pgs-num-lbl">Total coin balance</span>
            </div>
            <div className="pgs-num">
              <span className="pgs-num-val" style={{ color: '#38bdf8' }}>
                +{xpEarned} XP
              </span>
              <span className="pgs-num-lbl">Experience earned</span>
            </div>
          </div>

          {newLevel !== null && (
            <div className="pgs-level-up">
              <Icon name="Star" size={18} color="#f59e0b" />
              <span>Level Up! You reached <strong>Level {newLevel}</strong> — {rankTitle(newLevel)}</span>
            </div>
          )}

          {/* Missions completed */}
          {missionsCompleted.length > 0 && (
            <div className="pgs-section">
              <span className="pgs-section-label">
                <Icon name="Task" size={13} color="#10b981" /> Missions Progressed
              </span>
              {missionsCompleted.map(m => (
                <div key={m.id} className="pgs-row">
                  <Icon name="Check" size={13} color="#10b981" />
                  <span>{m.title}</span>
                  {m.completed && !m.claimed && (
                    <span className="pgs-claim-hint">Claim reward above</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Achievements */}
          {achievementsUnlocked.length > 0 && (
            <div className="pgs-section">
              <span className="pgs-section-label">
                <Icon name="Medal" size={13} color="#f59e0b" /> Achievements Unlocked
              </span>
              {achievementsUnlocked.map(a => (
                <div key={a.id} className="pgs-row">
                  <Icon name={a.icon as IconKey} size={13} color={a.color} />
                  <span>{a.title}</span>
                </div>
              ))}
            </div>
          )}

          {/* Suggested next action */}
          <div className="pgs-suggestion">
            <Icon name="Info" size={13} color="#94a3b8" />
            <span>
              {finalScore < 100
                ? 'Tip: Collect combo boxes to multiply your score!'
                : finalScore < 500
                  ? 'Tip: Grab a Shield from the shop to survive longer.'
                  : 'Great run! Claim your daily reward to boost your coin balance.'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Game Over Overlay ───────────────────────────────────────────────────────
interface GameOverProps {
  finalScore: number; finalCoins: number; coinBalance: number;
  isNewRecord: boolean; timeUntilNextClaim: string; canClaimReward: boolean;
  claimLoading: boolean; claimMsg: string | null; claimOk: boolean;
  txLoading: boolean; txPhase: TxPhase; txMsg: string | null;
  wallet: WalletState; lives: number;
  postGame: Omit<PostGameSummaryProps, 'finalScore'|'finalCoins'|'coinBalance'|'isNewRecord'>;
  onRestart: () => void; onShare: () => void;
  onSaveOnChain: () => void; onConnectWallet: () => void;
  onClaimReward: () => void; onBuyLife: () => void;
}

function GameOverOverlay({
  finalScore, finalCoins, coinBalance, isNewRecord,
  timeUntilNextClaim, canClaimReward,
  claimLoading, claimMsg, claimOk,
  txLoading, txPhase, txMsg,
  wallet, lives,
  postGame,
  onRestart, onShare, onSaveOnChain, onConnectWallet, onClaimReward, onBuyLife,
}: GameOverProps) {
  const txStatusClass =
    txPhase === 'confirmed' ? 'tx-success' :
    txPhase === 'failed'    ? 'tx-error'   :
    (txPhase === 'awaiting-approval' || txPhase === 'submitted') ? 'tx-pending' : '';

  const canAffordLife = coinBalance >= EXTRA_LIFE_COST;

  return (
    <div className="overlay gameover-overlay">
      <div className="gameover-modal">
        {isNewRecord && (
          <div className="new-record-banner">
            <Icon name="Trophy" size={12} color="#020916" /> NEW RECORD
          </div>
        )}

        <div className="go-header">
          <h2 className="go-title">WIPEOUT!</h2>
          <p className="go-sub">Your run ended. Claim rewards or surf again.</p>
        </div>

        {/* Post-game summary — Feature 5 */}
        <PostGameSummary
          finalScore={finalScore}
          finalCoins={finalCoins}
          coinBalance={coinBalance}
          isNewRecord={isNewRecord}
          {...postGame}
        />

        {/* Extra Life */}
        <div className="go-card go-card-life">
          <div className="go-card-title">
            <Icon name="Heart" size={16} color="#f9a8d4" />
            <span>Extra Life</span>
            <span className="go-lives-tag">
              {lives > 0 ? `${lives} free` : 'None free'}
            </span>
          </div>
          <p className="go-card-desc">Continue your run from exactly where you crashed.</p>
          <div className="go-life-btns">
            {lives > 0 && (
              <button className="go-btn go-btn-free-life" onClick={onBuyLife} type="button">
                <Icon name="Heart" size={15} color="#020916" />
                Use Free Life ({lives} left)
              </button>
            )}
            <button
              className={`go-btn${canAffordLife ? ' go-btn-buy-life' : ' go-btn-disabled'}`}
              onClick={canAffordLife ? onBuyLife : undefined}
              disabled={!canAffordLife}
              type="button"
            >
              <Icon name="Coin" size={14} color={canAffordLife ? '#f9a8d4' : '#475569'} />
              Buy Life — {EXTRA_LIFE_COST} coins
              {!canAffordLife && (
                <span className="go-short"> (need {EXTRA_LIFE_COST - coinBalance} more)</span>
              )}
            </button>
          </div>
        </div>

        {/* Daily Reward */}
        <div className="go-card go-card-reward">
          <div className="go-card-title">
            <Icon name="Gift" size={16} color="#f59e0b" />
            <span>Daily Reward</span>
            <span className="go-timer-tag" style={{ color: canClaimReward ? '#10b981' : '#94a3b8' }}>
              {canClaimReward ? 'Ready!' : timeUntilNextClaim}
            </span>
          </div>
          <p className="go-card-desc">+{DAILY_REWARD_COINS} coins — claimable once every 24 hours</p>
          <button
            className={`go-btn${canClaimReward ? ' go-btn-primary' : ' go-btn-disabled'}`}
            onClick={onClaimReward}
            disabled={claimLoading || !canClaimReward}
            type="button"
          >
            {claimLoading
              ? <><span className="spinner" /> Claiming…</>
              : canClaimReward
                ? <><Icon name="Gift" size={14} color="#020916" /> Claim +{DAILY_REWARD_COINS} Coins</>
                : <>Next in {timeUntilNextClaim}</>}
          </button>
          {claimMsg && (
            <div className={`tx-status ${claimOk ? 'tx-success' : 'tx-error'}`}>{claimMsg}</div>
          )}
        </div>

        {/* Actions */}
        <div className="go-actions">
          <button className="go-btn go-btn-restart" onClick={onRestart} type="button">
            Surf Again
          </button>
          <button className="go-btn go-btn-share" onClick={onShare} type="button">
            Share Score
          </button>
        </div>

        {/* On-chain */}
        <div className="go-onchain">
          {REWARD_CONTRACT_DEPLOYED ? (
            wallet.signer ? (
              <button className="go-link-btn" onClick={onSaveOnChain} disabled={txLoading} type="button">
                {txLoading ? <span className="spinner" /> : <><Icon name="Chain" size={13} color="currentColor" /> Save Score On-Chain</>}
              </button>
            ) : (
              <button className="go-link-btn" onClick={onConnectWallet} type="button">
                Connect Wallet to Save Score
              </button>
            )
          ) : (
            <p className="go-onchain-note">On-chain saving requires a deployed contract.</p>
          )}
        </div>

        {REWARD_CONTRACT_DEPLOYED && txPhase !== 'idle' && txMsg && (
          <div className={`tx-status ${txStatusClass}`}>
            {(txPhase === 'awaiting-approval' || txPhase === 'submitted') && (
              <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} />
            )}
            {txMsg}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Leaderboard ─────────────────────────────────────────────────────────────
function Leaderboard({ entries, walletConnected }: { entries: LeaderboardEntry[]; walletConnected: boolean }) {
  const rankMeta = (i: number) => {
    if (i === 0) return { label: '1', cls: 'lb-gold'   };
    if (i === 1) return { label: '2', cls: 'lb-silver' };
    if (i === 2) return { label: '3', cls: 'lb-bronze' };
    return { label: String(i + 1), cls: 'lb-default' };
  };

  return (
    <Section
      icon="Trophy" iconColor="#22d3ee" title="Leaderboard"
      badge={<span>{entries.length} entries</span>}
    >
      {entries.length === 0 ? (
        <p className="lb-empty">Complete a run to appear here!</p>
      ) : (
        <div className="lb-list">
          {entries.map((e, i) => {
            const { label, cls } = rankMeta(i);
            return (
              <div key={`${e.date}-${i}`} className={`lb-row${i < 3 ? ` lb-row-top` : ''}`}>
                <div className={`lb-rank ${cls}`}>{label}</div>
                <div className="lb-info">
                  <span className="lb-name">{e.name}</span>
                  <span className="lb-date">{new Date(e.date).toLocaleDateString()}</span>
                </div>
                <div className="lb-right">
                  <span className="lb-score">{e.score.toLocaleString()} pts</span>
                  <span className="lb-coins">
                    <Icon name="Coin" size={11} color="#f59e0b" /> {e.coins}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="lb-note">
        <Icon name="Info" size={12} color="#94a3b8" />
        Score is for ranking only. Coins are spendable currency.
        {walletConnected && ' Wallet connected.'}
      </div>
    </Section>
  );
}

// ─── Rules Modal ──────────────────────────────────────────────────────────────
function RulesModal({ onClose }: { onClose: () => void }) {
  const powerups: { icon: IconKey; color: string; name: string; desc: string }[] = [
    { icon: 'Shield', color: '#06b6d4', name: 'Shield',      desc: 'Absorbs one collision' },
    { icon: 'Magnet', color: '#f97316', name: 'Magnet',      desc: 'Attracts coins for 6s' },
    { icon: 'Bolt',   color: '#10b981', name: 'Speed Boost', desc: '1.6x speed for 5s'    },
    { icon: 'Flame',  color: '#ec4899', name: 'Combo Up',    desc: '+1 score multiplier'   },
    { icon: 'Skull',  color: '#ef4444', name: 'Coin Cut',    desc: 'Lose 20 coins — avoid!'},
    { icon: 'Snow',   color: '#60a5fa', name: 'Freeze',      desc: 'Stops movement 1.2s'   },
    { icon: 'Swirl',  color: '#0d9488', name: 'Slow Wave',   desc: 'Half speed for 4s'     },
    { icon: 'Coin',   color: '#f59e0b', name: 'Coin Box',    desc: 'Coins × current combo' },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="rules-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-left">
            <span className="modal-header-icon"><Icon name="Wave" size={22} color="#22d3ee" /></span>
            <div>
              <h2>How to Play</h2>
              <p>Surf Rush — Web3 Edition</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} type="button">X</button>
        </div>
        <div className="modal-content">
          <div className="modal-section">
            <div className="modal-section-title">Controls</div>
            <div className="modal-controls-grid">
              <span className="ctrl-key">Left / A</span><span>Move left</span>
              <span className="ctrl-key">Right / D</span><span>Move right</span>
              <span className="ctrl-key">Space / P</span><span>Pause</span>
              <span className="ctrl-key">Swipe</span><span>Left / right on mobile</span>
            </div>
          </div>
          <div className="modal-section">
            <div className="modal-section-title">Power-Ups</div>
            <div className="modal-powerup-grid">
              {powerups.map(p => (
                <div className="modal-powerup-item" key={p.name}>
                  <Icon name={p.icon} size={20} color={p.color} />
                  <div>
                    <span className="pu-name">{p.name}</span>
                    <span className="pu-desc">{p.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="modal-section">
            <div className="modal-section-title">Score vs Coins</div>
            <div className="svc-grid">
              <div className="svc-block svc-score">
                <span className="svc-title">Score Points</span>
                <ul>
                  <li>Earned by surviving and collecting</li>
                  <li>Used for leaderboard ranking only</li>
                  <li>Cannot be spent</li>
                </ul>
              </div>
              <div className="svc-block svc-coins">
                <span className="svc-title">Coins</span>
                <ul>
                  <li>Collected from coin boxes</li>
                  <li>Spent in the Power-Up Shop</li>
                  <li>Earned from Daily Rewards and Missions</li>
                </ul>
              </div>
            </div>
          </div>
          <div className="modal-section">
            <div className="modal-section-title">Blockchain</div>
            <div className="modal-items">
              <div className="modal-item"><Icon name="Chain" size={14} color="#a855f7" /><span>Connect MetaMask to save scores on-chain</span></div>
              <div className="modal-item"><Icon name="Gift"  size={14} color="#f59e0b" /><span>Daily Reward works without a wallet</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Start Screen ─────────────────────────────────────────────────────────────
function StartScreen({ onStart, profile, streak }: { onStart: () => void; profile: PlayerProfile; streak: StreakData }) {
  return (
    <div className="overlay start-overlay">
      <div className="start-content">
        <div className="start-logo">
          <div className="start-waves"><Icon name="Wave" size={28} color="#22d3ee" /><Icon name="Wave" size={28} color="#22d3ee" /><Icon name="Wave" size={28} color="#22d3ee" /></div>
          <h1 className="start-title">SURF RUSH</h1>
          <div className="start-badge"><Icon name="Chain" size={11} color="#22d3ee" /> Web3 Edition</div>
        </div>

        {streak.currentStreak > 0 && (
          <div className="start-streak">
            <Icon name="Fire" size={14} color="#f97316" />
            <span>{streak.currentStreak}-day streak!</span>
          </div>
        )}

        {profile.totalGames > 0 && (
          <div className="start-stats-row">
            <div className="start-stat">
              <span className="ss-val">{profile.highScore.toLocaleString()}</span>
              <span className="ss-lbl">Best</span>
            </div>
            <div className="start-stat">
              <span className="ss-val">{profile.totalGames}</span>
              <span className="ss-lbl">Runs</span>
            </div>
            <div className="start-stat">
              <span className="ss-val">{profile.coinBalance}</span>
              <span className="ss-lbl">Coins</span>
            </div>
            <div className="start-stat">
              <span className="ss-val">Lv.{profile.level}</span>
              <span className="ss-lbl">{rankTitle(profile.level)}</span>
            </div>
          </div>
        )}

        <p className="start-desc">Ride the waves. Dodge obstacles. Earn on-chain.</p>

        <div className="feature-chips">
          <span className="chip"><Icon name="Surf" size={13} color="#22d3ee" /> Surf</span>
          <span className="chip"><Icon name="Shield" size={13} color="#06b6d4" /> Power-ups</span>
          <span className="chip"><Icon name="Chain" size={13} color="#a855f7" /> On-chain</span>
          <span className="chip"><Icon name="Gift" size={13} color="#f59e0b" /> Daily Rewards</span>
        </div>

        <button className="play-btn" onClick={onStart} type="button">
          START SURFING
        </button>

        <div className="start-instructions">
          <span className="inst-item"><kbd>Left / Right</kbd> Switch lane</span>
          <span className="inst-item"><kbd>Space</kbd> Pause</span>
          <span className="inst-item">Swipe on mobile</span>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const canvasRef   = useRef<HTMLCanvasElement | null>(null);
  const gameAreaRef = useRef<HTMLDivElement | null>(null);
  const engineRef   = useRef<GameEngine | null>(null);
  const nameRef     = useRef('Surfer');
  const runNumRef   = useRef(0);
  const walletRef   = useRef<WalletState>({ address: null, provider: null, signer: null, chainId: null, networkName: null });

  const [screen, setScreen]         = useState<Screen>('start');
  const [gameState, setGameState]   = useState<GameState | null>(null);
  const [finalScore, setFinalScore] = useState(0);
  const [finalCoins, setFinalCoins] = useState(0);
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [lives, setLives]           = useState(0);

  const [wallet, setWalletState]    = useState<WalletState>({ address: null, provider: null, signer: null, chainId: null, networkName: null });
  const [walletErr, setWalletErr]   = useState<string | null>(null);
  const [connectPhase, setConnectPhase] = useState<TxPhase>('idle');
  const [txPhase, setTxPhase]       = useState<TxPhase>('idle');
  const [txMsg, setTxMsg]           = useState<string | null>(null);
  const connectLoading = connectPhase === 'connecting-wallet' || connectPhase === 'awaiting-approval';
  const txLoading      = txPhase === 'awaiting-approval'     || txPhase === 'submitted';
  const connInFlight   = useRef(false);
  const txInFlight     = useRef(false);
  const [copyFb, setCopyFb]         = useState(false);

  const setWallet = useCallback((w: WalletState) => { walletRef.current = w; setWalletState(w); }, []);

  useEffect(() => subscribeToChainChanges((chainId, networkName) => {
    if (!walletRef.current.address) return;
    setWallet({ ...walletRef.current, chainId, networkName });
  }), [setWallet]);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [scoreAnim, setScoreAnim]   = useState(false);
  const [comboAnim, setComboAnim]   = useState(false);
  const prevCombo = useRef(1);
  const prevScore = useRef(0);
  const [showRules, setShowRules]   = useState(false);

  const [lastClaim, setLastClaim]   = useState<number | null>(null);
  const [claimTimer, setClaimTimer] = useState('Ready now!');
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimMsg, setClaimMsg]     = useState<string | null>(null);
  const [claimOk, setClaimOk]       = useState(false);
  const claimInFlight               = useRef(false);

  const [profile, setProfile]         = useState<PlayerProfile>(getProfile);
  const [achievements, setAchievements] = useState(() => getAchievements());
  const [missions, setMissions]       = useState<Mission[]>(getMissions);
  const [streak, setStreak]           = useState<StreakData>(getStreak);
  const [shopPurchases, setShopPurchases] = useState<ShopPurchase>(getShopPurchases);
  const [toasts, setToasts]           = useState<{ id: number; msg: string; color: string; icon: IconKey }[]>([]);

  // Post-game summary data
  const [pgMissions, setPgMissions]       = useState<Mission[]>([]);
  const [pgAchievements, setPgAchievements] = useState<Achievement[]>([]);
  const [pgXp, setPgXp]                   = useState(0);
  const [pgNewLevel, setPgNewLevel]       = useState<number | null>(null);

  const coinBalance = profile.coinBalance;
  const canClaim    = !lastClaim || Date.now() - lastClaim >= 24 * 3600 * 1000;
  const canClaimRef = useRef(canClaim);
  useEffect(() => { canClaimRef.current = canClaim; }, [canClaim]);

  const addToast = useCallback((msg: string, icon: IconKey, color: string) => {
    const id = ++_toastId;
    setToasts(p => [...p, { id, msg, icon, color }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('surfRushLastClaim');
    if (saved) setLastClaim(Number(saved));
  }, []);

  useEffect(() => {
    const tick = () => {
      if (!lastClaim) { setClaimTimer('Ready now!'); return; }
      const rem = lastClaim + 24 * 3600 * 1000 - Date.now();
      if (rem <= 0) { setClaimTimer('Ready now!'); return; }
      setClaimTimer(`${Math.floor(rem / 3600000)}h ${Math.floor((rem % 3600000) / 60000)}m`);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [lastClaim]);

  useEffect(() => {
    initTelegram();
    const tg = getTelegramUser();
    const name = tg ? (tg.username ? `@${tg.username}` : tg.first_name) : 'Surfer';
    nameRef.current = name;
    setLeaderboard(getLeaderboard());
  }, []);

  useEffect(() => {
    if (!gameState) return;
    if (gameState.score !== prevScore.current) {
      prevScore.current = gameState.score;
      setScoreAnim(true);
      setTimeout(() => setScoreAnim(false), 300);
    }
    if (gameState.combo !== prevCombo.current) {
      prevCombo.current = gameState.combo;
      setComboAnim(true);
      setTimeout(() => setComboAnim(false), 400);
    }
  }, [gameState]);

  // Unlock achievement helper
  const tryUnlock = useCallback((id: AchievementId): Achievement | null => {
    const wasNew = unlockAchievement(id);
    if (!wasNew) return null;
    const updated = getAchievements();
    setAchievements(updated);
    const a = updated.find(x => x.id === id);
    if (a) addToast(`Achievement: ${a.title}`, a.icon as IconKey, a.color);
    return a ?? null;
  }, [addToast]);

  // Update mission progress helper
  const advanceMissions = useCallback((type: 'coins' | 'games' | 'score' | 'life', value: number) => {
    const cur = getMissions();
    let changed = false;
    const updated = cur.map(m => {
      if (m.claimed) return m;
      let np = m.progress;
      if (type === 'coins'  && m.id === 'collect_coins')  np = Math.min(m.target, m.progress + value);
      if (type === 'games'  && m.id === 'play_games')     np = Math.min(m.target, m.progress + value);
      if (type === 'score'  && m.id === 'reach_score')    np = Math.max(m.progress, value);
      if (type === 'life'   && m.id === 'use_extra_life') np = Math.min(m.target, m.progress + value);
      const completed = np >= m.target;
      if (np !== m.progress || completed !== m.completed) changed = true;
      return { ...m, progress: np, completed };
    });
    if (changed) { saveMissions(updated); setMissions(updated); }
    return updated;
  }, []);

  // Engine init
  const initEngine = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) { engineRef.current?.stop(); engineRef.current = null; canvasRef.current = null; return; }
    if (canvas === canvasRef.current && engineRef.current) return;
    canvasRef.current = canvas;
    engineRef.current?.stop();

    const engine = new GameEngine(canvas, {
      onStateChange: s => setGameState(s),
      onGameOver: (score, coins, avoided) => {
        setFinalScore(score);
        setFinalCoins(coins);

        const lb = getLeaderboard();
        setIsNewRecord(score > (lb[0]?.score ?? 0));

        runNumRef.current++;
        const name = nameRef.current !== 'Surfer' ? nameRef.current : `Surfer #${runNumRef.current}`;
        setLeaderboard(saveToLeaderboard({ name, score, coins, date: new Date().toISOString() }));

        // XP
        const earnedXp  = xpForRun(score);
        const newlyUnlocked: Achievement[] = [];

        // Update profile
        setProfile(prev => {
          const newXp    = prev.xp + earnedXp;
          const newLevel = levelFromXp(newXp);
          const leveledUp = newLevel > prev.level;

          const np: PlayerProfile = {
            ...prev,
            totalGames:            prev.totalGames + 1,
            highScore:             Math.max(prev.highScore, score),
            totalCoinsEarned:      prev.totalCoinsEarned + coins,
            coinBalance:           prev.coinBalance + coins,
            totalObstaclesAvoided: prev.totalObstaclesAvoided + avoided,
            totalScoreSum:         prev.totalScoreSum + score,
            xp:                    newXp,
            level:                 newLevel,
          };
          saveProfile(np);

          setPgXp(earnedXp);
          setPgNewLevel(leveledUp ? newLevel : null);

          // Check achievements
          const a1 = tryUnlock('first_run');        if (a1) newlyUnlocked.push(a1);
          if (score >= 100) { const a = tryUnlock('score_100'); if (a) newlyUnlocked.push(a); }
          if (score >= 500) { const a = tryUnlock('score_500'); if (a) newlyUnlocked.push(a); }
          if (coins >= 100) { const a = tryUnlock('coins_100'); if (a) newlyUnlocked.push(a); }

          return np;
        });

        // Update missions and capture for post-game summary
        const updatedMissions = advanceMissions('games', 1);
        advanceMissions('coins', coins);
        advanceMissions('score', score);
        const changed = updatedMissions.filter(m => m.progress > 0 && !m.claimed);
        setPgMissions(changed);
        setPgAchievements(newlyUnlocked);

        setScreen('gameover');
      },
    });
    engineRef.current = engine;
  }, [tryUnlock, advanceMissions]);

  // Keyboard
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === ' ') e.preventDefault();
      const eng = engineRef.current;
      if (!eng) return;
      if      (e.key === 'ArrowLeft'  || e.key.toLowerCase() === 'a') eng.moveLeft();
      else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') eng.moveRight();
      else if (e.key === ' '          || e.key.toLowerCase() === 'p') eng.togglePause();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Touch
  useEffect(() => {
    const area = gameAreaRef.current;
    if (!area) return;
    let sx = 0;
    const ts = (e: TouchEvent) => { sx = e.touches[0]?.clientX ?? 0; };
    const te = (e: TouchEvent) => {
      const d = (e.changedTouches[0]?.clientX ?? 0) - sx;
      if (Math.abs(d) < 30) return;
      d > 0 ? engineRef.current?.moveRight() : engineRef.current?.moveLeft();
    };
    area.addEventListener('touchstart', ts, { passive: true });
    area.addEventListener('touchend',   te, { passive: true });
    return () => { area.removeEventListener('touchstart', ts); area.removeEventListener('touchend', te); };
  }, []);

  const startGame = useCallback(() => {
    setScreen('playing');
    setTxPhase('idle'); setConnectPhase('idle'); setTxMsg(null);
    setClaimMsg(null); setClaimOk(false);
    txInFlight.current = false;
    setLives(0);

    const { streak: newStreak, bonusCoins, isNewDay } = updateStreak();
    if (isNewDay) {
      setStreak(newStreak);
      if (bonusCoins > 0) {
        setProfile(prev => { const u = { ...prev, coinBalance: prev.coinBalance + bonusCoins }; saveProfile(u); return u; });
        addToast(`Day ${newStreak.currentStreak} streak! +${bonusCoins} coins`, 'Fire', '#f97316');
      }
    }
    setMissions(getMissions());
    requestAnimationFrame(() => engineRef.current?.start());
  }, [addToast]);

  const restartGame = useCallback(() => {
    setScreen('playing');
    setTxPhase('idle'); setConnectPhase('idle'); setTxMsg(null);
    setClaimMsg(null); setClaimOk(false);
    txInFlight.current = false;
    setLives(0);
    setMissions(getMissions());
    requestAnimationFrame(() => engineRef.current?.restart());
  }, []);

  const handleBuyLife = useCallback(() => {
    if (lives > 0) {
      setLives(l => l - 1);
      setScreen('playing');
      advanceMissions('life', 1);
      tryUnlock('buy_extra_life');
      requestAnimationFrame(() => engineRef.current?.addLife(0));
    } else if (coinBalance >= EXTRA_LIFE_COST) {
      setProfile(prev => { const u = { ...prev, coinBalance: prev.coinBalance - EXTRA_LIFE_COST }; saveProfile(u); return u; });
      setScreen('playing');
      advanceMissions('life', 1);
      tryUnlock('buy_extra_life');
      requestAnimationFrame(() => engineRef.current?.addLife(0));
    }
  }, [lives, coinBalance, advanceMissions, tryUnlock]);

  const handleBuyShopItem = useCallback((key: 'shield' | 'magnet' | 'multiplier') => {
    const costs: Record<string, number> = { shield: SHIELD_COST, magnet: MAGNET_COST, multiplier: MULTIPLIER_COST };
    const cost = costs[key];
    if (coinBalance < cost) return;
    setProfile(prev => { const u = { ...prev, coinBalance: prev.coinBalance - cost }; saveProfile(u); return u; });
    setShopPurchases(prev => { const u = { ...prev, [key]: prev[key] + 1 }; saveShopPurchases(u); return u; });
    const names: Record<string, string> = { shield: 'Shield', magnet: 'Magnet Boost', multiplier: 'Score Multiplier' };
    addToast(`${names[key]} purchased! Ready for next run.`, 'Cart', '#22d3ee');
  }, [coinBalance, addToast]);

  const handleActivateInventory = useCallback((key: 'shield' | 'magnet' | 'multiplier' | 'life') => {
    if (key === 'life') return; // handled on game over screen
    if (shopPurchases[key] <= 0) return;
    addToast(`${key} boost will activate at the start of your next run.`, 'Bolt', '#10b981');
  }, [shopPurchases, addToast]);

  const handleClaimReward = useCallback(() => {
    if (claimInFlight.current) return;
    claimInFlight.current = true;
    setClaimLoading(true);
    try {
      if (!canClaimRef.current) {
        setClaimOk(false);
        setClaimMsg('Already claimed. Check back in 24 hours.');
        return;
      }
      setProfile(prev => {
        const u = { ...prev, coinBalance: prev.coinBalance + DAILY_REWARD_COINS, dailyRewardsClaimed: prev.dailyRewardsClaimed + 1 };
        saveProfile(u);
        return u;
      });
      const now = Date.now();
      localStorage.setItem('surfRushLastClaim', String(now));
      setLastClaim(now);
      setClaimOk(true);
      setClaimMsg(`+${DAILY_REWARD_COINS} coins added to your balance!`);
      tryUnlock('daily_claim');
    } finally {
      setClaimLoading(false);
      claimInFlight.current = false;
    }
  }, [tryUnlock]);

  const handleClaimMission = useCallback((id: string) => {
    const cur = getMissions();
    const m   = cur.find(x => x.id === id);
    if (!m || !m.completed || m.claimed) return;
    const updated = cur.map(x => x.id === id ? { ...x, claimed: true } : x);
    saveMissions(updated);
    setMissions(updated);
    setProfile(prev => { const u = { ...prev, coinBalance: prev.coinBalance + m.reward }; saveProfile(u); return u; });
    addToast(`Mission claimed: +${m.reward} coins!`, 'Task', '#10b981');
  }, [addToast]);

  const handleConnectWallet = useCallback(async () => {
    if (connInFlight.current) return;
    connInFlight.current = true;
    setWalletErr(null); setTxMsg(null);
    try {
      setConnectPhase('connecting-wallet');
      if (!isInjectedWalletAvailable() && isMobileDevice()) {
        setTxMsg('Opening MetaMask Mobile…');
      } else {
        setTxMsg('Requesting wallet access…');
        setConnectPhase('awaiting-approval');
      }
      const connected = await connectWallet();
      if (connected) { setWallet(connected); setConnectPhase('idle'); setTxMsg(null); }
    } catch (err: any) {
      setConnectPhase('idle');
      const msg = err.message ?? 'Wallet connection failed';
      setWalletErr(msg.length > 80 ? msg.slice(0, 80) + '…' : msg);
      setTxMsg(null);
    } finally { connInFlight.current = false; }
  }, [setWallet]);

  const handleDisconnectWallet = useCallback(() => {
    disconnectWallet();
    setWallet({ address: null, provider: null, signer: null, chainId: null, networkName: null });
    setWalletErr(null); setConnectPhase('idle');
  }, [setWallet]);

  const handleSaveOnChain = useCallback(async () => {
    if (txInFlight.current) return;
    txInFlight.current = true;
    setTxPhase('awaiting-approval');
    setTxMsg('Waiting for wallet approval…');
    try {
      const sig = walletRef.current.signer;
      if (!sig) throw new Error('No signer. Connect your wallet first.');
      const hash = await saveScoreOnChain(sig, finalScore);
      setTxPhase('confirmed');
      setTxMsg(`Saved! Tx: ${shorten(hash)}`);
    } catch (err: any) {
      setTxPhase('failed');
      const msg: string = err.message ?? 'Transaction failed';
      setTxMsg(msg.includes('rejected') || msg.includes('denied') ? 'Transaction cancelled.' : msg);
    } finally { txInFlight.current = false; }
  }, [finalScore]);

  // Active effects during gameplay
  const activeEffects = gameState ? ([
    gameState.hasShield                    && { icon: 'Shield' as IconKey, label: 'Shield', color: '#06b6d4' },
    Date.now() < gameState.magnetUntil     && { icon: 'Magnet' as IconKey, label: 'Magnet', color: '#f97316' },
    Date.now() < gameState.speedBoostUntil && { icon: 'Bolt'   as IconKey, label: 'Boost',  color: '#10b981' },
    Date.now() < gameState.freezeUntil     && { icon: 'Snow'   as IconKey, label: 'Frozen', color: '#60a5fa' },
    Date.now() < gameState.slowUntil       && { icon: 'Swirl'  as IconKey, label: 'Slow',   color: '#0d9488' },
  ] as (false | { icon: IconKey; label: string; color: string })[]).filter(Boolean) : [];

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="app">
      <ToastStack items={toasts} dismiss={id => setToasts(p => p.filter(t => t.id !== id))} />

      {/* Top bar */}
      <div className="topbar">
        <div className="brand">
          <span className="brand-icon"><Icon name="Wave" size={22} color="#22d3ee" /></span>
          <div className="brand-text">
            <span className="brand-title">SURF RUSH</span>
            <span className="brand-sub">Web3</span>
          </div>
        </div>
        <div className="topbar-right">
          {/* Coin balance — always visible */}
          <div className="topbar-stat">
            <Icon name="Coin" size={15} color="#f59e0b" />
            <span>{coinBalance}</span>
          </div>
          {/* Level chip */}
          <div className="topbar-stat topbar-level">
            <Icon name="Star" size={14} color="#a855f7" />
            <span>Lv.{profile.level}</span>
          </div>
          {/* Streak */}
          {streak.currentStreak > 0 && (
            <div className="topbar-stat topbar-streak">
              <Icon name="Fire" size={13} color="#f97316" />
              <span>{streak.currentStreak}</span>
            </div>
          )}
          <button className="rules-btn" onClick={() => setShowRules(true)} type="button">How to Play</button>
          {walletErr && <span className="wallet-err">{walletErr}</span>}
          {wallet.address ? (
            <button className="wallet-btn wallet-btn-connected" onClick={handleDisconnectWallet} type="button">
              <span className="wallet-dot" /> {shorten(wallet.address)}
            </button>
          ) : (
            <button className="wallet-btn" onClick={handleConnectWallet} disabled={connectLoading} type="button">
              {connectLoading ? <><span className="spinner" style={{ width:12,height:12,borderWidth:2 }} /> Connecting</> : 'Connect Wallet'}
            </button>
          )}
        </div>
      </div>

      {/* Wallet panel */}
      {wallet.address && (
        <div className="wallet-panel">
          <div className="wp-dot-col"><span className="wallet-dot" /></div>
          <div className="wp-info">
            <span className="wp-label">Connected Wallet</span>
            <span className="wp-address">{wallet.address}</span>
            <span className="wp-network">{wallet.networkName ?? 'Detecting network…'}</span>
          </div>
          <div className="wp-actions">
            <button className="wp-btn" onClick={() => {
              navigator.clipboard.writeText(wallet.address!).then(() => { setCopyFb(true); setTimeout(() => setCopyFb(false), 2000); }).catch(() => {});
            }} type="button">{copyFb ? 'Copied!' : 'Copy'}</button>
            <button className="wp-btn wp-btn-danger" onClick={handleDisconnectWallet} type="button">Disconnect</button>
          </div>
        </div>
      )}

      {/* HUD */}
      {screen === 'playing' && gameState && (
        <Hud gs={gameState} sa={scoreAnim} ca={comboAnim} bal={coinBalance} />
      )}

      {/* Active power-up bar */}
      {screen === 'playing' && activeEffects.length > 0 && (
        <div className="powerup-bar">
          {(activeEffects as { icon: IconKey; label: string; color: string }[]).map(fx => (
            <div key={fx.label} className="powerup-badge" style={{ borderColor: fx.color, color: fx.color }}>
              <Icon name={fx.icon} size={13} color={fx.color} />
              <span>{fx.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Game canvas area */}
      <div
        className={`game-area${screen === 'gameover' ? ' game-area--gameover' : ''}`}
        ref={gameAreaRef}
        style={{ minHeight: '500px' }}
      >
        <canvas ref={initEngine} style={{ display: 'block', width: '100%', height: '100%' }} />

        {screen === 'start' && (
          <StartScreen onStart={startGame} profile={profile} streak={streak} />
        )}

        {screen === 'gameover' && (
          <GameOverOverlay
            finalScore={finalScore}
            finalCoins={finalCoins}
            coinBalance={coinBalance}
            isNewRecord={isNewRecord}
            timeUntilNextClaim={claimTimer}
            canClaimReward={canClaim}
            claimLoading={claimLoading}
            claimMsg={claimMsg}
            claimOk={claimOk}
            txLoading={connectLoading || txLoading}
            txPhase={txPhase !== 'idle' ? txPhase : connectPhase}
            txMsg={txMsg}
            wallet={wallet}
            lives={lives}
            postGame={{ missionsCompleted: pgMissions, achievementsUnlocked: pgAchievements, xpEarned: pgXp, newLevel: pgNewLevel }}
            onRestart={restartGame}
            onShare={() => shareScore(finalScore, TELEGRAM_BOT_USERNAME)}
            onSaveOnChain={handleSaveOnChain}
            onConnectWallet={handleConnectWallet}
            onClaimReward={handleClaimReward}
            onBuyLife={handleBuyLife}
          />
        )}
      </div>

      {/* Mobile controls */}
      {screen === 'playing' && (
        <div className="controls">
          <button className="ctrl-btn" onPointerDown={() => engineRef.current?.moveLeft()} type="button">L</button>
          <button className="ctrl-btn pause-btn" onPointerDown={() => engineRef.current?.togglePause()} type="button">
            {gameState?.isPaused ? 'Go' : 'II'}
          </button>
          <button className="ctrl-btn" onPointerDown={() => engineRef.current?.moveRight()} type="button">R</button>
        </div>
      )}

      {/* Feature 1: Dashboard */}
      <PlayerDashboard profile={profile} streak={streak} />

      {/* Feature 2: Missions */}
      <DailyMissions missions={missions} onClaim={handleClaimMission} />

      {/* Feature 3: Shop */}
      <PowerUpShop coinBalance={coinBalance} shopPurchases={shopPurchases} onBuy={handleBuyShopItem} />

      {/* Feature 4: Inventory */}
      <BoostInventory shopPurchases={shopPurchases} profile={profile} onActivate={handleActivateInventory} />

      {/* Leaderboard */}
      <Leaderboard entries={leaderboard} walletConnected={!!wallet.address} />

      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}