import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  GameEngine, GameState,
  LeaderboardEntry, getLeaderboard, saveToLeaderboard,
  PlayerProfile, getProfile, saveProfile,
  levelFromXp, xpForLevel, xpForNextLevel, xpForRun, rankTitle,
  Achievement, AchievementId, getAchievements, unlockAchievement,
  Mission, getMissions, saveMissions,
  StreakData, getStreak, updateStreak,
  ShopPurchase, getShopPurchases, saveShopPurchases,
  claimDailyReward,
  sfx,
} from './game';
import {
  connectWallet, disconnectWallet,
  isInjectedWalletAvailable, isMobileDevice,
  saveScoreOnChain, subscribeToChainChanges,
  WalletState, TxPhase, REWARD_CONTRACT_DEPLOYED,
} from './wallet';
import { initTelegram, getTelegramUser, shareScore } from './telegram';

// ─── Constants ──────────────────────────────────────────────────────────────
type Screen = 'start' | 'playing' | 'gameover';
const EXTRA_LIFE_COST    = 100;
const SHIELD_COST        = 150;
const MAGNET_COST        = 150;
const MULTIPLIER_COST    = 200;
const DAILY_REWARD_COINS = 500;

function shorten(address: string) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ─── Pure SVG icons ──────────────────────────────────────────────────────────
interface SvgProps { size?: number; color?: string; }
const Ic = {
  Coin: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <circle cx="12" cy="12" r="9" stroke={color} strokeWidth="2"/><circle cx="12" cy="12" r="5.5" fill={color} opacity="0.2"/><path d="M12 8v8M9.5 10h3a1.5 1.5 0 0 1 0 3H9.5M9.5 13h3.5" stroke={color} strokeWidth="1.5" strokeLinecap="round"/>
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
  Settings: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <circle cx="12" cy="12" r="3" stroke={color} strokeWidth="2"/>
      <path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Close: ({ size = 16, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <path d="M18 6L6 18M6 6l12 12" stroke={color} strokeWidth="2.5" strokeLinecap="round"/>
    </svg>
  ),
  ChevronDown: ({ size = 16, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <path d="M6 9l6 6 6-6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  ChevronUp: ({ size = 16, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <path d="M18 15l-6-6-6 6" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  Volume: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <path d="M11 5L6 9H2v6h4l5 4V5z" stroke={color} strokeWidth="2" strokeLinejoin="round" fill={color} fillOpacity="0.15"/>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  VolumeOff: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <path d="M11 5L6 9H2v6h4l5 4V5z" stroke={color} strokeWidth="2" strokeLinejoin="round" fill={color} fillOpacity="0.15"/>
      <path d="M23 9l-6 6M17 9l6 6" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Refresh: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <path d="M1 4v6h6" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3.51 15a9 9 0 1 0 .49-4.5" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Share: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <circle cx="18" cy="5" r="3" stroke={color} strokeWidth="2"/>
      <circle cx="6" cy="12" r="3" stroke={color} strokeWidth="2"/>
      <circle cx="18" cy="19" r="3" stroke={color} strokeWidth="2"/>
      <path d="M8.59 13.51l6.83 3.98M15.41 6.51l-6.82 3.98" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Copy: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <rect x="9" y="9" width="13" height="13" rx="2" stroke={color} strokeWidth="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Telegram: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <path d="M22 2L11 13" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M22 2L15 22l-4-9-9-4 20-7z" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill={color} fillOpacity="0.15"/>
    </svg>
  ),
  Box: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" stroke={color} strokeWidth="2" fill={color} fillOpacity="0.1"/>
      <path d="M3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" stroke={color} strokeWidth="2" strokeLinecap="round"/>
    </svg>
  ),
  Wallet: ({ size = 18, color = 'currentColor' }: SvgProps) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" style={{ display:'inline-block', verticalAlign:'middle', flexShrink:0 }}>
      <rect x="2" y="5" width="20" height="15" rx="2" stroke={color} strokeWidth="2" fill={color} fillOpacity="0.1"/>
      <path d="M2 10h20" stroke={color} strokeWidth="2" strokeLinecap="round"/>
      <circle cx="17" cy="15" r="1.5" fill={color}/>
    </svg>
  ),
} as const;

type IconKey = keyof typeof Ic;
function Icon({ name, size, color }: { name: IconKey; size?: number; color?: string }) {
  const C = Ic[name];
  return <C size={size} color={color} />;
}

// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean }> {
  constructor(props: { children: React.ReactNode }) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: unknown) { console.error('SurfRush App Error:', error); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ color: 'white', padding: '40px', textAlign: 'center', fontFamily: 'system-ui, sans-serif', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#020916' }}>
          <h2 style={{ marginBottom: 12 }}>Oops! The surf got too rough.</h2>
          <p style={{ marginBottom: 20, color: 'rgba(224,242,254,0.7)' }}>Something went wrong. Please refresh the page to continue.</p>
          <button onClick={() => window.location.reload()} style={{ padding: '12px 24px', marginTop: 8, cursor: 'pointer', background: '#22d3ee', color: '#020916', border: 'none', borderRadius: 10, fontWeight: 700, fontSize: 14 }}>Reload Game</button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Toast ────────────────────────────────────────────────────────────────────
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
  const now = performance.now();
  const shieldActive = gs.hasShield;
  const magnetActive = now < gs.magnetUntil;
  return (
    <div className="hud">
      <div className={`hud-card${sa ? ' hud-pop' : ''}`}>
        <span className="hud-label">Score</span>
        <span className="hud-value" style={{ color: '#22d3ee' }}>{(gs.score || 0).toLocaleString()}</span>
      </div>
      <div className="hud-card">
        <span className="hud-label">Run Coins</span>
        <span className="hud-value" style={{ color: '#f59e0b', display:'flex', alignItems:'center', gap:4 }}>
          <Icon name="Coin" size={15} color="#f59e0b" />{gs.coins || 0}
        </span>
      </div>
      <div className={`hud-card${ca ? ' hud-pop' : ''}${(gs.combo || 1) > 3 ? ' hud-hot' : ''}`}>
        <span className="hud-label">Combo</span>
        <span className="hud-value" style={{ color: '#f97316' }}>x{gs.combo || 1}</span>
      </div>
      {shieldActive && (
        <div className="hud-card" style={{ borderColor: 'rgba(6,182,212,0.6)', background: 'rgba(6,182,212,0.12)' }}>
          <span className="hud-label">Shield</span>
          <span className="hud-value" style={{ color: '#06b6d4' }}><Icon name="Shield" size={15} color="#06b6d4" /> ON</span>
        </div>
      )}
      {magnetActive && (
        <div className="hud-card magnet-active" style={{ borderColor: 'rgba(249,115,22,0.6)', background: 'rgba(249,115,22,0.12)' }}>
          <span className="hud-label">Magnet</span>
          <span className="hud-value" style={{ color: '#f97316' }}><Icon name="Magnet" size={15} color="#f97316" /> ON</span>
        </div>
      )}
    </div>
  );
}

// ─── Section ──────────────────────────────────────────────────────────────────
function Section({
  icon, iconColor = '#22d3ee', title, badge, highlight, className, children,
}: {
  icon: IconKey; iconColor?: string; title: string;
  badge?: React.ReactNode; highlight?: boolean; className?: string; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`section-card${highlight ? ' section-highlight' : ''}${className ? ' ' + className : ''}`}>
      <button className="section-header-btn" onClick={() => setOpen(o => !o)} type="button" aria-expanded={open}>
        <span className="section-icon"><Icon name={icon} size={16} color={iconColor} /></span>
        <span className="section-title">{title}</span>
        {badge && <span className="section-badge">{badge}</span>}
        <span className="section-chevron">
          <Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={15} color="rgba(186,230,253,0.4)" />
        </span>
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

// ─── Level Help Modal ─────────────────────────────────────────────────────────
function LevelHelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="rules-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <div className="modal-header-left">
            <span className="modal-header-icon"><Icon name="Star" size={20} color="#f59e0b" /></span>
            <div><h2>How Levels Work</h2><p>XP &amp; Progression Guide</p></div>
          </div>
          <button className="modal-close" onClick={onClose} type="button"><Icon name="Close" size={14} color="currentColor" /></button>
        </div>
        <div className="modal-content">
          <div className="modal-section">
            <div className="modal-section-title">What is XP?</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
              XP (Experience Points) are earned at the end of every run based on your score. The higher you score, the more XP you earn.
            </p>
          </div>
          <div className="modal-section">
            <div className="modal-section-title">How do Levels work?</div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>
              Each level requires progressively more XP. When you fill your XP bar, you level up automatically and receive a <strong style={{ color: '#f59e0b' }}>+100 Coin bonus</strong> per level gained.
            </p>
          </div>
          <div className="modal-section">
            <div className="modal-section-title">XP Requirements</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
              {[
                { lvl: 1, xp: 0 }, { lvl: 2, xp: 100 }, { lvl: 5, xp: 500 }, { lvl: 10, xp: 1500 },
                { lvl: 20, xp: 4500 }, { lvl: 30, xp: 10000 }, { lvl: 50, xp: 30000 },
              ].map(r => (
                <div key={r.lvl} style={{ background: 'var(--glass-2)', borderRadius: 8, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ color: '#a855f7', fontWeight: 700 }}>Lv.{r.lvl}</span>
                  <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{r.xp.toLocaleString()} XP</span>
                </div>
              ))}
            </div>
          </div>
          <div className="modal-section">
            <div className="modal-section-title">Rank Titles</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
              {[
                { name: 'Beginner', minLvl: 1, color: '#94a3b8' },
                { name: 'Surfer', minLvl: 5, color: '#10b981' },
                { name: 'Veteran', minLvl: 10, color: '#38bdf8' },
                { name: 'Expert', minLvl: 20, color: '#22d3ee' },
                { name: 'Master', minLvl: 30, color: '#a855f7' },
                { name: 'Legend', minLvl: 50, color: '#f59e0b' },
              ].map(r => (
                <span key={r.name} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 20, border: `1px solid ${r.color}`, color: r.color, background: `${r.color}18` }}>
                  Lv.{r.minLvl}+ {r.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Wallet Information Section ───────────────────────────────────────────────
function WalletInfoSection({ wallet, onConnect, onDisconnect }: { wallet: WalletState; onConnect: () => void; onDisconnect: () => void }) {
  return (
    <Section icon="Wallet" iconColor="#a855f7" title="Wallet & Blockchain" className="section-card--wallet">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: 'var(--glass-2)', borderRadius: 10, padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>How currencies work</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ background: 'rgba(34,211,238,0.07)', border: '1px solid rgba(34,211,238,0.2)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Icon name="Trophy" size={14} color="#22d3ee" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#22d3ee' }}>Score</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>Leaderboard ranking only. Does not buy items.</p>
            </div>
            <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Icon name="Coin" size={14} color="#f59e0b" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b' }}>Coins</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>In-game currency. Used to buy Shields, Magnets, Lives.</p>
            </div>
            <div style={{ background: 'rgba(56,189,248,0.07)', border: '1px solid rgba(56,189,248,0.2)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Icon name="Xp" size={14} color="#38bdf8" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8' }}>XP</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>Earns levels. Each new level grants +100 Coins.</p>
            </div>
            <div style={{ background: 'rgba(168,85,247,0.07)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Icon name="Chain" size={14} color="#a855f7" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#a855f7' }}>Wallet</span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>Separate blockchain feature. Save scores on-chain permanently.</p>
            </div>
          </div>
        </div>
        <div style={{ background: 'var(--glass-2)', borderRadius: 10, padding: '14px' }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 10px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Connected Wallet</p>
          {wallet.address ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: '#10b981', fontWeight: 600 }}>Connected</span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', marginLeft: 'auto' }}>{shorten(wallet.address)}</span>
              </div>
              {wallet.networkName && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Network: {wallet.networkName}</p>}
              <button onClick={onDisconnect} type="button" style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.1)', color: '#ef4444', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                Disconnect Wallet
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Connect a Web3 wallet to save your scores on the blockchain permanently.</p>
              <button onClick={onConnect} type="button" style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid rgba(168,85,247,0.5)', background: 'rgba(168,85,247,0.15)', color: '#a855f7', fontSize: 13, cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                <Icon name="Wallet" size={15} color="#a855f7" /> Connect Wallet
              </button>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

// ─── Player Dashboard ─────────────────────────────────────────────────────────
function PlayerDashboard({ profile, streak, wallet }: { profile: PlayerProfile; streak: StreakData; wallet?: WalletState }) {
  const level      = profile.level || 1;
  const xpCurrent  = Math.max(0, (profile.xp || 0) - xpForLevel(level));
  const xpNeeded   = Math.max(1, xpForNextLevel(level) - xpForLevel(level));
  const xpPct      = Math.min(100, Math.round((xpCurrent / xpNeeded) * 100));
  const rank       = rankTitle(level);
  const avgScore   = (profile.totalGames || 0) > 0 ? Math.round((profile.totalScoreSum || 0) / profile.totalGames) : 0;
  const rankColor  = level >= 50 ? '#f59e0b' : level >= 30 ? '#a855f7' : level >= 20 ? '#22d3ee' : level >= 10 ? '#38bdf8' : level >= 5 ? '#10b981' : '#94a3b8';
  const [showLevelHelp, setShowLevelHelp] = useState(false);
  const walletConnected = !!wallet?.address;

  return (
    <>
      {showLevelHelp && <LevelHelpModal onClose={() => setShowLevelHelp(false)} />}
      <Section icon="User" iconColor="#22d3ee" title="Player Profile" className="section-card--profile" badge={<span className="db-rank-badge" style={{ borderColor: rankColor, color: rankColor }}>{rank} · Lv.{level}</span>}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
          <div style={{ background: 'rgba(34,211,238,0.07)', border: '1px solid rgba(34,211,238,0.2)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
              <Icon name="Trophy" size={13} color="#22d3ee" />
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Score</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#22d3ee', fontFamily: 'Orbitron, sans-serif' }}>{(profile.highScore || 0).toLocaleString()}</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>Leaderboard ranking only</div>
          </div>
          <div style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
              <Icon name="Coin" size={13} color="#f59e0b" />
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Coins</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#f59e0b', fontFamily: 'Orbitron, sans-serif' }}>{profile.coinBalance || 0}</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>In-game purchases</div>
          </div>
          <div style={{ background: 'rgba(56,189,248,0.07)', border: '1px solid rgba(56,189,248,0.2)', borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
              <Icon name="Xp" size={13} color="#38bdf8" />
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>XP</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#38bdf8', fontFamily: 'Orbitron, sans-serif' }}>{(profile.xp || 0).toLocaleString()}</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>Leveling up</div>
          </div>
          <div style={{ background: `${rankColor}0f`, border: `1px solid ${rankColor}33`, borderRadius: 10, padding: '10px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
              <Icon name="Star" size={13} color={rankColor} />
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Level</span>
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, color: rankColor, fontFamily: 'Orbitron, sans-serif' }}>{level}</div>
            <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>{rank}</div>
          </div>
          {wallet && (
            <div style={{ background: 'rgba(168,85,247,0.07)', border: '1px solid rgba(168,85,247,0.2)', borderRadius: 10, padding: '10px 12px', gridColumn: '1 / -1' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2 }}>
                <Icon name="Wallet" size={13} color="#a855f7" />
                <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Wallet</span>
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#a855f7', fontFamily: 'Orbitron, sans-serif' }}>
                {walletConnected ? shorten(wallet.address as string) : 'Not connected'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-secondary)', marginTop: 2 }}>
                {walletConnected ? 'Eligible to save scores on-chain' : 'Connect to unlock on-chain rewards'}
              </div>
            </div>
          )}
        </div>

        <div className="db-xp-row">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <span style={{ fontSize: 13, color: rankColor, fontWeight: 600 }}>Level {level} → {level + 1}</span>
            <button type="button" onClick={() => setShowLevelHelp(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, display: 'flex', alignItems: 'center' }} title="How do levels work?">
              <Icon name="Info" size={14} color="rgba(186,230,253,0.5)" />
            </button>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>{xpCurrent.toLocaleString()} / {xpNeeded.toLocaleString()} XP</span>
          </div>
          <div className="db-xp-bar-track">
            <div className="db-xp-bar-fill" style={{ width: `${xpPct}%`, background: `linear-gradient(90deg, ${rankColor}99, ${rankColor})` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span className="db-xp-pct">{xpPct}% to Level {level + 1}</span>
            <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>+100 coins on level up</span>
          </div>
        </div>

        <div className="db-stats-grid">
          <div className="db-stat"><Icon name="Surf" size={18} color="#22d3ee" /><span className="db-stat-val">{profile.totalGames || 0}</span><span className="db-stat-lbl">Runs</span></div>
          <div className="db-stat"><Icon name="Chart" size={18} color="#38bdf8" /><span className="db-stat-val">{avgScore.toLocaleString()}</span><span className="db-stat-lbl">Avg Score</span></div>
          <div className="db-stat"><Icon name="Coin" size={18} color="#f59e0b" /><span className="db-stat-val">{(profile.totalCoinsEarned || 0).toLocaleString()}</span><span className="db-stat-lbl">Lifetime Coins</span></div>
          <div className="db-stat"><Icon name="Heart" size={18} color="#f9a8d4" /><span className="db-stat-val">{profile.lives || 0}</span><span className="db-stat-lbl">Free Lives</span></div>
        </div>

        <div className="db-rank-path">
          <span className="db-rank-path-label">Rank Path</span>
          <div className="db-rank-path-steps">
            {[{ name: 'Beginner', minLvl: 1, color: '#94a3b8' }, { name: 'Surfer', minLvl: 5, color: '#10b981' }, { name: 'Veteran', minLvl: 10, color: '#38bdf8' }, { name: 'Expert', minLvl: 20, color: '#22d3ee' }, { name: 'Master', minLvl: 30, color: '#a855f7' }, { name: 'Legend', minLvl: 50, color: '#f59e0b' }].map(r => (
              <div key={r.name} className={`db-rank-step${level >= r.minLvl ? ' active' : ''}`} style={level >= r.minLvl ? { borderColor: r.color, color: r.color, background: `${r.color}18` } : {}}>{r.name}</div>
            ))}
          </div>
        </div>

        {(streak.currentStreak || 0) > 0 && (
          <div className="db-streak-row">
            <div className="db-streak-left">
              <Icon name="Fire" size={16} color="#f97316" />
              <div className="db-streak-text">
                <strong>{streak.currentStreak}-day streak</strong>
                <span className="db-streak-bonus">{streak.currentStreak >= 7 ? '+250' : streak.currentStreak >= 3 ? '+100' : '+50'} bonus coins daily</span>
              </div>
            </div>
            <div className="db-streak-dots">
              {[{ d: 1, label: 'D1' }, { d: 3, label: 'D3' }, { d: 7, label: 'D7' }].map(m => (
                <span key={m.d} className={`db-streak-dot${streak.currentStreak >= m.d ? ' active' : ''}`}>{m.label}</span>
              ))}
            </div>
          </div>
        )}
      </Section>
    </>
  );
}

// ─── Daily Missions ───────────────────────────────────────────────────────────
function DailyMissions({ missions, onClaim }: { missions: Mission[]; onClaim: (id: string) => void }) {
  const claimable          = missions.filter(m => m.completed && !m.claimed).length;
  const done               = missions.filter(m => m.completed).length;
  const inProgress         = missions.filter(m => !m.completed && !m.claimed);
  const completedUnclaimed = missions.filter(m => m.completed && !m.claimed);
  const claimed            = missions.filter(m => m.claimed);

  const renderMission = (m: Mission) => {
    const pct  = Math.min(100, Math.round(((m.progress || 0) / Math.max(1, m.target || 1)) * 100));
    const icon = (m.icon as IconKey) in Ic ? (m.icon as IconKey) : 'Star';
    return (
      <div key={m.id} className={`mission-card${m.claimed ? ' mission-claimed' : m.completed ? ' mission-done' : ''}`}>
        <div className="mission-card-top">
          <div className="mission-icon-wrap"><Icon name={icon} size={18} color={m.completed ? '#10b981' : '#475569'} /></div>
          <div className="mission-body">
            <span className="mission-title">{m.title}</span><span className="mission-desc">{m.desc}</span>
          </div>
          <div className="mission-status-col">
            {m.claimed
              ? <span className="mission-status-tag tag-claimed"><Icon name="Check" size={11} color="#10b981" /> Claimed</span>
              : m.completed
                ? <span className="mission-status-tag tag-done">Complete</span>
                : <span className="mission-status-tag tag-progress">{m.progress || 0}/{m.target}</span>
            }
          </div>
        </div>
        <div className="mission-progress-wrap">
          <div className="mission-bar"><div className={`mission-bar-fill${m.completed ? ' mission-bar-complete' : ''}`} style={{ width: `${pct}%` }} /></div>
          <span className="mission-pct">{pct}%</span>
        </div>
        <div className="mission-card-bottom">
          <span className="mission-reward-label"><Icon name="Coin" size={12} color="#f59e0b" /><span>{m.reward} coins reward</span></span>
          {m.claimed
            ? <span className="mission-claimed-badge"><Icon name="Check" size={12} color="#10b981" /> Claimed</span>
            : m.completed
              ? <button className="mission-claim-btn" onClick={() => onClaim(m.id)} type="button"><Icon name="Coin" size={12} color="#020916" /> Claim +{m.reward}</button>
              : null
          }
        </div>
      </div>
    );
  };

  return (
    <Section icon="Task" iconColor="#10b981" title="Daily Missions" className="section-card--missions" highlight={claimable > 0} badge={
      claimable > 0
        ? <span className="badge-green">{claimable} ready to claim</span>
        : <span className="badge-neutral">{done}/{missions.length} done</span>
    }>
      <div className="missions-list">
        {completedUnclaimed.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '0 2px' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.06em' }}>✓ Completed — Claim Reward</span>
            </div>
            {completedUnclaimed.map(m => renderMission(m))}
          </div>
        )}
        {inProgress.length > 0 && (
          <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '0 2px' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', textTransform: 'uppercase', letterSpacing: '0.06em' }}>In Progress</span>
            </div>
            {inProgress.map(m => renderMission(m))}
          </div>
        )}
        {claimed.length > 0 && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6, padding: '0 2px' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Claimed</span>
            </div>
            {claimed.map(m => renderMission(m))}
          </div>
        )}
      </div>
    </Section>
  );
}

// ─── Power Up Shop ────────────────────────────────────────────────────────────
function PowerUpShop({ coinBalance, onBuy }: { coinBalance: number; onBuy: (key: 'shield' | 'magnet' | 'multiplier') => void }) {
  const SHOP_ITEMS = [
    { key: 'shield' as const, icon: 'Shield' as IconKey, color: '#06b6d4', name: 'Shield', desc: 'Protects you from 1 collision. The shield absorbs the hit so you keep surfing.', cost: SHIELD_COST },
    { key: 'magnet' as const, icon: 'Magnet' as IconKey, color: '#f97316', name: 'Magnet Boost', desc: 'Automatically attracts nearby coins to you for a limited time during a run.', cost: MAGNET_COST },
    { key: 'multiplier' as const, icon: 'Star' as IconKey, color: '#f59e0b', name: 'Score Multiplier', desc: 'Start the run with an active x2 combo multiplier to turbocharge your score.', cost: MULTIPLIER_COST },
  ];

  return (
    <Section icon="Cart" iconColor="#a855f7" title="Reward Store" className="section-card--store" badge={<span className="badge-coins"><Icon name="Coin" size={12} color="#f59e0b" /><span>{coinBalance || 0}</span></span>}>
      <div className="shop-info-bar"><Icon name="Info" size={13} color="#94a3b8" /><span>Buy items with coins, then queue them in your inventory before a run.</span></div>

      <div className="shop-item shop-item-life">
        <div className="shop-item-icon-wrap"><Icon name="Heart" size={22} color="#f9a8d4" /></div>
        <div className="shop-item-details">
          <span className="shop-item-name">Extra Life</span>
          <span className="shop-item-desc">Continue your run from exactly where you wiped out. Purchased automatically on the Game Over screen.</span>
        </div>
        <div className="shop-item-price-col">
          <span className="shop-item-price"><Icon name="Coin" size={13} color="#f59e0b" /><span>{EXTRA_LIFE_COST}</span></span>
          <span className="shop-item-context-note">Game Over screen</span>
        </div>
      </div>

      <div className="shop-item shop-item-life" style={{ opacity: 0.6 }}>
        <div className="shop-item-icon-wrap"><Icon name="Box" size={22} color="#a855f7" /></div>
        <div className="shop-item-details">
          <span className="shop-item-name">Mystery Box</span>
          <span className="shop-item-desc">A surprise reward — could be coins, a boost, or an extra life. Contents are random every time.</span>
        </div>
        <div className="shop-item-price-col">
          <span className="shop-item-price" style={{ color: '#a855f7' }}>Soon</span>
        </div>
      </div>

      {SHOP_ITEMS.map(item => {
        const canAfford = (coinBalance || 0) >= item.cost;
        return (
          <div key={item.key} className={`shop-item shop-item-buyable${!canAfford ? ' shop-item-broke' : ''}`}>
            <div className="shop-item-icon-wrap"><Icon name={item.icon} size={22} color={item.color} /></div>
            <div className="shop-item-details">
              <span className="shop-item-name">{item.name}</span>
              <span className="shop-item-desc">{item.desc}</span>
            </div>
            <div className="shop-item-action">
              <span className="shop-item-price"><Icon name="Coin" size={12} color="#f59e0b" /><span>{item.cost}</span></span>
              <button className={`shop-buy-btn${canAfford ? ' buy-enabled' : ' buy-disabled'}`} onClick={() => canAfford && onBuy(item.key)} disabled={!canAfford} type="button">
                {canAfford ? 'Buy' : `Need ${item.cost - (coinBalance || 0)}`}
              </button>
            </div>
          </div>
        );
      })}
    </Section>
  );
}

// ─── Boost Inventory ──────────────────────────────────────────────────────────
function BoostInventory({ shopPurchases, profile, queuedBoosts, onQueue }: { shopPurchases: ShopPurchase; profile: PlayerProfile; queuedBoosts: Record<string, boolean>; onQueue: (key: 'shield' | 'magnet' | 'multiplier') => void; }) {
  const totalItems = (shopPurchases.shield || 0) + (shopPurchases.magnet || 0) + (shopPurchases.multiplier || 0) + (profile.lives || 0);
  const items = [
    { key: 'shield'     as const, icon: 'Shield' as IconKey, color: '#06b6d4', name: 'Shield',         count: shopPurchases.shield || 0,     desc: 'Absorbs 1 obstacle hit, saving your run.' },
    { key: 'magnet'     as const, icon: 'Magnet' as IconKey, color: '#f97316', name: 'Magnet',         count: shopPurchases.magnet || 0,     desc: 'Pulls nearby coins to you automatically.' },
    { key: 'multiplier' as const, icon: 'Star'   as IconKey, color: '#f59e0b', name: 'x2 Multiplier', count: shopPurchases.multiplier || 0, desc: 'Starts run with an active x2 score combo.' },
    { key: 'life'       as const, icon: 'Heart'  as IconKey, color: '#f9a8d4', name: 'Extra Lives',   count: profile.lives || 0,            desc: 'Used automatically on the Game Over screen.' },
  ];

  return (
    <Section icon="Bag" iconColor="#f59e0b" title="Inventory" className="section-card--inventory" badge={<span className="badge-neutral">{totalItems} owned</span>}>
      {totalItems === 0 ? (
        <div className="inventory-empty"><Icon name="Cart" size={28} color="#334155" /><p>No boosts owned. Visit the Reward Store above to buy some!</p></div>
      ) : (
        <div className="inventory-grid">
          {items.map(item => {
            const isQueued = !!queuedBoosts[item.key as keyof typeof queuedBoosts];
            return (
              <div key={item.key} className={`inv-item${item.count === 0 ? ' inv-item-empty' : ''}`}>
                <div className="inv-icon" style={{ background: `${item.color}18`, borderColor: `${item.color}40` }}>
                  <Icon name={item.icon} size={24} color={item.count > 0 ? item.color : '#334155'} />
                  <span className="inv-count" style={{ color: item.count > 0 ? item.color : '#475569' }}>x{item.count}</span>
                </div>
                <span className="inv-name">{item.name}</span>
                <span className="inv-desc">{item.desc}</span>
                {item.count > 0 && item.key !== 'life' && (
                  <button
                    className="inv-activate-btn"
                    style={{ borderColor: isQueued ? '#10b981' : item.color, color: isQueued ? '#10b981' : item.color }}
                    onClick={() => !isQueued && onQueue(item.key as 'shield' | 'magnet' | 'multiplier')}
                    disabled={isQueued}
                    type="button"
                  >
                    {isQueued ? 'Queued ✓' : 'Queue Next Run'}
                  </button>
                )}
                {item.key === 'life' && item.count > 0 && <span className="inv-life-note">Auto-used on Game Over</span>}
                {item.count === 0 && <span className="inv-empty-label">None owned</span>}
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

// ─── Post Game Summary ────────────────────────────────────────────────────────
function PostGameSummary({ finalScore, finalCoins, coinBalance, isNewRecord, xpEarned, newLevel }: { finalScore: number; finalCoins: number; coinBalance: number; isNewRecord: boolean; xpEarned: number; newLevel: number | null }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="pgs-card">
      <button className="pgs-header" onClick={() => setOpen(o => !o)} type="button">
        <Icon name="Chart" size={16} color="#22d3ee" /><span>Run Summary</span>
        {isNewRecord && <span className="pgs-new-record">New Record!</span>}
        <span className="pgs-chevron"><Icon name={open ? 'ChevronUp' : 'ChevronDown'} size={14} color="rgba(186,230,253,0.4)" /></span>
      </button>
      {open && (
        <div className="pgs-body">
          <div className="pgs-score-card">
            <div className="pgs-score-row">
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="pgs-score-label">Score</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Leaderboard ranking</span>
              </div>
              <span className="pgs-score-value" style={{ color: '#22d3ee' }}>{(finalScore || 0).toLocaleString()}</span>
            </div>
            <div className="pgs-divider" />
            <div className="pgs-score-row">
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="pgs-score-label">Coin Balance</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Available for store</span>
              </div>
              <span className="pgs-score-value" style={{ color: '#a855f7' }}><Icon name="Coin" size={16} color="#a855f7" /><span>{coinBalance || 0}</span></span>
            </div>
            <div className="pgs-divider" />
            <div className="pgs-score-row">
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="pgs-score-label">Coins Earned</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Added this run</span>
              </div>
              <span className="pgs-score-value" style={{ color: '#f59e0b' }}><Icon name="Coin" size={16} color="#f59e0b" /><span>+{finalCoins || 0}</span></span>
            </div>
            <div className="pgs-divider" />
            <div className="pgs-score-row">
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span className="pgs-score-label">XP Earned</span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>Progress toward next level</span>
              </div>
              <span className="pgs-score-value" style={{ color: '#38bdf8' }}><Icon name="Xp" size={16} color="#38bdf8" /><span>+{xpEarned || 0}</span></span>
            </div>
          </div>
          {newLevel !== null && <div className="pgs-level-up"><Icon name="Star" size={18} color="#f59e0b" /><span>Level Up! You are now <strong>Level {newLevel}</strong> · +100 Coins!</span></div>}
        </div>
      )}
    </div>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────────────
function SettingsPanel({ soundEnabled, reducedAnimations, onToggleSound, onToggleAnimations, onResetProgress, onReplayTutorial }: { soundEnabled: boolean; reducedAnimations: boolean; onToggleSound: () => void; onToggleAnimations: () => void; onResetProgress: () => void; onReplayTutorial: () => void }) {
  const [confirmReset, setConfirmReset] = useState(false);
  return (
    <Section icon="Settings" iconColor="#94a3b8" title="Settings">
      <div className="settings-list">
        <div className="settings-row" style={{ background: 'var(--glass-2)', borderRadius: 10, padding: '12px 14px' }}>
          <div className="settings-info">
            <Icon name={soundEnabled ? 'Volume' : 'VolumeOff'} size={18} color={soundEnabled ? '#22d3ee' : '#475569'} />
            <div>
              <span className="settings-label">Sound Effects</span>
              <span className="settings-sub">{soundEnabled ? '🔊 Audio is on' : '🔇 Audio is off'}</span>
            </div>
          </div>
          <button className={`settings-toggle${soundEnabled ? ' toggle-on' : ' toggle-off'}`} onClick={onToggleSound} type="button"><span className="toggle-knob" /></button>
        </div>
        <div className="settings-row">
          <div className="settings-info"><Icon name="Bolt" size={16} color={!reducedAnimations ? '#22d3ee' : '#475569'} /><div><span className="settings-label">Animations</span><span className="settings-sub">{reducedAnimations ? 'Reduced (better performance)' : 'Full animations'}</span></div></div>
          <button className={`settings-toggle${!reducedAnimations ? ' toggle-on' : ' toggle-off'}`} onClick={onToggleAnimations} type="button"><span className="toggle-knob" /></button>
        </div>
        <div className="settings-reset-area">
          <button className="settings-reset-btn" style={{ color: '#22d3ee', borderColor: '#22d3ee', marginBottom: 8 }} onClick={onReplayTutorial} type="button">
            <Icon name="Info" size={14} color="#22d3ee" /> Replay Tutorial
          </button>
          {!confirmReset ? (
            <button className="settings-reset-btn" onClick={() => setConfirmReset(true)} type="button"><Icon name="Refresh" size={14} color="#ef4444" /> Reset All Local Progress</button>
          ) : (
            <div className="settings-confirm">
              <p>Permanently clear all coins, levels, missions and scores?</p>
              <div className="settings-confirm-btns">
                <button className="settings-confirm-yes" onClick={() => { onResetProgress(); setConfirmReset(false); }} type="button">Yes, reset</button>
                <button className="settings-confirm-no" onClick={() => setConfirmReset(false)} type="button">Cancel</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </Section>
  );
}

// ─── Rules Modal ──────────────────────────────────────────────────────────────
function RulesModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="rules-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-left"><span className="modal-header-icon"><Icon name="Wave" size={22} color="#22d3ee" /></span><div><h2>How to Play</h2><p>Surf Rush Rules &amp; Info</p></div></div>
          <button className="modal-close" onClick={onClose} type="button"><Icon name="Close" size={14} color="currentColor" /></button>
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
            <div className="modal-section-title">Currencies &amp; Progression</div>
            <div className="svc-grid">
              <div className="svc-block svc-score"><span className="svc-title">Score Points</span><ul><li>Earned by surviving</li><li>Used for Leaderboard ranking only</li></ul></div>
              <div className="svc-block svc-coins"><span className="svc-title">Coins</span><ul><li>Collected in-game</li><li>Used in Reward Store for shields, magnets &amp; lives</li></ul></div>
              <div className="svc-block svc-xp" style={{ borderColor: 'rgba(56, 189, 248, 0.2)' }}><span className="svc-title">XP (Experience)</span><ul><li>Earned per run based on score</li><li>Fills your level bar — level up for +100 Coins</li></ul></div>
              <div className="svc-block svc-wallet" style={{ borderColor: 'rgba(168, 85, 247, 0.2)' }}><span className="svc-title">Wallet Rewards</span><ul><li>Separate blockchain feature</li><li>Connect wallet to save scores on-chain permanently</li></ul></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Tutorial Modal ───────────────────────────────────────────────────────────
function TutorialModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const steps = [
    { title: 'Welcome to Surf Rush!', desc: 'Ride the waves, dodge obstacles, and collect as many coins as you can. Complete missions and level up to unlock rewards!', icon: 'Wave' as IconKey, color: '#22d3ee' },
    {
      title: 'Controls',
      desc: 'Use ← → arrow keys, A/D keys, or swipe left/right on mobile to switch lanes. Press Space or P to pause at any time.',
      icon: 'Swirl' as IconKey, color: '#a855f7',
      extra: (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
          {[{ key: '← →  / A D', desc: 'Switch lane' }, { key: 'Space / P', desc: 'Pause game' }, { key: 'Swipe', desc: 'Mobile lane switch' }, { key: 'Tap ⟨ ⟩', desc: 'On-screen buttons' }].map(c => (
            <div key={c.key} style={{ background: 'rgba(168,85,247,0.1)', borderRadius: 8, padding: '8px 10px', textAlign: 'left' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#a855f7', marginBottom: 2 }}>{c.key}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{c.desc}</div>
            </div>
          ))}
        </div>
      ),
    },
    {
      title: 'Coins & XP',
      desc: 'Collect gold coins on the wave to earn Coins (for the store) and XP (for leveling up). More score = more XP per run.',
      icon: 'Coin' as IconKey, color: '#f59e0b',
      extra: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, textAlign: 'left' }}>
          <div style={{ background: 'rgba(245,158,11,0.1)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', marginBottom: 3 }}>Coins</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Used to buy Shields, Magnets, and Extra Lives in the Reward Store.</div>
          </div>
          <div style={{ background: 'rgba(56,189,248,0.1)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#38bdf8', marginBottom: 3 }}>XP</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Fills your level bar. Level up to earn +100 Coins bonus each time!</div>
          </div>
        </div>
      ),
    },
    {
      title: 'Shields & Magnets',
      desc: 'Buy power-ups from the Reward Store with coins, then queue them in your Inventory before starting a run.',
      icon: 'Shield' as IconKey, color: '#06b6d4',
      extra: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, textAlign: 'left' }}>
          <div style={{ background: 'rgba(6,182,212,0.1)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#06b6d4', marginBottom: 3 }}>🛡 Shield</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Absorbs 1 obstacle collision. You keep surfing instead of wiping out. A bright ring appears when active.</div>
          </div>
          <div style={{ background: 'rgba(249,115,22,0.1)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f97316', marginBottom: 3 }}>🧲 Magnet</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Automatically pulls nearby coins toward you during the run. Orange glow appears when active.</div>
          </div>
        </div>
      ),
    },
    {
      title: 'Daily Missions',
      desc: 'Complete daily challenges like "Play 3 games" or "Collect 50 coins" to earn bonus coin rewards. Missions reset every day.',
      icon: 'Task' as IconKey, color: '#10b981',
      extra: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, textAlign: 'left' }}>
          <div style={{ background: 'rgba(16,185,129,0.1)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981', marginBottom: 3 }}>✓ How it works</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Progress is tracked automatically as you play. Claim your coin reward as soon as a mission is complete.</div>
          </div>
          <div style={{ background: 'rgba(16,185,129,0.1)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981', marginBottom: 3 }}>🔄 Resets daily</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Check back each day for a fresh set of missions and rewards.</div>
          </div>
        </div>
      ),
    },
    {
      title: 'Lives',
      desc: 'Wiped out? You can continue your run from exactly where you crashed using a free life or by spending 100 coins.',
      icon: 'Heart' as IconKey, color: '#f9a8d4',
      extra: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, textAlign: 'left' }}>
          <div style={{ background: 'rgba(249,164,196,0.1)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f9a8d4', marginBottom: 3 }}>❤ Free Lives</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Earned through leveling up and streaks. Used automatically on the Game Over screen.</div>
          </div>
          <div style={{ background: 'rgba(249,164,196,0.1)', borderRadius: 8, padding: '10px 12px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#f9a8d4', marginBottom: 3 }}>🪙 Buy a Life</div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No free lives left? Spend 100 coins on the Game Over screen to keep surfing.</div>
          </div>
        </div>
      ),
    },
  ];

  const cur = steps[step] ?? steps[0];

  return (
    <div className="modal-overlay">
      <div className="rules-modal" style={{ maxWidth: 420, padding: '28px 22px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
          {steps.map((_, i) => (
            <div key={i} onClick={() => setStep(i)} style={{ width: i === step ? 22 : 8, height: 8, borderRadius: 4, background: i === step ? cur.color : 'var(--glass-3)', cursor: 'pointer', transition: 'all 0.25s' }} />
          ))}
        </div>
        <div style={{ textAlign: 'center' }}>
          <Icon name={cur.icon} size={48} color={cur.color} />
          <h2 style={{ marginTop: 14, fontFamily: 'Orbitron, sans-serif', color: cur.color, fontSize: 18 }}>{cur.title}</h2>
          <p style={{ marginTop: 10, color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.6 }}>{cur.desc}</p>
        </div>
        {(cur as any).extra && <div>{(cur as any).extra}</div>}
        <div style={{ marginTop: 24, display: 'flex', gap: 10 }}>
          <button onClick={onClose} type="button" style={{ flex: 1, padding: '12px', borderRadius: 10, background: 'var(--glass-2)', color: 'rgba(186,230,253,0.7)', border: '1px solid var(--border-2)', cursor: 'pointer', fontSize: 14 }}>
            Skip
          </button>
          <button onClick={() => { if (step < steps.length - 1) setStep(s => s + 1); else onClose(); }} type="button" style={{ flex: 2, padding: '12px', borderRadius: 10, background: cur.color, color: '#020916', fontWeight: 700, border: 'none', cursor: 'pointer', fontSize: 14 }}>
            {step < steps.length - 1 ? `Next (${step + 1}/${steps.length})` : 'Start Surfing! 🏄'}
          </button>
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
        {(streak.currentStreak || 0) > 0 && <div className="start-streak"><Icon name="Fire" size={14} color="#f97316" /><span>{streak.currentStreak}-day streak!</span></div>}
        {(profile.totalGames || 0) > 0 && (
          <div className="start-stats-row">
            <div className="start-stat"><span className="ss-val">{(profile.highScore || 0).toLocaleString()}</span><span className="ss-lbl">Best</span></div>
            <div className="start-stat"><span className="ss-val">{profile.totalGames || 0}</span><span className="ss-lbl">Runs</span></div>
            <div className="start-stat"><span className="ss-val">Lv.{profile.level || 1}</span><span className="ss-lbl">{rankTitle(profile.level || 1)}</span></div>
          </div>
        )}
        <button className="play-btn" onClick={onStart} type="button">START SURFING</button>
        <div className="start-instructions">
          <span className="inst-item"><kbd>Left / Right</kbd> Switch lane</span>
          <span className="inst-item"><kbd>Space</kbd> Pause</span>
          <span className="inst-item">Swipe on mobile</span>
        </div>
      </div>
    </div>
  );
}

// ─── Game Over Overlay ────────────────────────────────────────────────────────
function GameOverOverlay({
  finalScore, finalCoins, coinBalance, isNewRecord,
  txLoading, txPhase, txMsg, wallet, lives,
  postGame, onRestart, onShare, onCopyScore, onSaveOnChain, onConnectWallet, onBuyLife,
}: {
  finalScore: number; finalCoins: number; coinBalance: number; isNewRecord: boolean;
  txLoading: boolean; txPhase: TxPhase; txMsg: string | null; wallet: WalletState; lives: number;
  postGame: { xpEarned: number; newLevel: number | null };
  onRestart: () => void; onShare: () => void; onCopyScore: () => void;
  onSaveOnChain: () => void; onConnectWallet: () => void; onBuyLife: () => void;
}) {
  const canAffordLife = (coinBalance || 0) >= EXTRA_LIFE_COST;
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [shareFeedback, setShareFeedback] = useState(false);

  const handleCopy = () => {
    try { onCopyScore(); } catch {}
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2500);
  };

  const handleShare = () => {
    try { onShare(); } catch {}
    setShareFeedback(true);
    setTimeout(() => setShareFeedback(false), 2500);
  };

  return (
    <div className="overlay gameover-overlay">
      <div className="gameover-modal">
        {isNewRecord && <div className="new-record-banner"><Icon name="Trophy" size={12} color="#020916" /> NEW RECORD</div>}
        <div className="go-header"><h2 className="go-title">WIPEOUT!</h2><p className="go-sub">Your run ended. Claim rewards or surf again.</p></div>
        <PostGameSummary
          finalScore={finalScore || 0}
          finalCoins={finalCoins || 0}
          coinBalance={coinBalance || 0}
          isNewRecord={isNewRecord}
          xpEarned={postGame?.xpEarned || 0}
          newLevel={postGame?.newLevel ?? null}
        />

        <div className="go-card go-card-life">
          <div className="go-card-header">
            <div className="go-card-title-row"><Icon name="Heart" size={16} color="#f9a8d4" /><span className="go-card-title">Extra Life</span></div>
            <span className="go-lives-tag">{lives > 0 ? `${lives} free available` : 'No free lives'}</span>
          </div>
          <p className="go-card-desc">Continue your run from exactly where you crashed.</p>
          <div className="go-life-btns">
            {lives > 0 && <button className="go-btn go-btn-free-life" onClick={onBuyLife} type="button"><Icon name="Heart" size={15} color="#020916" />Use Free Life ({lives} left)</button>}
            <button className={`go-btn${canAffordLife ? ' go-btn-buy-life' : ' go-btn-disabled'}`} onClick={canAffordLife ? onBuyLife : undefined} disabled={!canAffordLife} type="button">
              <Icon name="Coin" size={14} color={canAffordLife ? '#f9a8d4' : '#475569'} /> Buy Life — {EXTRA_LIFE_COST} coins
            </button>
          </div>
        </div>

        <div className="go-card" style={{ marginTop: 10, background: 'var(--glass-2)', border: '1px solid var(--border-2)' }}>
          <div className="go-card-header">
            <div className="go-card-title-row"><Icon name="Share" size={16} color="#22d3ee" /><span className="go-card-title">Share Your Score</span></div>
          </div>
          <p className="go-card-desc" style={{ margin: '4px 0 10px' }}>Let your friends know how you did!</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              className="go-btn go-btn-share"
              onClick={handleCopy}
              type="button"
              style={copyFeedback ? { background: 'rgba(16,185,129,0.2)', borderColor: '#10b981', color: '#10b981', border: '1px solid' } : {}}
            >
              {copyFeedback ? <><Icon name="Check" size={15} color="#10b981" /> Copied to clipboard!</> : <><Icon name="Copy" size={15} color="currentColor" /> Copy Score</>}
            </button>
            <button
              className="go-btn"
              onClick={handleShare}
              type="button"
              style={shareFeedback
                ? { background: 'rgba(16,185,129,0.2)', border: '1px solid #10b981', color: '#10b981' }
                : { background: 'rgba(34,211,238,0.15)', border: '1px solid rgba(34,211,238,0.5)', color: '#22d3ee' }
              }
            >
              {shareFeedback ? <><Icon name="Check" size={15} color="#10b981" /> Shared on Telegram!</> : <><Icon name="Telegram" size={15} color="currentColor" /> Share on Telegram</>}
            </button>
          </div>
        </div>

        <div className="go-actions" style={{ marginTop: 10 }}>
          <button className="go-btn go-btn-restart" onClick={onRestart} type="button"><Icon name="Surf" size={16} color="#020916" /> Surf Again</button>
        </div>

        <div className="go-onchain">
          {REWARD_CONTRACT_DEPLOYED ? (
            wallet?.signer
              ? <button className="go-link-btn" onClick={onSaveOnChain} disabled={txLoading} type="button">
                  {txLoading ? <span className="spinner" /> : <><Icon name="Chain" size={13} color="currentColor" /> Save Score On-Chain</>}
                </button>
              : <button className="go-link-btn" onClick={onConnectWallet} type="button">Connect Wallet to Save Score</button>
          ) : <p className="go-onchain-note">On-chain saving requires a deployed contract.</p>}
        </div>
        {txMsg && <div className={`tx-status ${txPhase === 'confirmed' ? 'tx-success' : txPhase === 'failed' ? 'tx-error' : 'tx-pending'}`}>{txMsg}</div>}
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
function App() {
  const canvasRef   = useRef<HTMLCanvasElement | null>(null);
  const gameAreaRef = useRef<HTMLDivElement | null>(null);
  const engineRef   = useRef<GameEngine | null>(null);
  const walletRef   = useRef<WalletState>({ address: null, provider: null, signer: null, chainId: null, networkName: null });

  // Screen
  const [screen, setScreen]       = useState<Screen>('start');

  // Game state (during play)
  const [gameState, setGameState] = useState<GameState | null>(null);

  // Post-game
  const [finalScore, setFinalScore]   = useState(0);
  const [finalCoins, setFinalCoins]   = useState(0);
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [lives, setLives]             = useState(0);
  const [pgXp, setPgXp]               = useState(0);
  const [pgNewLevel, setPgNewLevel]   = useState<number | null>(null);

  // Wallet
  const [wallet, setWalletState]     = useState<WalletState>({ address: null, provider: null, signer: null, chainId: null, networkName: null });
  const [walletErr, setWalletErr]    = useState<string | null>(null);
  const [txPhase, setTxPhase]        = useState<TxPhase>('idle');
  const [txMsg, setTxMsg]            = useState<string | null>(null);

  // Leaderboard
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);

  // Modals
  const [showRules, setShowRules]       = useState(false);
  const [showTutorial, setShowTutorial] = useState(() => { try { return !localStorage.getItem('srTutorialSeen'); } catch { return true; } });

  // Daily reward
  const [lastClaim, setLastClaim]       = useState<number | null>(() => { try { const s = localStorage.getItem('surfRushLastClaim'); return s ? Number(s) : null; } catch { return null; } });
  const [claimLoading, setClaimLoading] = useState(false);

  // Profile / missions / streak / shop
  const [profile, setProfile]             = useState<PlayerProfile>(() => { try { return getProfile(); } catch { return { totalGames: 0, highScore: 0, totalCoinsEarned: 0, dailyRewardsClaimed: 0, coinBalance: 0, totalObstaclesAvoided: 0, totalScoreSum: 0, xp: 0, level: 1, lives: 0 }; } });
  const [missions, setMissions]           = useState<Mission[]>(() => { try { return getMissions(); } catch { return []; } });
  const [streak, setStreak]               = useState<StreakData>(() => { try { return getStreak(); } catch { return { currentStreak: 0, lastPlayDate: null }; } });
  const [shopPurchases, setShopPurchases] = useState<ShopPurchase>(() => { try { return getShopPurchases(); } catch { return { shield: 0, magnet: 0, multiplier: 0 }; } });
  const [queuedBoosts, setQueuedBoosts]   = useState<{ shield: boolean; magnet: boolean; multiplier: boolean }>({ shield: false, magnet: false, multiplier: false });

  // UI
  const [toasts, setToasts]                     = useState<ToastItem[]>([]);
  const [soundEnabled, setSoundEnabled]         = useState(() => { try { return localStorage.getItem('srSound') !== 'off'; } catch { return true; } });
  const [reducedAnimations, setReducedAnimations] = useState(() => { try { return localStorage.getItem('srReducedAnim') === 'on'; } catch { return false; } });

  // HUD animation triggers
  const [scoreAnim, setScoreAnim] = useState(false);
  const [coinAnim, setCoinAnim]   = useState(false);

  const coinBalance = profile.coinBalance ?? 0;
  const canClaim    = !lastClaim || Date.now() - lastClaim >= 24 * 3600 * 1000;

  // ── Toast helper ─────────────────────────────────────────────────────────────
  const addToast = useCallback((msg: string, icon: IconKey, color: string) => {
    const id = ++_toastId;
    setToasts(p => [...p, { id, msg, icon, color }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 4000);
  }, []);

  const dismissToast = useCallback((id: number) => {
    setToasts(p => p.filter(t => t.id !== id));
  }, []);

  // ── Init ─────────────────────────────────────────────────────────────────────
  useEffect(() => {
    sfx.enabled = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    try { initTelegram(); } catch {}
    try { setLeaderboard(getLeaderboard()); } catch {}
  }, []);

  // ── Mission advance ───────────────────────────────────────────────────────────
  const advanceMissions = useCallback((type: 'coins' | 'games' | 'score' | 'life', value: number) => {
    try {
      const cur = getMissions();
      let changed = false;
      const updated = cur.map(m => {
        if (m.claimed) return m;
        let np = m.progress || 0;
        if (type === 'coins'  && (m.id === 'm2' || m.id === 'collect_coins'))  np = Math.min(m.target, np + value);
        if (type === 'games'  && (m.id === 'm1' || m.id === 'play_games'))     np = Math.min(m.target, np + value);
        if (type === 'score'  && (m.id === 'm3' || m.id === 'reach_score'))    np = Math.max(np, value);
        if (type === 'life'   && (m.id === 'use_extra_life'))                  np = Math.min(m.target, np + value);
        const completed = np >= m.target;
        if (np !== (m.progress || 0) || completed !== m.completed) changed = true;
        return { ...m, progress: np, completed };
      });
      if (changed) { saveMissions(updated); setMissions(updated); }
      return updated;
    } catch (e) {
      console.error('advanceMissions error:', e);
      return missions;
    }
  }, [missions]);

  // ── Engine init ───────────────────────────────────────────────────────────────
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

    try {
      const engine = new GameEngine(canvas, {
        onStateChange: (s: GameState) => {
          if (!s) return;
          setGameState(s);
        },
        onGameOver: (finalScoreRaw: number, finalCoinsRaw: number, obstaclesAvoided: number) => {
          try {
            // Sanitize values
            const fScore = Number.isFinite(finalScoreRaw) ? Math.max(0, finalScoreRaw) : 0;
            const fCoins = Number.isFinite(finalCoinsRaw) ? Math.max(0, finalCoinsRaw) : 0;
            const fObs   = Number.isFinite(obstaclesAvoided) ? Math.max(0, obstaclesAvoided) : 0;

            // Load fresh profile to avoid stale reads
            let p: PlayerProfile;
            try { p = getProfile(); } catch { p = { totalGames: 0, highScore: 0, totalCoinsEarned: 0, dailyRewardsClaimed: 0, coinBalance: 0, totalObstaclesAvoided: 0, totalScoreSum: 0, xp: 0, level: 1, lives: 0 }; }

            const newRecord = fScore > (p.highScore || 0);
            const xpEarned  = xpForRun(fScore);
            const newXp     = Math.max(0, (p.xp || 0) + xpEarned);
            const oldLevel  = p.level || 1;
            const newLevel  = levelFromXp(newXp);
            const leveledUp = newLevel > oldLevel;
            const levelUpCoins = leveledUp ? (newLevel - oldLevel) * 100 : 0;
            const newBalance   = Math.max(0, (p.coinBalance || 0) + fCoins + levelUpCoins);

            const updatedProfile: PlayerProfile = {
              ...p,
              totalGames:            Math.max(0, (p.totalGames || 0) + 1),
              highScore:             newRecord ? fScore : (p.highScore || 0),
              totalCoinsEarned:      Math.max(0, (p.totalCoinsEarned || 0) + fCoins),
              coinBalance:           newBalance,
              totalObstaclesAvoided: Math.max(0, (p.totalObstaclesAvoided || 0) + fObs),
              totalScoreSum:         Math.max(0, (p.totalScoreSum || 0) + fScore),
              xp:                    newXp,
              level:                 newLevel,
            };

            try { saveProfile(updatedProfile); } catch {}

            // Save to leaderboard
            try {
              const tgUser = getTelegramUser();
              const name   = tgUser?.first_name || tgUser?.username || 'Surfer';
              saveToLeaderboard({ name, score: fScore, coins: fCoins, date: new Date().toISOString().slice(0, 10) });
              setLeaderboard(getLeaderboard());
            } catch {}

            // Advance missions
            try {
              const ms1 = getMissions();
              let ms2 = ms1.map(m => {
                if (m.claimed) return m;
                let np = m.progress || 0;
                if (m.id === 'play_games' || m.id === 'm1')     np = Math.min(m.target, np + 1);
                if (m.id === 'collect_coins' || m.id === 'm2')  np = Math.min(m.target, np + fCoins);
                if (m.id === 'reach_score' || m.id === 'm3')    np = Math.max(np, fScore);
                const completed = np >= m.target;
                return { ...m, progress: np, completed };
              });
              saveMissions(ms2);
              setMissions(ms2);
            } catch {}

            // Streak
            try {
              const streakResult = updateStreak();
              setStreak(streakResult.streak);
              if (streakResult.isNewDay && streakResult.bonusCoins > 0) {
                addToast(`+${streakResult.bonusCoins} streak bonus!`, 'Fire', '#f97316');
              }
            } catch {}

            // Unlock achievements
            try {
              if (newRecord && unlockAchievement('first_run')) addToast('Achievement: First Wave!', 'Star', '#f59e0b');
              if (fScore >= 100  && unlockAchievement('score_100'))  addToast('Achievement: On The Board!', 'Trophy', '#f59e0b');
              if (fScore >= 500  && unlockAchievement('score_500'))  addToast('Achievement: Wave Rider!', 'Trophy', '#f59e0b');
              if (fScore >= 1000 && unlockAchievement('score_1000')) addToast('Achievement: Surf Legend!', 'Trophy', '#a855f7');
              if (updatedProfile.totalGames >= 10  && unlockAchievement('games_10'))  addToast('Achievement: Regular Rider!', 'Surf', '#22d3ee');
              if (updatedProfile.totalGames >= 50  && unlockAchievement('games_50'))  addToast('Achievement: Surf Addict!', 'Wave', '#a855f7');
              if (newLevel >= 5  && unlockAchievement('level_5'))  {}
              if (newLevel >= 10 && unlockAchievement('level_10')) {}
            } catch {}

            if (leveledUp) {
              addToast(`Level Up! Now Level ${newLevel} · +${levelUpCoins} coins!`, 'Star', '#f59e0b');
              try { sfx.levelup?.(); } catch {}
            }
            if (newRecord) {
              addToast('New high score!', 'Trophy', '#22d3ee');
            }

            // Consume queued boosts
            try {
              const sp = getShopPurchases();
              setShopPurchases(sp);
            } catch {}

            // Update state atomically THEN switch screen
            setProfile(updatedProfile);
            setFinalScore(fScore);
            setFinalCoins(fCoins);
            setIsNewRecord(newRecord);
            setLives(updatedProfile.lives || 0);
            setPgXp(xpEarned);
            setPgNewLevel(leveledUp ? newLevel : null);

            // Switch to gameover screen — delayed slightly to ensure all state updates flush
            setTimeout(() => {
              setScreen('gameover');
            }, 0);
          } catch (e) {
            console.error('onGameOver handler error:', e);
            // Safe fallback: always show gameover even if something crashed
            setScreen('gameover');
          }
        },
        onCoinCollect: (_x: number, _y: number) => {
          setCoinAnim(true);
          setTimeout(() => setCoinAnim(false), 400);
        },
      });
      engineRef.current = engine;
    } catch (e) {
      console.error('GameEngine creation error:', e);
    }
  }, [addToast]);

  // ── Input handling ────────────────────────────────────────────────────────────
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!engineRef.current) return;
      if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') { e.preventDefault(); engineRef.current.moveLeft(); }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { e.preventDefault(); engineRef.current.moveRight(); }
      if (e.key === ' ' || e.key === 'p' || e.key === 'P') { e.preventDefault(); engineRef.current.togglePause(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Touch / swipe handling
  useEffect(() => {
    let touchStartX = 0;
    const onTouchStart = (e: TouchEvent) => { touchStartX = e.touches[0]?.clientX ?? 0; };
    const onTouchEnd   = (e: TouchEvent) => {
      if (!engineRef.current) return;
      const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartX;
      if (Math.abs(dx) > 30) { if (dx < 0) engineRef.current.moveLeft(); else engineRef.current.moveRight(); }
    };
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchend',   onTouchEnd,   { passive: true });
    return () => { window.removeEventListener('touchstart', onTouchStart); window.removeEventListener('touchend', onTouchEnd); };
  }, []);

  // ── Wallet chain subscription ─────────────────────────────────────────────────
  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = subscribeToChainChanges((w) => {
        walletRef.current = w;
        setWalletState({ ...w });
      });
    } catch {}
    return () => { try { unsub?.(); } catch {} };
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────────────

  const handleStart = useCallback(() => {
    try {
      setScreen('playing');
      setGameState(null);
      // Apply queued boosts
      const opts = {
        startWithShield:     queuedBoosts.shield,
        startWithMagnet:     queuedBoosts.magnet,
        startWithMultiplier: queuedBoosts.multiplier,
      };
      // Consume queued boosts from inventory
      if (queuedBoosts.shield || queuedBoosts.magnet || queuedBoosts.multiplier) {
        try {
          const sp = getShopPurchases();
          const updated: ShopPurchase = {
            shield:     Math.max(0, sp.shield     - (queuedBoosts.shield     ? 1 : 0)),
            magnet:     Math.max(0, sp.magnet     - (queuedBoosts.magnet     ? 1 : 0)),
            multiplier: Math.max(0, sp.multiplier - (queuedBoosts.multiplier ? 1 : 0)),
          };
          saveShopPurchases(updated);
          setShopPurchases(updated);
        } catch {}
        setQueuedBoosts({ shield: false, magnet: false, multiplier: false });
      }
      // Slight delay to let the canvas mount
      setTimeout(() => {
        if (engineRef.current) {
          try { engineRef.current.start(opts); } catch (e) { console.error('engine.start error:', e); }
        }
      }, 50);
    } catch (e) {
      console.error('handleStart error:', e);
      setScreen('start'); // safe fallback
    }
  }, [queuedBoosts]);

  const handleRestart = useCallback(() => {
    try {
      setScreen('playing');
      setGameState(null);
      setFinalScore(0);
      setFinalCoins(0);
      setIsNewRecord(false);
      setPgXp(0);
      setPgNewLevel(null);
      // Refresh profile in case daily reward was claimed on game over screen
      try { setProfile(getProfile()); } catch {}
      setTimeout(() => {
        if (engineRef.current) {
          try { engineRef.current.restart({}); } catch (e) { console.error('engine.restart error:', e); }
        }
      }, 50);
    } catch (e) {
      console.error('handleRestart error:', e);
      setScreen('start');
    }
  }, []);

  const handleBuyLife = useCallback(() => {
    if (!engineRef.current) return;
    try {
      let p: PlayerProfile;
      try { p = getProfile(); } catch { return; }

      if ((p.lives || 0) > 0) {
        // Use free life
        const updated: PlayerProfile = { ...p, lives: Math.max(0, (p.lives || 0) - 1) };
        try { saveProfile(updated); setProfile(updated); } catch {}
        engineRef.current.addLife(0);
        setLives(updated.lives);
        setScreen('playing');
        advanceMissions('life', 1);
        try { unlockAchievement('buy_extra_life'); } catch {}
        addToast('Free life used! Keep surfing!', 'Heart', '#f9a8d4');
      } else if ((p.coinBalance || 0) >= EXTRA_LIFE_COST) {
        // Buy life with coins
        const updated: PlayerProfile = { ...p, coinBalance: Math.max(0, (p.coinBalance || 0) - EXTRA_LIFE_COST) };
        try { saveProfile(updated); setProfile(updated); } catch {}
        engineRef.current.addLife(EXTRA_LIFE_COST);
        setLives(0);
        setScreen('playing');
        advanceMissions('life', 1);
        try { unlockAchievement('buy_extra_life'); } catch {}
        addToast(`Life purchased! -${EXTRA_LIFE_COST} coins`, 'Heart', '#f9a8d4');
      } else {
        addToast('Not enough coins for a life!', 'Coin', '#ef4444');
      }
    } catch (e) {
      console.error('handleBuyLife error:', e);
    }
  }, [addToast, advanceMissions]);

  const handleBuyShopItem = useCallback((key: 'shield' | 'magnet' | 'multiplier') => {
    try {
      const cost = key === 'shield' ? SHIELD_COST : key === 'magnet' ? MAGNET_COST : MULTIPLIER_COST;
      let p: PlayerProfile;
      try { p = getProfile(); } catch { return; }
      if ((p.coinBalance || 0) < cost) { addToast('Not enough coins!', 'Coin', '#ef4444'); return; }
      const updatedProfile: PlayerProfile = { ...p, coinBalance: Math.max(0, (p.coinBalance || 0) - cost) };
      try { saveProfile(updatedProfile); setProfile(updatedProfile); } catch {}
      const sp = getShopPurchases();
      const updatedSp: ShopPurchase = { ...sp, [key]: Math.max(0, (sp[key] || 0) + 1) };
      try { saveShopPurchases(updatedSp); setShopPurchases(updatedSp); } catch {}
      addToast(`${key.charAt(0).toUpperCase() + key.slice(1)} purchased! -${cost} coins`, key === 'shield' ? 'Shield' : key === 'magnet' ? 'Magnet' : 'Star', '#22d3ee');
      try { sfx.reward?.(); } catch {}
    } catch (e) {
      console.error('handleBuyShopItem error:', e);
    }
  }, [addToast]);

  const handleQueueBoost = useCallback((key: 'shield' | 'magnet' | 'multiplier') => {
    setQueuedBoosts(prev => ({ ...prev, [key]: true }));
    addToast(`${key.charAt(0).toUpperCase() + key.slice(1)} queued for next run!`, key === 'shield' ? 'Shield' : key === 'magnet' ? 'Magnet' : 'Star', '#22d3ee');
  }, [addToast]);

  const handleClaimMission = useCallback((id: string) => {
    try {
      const cur = getMissions();
      const mission = cur.find(m => m.id === id);
      if (!mission || !mission.completed || mission.claimed) return;
      const reward = mission.reward || 0;
      const updated = cur.map(m => m.id === id ? { ...m, claimed: true } : m);
      try { saveMissions(updated); setMissions(updated); } catch {}
      // Credit coins
      let p: PlayerProfile;
      try { p = getProfile(); } catch { return; }
      const updatedProfile: PlayerProfile = { ...p, coinBalance: Math.max(0, (p.coinBalance || 0) + reward), totalCoinsEarned: Math.max(0, (p.totalCoinsEarned || 0) + reward) };
      try { saveProfile(updatedProfile); setProfile(updatedProfile); } catch {}
      addToast(`+${reward} coins from mission!`, 'Task', '#10b981');
      try { sfx.reward?.(); } catch {}
    } catch (e) {
      console.error('handleClaimMission error:', e);
    }
  }, [addToast]);

  const handleClaimDailyReward = useCallback(() => {
    if (claimLoading || !canClaim) return;
    setClaimLoading(true);
    try {
      const result = claimDailyReward(DAILY_REWARD_COINS);
      if (result.success) {
        const ts = Date.now();
        try { localStorage.setItem('surfRushLastClaim', String(ts)); } catch {}
        setLastClaim(ts);
        setProfile(result.profile);
        addToast(`+${result.coinsAdded} Daily Reward claimed!`, 'Gift', '#10b981');
        try { sfx.reward?.(); } catch {}
        try { unlockAchievement('daily_claim'); } catch {}
      } else {
        addToast(result.error || 'Claim failed, try again', 'Gift', '#ef4444');
      }
    } catch (e) {
      console.error('handleClaimDailyReward error:', e);
      addToast('Claim failed, please try again', 'Gift', '#ef4444');
    } finally {
      setClaimLoading(false);
    }
  }, [canClaim, claimLoading, addToast]);

  const handleConnectWallet = useCallback(async () => {
    try {
      setWalletErr(null);
      const w = await connectWallet();
      walletRef.current = w;
      setWalletState({ ...w });
    } catch (e: any) {
      setWalletErr(e?.message ?? 'Connection failed');
    }
  }, []);

  const handleDisconnectWallet = useCallback(() => {
    try {
      disconnectWallet();
      const empty: WalletState = { address: null, provider: null, signer: null, chainId: null, networkName: null };
      walletRef.current = empty;
      setWalletState(empty);
    } catch {}
  }, []);

  const handleSaveOnChain = useCallback(async () => {
    try {
      if (!walletRef.current?.signer) return;
      setTxPhase('pending');
      setTxMsg('Saving score on-chain...');
      await saveScoreOnChain(walletRef.current.signer, finalScore);
      setTxPhase('confirmed');
      setTxMsg('Score saved on-chain!');
      addToast('Score saved on blockchain!', 'Chain', '#22d3ee');
    } catch (e: any) {
      setTxPhase('failed');
      setTxMsg(e?.message ?? 'Transaction failed');
    }
  }, [finalScore, addToast]);

  const handleCopyScore = useCallback(() => {
    try {
      const tgUser = getTelegramUser();
      const name   = tgUser?.first_name || tgUser?.username || 'Surfer';
      const text   = `🏄 ${name} scored ${(finalScore || 0).toLocaleString()} in Surf Rush Web3 Edition! Can you beat it?`;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).catch(() => {});
      } else {
        const el = document.createElement('textarea');
        el.value = text;
        el.style.position = 'fixed';
        el.style.opacity  = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
    } catch {}
  }, [finalScore]);

  const handleShareTelegram = useCallback(() => {
    try {
      shareScore(finalScore || 0);
    } catch {
      // Fallback: open a generic Telegram share URL
      try {
        const tgUser = getTelegramUser();
        const name   = tgUser?.first_name || tgUser?.username || 'Surfer';
        const text   = encodeURIComponent(`🏄 ${name} scored ${(finalScore || 0).toLocaleString()} in Surf Rush! 🌊`);
        window.open(`https://t.me/share/url?url=${encodeURIComponent(window.location.href)}&text=${text}`, '_blank', 'noopener');
      } catch {}
    }
  }, [finalScore]);

  const handleToggleSound = useCallback(() => {
    setSoundEnabled(s => {
      const next = !s;
      try { localStorage.setItem('srSound', next ? 'on' : 'off'); } catch {}
      sfx.enabled = next;
      return next;
    });
  }, []);

  const handleToggleAnimations = useCallback(() => {
    setReducedAnimations(s => {
      const next = !s;
      try { localStorage.setItem('srReducedAnim', next ? 'on' : 'off'); } catch {}
      return next;
    });
  }, []);

  const handleResetProgress = useCallback(() => {
    try {
      const keys = ['surfRushProfile', 'surfRushLeaderboard', 'surfRushMissions', 'surfRushMissionsDate', 'surfRushStreak', 'surfRushShopPurchases', 'surfRushAchievements', 'surfRushLastClaim', 'srTutorialSeen', 'surfRushWeekly', 'surfRushWeeklyDate'];
      keys.forEach(k => { try { localStorage.removeItem(k); } catch {} });
    } catch {}
    try { setProfile(getProfile()); } catch {}
    try { setMissions(getMissions()); } catch {}
    try { setStreak(getStreak()); } catch {}
    try { setShopPurchases(getShopPurchases()); } catch {}
    setLeaderboard([]);
    setLastClaim(null);
    setQueuedBoosts({ shield: false, magnet: false, multiplier: false });
    addToast('Progress reset!', 'Refresh', '#ef4444');
  }, [addToast]);

  const handleReplayTutorial = useCallback(() => {
    setShowTutorial(true);
  }, []);

  const handleCloseTutorial = useCallback(() => {
    try { localStorage.setItem('srTutorialSeen', '1'); } catch {}
    setShowTutorial(false);
  }, []);

  // ── Canvas ref callback ───────────────────────────────────────────────────────
  const canvasCallback = useCallback((canvas: HTMLCanvasElement | null) => {
    initEngine(canvas);
  }, [initEngine]);

  // ── Daily reward timer display ────────────────────────────────────────────────
  const claimTimer = (() => {
    if (!lastClaim) return 'Ready now!';
    const elapsed = Date.now() - lastClaim;
    const remaining = 24 * 3600 * 1000 - elapsed;
    if (remaining <= 0) return 'Ready now!';
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    return `${h}h ${m}m`;
  })();

  // ── Safe fallback render guard ────────────────────────────────────────────────
  // Ensure we never render a blank screen by always having a valid screen value
  const safeScreen: Screen = screen === 'start' || screen === 'playing' || screen === 'gameover' ? screen : 'start';

  return (
    <ErrorBoundary>
      <div className={`app${reducedAnimations ? ' reduced-animations' : ''}`}>
        <ToastStack items={toasts} dismiss={dismissToast} />

        {/* Topbar */}
        <header className="topbar">
          <div className="brand">
            <span className="brand-icon"><Icon name="Wave" size={26} color="#22d3ee" /></span>
            <div className="brand-text">
              <span className="brand-title">SURF RUSH</span>
              <span className="brand-sub">Web3 Edition</span>
            </div>
          </div>
          <div className="topbar-right">
            <span className="topbar-stat">
              <Icon name="Coin" size={13} color="#f59e0b" />{coinBalance}
            </span>
            <span className="topbar-stat topbar-level">
              <Icon name="Star" size={13} color="#a855f7" />Lv.{profile.level || 1}
            </span>
            {(streak.currentStreak || 0) > 0 && (
              <span className="topbar-stat topbar-streak">
                <Icon name="Fire" size={13} color="#f97316" />{streak.currentStreak}d
              </span>
            )}
            {/* Daily Reward */}
            <button
              className="topbar-btn"
              onClick={handleClaimDailyReward}
              disabled={!canClaim || claimLoading}
              type="button"
              title={canClaim ? 'Claim daily reward' : `Next reward in ${claimTimer}`}
              style={canClaim ? { borderColor: 'rgba(16,185,129,0.5)', color: '#10b981', background: 'rgba(16,185,129,0.12)' } : {}}
            >
              <Icon name="Gift" size={14} color={canClaim ? '#10b981' : 'currentColor'} />
              {claimLoading ? '...' : canClaim ? `+${DAILY_REWARD_COINS}` : claimTimer}
            </button>
            <button className="topbar-btn" onClick={() => setShowRules(true)} type="button">
              <Icon name="Info" size={14} color="currentColor" /> How to Play
            </button>
            {wallet.address ? (
              <button className="wallet-btn wallet-btn-connected" onClick={handleDisconnectWallet} type="button">
                <span className="wallet-dot" />{shorten(wallet.address)}
              </button>
            ) : (
              <button className="wallet-btn" onClick={handleConnectWallet} type="button">
                <Icon name="Wallet" size={14} color="currentColor" /> Connect
              </button>
            )}
          </div>
        </header>

        {walletErr && <div className="wallet-err">{walletErr}</div>}

        {/* Game area — always mounted when playing */}
        {safeScreen === 'playing' && (
          <div className="game-area" ref={gameAreaRef} style={{ height: 560 }}>
            <canvas ref={canvasCallback} style={{ display: 'block', width: '100%', height: '100%', position: 'absolute', inset: 0 }} />
            {gameState && (
              <div style={{ position: 'absolute', top: 12, left: 0, right: 0, zIndex: 10, padding: '0 12px' }}>
                <Hud gs={gameState} sa={scoreAnim} ca={coinAnim} bal={coinBalance} />
              </div>
            )}
            {/* Mobile controls */}
            <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, zIndex: 10, display: 'flex', justifyContent: 'space-between', padding: '0 16px', alignItems: 'center' }}>
              <button className="ctrl-btn" onPointerDown={() => engineRef.current?.moveLeft()} type="button" aria-label="Move left">←</button>
              <button className="ctrl-btn pause-btn" onPointerDown={() => engineRef.current?.togglePause()} type="button" aria-label="Pause">⏸</button>
              <button className="ctrl-btn" onPointerDown={() => engineRef.current?.moveRight()} type="button" aria-label="Move right">→</button>
            </div>
          </div>
        )}

        {/* Start screen */}
        {safeScreen === 'start' && (
          <div className="game-area" style={{ minHeight: 320, position: 'relative' }}>
            <StartScreen onStart={handleStart} profile={profile} streak={streak} />
          </div>
        )}

        {/* Game Over screen */}
        {safeScreen === 'gameover' && (
          <GameOverOverlay
            finalScore={finalScore}
            finalCoins={finalCoins}
            coinBalance={coinBalance}
            isNewRecord={isNewRecord}
            txLoading={txPhase === 'pending'}
            txPhase={txPhase}
            txMsg={txMsg}
            wallet={wallet}
            lives={lives}
            postGame={{ xpEarned: pgXp, newLevel: pgNewLevel }}
            onRestart={handleRestart}
            onShare={handleShareTelegram}
            onCopyScore={handleCopyScore}
            onSaveOnChain={handleSaveOnChain}
            onConnectWallet={handleConnectWallet}
            onBuyLife={handleBuyLife}
          />
        )}

        {/* Dashboard — shown when not playing */}
        {safeScreen !== 'playing' && (
          <>
            <PlayerDashboard profile={profile} streak={streak} wallet={wallet} />
            <DailyMissions missions={missions} onClaim={handleClaimMission} />
            <PowerUpShop coinBalance={coinBalance} onBuy={handleBuyShopItem} />
            <BoostInventory shopPurchases={shopPurchases} profile={profile} queuedBoosts={queuedBoosts} onQueue={handleQueueBoost} />
            <WalletInfoSection wallet={wallet} onConnect={handleConnectWallet} onDisconnect={handleDisconnectWallet} />
            <SettingsPanel
              soundEnabled={soundEnabled}
              reducedAnimations={reducedAnimations}
              onToggleSound={handleToggleSound}
              onToggleAnimations={handleToggleAnimations}
              onResetProgress={handleResetProgress}
              onReplayTutorial={handleReplayTutorial}
            />
          </>
        )}

        {showRules    && <RulesModal    onClose={() => setShowRules(false)} />}
        {showTutorial && <TutorialModal onClose={handleCloseTutorial} />}
      </div>
    </ErrorBoundary>
  );
}

export default App;