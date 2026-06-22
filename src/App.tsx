import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GameEngine,
  GameState,
  LeaderboardEntry,
  getLeaderboard,
  saveToLeaderboard,
  getProfile,
  saveProfile,
  PlayerProfile,
  getAchievements,
  unlockAchievement,
  Achievement,
  AchievementId,
  getMissions,
  saveMissions,
  Mission,
  getStreak,
  updateStreak,
  StreakData,
  getShopPurchases,
  saveShopPurchases,
  ShopPurchase,
} from './game';
import {
  connectWallet,
  disconnectWallet,
  isInjectedWalletAvailable,
  isMobileDevice,
  getWalletName,
  saveScoreOnChain,
  subscribeToChainChanges,
  WalletState,
  TxPhase,
  TX_PHASE_LABEL,
  REWARD_CONTRACT_DEPLOYED
} from './wallet';
import { initTelegram, getTelegramUser, shareScore } from './telegram';

type Screen = 'start' | 'playing' | 'gameover';

const TELEGRAM_BOT_USERNAME = 'your_bot_username';

const EXTRA_LIFE_COST   = 100;
const SHIELD_COST       = 200;
const MAGNET_COST       = 150;
const MULTIPLIER_COST   = 250;

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ─── SVG Icon components ──────────────────────────────────────────────────────
interface IconProps {
  size?: number;
  color?: string;
  className?: string;
}

function CoinIcon({ size = 18, color = 'currentColor', className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2" fill="none"/>
      <circle cx="12" cy="12" r="6" fill={color} opacity="0.18"/>
      <text x="12" y="16" textAnchor="middle" fontSize="9" fontWeight="bold" fill={color} fontFamily="Arial,sans-serif">$</text>
    </svg>
  );
}

function HeartIcon({ size = 18, color = 'currentColor', className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg" className={className} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
    </svg>
  );
}

function ShieldIcon({ size = 18, color = 'currentColor', className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <path d="M12 2L3 7v6c0 5.25 3.75 10.15 9 11.25C17.25 23.15 21 18.25 21 13V7L12 2z" stroke={color} strokeWidth="2" strokeLinejoin="round" fill={color} fillOpacity="0.15"/>
    </svg>
  );
}

function MagnetIcon({ size = 18, color = 'currentColor', className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <path d="M6 4v8a6 6 0 0 0 12 0V4" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M4 4h4M16 4h4" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

function BoltIcon({ size = 18, color = 'currentColor', className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg" className={className} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>
  );
}

function FlameIcon({ size = 18, color = 'currentColor', className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg" className={className} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <path d="M12 2c0 0-5 4-5 9a5 5 0 0 0 10 0c0-2-1-4-2-5 0 2-1 3-3 3-1 0-2-1-2-2 0-2 2-5 2-5z"/>
    </svg>
  );
}

function SkullIcon({ size = 18, color = 'currentColor', className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <circle cx="12" cy="10" r="7" stroke={color} strokeWidth="2" fill={color} fillOpacity="0.15"/>
      <path d="M9 17v3M15 17v3M9 20h6" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="9.5" cy="10" r="1.5" fill={color}/>
      <circle cx="14.5" cy="10" r="1.5" fill={color}/>
    </svg>
  );
}

function SnowflakeIcon({ size = 18, color = 'currentColor', className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <path d="M12 2v20M2 12h20M4.93 4.93l14.14 14.14M19.07 4.93L4.93 19.07" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="12" cy="12" r="2" fill={color}/>
    </svg>
  );
}

function SwirlIcon({ size = 18, color = 'currentColor', className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <path d="M20 12a8 8 0 1 1-8-8" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M12 4l3-3M12 4l-3-3" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function TrophyIcon({ size = 18, color = 'currentColor', className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <path d="M8 21h8M12 21v-4" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <path d="M7 3H4v4a3 3 0 0 0 3 3M17 3h3v4a3 3 0 0 1-3 3" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M7 3h10v6a5 5 0 0 1-10 0V3z" stroke={color} strokeWidth="2" strokeLinejoin="round" fill={color} fillOpacity="0.15"/>
      <path d="M5 17h14" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function GiftIcon({ size = 18, color = 'currentColor', className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <rect x="2" y="9" width="20" height="13" rx="2" stroke={color} strokeWidth="2" fill={color} fillOpacity="0.1"/>
      <path d="M12 9v13M2 14h20" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <path d="M12 9a3 3 0 0 0-3-3c-1.5 0-2 1-2 2s.5 2 2 2h3M12 9a3 3 0 0 1 3-3c1.5 0 2 1 2 2s-.5 2-2 2h-3" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function WaveIcon({ size = 18, color = 'currentColor', className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <path d="M2 12c1.5-2 3-3 5-3s3.5 2 5 2 3.5-2 5-2 3.5 1 5 3" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
      <path d="M2 17c1.5-2 3-3 5-3s3.5 2 5 2 3.5-2 5-2 3.5 1 5 3" stroke={color} strokeWidth="2" strokeLinecap="round" opacity="0.5"/>
    </svg>
  );
}

function ChainIcon({ size = 18, color = 'currentColor', className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function CartIcon({ size = 18, color = 'currentColor', className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" stroke={color} strokeWidth="2" strokeLinejoin="round" fill={color} fillOpacity="0.1"/>
      <path d="M3 6h18" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <path d="M16 10a4 4 0 0 1-8 0" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function SurferIcon({ size = 18, color = 'currentColor', className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <circle cx="12" cy="4" r="2" fill={color}/>
      <path d="M8 19l4-8 4 4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M4 17c2-1 4-1.5 8-1s6 1 8 0" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function StarIcon({ size = 18, color = 'currentColor', className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg" className={className} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  );
}

function InfoIcon({ size = 16, color = 'currentColor', className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10" stroke={color} strokeWidth="2"/>
      <path d="M12 8v1M12 11v5" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  );
}

function BarChartIcon({ size = 18, color = 'currentColor', className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <rect x="3"  y="12" width="4" height="9" rx="1" fill={color} fillOpacity="0.7"/>
      <rect x="10" y="7"  width="4" height="14" rx="1" fill={color}/>
      <rect x="17" y="4"  width="4" height="17" rx="1" fill={color} fillOpacity="0.5"/>
    </svg>
  );
}

function UserIcon({ size = 18, color = 'currentColor', className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <circle cx="12" cy="8" r="4" stroke={color} strokeWidth="2"/>
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function TaskIcon({ size = 18, color = 'currentColor', className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <rect x="3" y="3" width="18" height="18" rx="3" stroke={color} strokeWidth="2" fill={color} fillOpacity="0.07"/>
      <path d="M8 12l3 3 5-5" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function FireIcon({ size = 18, color = 'currentColor', className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} xmlns="http://www.w3.org/2000/svg" className={className} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <path d="M12 2c0 0-5 4-5 9a5 5 0 0 0 10 0c0-2-1-4-2-5 0 2-1 3-3 3-1 0-2-1-2-2 0-2 2-5 2-5z"/>
      <circle cx="12" cy="16" r="2" fill="rgba(255,255,255,0.4)"/>
    </svg>
  );
}

function MedalIcon({ size = 18, color = 'currentColor', className = '' }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0 }}>
      <circle cx="12" cy="14" r="6" stroke={color} strokeWidth="2" fill={color} fillOpacity="0.15"/>
      <path d="M8 6l-2-4h12l-2 4" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
      <path d="M9 6h6" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <path d="M12 11v3l2 1" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

const ICON_COMPONENTS = {
  coin:      CoinIcon,
  shield:    ShieldIcon,
  magnet:    MagnetIcon,
  speed:     BoltIcon,
  combo:     FlameIcon,
  coinCut:   SkullIcon,
  freeze:    SnowflakeIcon,
  slow:      SwirlIcon,
  trophy:    TrophyIcon,
  gift:      GiftIcon,
  surf:      SurferIcon,
  wave:      WaveIcon,
  chain:     ChainIcon,
  heart:     HeartIcon,
  shop:      CartIcon,
  star:      StarIcon,
  cart:      CartIcon,
  info:      InfoIcon,
  chart:     BarChartIcon,
  user:      UserIcon,
  task:      TaskIcon,
  fire:      FireIcon,
  medal:     MedalIcon,
} as const;

type IconName = keyof typeof ICON_COMPONENTS;

function Icon({ name, size = 18, color = 'currentColor', className = '' }: { name: IconName; size?: number; color?: string; className?: string }) {
  const Component = ICON_COMPONENTS[name];
  return <Component size={size} color={color} className={className} />;
}

// ─── Toast notification ───────────────────────────────────────────────────────
interface ToastData {
  id: number;
  message: string;
  type: 'achievement' | 'mission' | 'streak' | 'info';
  icon?: IconName;
  color?: string;
}

let toastIdCounter = 0;

function ToastStack({ toasts, onDismiss }: { toasts: ToastData[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toast-stack">
      {toasts.map(t => (
        <div key={t.id} className={`toast toast-${t.type}`} onClick={() => onDismiss(t.id)}>
          {t.icon && <Icon name={t.icon} size={16} color={t.color ?? 'currentColor'} />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Wallet Panel ─────────────────────────────────────────────────────────────
interface WalletPanelProps {
  address: string;
  networkName: string | null;
  onDisconnect: () => void;
  onCopy: () => void;
  copyFeedback: boolean;
}

function WalletPanel({ address, networkName, onDisconnect, onCopy, copyFeedback }: WalletPanelProps) {
  return (
    <div className="wallet-panel">
      <div className="wallet-panel-icon">◈</div>
      <div className="wallet-panel-info">
        <div className="wallet-panel-label">Connected Wallet</div>
        <div className="wallet-panel-address">{address}</div>
        <div className="wallet-panel-status">
          <span className="wallet-dot" />
          <span className="wallet-panel-net">{networkName ?? 'Detecting network…'}</span>
        </div>
      </div>
      <div className="wallet-panel-actions">
        <button className="copy-addr-btn" onClick={onCopy} type="button">
          {copyFeedback ? '✓ Copied' : 'Copy'}
        </button>
        <button className="disconnect-btn" onClick={onDisconnect} type="button">
          Disconnect
        </button>
      </div>
    </div>
  );
}

// ─── HUD ──────────────────────────────────────────────────────────────────────
interface HudProps {
  gameState: GameState;
  scoreAnim: boolean;
  comboAnim: boolean;
  coinBalance: number;
}

function Hud({ gameState, scoreAnim, comboAnim, coinBalance }: HudProps) {
  return (
    <div className="hud">
      <div className={`hud-card ${scoreAnim ? 'hud-pop' : ''}`}>
        <span className="hud-label">SCORE</span>
        <span className="hud-value score-val">{gameState.score.toLocaleString()}</span>
      </div>
      <div className="hud-card">
        <span className="hud-label">COINS</span>
        <span className="hud-value coin-val">
          <Icon name="coin" size={16} color="#f59e0b" /> {gameState.coins}
        </span>
      </div>
      <div className={`hud-card ${comboAnim ? 'hud-pop' : ''} ${gameState.combo > 3 ? 'hud-hot' : ''}`}>
        <span className="hud-label">COMBO</span>
        <span className="hud-value combo-val">x{gameState.combo}</span>
      </div>
      <div className="hud-card hud-balance">
        <span className="hud-label">BALANCE</span>
        <span className="hud-value coin-val">
          <Icon name="coin" size={14} color="#f59e0b" /> {coinBalance}
        </span>
      </div>
    </div>
  );
}

// ─── Start Overlay ────────────────────────────────────────────────────────────
interface StartOverlayProps {
  onStart: () => void;
  streak: StreakData;
  profile: PlayerProfile;
}

function StartOverlay({ onStart, streak, profile }: StartOverlayProps) {
  return (
    <div className="overlay start-overlay">
      <div className="start-content">
        <div className="start-logo">
          <div className="start-waves">
            <Icon name="wave" size={32} color="#22d3ee" />
            <Icon name="wave" size={32} color="#22d3ee" />
            <Icon name="wave" size={32} color="#22d3ee" />
          </div>
          <h1 className="start-title">SURF RUSH</h1>
          <div className="start-badge">
            <Icon name="chain" size={12} color="#22d3ee" /> WEB3 EDITION
          </div>
        </div>

        {streak.currentStreak > 0 && (
          <div className="start-streak-badge">
            <Icon name="fire" size={14} color="#f97316" />
            <span>{streak.currentStreak}-day streak!</span>
          </div>
        )}

        {profile.totalGames > 0 && (
          <div className="start-stats-row">
            <div className="start-stat">
              <span className="start-stat-val">{profile.highScore.toLocaleString()}</span>
              <span className="start-stat-label">Best</span>
            </div>
            <div className="start-stat">
              <span className="start-stat-val">{profile.totalGames}</span>
              <span className="start-stat-label">Runs</span>
            </div>
            <div className="start-stat">
              <span className="start-stat-val">{profile.coinBalance}</span>
              <span className="start-stat-label">Coins</span>
            </div>
          </div>
        )}

        <p className="start-desc">
          Ride the waves. Dodge obstacles.<br />
          Collect rewards. Earn on-chain.
        </p>

        <div className="feature-chips">
          <div className="chip"><Icon name="surf" size={14} color="currentColor" /> Surf</div>
          <div className="chip"><Icon name="shield" size={14} color="currentColor" /> Power-ups</div>
          <div className="chip"><Icon name="chain" size={14} color="currentColor" /> On-chain</div>
          <div className="chip"><Icon name="gift" size={14} color="currentColor" /> Daily Rewards</div>
        </div>

        <button className="play-btn" onClick={onStart} type="button">
          START SURFING
        </button>

        <div className="start-instructions">
          <div className="inst-item">
            <span className="inst-key">◀ ▶</span>
            <span>Switch lanes</span>
          </div>
          <div className="inst-item">
            <span className="inst-key">Space</span>
            <span>Pause</span>
          </div>
          <div className="inst-item">
            <span>Swipe on mobile</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Achievements Panel ───────────────────────────────────────────────────────
interface AchievementsPanelProps {
  achievements: Achievement[];
}

function AchievementsPanel({ achievements }: AchievementsPanelProps) {
  const [open, setOpen] = useState(false);
  const unlockedCount = achievements.filter(a => a.unlocked).length;

  return (
    <div className="section-card achievements-panel">
      <button
        className="section-header section-header-btn"
        onClick={() => setOpen(o => !o)}
        type="button"
        aria-expanded={open}
      >
        <div className="section-icon"><Icon name="medal" size={16} color="#f59e0b" /></div>
        <span className="section-title">Achievements</span>
        <span className="section-badge">
          <span className="achievement-count">{unlockedCount}/{achievements.length}</span>
        </span>
        <span className="collapse-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="achievements-body">
          <div className="achievements-grid">
            {achievements.map(a => (
              <div
                key={a.id}
                className={`achievement-badge ${a.unlocked ? 'achievement-unlocked' : 'achievement-locked'}`}
                style={a.unlocked ? { '--ach-color': a.color } as React.CSSProperties : undefined}
                title={a.desc}
              >
                <div className="ach-icon-wrap">
                  <Icon name={a.icon as IconName} size={20} color={a.unlocked ? a.color : 'rgba(255,255,255,0.15)'} />
                  {a.unlocked && <div className="ach-glow" style={{ background: a.color }} />}
                </div>
                <span className="ach-title">{a.title}</span>
                <span className="ach-desc">{a.desc}</span>
                {a.unlocked && a.unlockedAt && (
                  <span className="ach-date">{new Date(a.unlockedAt).toLocaleDateString()}</span>
                )}
                {!a.unlocked && <span className="ach-locked-label">Locked</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Player Profile Card ──────────────────────────────────────────────────────
interface ProfileCardProps {
  profile: PlayerProfile;
  streak: StreakData;
}

function ProfileCard({ profile, streak }: ProfileCardProps) {
  const [open, setOpen] = useState(false);
  const avgScore = profile.totalGames > 0 ? Math.round(profile.totalScoreSum / profile.totalGames) : 0;

  return (
    <div className="section-card profile-card">
      <button
        className="section-header section-header-btn"
        onClick={() => setOpen(o => !o)}
        type="button"
        aria-expanded={open}
      >
        <div className="section-icon"><Icon name="user" size={16} color="#22d3ee" /></div>
        <span className="section-title">Player Profile</span>
        <span className="section-badge">
          {streak.currentStreak > 0 && (
            <span className="streak-mini">
              <Icon name="fire" size={12} color="#f97316" /> {streak.currentStreak}d
            </span>
          )}
        </span>
        <span className="collapse-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="profile-body">
          {streak.currentStreak > 0 && (
            <div className="streak-banner">
              <Icon name="fire" size={18} color="#f97316" />
              <div className="streak-info">
                <span className="streak-num">{streak.currentStreak}-Day Streak</span>
                <span className="streak-sub">
                  {streak.currentStreak >= 7 ? '+250 bonus today' :
                   streak.currentStreak >= 3 ? '+100 bonus today' : '+50 bonus today'}
                </span>
              </div>
              <div className="streak-milestones">
                <span className={`streak-mile ${streak.currentStreak >= 1 ? 'reached' : ''}`}>D1</span>
                <span className={`streak-mile ${streak.currentStreak >= 3 ? 'reached' : ''}`}>D3</span>
                <span className={`streak-mile ${streak.currentStreak >= 7 ? 'reached' : ''}`}>D7</span>
              </div>
            </div>
          )}
          <div className="profile-stats-grid">
            <div className="profile-stat">
              <Icon name="surf" size={16} color="#22d3ee" />
              <span className="ps-val">{profile.totalGames}</span>
              <span className="ps-label">Games Played</span>
            </div>
            <div className="profile-stat">
              <Icon name="trophy" size={16} color="#f59e0b" />
              <span className="ps-val">{profile.highScore.toLocaleString()}</span>
              <span className="ps-label">High Score</span>
            </div>
            <div className="profile-stat">
              <Icon name="coin" size={16} color="#f59e0b" />
              <span className="ps-val">{profile.totalCoinsEarned.toLocaleString()}</span>
              <span className="ps-label">Total Coins</span>
            </div>
            <div className="profile-stat">
              <Icon name="gift" size={16} color="#10b981" />
              <span className="ps-val">{profile.dailyRewardsClaimed}</span>
              <span className="ps-label">Daily Claims</span>
            </div>
            <div className="profile-stat">
              <Icon name="coin" size={16} color="#a855f7" />
              <span className="ps-val">{profile.coinBalance}</span>
              <span className="ps-label">Balance</span>
            </div>
            <div className="profile-stat">
              <Icon name="chart" size={16} color="#38bdf8" />
              <span className="ps-val">{avgScore.toLocaleString()}</span>
              <span className="ps-label">Avg Score</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Daily Missions Panel ─────────────────────────────────────────────────────
interface MissionsPanelProps {
  missions: Mission[];
  onClaim: (missionId: string) => void;
}

function MissionsPanel({ missions, onClaim }: MissionsPanelProps) {
  const [open, setOpen] = useState(false);
  const completedCount = missions.filter(m => m.completed).length;
  const claimableCount = missions.filter(m => m.completed && !m.claimed).length;

  return (
    <div className={`section-card missions-panel ${claimableCount > 0 ? 'missions-has-claimable' : ''}`}>
      <button
        className="section-header section-header-btn"
        onClick={() => setOpen(o => !o)}
        type="button"
        aria-expanded={open}
      >
        <div className="section-icon"><Icon name="task" size={16} color="#10b981" /></div>
        <span className="section-title">Daily Missions</span>
        <span className="section-badge">
          {claimableCount > 0 && (
            <span className="mission-claimable-dot">{claimableCount} ready</span>
          )}
          {claimableCount === 0 && <span>{completedCount}/{missions.length}</span>}
        </span>
        <span className="collapse-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="missions-body">
          {missions.map(m => {
            const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
            return (
              <div key={m.id} className={`mission-row ${m.claimed ? 'mission-claimed' : m.completed ? 'mission-done' : ''}`}>
                <div className="mission-icon">
                  <Icon name={m.icon as IconName} size={18} color={m.completed ? '#10b981' : '#94a3b8'} />
                </div>
                <div className="mission-info">
                  <span className="mission-title">{m.title}</span>
                  <span className="mission-desc">{m.desc}</span>
                  <div className="mission-progress-wrap">
                    <div className="mission-progress-bar">
                      <div className="mission-progress-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="mission-progress-label">{m.progress}/{m.target}</span>
                  </div>
                </div>
                <div className="mission-reward">
                  {m.claimed ? (
                    <span className="mission-claimed-label">Claimed</span>
                  ) : m.completed ? (
                    <button className="mission-claim-btn" onClick={() => onClaim(m.id)} type="button">
                      +{m.reward} <Icon name="coin" size={11} color="#020916" />
                    </button>
                  ) : (
                    <span className="mission-reward-label">
                      <Icon name="coin" size={12} color="#f59e0b" /> {m.reward}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Stats Panel ──────────────────────────────────────────────────────────────
interface StatsPanelProps {
  profile: PlayerProfile;
}

function StatsPanel({ profile }: StatsPanelProps) {
  const [open, setOpen] = useState(false);
  const avg = profile.totalGames > 0 ? Math.round(profile.totalScoreSum / profile.totalGames) : 0;

  return (
    <div className="section-card stats-panel">
      <button
        className="section-header section-header-btn"
        onClick={() => setOpen(o => !o)}
        type="button"
        aria-expanded={open}
      >
        <div className="section-icon"><Icon name="chart" size={16} color="#38bdf8" /></div>
        <span className="section-title">Statistics</span>
        <span className="section-badge">{profile.totalGames} runs total</span>
        <span className="collapse-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="stats-body">
          <div className="stats-grid">
            <div className="stat-cell">
              <span className="stat-num" style={{ color: '#22d3ee' }}>{avg.toLocaleString()}</span>
              <span className="stat-lbl">Avg Score</span>
            </div>
            <div className="stat-cell">
              <span className="stat-num" style={{ color: '#f59e0b' }}>{profile.highScore.toLocaleString()}</span>
              <span className="stat-lbl">Best Score</span>
            </div>
            <div className="stat-cell">
              <span className="stat-num" style={{ color: '#f59e0b' }}>{profile.totalCoinsEarned.toLocaleString()}</span>
              <span className="stat-lbl">Total Coins</span>
            </div>
            <div className="stat-cell">
              <span className="stat-num" style={{ color: '#38bdf8' }}>{profile.totalGames}</span>
              <span className="stat-lbl">Runs</span>
            </div>
            <div className="stat-cell">
              <span className="stat-num" style={{ color: '#10b981' }}>{profile.totalObstaclesAvoided.toLocaleString()}</span>
              <span className="stat-lbl">Obstacles Avoided</span>
            </div>
            <div className="stat-cell">
              <span className="stat-num" style={{ color: '#a855f7' }}>{profile.coinBalance}</span>
              <span className="stat-lbl">Coin Balance</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Coin Shop Panel ──────────────────────────────────────────────────────────
interface CoinShopPanelProps {
  coinBalance: number;
  shopPurchases: ShopPurchase;
  onBuyShopItem: (item: 'shield' | 'magnet' | 'multiplier') => void;
}

function CoinShopPanel({ coinBalance, shopPurchases, onBuyShopItem }: CoinShopPanelProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="coin-shop-panel section-card">
      <button
        className="section-header section-header-btn"
        onClick={() => setOpen(o => !o)}
        type="button"
        aria-expanded={open}
      >
        <div className="section-icon"><Icon name="shop" size={16} color="#22d3ee" /></div>
        <span className="section-title">Power-Up Shop</span>
        <span className="section-badge">
          <Icon name="coin" size={13} color="#f59e0b" /> {coinBalance}
        </span>
        <span className="collapse-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="coin-shop-body">
          <div className="coin-explainer">
            <div className="coin-explainer-title">
              <Icon name="coin" size={15} color="#f59e0b" />
              How Coins Work
            </div>
            <p className="coin-explainer-desc">
              Coins are collected during your run. Spend them on power-ups below — they activate at the start of your next run. Your balance: <strong>{coinBalance} coins</strong>.
            </p>
          </div>

          <div className="coin-shop-items">
            {/* Extra Life — always available */}
            <div className="shop-item shop-item-life">
              <div className="shop-item-icon"><Icon name="heart" size={22} color="#f9a8d4" /></div>
              <div className="shop-item-info">
                <span className="shop-item-name">
                  Extra Life
                  <span className="shop-item-available-tag">Available on Game Over</span>
                </span>
                <span className="shop-item-desc">Continue your run after a wipeout.</span>
                <span className="shop-item-tooltip">
                  <Icon name="info" size={11} color="#94a3b8" />
                  Buy on the Game Over screen to resume where you crashed.
                </span>
              </div>
              <div className="shop-item-cost">
                <Icon name="coin" size={14} color="#f59e0b" /> {EXTRA_LIFE_COST}
              </div>
            </div>

            {/* Shield */}
            <div className={`shop-item shop-item-buyable ${coinBalance < SHIELD_COST ? 'shop-item-insufficient' : ''}`}>
              <div className="shop-item-icon"><Icon name="shield" size={22} color="#06b6d4" /></div>
              <div className="shop-item-info">
                <span className="shop-item-name">
                  Shield
                  {shopPurchases.shield > 0 && <span className="shop-item-owned-tag">×{shopPurchases.shield} owned</span>}
                </span>
                <span className="shop-item-desc">Start your next run with a shield active.</span>
              </div>
              <div className="shop-item-actions">
                <span className="shop-item-cost"><Icon name="coin" size={13} color="#f59e0b" /> {SHIELD_COST}</span>
                <button
                  className={`shop-buy-btn ${coinBalance >= SHIELD_COST ? 'shop-buy-enabled' : 'shop-buy-disabled'}`}
                  onClick={() => coinBalance >= SHIELD_COST && onBuyShopItem('shield')}
                  type="button"
                  disabled={coinBalance < SHIELD_COST}
                >
                  {coinBalance >= SHIELD_COST ? 'Buy' : `Need ${SHIELD_COST - coinBalance} more`}
                </button>
              </div>
            </div>

            {/* Magnet Boost */}
            <div className={`shop-item shop-item-buyable ${coinBalance < MAGNET_COST ? 'shop-item-insufficient' : ''}`}>
              <div className="shop-item-icon"><Icon name="magnet" size={22} color="#f97316" /></div>
              <div className="shop-item-info">
                <span className="shop-item-name">
                  Magnet Boost
                  {shopPurchases.magnet > 0 && <span className="shop-item-owned-tag">×{shopPurchases.magnet} owned</span>}
                </span>
                <span className="shop-item-desc">Start with 6s magnet effect active.</span>
              </div>
              <div className="shop-item-actions">
                <span className="shop-item-cost"><Icon name="coin" size={13} color="#f59e0b" /> {MAGNET_COST}</span>
                <button
                  className={`shop-buy-btn ${coinBalance >= MAGNET_COST ? 'shop-buy-enabled' : 'shop-buy-disabled'}`}
                  onClick={() => coinBalance >= MAGNET_COST && onBuyShopItem('magnet')}
                  type="button"
                  disabled={coinBalance < MAGNET_COST}
                >
                  {coinBalance >= MAGNET_COST ? 'Buy' : `Need ${MAGNET_COST - coinBalance} more`}
                </button>
              </div>
            </div>

            {/* Score Multiplier */}
            <div className={`shop-item shop-item-buyable ${coinBalance < MULTIPLIER_COST ? 'shop-item-insufficient' : ''}`}>
              <div className="shop-item-icon"><Icon name="star" size={22} color="#f59e0b" /></div>
              <div className="shop-item-info">
                <span className="shop-item-name">
                  Score Multiplier
                  {shopPurchases.multiplier > 0 && <span className="shop-item-owned-tag">×{shopPurchases.multiplier} owned</span>}
                </span>
                <span className="shop-item-desc">Start with 2× score combo active.</span>
              </div>
              <div className="shop-item-actions">
                <span className="shop-item-cost"><Icon name="coin" size={13} color="#f59e0b" /> {MULTIPLIER_COST}</span>
                <button
                  className={`shop-buy-btn ${coinBalance >= MULTIPLIER_COST ? 'shop-buy-enabled' : 'shop-buy-disabled'}`}
                  onClick={() => coinBalance >= MULTIPLIER_COST && onBuyShopItem('multiplier')}
                  type="button"
                  disabled={coinBalance < MULTIPLIER_COST}
                >
                  {coinBalance >= MULTIPLIER_COST ? 'Buy' : `Need ${MULTIPLIER_COST - coinBalance} more`}
                </button>
              </div>
            </div>

            {/* On-chain item */}
            <div className="shop-item shop-item-locked">
              <div className="shop-item-icon"><Icon name="chain" size={22} color="#a855f7" /></div>
              <div className="shop-item-info">
                <span className="shop-item-name">On-chain Reward</span>
                <span className="shop-item-desc">Redeem coins for on-chain tokens (contract pending)</span>
              </div>
              <div className="shop-item-cost shop-item-cost--locked">Pending deploy</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Game Over Overlay ────────────────────────────────────────────────────────
interface GameOverOverlayProps {
  finalScore: number;
  finalCoins: number;
  coinBalance: number;
  isNewRecord: boolean;
  timeUntilNextClaim: string;
  canClaimReward: boolean;
  claimLoading: boolean;
  claimMessage: string | null;
  claimSuccess: boolean;
  txLoading: boolean;
  txPhase: TxPhase;
  txMessage: string | null;
  wallet: WalletState;
  lives: number;
  onRestart: () => void;
  onShare: () => void;
  onSaveOnChain: () => void;
  onConnectWallet: () => void;
  onClaimReward: () => void;
  onBuyLife: () => void;
}

function GameOverOverlay({
  finalScore, finalCoins, coinBalance, isNewRecord,
  timeUntilNextClaim, canClaimReward,
  claimLoading, claimMessage, claimSuccess,
  txLoading, txPhase, txMessage,
  wallet, lives,
  onRestart, onShare, onSaveOnChain, onConnectWallet, onClaimReward, onBuyLife,
}: GameOverOverlayProps) {
  const statusClass =
    txPhase === 'confirmed' ? 'tx-success' :
    txPhase === 'failed'    ? 'tx-error'   :
    (txPhase === 'awaiting-approval' || txPhase === 'submitted') ? 'tx-pending' :
    '';
  const statusLabel = TX_PHASE_LABEL[txPhase];
  const canAffordLife = coinBalance >= EXTRA_LIFE_COST;

  return (
    <div className="overlay gameover-overlay">
      <div className="gameover-modal">
        {isNewRecord && (
          <div className="new-record-banner">
            <Icon name="trophy" size={13} color="#020916" /> NEW RECORD!
          </div>
        )}

        <div className="gameover-header">
          <h2 className="gameover-title">WIPEOUT!</h2>
          <p className="gameover-sub">Your run has ended. Continue or claim your rewards.</p>
        </div>

        <div className="score-card">
          <div className="score-card-row">
            <span className="sc-label">
              <span className="sc-label-with-tip">
                Final Score
                <span className="sc-label-tip">For ranking only</span>
              </span>
            </span>
            <span className="sc-value score-highlight">{finalScore.toLocaleString()}</span>
          </div>
          <div className="score-card-divider" />
          <div className="score-card-row">
            <span className="sc-label">
              <span className="sc-label-with-tip">
                Coins This Run
                <span className="sc-label-tip">Added to balance</span>
              </span>
            </span>
            <span className="sc-value coin-sc-value">
              <Icon name="coin" size={18} color="#f59e0b" /> {finalCoins}
            </span>
          </div>
          <div className="score-card-divider" />
          <div className="score-card-row">
            <span className="sc-label">
              <span className="sc-label-with-tip">
                Coin Balance
                <span className="sc-label-tip">Spendable below</span>
              </span>
            </span>
            <span className="sc-value coin-sc-value">
              <Icon name="coin" size={18} color="#a855f7" /> {coinBalance}
            </span>
          </div>
        </div>

        {/* Extra Life */}
        <div className="extra-life-card">
          <div className="extra-life-header">
            <Icon name="heart" size={20} color="#f9a8d4" />
            <div className="extra-life-header-text">
              <span className="extra-life-title">Extra Life</span>
              <span className="extra-life-subtitle">Continue from where you crashed</span>
            </div>
            <span className="extra-life-lives">
              {lives > 0 ? `${lives} free ${lives === 1 ? 'life' : 'lives'}` : 'No free lives'}
            </span>
          </div>
          <div className="extra-life-actions">
            {lives > 0 && (
              <button className="action-btn primary-action extra-life-btn" onClick={onBuyLife} type="button">
                <Icon name="heart" size={16} color="#020916" /> Use 1 Free Life
                <span className="extra-life-badge">{lives} left</span>
              </button>
            )}
            <button
              className={`action-btn extra-life-btn ${canAffordLife ? 'buy-life-action' : 'buy-life-action--disabled'}`}
              onClick={canAffordLife ? onBuyLife : undefined}
              type="button"
              disabled={!canAffordLife}
            >
              <Icon name="coin" size={16} color={canAffordLife ? '#f9a8d4' : undefined} />
              Buy Extra Life — {EXTRA_LIFE_COST} Coins
              {!canAffordLife && (
                <span className="extra-life-short">Need {EXTRA_LIFE_COST - coinBalance} more</span>
              )}
            </button>
          </div>
        </div>

        {/* Daily Reward */}
        <div className="daily-reward-card">
          <div className="dr-header">
            <span className="dr-header-left">
              <Icon name="gift" size={16} color="#f59e0b" /> Daily Reward
            </span>
            <span className="dr-timer">
              {canClaimReward ? 'Ready now!' : `Next: ${timeUntilNextClaim}`}
            </span>
          </div>
          <p className="dr-desc">+500 coins · Claimable once every 24 hours</p>
          <button
            className="action-btn primary-action"
            style={{ marginTop: '10px' }}
            onClick={onClaimReward}
            type="button"
            disabled={claimLoading || !canClaimReward}
          >
            {claimLoading
              ? <><span className="spinner" /> Claiming…</>
              : canClaimReward
                ? <><Icon name="gift" size={16} color="#020916" /> Claim +500 Coins</>
                : <>Next claim in {timeUntilNextClaim}</>
            }
          </button>
          {claimMessage && (
            <div className={`tx-status ${claimSuccess ? 'tx-success' : 'tx-error'}`} style={{ marginTop: '8px' }}>
              {claimMessage}
            </div>
          )}
        </div>

        {/* Primary actions */}
        <div className="gameover-actions">
          <button className="action-btn secondary-action" onClick={onRestart} type="button">
            ↺ Surf Again
          </button>
          <button className="action-btn tertiary-action" onClick={onShare} type="button">
            Share on Telegram
          </button>
        </div>

        {/* On-chain Save Score */}
        <div className="gameover-secondary-actions">
          {REWARD_CONTRACT_DEPLOYED ? (
            wallet.signer ? (
              <button className="link-action" onClick={onSaveOnChain} type="button" disabled={txLoading}>
                {txLoading ? <span className="spinner" /> : <><Icon name="chain" size={14} color="currentColor" /> Save Score On-Chain</>}
              </button>
            ) : (
              <button className="link-action" onClick={onConnectWallet} type="button">
                ◈ Connect Wallet to Save Score
              </button>
            )
          ) : (
            <p className="onchain-unavailable-note">On-chain saving is currently unavailable — no deployed contract is configured.</p>
          )}
        </div>

        {REWARD_CONTRACT_DEPLOYED && txPhase !== 'idle' && (txMessage || statusLabel) && (
          <div className={`tx-status ${statusClass}`}>
            {(txPhase === 'awaiting-approval' || txPhase === 'submitted') &&
              <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2, marginRight: 6, verticalAlign: 'middle' }} />
            }
            {txMessage || statusLabel}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────
interface LeaderboardProps {
  entries: LeaderboardEntry[];
  walletConnected: boolean;
}

function Leaderboard({ entries, walletConnected }: LeaderboardProps) {
  const [open, setOpen] = useState(false);

  const rankMeta = (i: number) => {
    if (i === 0) return { label: '1st', cls: 'lb-rank-gold',   icon: '🥇' };
    if (i === 1) return { label: '2nd', cls: 'lb-rank-silver', icon: '🥈' };
    if (i === 2) return { label: '3rd', cls: 'lb-rank-bronze', icon: '🥉' };
    return { label: `#${i + 1}`, cls: 'lb-rank-default', icon: null };
  };
  const rowClass = (i: number) => {
    if (i === 0) return 'lb-row lb-first';
    if (i === 1) return 'lb-row lb-second';
    if (i === 2) return 'lb-row lb-third';
    return 'lb-row';
  };

  return (
    <div className="leaderboard section-card">
      <button
        className="section-header section-header-btn"
        onClick={() => setOpen(o => !o)}
        type="button"
        aria-expanded={open}
      >
        <div className="section-icon"><Icon name="trophy" size={16} color="#22d3ee" /></div>
        <span className="section-title">Leaderboard</span>
        <span className="section-badge">{entries.length} entries</span>
        <span className="collapse-chevron">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <>
          <div className="lb-description">
            <Icon name="info" size={13} color="#94a3b8" />
            {walletConnected
              ? 'Leaderboard displays connected player scores.'
              : 'Leaderboard shows the highest scores on this device.'}
          </div>
          <div className="lb-score-note">
            <Icon name="star" size={12} color="#22d3ee" />
            Score is for ranking only.
            <span style={{ marginLeft: 8, display: 'inline-flex' }}><Icon name="coin" size={12} color="#f59e0b" /></span>
            Coins are for purchases.
          </div>
          {entries.length === 0 ? (
            <div className="lb-empty">Play a run to appear on the leaderboard!</div>
          ) : (
            <div className="lb-list">
              {entries.map((entry, idx) => {
                const { label, cls, icon } = rankMeta(idx);
                return (
                  <div key={`${entry.date}-${idx}`} className={rowClass(idx)}>
                    <div className={`lb-rank lb-rank-badge ${cls}`}>
                      {idx < 3 ? (
                        <span className="lb-medal-emoji">{icon}</span>
                      ) : label}
                    </div>
                    <div className="lb-info">
                      <span className="lb-name">{entry.name}</span>
                      <span className="lb-date">{new Date(entry.date).toLocaleDateString()}</span>
                    </div>
                    <div className="lb-scores">
                      <span className="lb-score">{entry.score.toLocaleString()} pts</span>
                      <span className="lb-coins">
                        <Icon name="coin" size={11} color="#f59e0b" /> {entry.coins}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Rules Modal ──────────────────────────────────────────────────────────────
interface RulesModalProps { onClose: () => void; }

function RulesModal({ onClose }: RulesModalProps) {
  const powerups = [
    { icon: 'shield'  as IconName, color: '#06b6d4', name: 'Shield',      desc: 'Absorbs one collision' },
    { icon: 'magnet'  as IconName, color: '#f97316', name: 'Magnet',      desc: 'Attracts coins for 6s' },
    { icon: 'speed'   as IconName, color: '#10b981', name: 'Speed Boost', desc: '1.6× speed for 5s' },
    { icon: 'combo'   as IconName, color: '#f97316', name: 'Combo Up',    desc: '+1 score multiplier' },
    { icon: 'coinCut' as IconName, color: '#ef4444', name: 'Coin Cut',    desc: 'Lose 20 coins · avoid!' },
    { icon: 'freeze'  as IconName, color: '#60a5fa', name: 'Freeze',      desc: 'Stops movement for 1.2s' },
    { icon: 'slow'    as IconName, color: '#0d9488', name: 'Slow Wave',   desc: 'Halves speed for 4s' },
    { icon: 'coin'    as IconName, color: '#f59e0b', name: 'Coin Box',    desc: 'Collects coins x combo' },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="rules-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-left">
            <span className="modal-header-icon"><Icon name="wave" size={22} color="#22d3ee" /></span>
            <div>
              <h2>How to Play</h2>
              <p>Surf Rush · Web3 Edition</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} type="button" aria-label="Close">✕</button>
        </div>

        <div className="modal-content">
          <div className="modal-section">
            <div className="modal-section-title"><span className="icon">Objective</span></div>
            <div className="modal-items">
              <div className="modal-item"><span className="modal-item-icon"><Icon name="surf" size={16} color="#22d3ee" /></span><span>Survive as long as possible on the endless ocean while dodging obstacles.</span></div>
              <div className="modal-item"><span className="modal-item-icon"><Icon name="coin" size={16} color="#f59e0b" /></span><span>Collect coin boxes and power-up boxes to increase your score and combo.</span></div>
              <div className="modal-item"><span className="modal-item-icon"><Icon name="chain" size={16} color="#a855f7" /></span><span>Save your high score on-chain and claim daily in-game rewards.</span></div>
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-title"><span className="icon">Controls</span></div>
            <div className="modal-controls-grid">
              <span className="ctrl-key">◀ / A</span><span className="ctrl-desc">Move left</span>
              <span className="ctrl-key">▶ / D</span><span className="ctrl-desc">Move right</span>
              <span className="ctrl-key">Space / P</span><span className="ctrl-desc">Pause game</span>
              <span className="ctrl-key">Swipe</span><span className="ctrl-desc">Swipe left or right on mobile</span>
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-title"><span className="icon">Power-Ups &amp; Boxes</span></div>
            <div className="modal-powerup-grid">
              {powerups.map(p => (
                <div className="modal-powerup-item" key={p.name}>
                  <span className="pu-icon"><Icon name={p.icon} size={20} color={p.color} /></span>
                  <div className="pu-info">
                    <span className="pu-name">{p.name}</span>
                    <span className="pu-desc">{p.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-title"><span className="icon">Obstacles</span></div>
            <div className="modal-items">
              <div className="modal-item"><span className="modal-item-icon modal-item-icon--text">Rock</span><span>Rock — solid object blocking the lane</span></div>
              <div className="modal-item"><span className="modal-item-icon modal-item-icon--text">Shark</span><span>Shark — lurks beneath the surface</span></div>
              <div className="modal-item"><span className="modal-item-icon modal-item-icon--text">Jelly</span><span>Jellyfish — drifts unpredictably</span></div>
              <div className="modal-item"><span className="modal-item-icon"><Icon name="wave" size={16} color="#22d3ee" /></span><span>Rogue Wave — crashing wall of water</span></div>
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-title"><span className="icon"><Icon name="coin" size={14} color="#f59e0b" /></span> Scores vs Coins</div>
            <div className="score-vs-coins-explainer">
              <div className="svc-block svc-score">
                <div className="svc-title">Score Points</div>
                <ul className="svc-list">
                  <li>Earned by surviving, collecting, and maintaining combos</li>
                  <li>Used only for leaderboard ranking</li>
                  <li>Cannot be spent on anything</li>
                </ul>
              </div>
              <div className="svc-block svc-coins">
                <div className="svc-title"><Icon name="coin" size={13} color="#f59e0b" /> Coins</div>
                <ul className="svc-list">
                  <li>Collected from coin boxes during your run</li>
                  <li>Spent on Extra Lives, Shield, Magnet, Multiplier</li>
                  <li>Bonus from Daily Rewards, Missions, Streak</li>
                  <li>Unused coins stay in your balance</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-title"><span className="icon"><Icon name="chain" size={14} color="#22d3ee" /></span> Blockchain Features</div>
            <div className="modal-items">
              <div className="modal-item"><span className="modal-item-icon">◈</span><span>Connect MetaMask to unlock on-chain score saving</span></div>
              <div className="modal-item"><span className="modal-item-icon"><Icon name="trophy" size={16} color="#f59e0b" /></span><span>Save your high score permanently on-chain after each run</span></div>
              <div className="modal-item"><span className="modal-item-icon"><Icon name="gift" size={16} color="#f59e0b" /></span><span>Daily Reward is local (no wallet needed) — +500 coins, once per 24h</span></div>
              <div className="modal-item"><span className="modal-item-icon">📱</span><span>On Android, tap Connect Wallet to open in MetaMask Mobile</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const canvasRef     = useRef<HTMLCanvasElement | null>(null);
  const gameAreaRef   = useRef<HTMLDivElement | null>(null);
  const engineRef     = useRef<GameEngine | null>(null);
  const playerNameRef = useRef<string>('Surfer');
  const runCountRef   = useRef<number>(0);

  const walletRef = useRef<WalletState>({ address: null, provider: null, signer: null, chainId: null, networkName: null });

  const [screen, setScreen]           = useState<Screen>('start');
  const [gameState, setGameState]     = useState<GameState | null>(null);
  const [finalScore, setFinalScore]   = useState(0);
  const [finalCoins, setFinalCoins]   = useState(0);
  const [isNewRecord, setIsNewRecord] = useState(false);

  const [lives, setLives] = useState(0);

  const [wallet, setWalletState]      = useState<WalletState>({ address: null, provider: null, signer: null, chainId: null, networkName: null });
  const [walletError, setWalletError] = useState<string | null>(null);

  const [connectPhase, setConnectPhase] = useState<TxPhase>('idle');
  const [txPhase, setTxPhase]           = useState<TxPhase>('idle');
  const [txMessage, setTxMessage]       = useState<string | null>(null);
  const connectLoading = connectPhase === 'connecting-wallet' || connectPhase === 'awaiting-approval';
  const txLoading      = txPhase === 'awaiting-approval' || txPhase === 'submitted';

  const connectInFlightRef = useRef(false);
  const txInFlightRef      = useRef(false);

  const [copyFeedback, setCopyFeedback] = useState(false);

  const setWallet = useCallback((w: WalletState) => {
    walletRef.current = w;
    setWalletState(w);
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeToChainChanges((chainId, networkName) => {
      if (!walletRef.current.address) return;
      setWallet({ ...walletRef.current, chainId, networkName });
    });
    return unsubscribe;
  }, [setWallet]);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [playerName, setPlayerName]   = useState<string>('Surfer');

  const [scoreAnim, setScoreAnim] = useState(false);
  const [comboAnim, setComboAnim] = useState(false);
  const prevCombo = useRef(1);
  const prevScore = useRef(0);

  const [showRules, setShowRules] = useState(false);

  const [lastClaimTime, setLastClaimTime]           = useState<number | null>(null);
  const [timeUntilNextClaim, setTimeUntilNextClaim] = useState('Ready now!');

  // New feature states
  const [profile, setProfile]             = useState<PlayerProfile>(getProfile);
  const [achievements, setAchievements]   = useState<Achievement[]>(getAchievements);
  const [missions, setMissions]           = useState<Mission[]>(getMissions);
  const [streak, setStreak]               = useState<StreakData>(getStreak);
  const [shopPurchases, setShopPurchases] = useState<ShopPurchase>(getShopPurchases);
  const [toasts, setToasts]               = useState<ToastData[]>([]);

  const showToast = useCallback((message: string, type: ToastData['type'], icon?: IconName, color?: string) => {
    const id = ++toastIdCounter;
    setToasts(prev => [...prev, { id, message, type, icon, color }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // Coin balance derived from profile (persistent across runs)
  const coinBalance = profile.coinBalance;

  useEffect(() => {
    const saved = localStorage.getItem('surfRushLastClaim');
    if (saved) setLastClaimTime(Number(saved));
  }, []);

  useEffect(() => {
    const calc = () => {
      if (!lastClaimTime) { setTimeUntilNextClaim('Ready now!'); return; }
      const remaining = lastClaimTime + 24 * 60 * 60 * 1000 - Date.now();
      if (remaining <= 0) { setTimeUntilNextClaim('Ready now!'); return; }
      const h = Math.floor(remaining / (1000 * 60 * 60));
      const m = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      setTimeUntilNextClaim(`${h}h ${m}m`);
    };
    calc();
    const id = setInterval(calc, 30_000);
    return () => clearInterval(id);
  }, [lastClaimTime]);

  const canClaimReward = !lastClaimTime || Date.now() - lastClaimTime >= 24 * 60 * 60 * 1000;

  const [claimLoading, setClaimLoading] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const claimInFlightRef = useRef(false);
  const canClaimRewardRef = useRef(canClaimReward);
  useEffect(() => { canClaimRewardRef.current = canClaimReward; }, [canClaimReward]);

  // Helper: check & unlock achievement
  const tryUnlock = useCallback((id: AchievementId, def: Achievement) => {
    const wasNew = unlockAchievement(id);
    if (wasNew) {
      setAchievements(getAchievements());
      showToast(`Achievement unlocked: ${def.title}`, 'achievement', def.icon as IconName, def.color);
    }
  }, [showToast]);

  const checkAchievements = useCallback((score: number, coins: number, prof: PlayerProfile) => {
    const all = getAchievements();
    const byId = Object.fromEntries(all.map(a => [a.id, a]));
    if (prof.totalGames >= 1) tryUnlock('first_run', byId['first_run']);
    if (score >= 100)         tryUnlock('score_100', byId['score_100']);
    if (score >= 500)         tryUnlock('score_500', byId['score_500']);
    if (coins >= 100)         tryUnlock('coins_100', byId['coins_100']);
  }, [tryUnlock]);

  // Helper: update mission progress
  const updateMissionProgress = useCallback((
    type: 'coins' | 'games' | 'score' | 'life',
    value: number
  ) => {
    const current = getMissions();
    let changed = false;
    const updated = current.map(m => {
      if (m.claimed) return m;
      let newProgress = m.progress;
      if (type === 'coins'  && m.id === 'collect_coins') newProgress = Math.min(m.target, m.progress + value);
      if (type === 'games'  && m.id === 'play_games')    newProgress = Math.min(m.target, m.progress + value);
      if (type === 'score'  && m.id === 'reach_score')   newProgress = Math.max(m.progress, value);
      if (type === 'life'   && m.id === 'use_extra_life') newProgress = Math.min(m.target, m.progress + value);
      const completed = newProgress >= m.target;
      if (newProgress !== m.progress || completed !== m.completed) changed = true;
      return { ...m, progress: newProgress, completed };
    });
    if (changed) {
      saveMissions(updated);
      setMissions(updated);
    }
  }, []);

  useEffect(() => {
    initTelegram();
    const tgUser = getTelegramUser();
    if (tgUser) {
      const name = tgUser.username ? `@${tgUser.username}` : tgUser.first_name;
      setPlayerName(name);
      playerNameRef.current = name;
    } else {
      setPlayerName('Surfer');
      playerNameRef.current = 'Surfer';
    }
    setLeaderboard(getLeaderboard());
  }, []);

  useEffect(() => {
    playerNameRef.current = playerName;
  }, [playerName]);

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

  const initEngine = useCallback((canvas: HTMLCanvasElement | null) => {
    if (!canvas) {
      engineRef.current?.stop();
      engineRef.current = null;
      canvasRef.current = null;
      return;
    }
    if (canvas === canvasRef.current && engineRef.current) return;
    canvasRef.current = canvas;
    engineRef.current?.stop();

    const engine = new GameEngine(canvas, {
      onStateChange: (state) => setGameState(state),
      onGameOver: (score, coins, obstaclesAvoided) => {
        setFinalScore(score);
        setFinalCoins(coins);

        const prev = getLeaderboard();
        const top  = prev.length > 0 ? prev[0].score : 0;
        setIsNewRecord(score > top);

        runCountRef.current += 1;
        const displayName = playerNameRef.current && playerNameRef.current !== 'Surfer'
          ? playerNameRef.current
          : `Surfer #${runCountRef.current}`;

        const updated = saveToLeaderboard({ name: displayName, score, coins, date: new Date().toISOString() });
        setLeaderboard(updated);

        // Update profile
        setProfile(prev => {
          const newProf: PlayerProfile = {
            ...prev,
            totalGames:             prev.totalGames + 1,
            highScore:              Math.max(prev.highScore, score),
            totalCoinsEarned:       prev.totalCoinsEarned + coins,
            coinBalance:            prev.coinBalance + coins,
            totalObstaclesAvoided:  prev.totalObstaclesAvoided + obstaclesAvoided,
            totalScoreSum:          prev.totalScoreSum + score,
          };
          saveProfile(newProf);
          checkAchievements(score, coins, newProf);
          return newProf;
        });

        // Update missions
        updateMissionProgress('games', 1);
        updateMissionProgress('coins', coins);
        updateMissionProgress('score', score);

        setScreen('gameover');
      },
    });
    engineRef.current = engine;
  }, [checkAchievements, updateMissionProgress]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === ' ') e.preventDefault();
      const eng = engineRef.current;
      if (!eng) return;
      if      (e.key === 'ArrowLeft'  || e.key.toLowerCase() === 'a') eng.moveLeft();
      else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') eng.moveRight();
      else if (e.key === ' '          || e.key.toLowerCase() === 'p') eng.togglePause();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    const area = gameAreaRef.current;
    if (!area) return;
    let startX = 0;
    const onTouchStart = (e: TouchEvent) => { startX = e.touches[0]?.clientX ?? 0; };
    const onTouchEnd   = (e: TouchEvent) => {
      const delta = (e.changedTouches[0]?.clientX ?? 0) - startX;
      if (Math.abs(delta) < 30) return;
      if (delta > 0) engineRef.current?.moveRight();
      else           engineRef.current?.moveLeft();
    };
    area.addEventListener('touchstart', onTouchStart, { passive: true });
    area.addEventListener('touchend',   onTouchEnd,   { passive: true });
    return () => {
      area.removeEventListener('touchstart', onTouchStart);
      area.removeEventListener('touchend',   onTouchEnd);
    };
  }, []);

  const startGame = useCallback(() => {
    setScreen('playing');
    setTxPhase('idle');
    setConnectPhase('idle');
    setTxMessage(null);
    setClaimMessage(null);
    setClaimSuccess(false);
    txInFlightRef.current = false;
    setLives(0);

    // Streak update on first play of the day
    const { streak: newStreak, bonusCoins, isNewDay } = updateStreak();
    if (isNewDay) {
      setStreak(newStreak);
      if (bonusCoins > 0) {
        setProfile(prev => {
          const updated = { ...prev, coinBalance: prev.coinBalance + bonusCoins };
          saveProfile(updated);
          return updated;
        });
        showToast(`Streak Day ${newStreak.currentStreak}! +${bonusCoins} bonus coins`, 'streak', 'fire', '#f97316');
      }
    }

    // Refresh missions for new day
    setMissions(getMissions());

    requestAnimationFrame(() => {
      engineRef.current?.start();
    });
  }, [showToast]);

  const restartGame = useCallback(() => {
    setScreen('playing');
    setTxPhase('idle');
    setConnectPhase('idle');
    setTxMessage(null);
    setClaimMessage(null);
    setClaimSuccess(false);
    txInFlightRef.current = false;
    setLives(0);
    setMissions(getMissions());
    requestAnimationFrame(() => {
      engineRef.current?.restart();
    });
  }, []);

  const handleBuyLife = useCallback(() => {
    if (lives > 0) {
      setLives(l => l - 1);
      setScreen('playing');
      updateMissionProgress('life', 1);
      // unlock achievement
      const all = getAchievements();
      const def = all.find(a => a.id === 'buy_extra_life');
      if (def) tryUnlock('buy_extra_life', def);
      requestAnimationFrame(() => { engineRef.current?.addLife(0); });
    } else if (coinBalance >= EXTRA_LIFE_COST) {
      setProfile(prev => {
        const updated = { ...prev, coinBalance: prev.coinBalance - EXTRA_LIFE_COST };
        saveProfile(updated);
        return updated;
      });
      setScreen('playing');
      updateMissionProgress('life', 1);
      const all = getAchievements();
      const def = all.find(a => a.id === 'buy_extra_life');
      if (def) tryUnlock('buy_extra_life', def);
      requestAnimationFrame(() => { engineRef.current?.addLife(0); });
    }
  }, [lives, coinBalance, updateMissionProgress, tryUnlock]);

  const handleBuyShopItem = useCallback((item: 'shield' | 'magnet' | 'multiplier') => {
    const costs: Record<string, number> = { shield: SHIELD_COST, magnet: MAGNET_COST, multiplier: MULTIPLIER_COST };
    const cost = costs[item];
    if (coinBalance < cost) return;
    setProfile(prev => {
      const updated = { ...prev, coinBalance: prev.coinBalance - cost };
      saveProfile(updated);
      return updated;
    });
    setShopPurchases(prev => {
      const updated = { ...prev, [item]: prev[item] + 1 };
      saveShopPurchases(updated);
      return updated;
    });
    const labels: Record<string, string> = { shield: 'Shield', magnet: 'Magnet Boost', multiplier: 'Score Multiplier' };
    showToast(`${labels[item]} purchased! Ready for next run.`, 'info', item as IconName, '#22d3ee');
  }, [coinBalance, showToast]);

  const togglePause = useCallback(() => { engineRef.current?.togglePause(); }, []);

  const handleConnectWallet = useCallback(async () => {
    if (connectInFlightRef.current) return;
    connectInFlightRef.current = true;
    setWalletError(null);
    setTxMessage(null);
    try {
      setConnectPhase('connecting-wallet');
      if (!isInjectedWalletAvailable() && isMobileDevice()) {
        setTxMessage('Opening MetaMask Mobile…');
      } else {
        setTxMessage('Requesting wallet access…');
        setConnectPhase('awaiting-approval');
      }
      const connected = await connectWallet();
      if (connected) {
        setWallet(connected);
        setConnectPhase('idle');
        setTxMessage(null);
      }
    } catch (err: any) {
      setConnectPhase('idle');
      const msg = err.message ?? 'Wallet connection failed';
      setWalletError(msg.length > 80 ? msg.slice(0, 80) + '…' : msg);
      setTxMessage(null);
    } finally {
      connectInFlightRef.current = false;
    }
  }, [setWallet]);

  const handleDisconnectWallet = useCallback(() => {
    disconnectWallet();
    setWallet({ address: null, provider: null, signer: null, chainId: null, networkName: null });
    setWalletError(null);
    setConnectPhase('idle');
  }, [setWallet]);

  const handleCopyAddress = useCallback(() => {
    if (!wallet.address) return;
    navigator.clipboard.writeText(wallet.address).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }).catch(() => {});
  }, [wallet.address]);

  const handleSaveScoreOnChain = useCallback(async () => {
    if (txInFlightRef.current) return;
    txInFlightRef.current = true;
    setTxPhase('awaiting-approval');
    setTxMessage('Waiting for wallet approval…');
    try {
      const signer = walletRef.current.signer;
      if (!signer) throw new Error('No signer available. Please connect your wallet.');
      const hash = await saveScoreOnChain(signer, finalScore);
      setTxPhase('confirmed');
      setTxMessage(`Score saved on-chain! Tx: ${shortenAddress(hash)}`);
    } catch (err: any) {
      setTxPhase('failed');
      if (err.code === 4001 || err.message?.includes('rejected') || err.message?.includes('denied') || err.message?.includes('User rejected')) {
        setTxMessage('Transaction cancelled.');
      } else {
        setTxMessage(err.message || 'Transaction failed.');
      }
    } finally {
      txInFlightRef.current = false;
    }
  }, [finalScore]);

  const handleClaimReward = useCallback(() => {
    if (claimInFlightRef.current) return;
    claimInFlightRef.current = true;
    setClaimLoading(true);
    try {
      if (!canClaimRewardRef.current) {
        setClaimSuccess(false);
        setClaimMessage('Daily reward already claimed. Check back in 24 hours.');
        return;
      }
      const REWARD = 500;
      setProfile(prev => {
        const updated = {
          ...prev,
          coinBalance: prev.coinBalance + REWARD,
          dailyRewardsClaimed: prev.dailyRewardsClaimed + 1,
        };
        saveProfile(updated);
        return updated;
      });
      const now = Date.now();
      localStorage.setItem('surfRushLastClaim', String(now));
      setLastClaimTime(now);
      setClaimSuccess(true);
      setClaimMessage('Daily reward claimed! +500 coins added.');

      // Achievement
      const all = getAchievements();
      const def = all.find(a => a.id === 'daily_claim');
      if (def) tryUnlock('daily_claim', def);
    } finally {
      setClaimLoading(false);
      claimInFlightRef.current = false;
    }
  }, [tryUnlock]);

  const handleClaimMission = useCallback((missionId: string) => {
    const current = getMissions();
    const mission = current.find(m => m.id === missionId);
    if (!mission || !mission.completed || mission.claimed) return;
    const updated = current.map(m => m.id === missionId ? { ...m, claimed: true } : m);
    saveMissions(updated);
    setMissions(updated);
    setProfile(prev => {
      const u = { ...prev, coinBalance: prev.coinBalance + mission.reward };
      saveProfile(u);
      return u;
    });
    showToast(`Mission complete: +${mission.reward} coins!`, 'mission', 'task', '#10b981');
  }, [showToast]);

  const handleShareScore = useCallback(() => {
    shareScore(finalScore, TELEGRAM_BOT_USERNAME);
  }, [finalScore]);

  const activeEffects = gameState
    ? ([
        gameState.hasShield                    && { icon: 'shield'  as IconName, label: 'Shield', color: '#06b6d4' },
        Date.now() < gameState.magnetUntil     && { icon: 'magnet'  as IconName, label: 'Magnet', color: '#f97316' },
        Date.now() < gameState.speedBoostUntil && { icon: 'speed'   as IconName, label: 'Boost',  color: '#10b981' },
        Date.now() < gameState.freezeUntil     && { icon: 'freeze'  as IconName, label: 'Frozen', color: '#60a5fa' },
        Date.now() < gameState.slowUntil       && { icon: 'slow'    as IconName, label: 'Slow',   color: '#0d9488' },
      ] as (false | { icon: IconName; label: string; color: string })[]).filter(Boolean)
    : [];

  return (
    <div className="app">
      <ToastStack toasts={toasts} onDismiss={dismissToast} />

      {/* Top Bar */}
      <div className="topbar">
        <div className="brand">
          <span className="brand-icon"><Icon name="wave" size={22} color="#22d3ee" /></span>
          <div className="brand-text">
            <span className="brand-title">SURF RUSH</span>
            <span className="brand-sub">WEB3</span>
          </div>
        </div>

        <div className="topbar-right">
          {/* Coin balance display */}
          <div className="topbar-balance">
            <Icon name="coin" size={14} color="#f59e0b" />
            <span>{coinBalance}</span>
          </div>

          {streak.currentStreak > 0 && (
            <div className="topbar-streak">
              <Icon name="fire" size={13} color="#f97316" />
              <span>{streak.currentStreak}</span>
            </div>
          )}

          <button className="rules-btn" onClick={() => setShowRules(true)} type="button">
            How to Play
          </button>

          {walletError && <div className="wallet-error-inline">{walletError}</div>}

          {wallet.address ? (
            <button className="wallet-btn connected" onClick={handleDisconnectWallet} type="button">
              <span className="wallet-dot" />
              {shortenAddress(wallet.address)}
            </button>
          ) : (
            <button className="wallet-btn" onClick={handleConnectWallet} type="button" disabled={connectLoading}>
              {connectLoading
                ? <><span className="spinner" style={{ width: 12, height: 12, borderWidth: 2 }} /> Connecting…</>
                : <><span className="wallet-icon">◈</span> Connect Wallet</>
              }
            </button>
          )}
        </div>
      </div>

      {/* Wallet Panel */}
      {wallet.address && (
        <WalletPanel
          address={wallet.address}
          networkName={wallet.networkName}
          onDisconnect={handleDisconnectWallet}
          onCopy={handleCopyAddress}
          copyFeedback={copyFeedback}
        />
      )}

      {/* HUD */}
      {screen === 'playing' && gameState && (
        <Hud gameState={gameState} scoreAnim={scoreAnim} comboAnim={comboAnim} coinBalance={coinBalance} />
      )}

      {/* Power-up bar */}
      {screen === 'playing' && activeEffects.length > 0 && (
        <div className="powerup-bar">
          {(activeEffects as { icon: IconName; label: string; color: string }[]).map((fx) => (
            <div className="powerup-badge" key={fx.label} style={{ borderColor: fx.color, color: fx.color }}>
              <Icon name={fx.icon} size={14} color={fx.color} />
              <span>{fx.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Game area */}
      <div
        className={`game-area${screen === 'gameover' ? ' game-area--gameover' : ''}`}
        ref={gameAreaRef}
        style={{ minHeight: '500px' }}
      >
        <canvas ref={initEngine} style={{ display: 'block', width: '100%', height: '100%' }} />

        {screen === 'start' && (
          <StartOverlay onStart={startGame} streak={streak} profile={profile} />
        )}

        {screen === 'gameover' && (
          <GameOverOverlay
            finalScore={finalScore}
            finalCoins={finalCoins}
            coinBalance={coinBalance}
            isNewRecord={isNewRecord}
            timeUntilNextClaim={timeUntilNextClaim}
            canClaimReward={canClaimReward}
            claimLoading={claimLoading}
            claimMessage={claimMessage}
            claimSuccess={claimSuccess}
            txLoading={connectLoading || txLoading}
            txPhase={txPhase !== 'idle' ? txPhase : connectPhase}
            txMessage={txMessage}
            wallet={wallet}
            lives={lives}
            onRestart={restartGame}
            onShare={handleShareScore}
            onSaveOnChain={handleSaveScoreOnChain}
            onConnectWallet={handleConnectWallet}
            onClaimReward={handleClaimReward}
            onBuyLife={handleBuyLife}
          />
        )}
      </div>

      {/* Mobile controls */}
      {screen === 'playing' && (
        <div className="controls">
          <button className="ctrl-btn" onPointerDown={() => engineRef.current?.moveLeft()} type="button">◀</button>
          <button className="ctrl-btn pause-btn" onPointerDown={togglePause} type="button">
            {gameState?.isPaused ? '▶' : '⏸'}
          </button>
          <button className="ctrl-btn" onPointerDown={() => engineRef.current?.moveRight()} type="button">▶</button>
        </div>
      )}

      {/* Profile Card */}
      <ProfileCard profile={profile} streak={streak} />

      {/* Daily Missions */}
      <MissionsPanel missions={missions} onClaim={handleClaimMission} />

      {/* Achievements */}
      <AchievementsPanel achievements={achievements} />

      {/* Statistics */}
      <StatsPanel profile={profile} />

      {/* Power-Up Shop */}
      <CoinShopPanel
        coinBalance={coinBalance}
        shopPurchases={shopPurchases}
        onBuyShopItem={handleBuyShopItem}
      />

      {/* Leaderboard */}
      <Leaderboard entries={leaderboard} walletConnected={!!wallet.address} />

      {/* Rules modal */}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}
    </div>
  );
}