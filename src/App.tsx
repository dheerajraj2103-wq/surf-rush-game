import { useCallback, useEffect, useRef, useState } from 'react';
import {
  GameEngine,
  GameState,
  LeaderboardEntry,
  getLeaderboard,
  saveToLeaderboard
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

// Cost in coins to purchase one extra life
const EXTRA_LIFE_COST = 100;

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ─── SVG Icon components — cross-browser, no Unicode/emoji rendering issues ───
// All icons use inline SVG for guaranteed rendering on Chrome, Firefox, Brave,
// Android and iOS without any font or codepoint dependencies.

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

// Map icon names to components for use throughout the app
const ICON_COMPONENTS = {
  coin:    CoinIcon,
  shield:  ShieldIcon,
  magnet:  MagnetIcon,
  speed:   BoltIcon,
  combo:   FlameIcon,
  coinCut: SkullIcon,
  freeze:  SnowflakeIcon,
  slow:    SwirlIcon,
  trophy:  TrophyIcon,
  gift:    GiftIcon,
  surf:    SurferIcon,
  wave:    WaveIcon,
  chain:   ChainIcon,
  heart:   HeartIcon,
  shop:    CartIcon,
  star:    StarIcon,
  cart:    CartIcon,
  info:    InfoIcon,
} as const;

type IconName = keyof typeof ICON_COMPONENTS;

function Icon({ name, size = 18, color = 'currentColor', className = '' }: { name: IconName; size?: number; color?: string; className?: string }) {
  const Component = ICON_COMPONENTS[name];
  return <Component size={size} color={color} className={className} />;
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
}

function Hud({ gameState, scoreAnim, comboAnim }: HudProps) {
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
    </div>
  );
}

// ─── Start Overlay ────────────────────────────────────────────────────────────
interface StartOverlayProps {
  onStart: () => void;
}

function StartOverlay({ onStart }: StartOverlayProps) {
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

// ─── Coin Shop Panel ──────────────────────────────────────────────────────────
function CoinShopPanel() {
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
        <span className="section-title">Coin Shop</span>
        <span className="section-badge"><Icon name="coin" size={13} color="#f59e0b" /> Use your coins</span>
        <span className="collapse-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="coin-shop-body">
          {/* ISSUE 3 FIX — Coin system clarity panel */}
          <div className="coin-explainer">
            <div className="coin-explainer-title">
              <Icon name="coin" size={15} color="#f59e0b" />
              How Coins Work
            </div>
            <p className="coin-explainer-desc">
              Coins are collected during your run. They are separate from your Score and can be spent on items below.
              Unused coins remain in your balance — they are never lost between screens.
            </p>
            <div className="coin-uses-grid">
              <div className="coin-use-row">
                <Icon name="heart" size={14} color="#f9a8d4" />
                <span>Extra Life — 100 coins</span>
                <span className="coin-use-status coin-use-active">Available now</span>
              </div>
              <div className="coin-use-row">
                <Icon name="shield" size={14} color="#22d3ee" />
                <span>Power-Up Boosts</span>
                <span className="coin-use-status coin-use-soon">Coming soon</span>
              </div>
              <div className="coin-use-row">
                <Icon name="star" size={14} color="#f59e0b" />
                <span>Unlockables</span>
                <span className="coin-use-status coin-use-soon">Coming soon</span>
              </div>
              <div className="coin-use-row">
                <Icon name="cart" size={14} color="#a78bfa" />
                <span>Reward Store</span>
                <span className="coin-use-status coin-use-soon">Coming soon</span>
              </div>
            </div>
          </div>

          <p className="coin-shop-intro">
            Items available now — more items will be added as the game expands.
          </p>
          <div className="coin-shop-items">
            {/* ISSUE 4 FIX — Life section with clear icon + tooltip */}
            <div className="shop-item shop-item-life">
              <div className="shop-item-icon"><Icon name="heart" size={22} color="#f9a8d4" /></div>
              <div className="shop-item-info">
                <span className="shop-item-name">
                  Extra Life
                  <span className="shop-item-available-tag">Available</span>
                </span>
                <span className="shop-item-desc">Use 100 coins to continue your run after a wipeout.</span>
                <span className="shop-item-tooltip">
                  <Icon name="info" size={11} color="#94a3b8" />
                  Buy this on the Game Over screen to resume exactly where you crashed.
                </span>
              </div>
              <div className="shop-item-cost">
                <Icon name="coin" size={14} color="#f59e0b" /> {EXTRA_LIFE_COST}
              </div>
            </div>
            <div className="shop-item shop-item-locked">
              <div className="shop-item-icon"><Icon name="shield" size={22} color="#22d3ee" /></div>
              <div className="shop-item-info">
                <span className="shop-item-name">Shield Power-up</span>
                <span className="shop-item-desc">Start your next run with a shield active</span>
              </div>
              <div className="shop-item-cost shop-item-cost--locked">Coming soon</div>
            </div>
            <div className="shop-item shop-item-locked">
              <div className="shop-item-icon"><Icon name="magnet" size={22} color="#f97316" /></div>
              <div className="shop-item-info">
                <span className="shop-item-name">Magnet Boost</span>
                <span className="shop-item-desc">Start with 6s magnet effect active</span>
              </div>
              <div className="shop-item-cost shop-item-cost--locked">Coming soon</div>
            </div>
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
  finalScore,
  finalCoins,
  isNewRecord,
  timeUntilNextClaim,
  canClaimReward,
  claimLoading,
  claimMessage,
  claimSuccess,
  txLoading,
  txPhase,
  txMessage,
  wallet,
  lives,
  onRestart,
  onShare,
  onSaveOnChain,
  onConnectWallet,
  onClaimReward,
  onBuyLife,
}: GameOverOverlayProps) {
  const statusClass =
    txPhase === 'confirmed' ? 'tx-success' :
    txPhase === 'failed'    ? 'tx-error'   :
    (txPhase === 'awaiting-approval' || txPhase === 'submitted') ? 'tx-pending' :
    '';
  const statusLabel = TX_PHASE_LABEL[txPhase];

  const canAffordLife = finalCoins >= EXTRA_LIFE_COST;

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

        {/* ISSUE 6 FIX — Score vs Coin clarity */}
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
                Coins Collected
                <span className="sc-label-tip">Spendable below</span>
              </span>
            </span>
            <span className="sc-value coin-sc-value">
              <Icon name="coin" size={18} color="#f59e0b" /> {finalCoins}
            </span>
          </div>
          {/* Score/Coin explanation */}
          <div className="score-coin-explainer">
            <div className="score-coin-explainer-row">
              <span className="sce-label sce-score">Score Points</span>
              <span className="sce-desc">Used only for leaderboard ranking. Cannot be spent.</span>
            </div>
            <div className="score-coin-explainer-row">
              <span className="sce-label sce-coins">
                <Icon name="coin" size={12} color="#f59e0b" /> Coins
              </span>
              <span className="sce-desc">
                Used for purchases. Current balance: <strong>{finalCoins}</strong>.
                {finalCoins > 0 && finalCoins < EXTRA_LIFE_COST && (
                  <span> Need {EXTRA_LIFE_COST - finalCoins} more for an Extra Life.</span>
                )}
                {finalCoins >= EXTRA_LIFE_COST && (
                  <span> You can buy an Extra Life below!</span>
                )}
              </span>
            </div>
          </div>
        </div>

        {/* ISSUE 4 FIX — Extra Life / Continue section */}
        <div className="extra-life-card">
          <div className="extra-life-header">
            <Icon name="heart" size={20} color="#f9a8d4" />
            <div className="extra-life-header-text">
              <span className="extra-life-title">Extra Life</span>
              <span className="extra-life-subtitle">Continue your run from where you crashed</span>
            </div>
            <span className="extra-life-lives">
              {lives > 0 ? `${lives} free ${lives === 1 ? 'life' : 'lives'}` : 'No free lives left'}
            </span>
          </div>
          <div className="extra-life-help">
            <Icon name="info" size={13} color="#94a3b8" />
            Use 100 coins to continue your run after a wipeout. Your score and progress are preserved.
          </div>
          <div className="extra-life-actions">
            {lives > 0 && (
              <button
                className="action-btn primary-action extra-life-btn"
                onClick={onBuyLife}
                type="button"
              >
                <Icon name="heart" size={16} color="#020916" /> Use 1 Free Life &amp; Continue
                <span className="extra-life-badge">{lives} left</span>
              </button>
            )}
            <button
              className={`action-btn extra-life-btn ${canAffordLife ? 'buy-life-action' : 'buy-life-action--disabled'}`}
              onClick={canAffordLife ? onBuyLife : undefined}
              type="button"
              disabled={!canAffordLife}
              title={canAffordLife ? 'Spend 100 coins to continue your run' : `Need ${EXTRA_LIFE_COST} coins to buy a life (you have ${finalCoins})`}
            >
              <Icon name="coin" size={16} color={canAffordLife ? '#f9a8d4' : undefined} /> Buy Extra Life — 100 Coins
              {!canAffordLife && (
                <span className="extra-life-short">
                  Need {EXTRA_LIFE_COST - finalCoins} more
                </span>
              )}
            </button>
          </div>
        </div>

        {/* ISSUE 2 FIX — Daily Reward with no broken Unicode */}
        <div className="daily-reward-card">
          <div className="dr-header">
            <span className="dr-header-left">
              <Icon name="gift" size={16} color="#f59e0b" /> Daily Reward
            </span>
            <span className="dr-timer">
              {canClaimReward ? 'Ready now!' : `Next claim in ${timeUntilNextClaim}`}
            </span>
          </div>
          <p className="dr-desc">+500 coins · Claimable once every 24 hours</p>
          <p className="dr-note">
            Local in-game reward — no wallet or transaction required.
          </p>

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
              <button
                className="link-action"
                onClick={onSaveOnChain}
                type="button"
                disabled={txLoading}
              >
                {txLoading ? <span className="spinner" /> : <><Icon name="chain" size={14} color="currentColor" /> Save Score On-Chain</>}
              </button>
            ) : (
              <button
                className="link-action"
                onClick={onConnectWallet}
                type="button"
              >
                ◈ Connect Wallet to Save Score
              </button>
            )
          ) : (
            <p className="onchain-unavailable-note">
              On-chain saving is currently unavailable — no deployed contract is configured.
            </p>
          )}
        </div>

        {REWARD_CONTRACT_DEPLOYED && txPhase !== 'idle' && (txMessage || statusLabel) && (
          <div className={`tx-status ${statusClass}`}>
            {txPhase === 'awaiting-approval' || txPhase === 'submitted'
              ? <span className="spinner" style={{ width: 12, height: 12, borderWidth: 2, marginRight: 6, verticalAlign: 'middle' }} />
              : null}
            {txMessage || statusLabel}
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Leaderboard (collapsible) ────────────────────────────────────────────────
interface LeaderboardProps {
  entries: LeaderboardEntry[];
  walletConnected: boolean;
}

function Leaderboard({ entries, walletConnected }: LeaderboardProps) {
  const [open, setOpen] = useState(false);

  // ISSUE 5 FIX — rank labels use text instead of medal emoji
  const rankLabel = (i: number) => {
    if (i === 0) return '1st';
    if (i === 1) return '2nd';
    if (i === 2) return '3rd';
    return `#${i + 1}`;
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
        <div className="section-icon">
          <Icon name="trophy" size={16} color="#22d3ee" />
        </div>
        <span className="section-title">Leaderboard</span>
        <span className="section-badge">{entries.length} entries</span>
        <span className="collapse-chevron">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <>
          {/* ISSUE 5 FIX — Leaderboard description */}
          <div className="lb-description">
            <Icon name="info" size={13} color="#94a3b8" />
            {walletConnected
              ? 'Leaderboard displays connected player scores.'
              : 'Leaderboard displays the highest local scores recorded on this device.'}
          </div>
          {/* ISSUE 6 FIX — Score clarification in leaderboard */}
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
              {entries.map((entry, idx) => (
                <div key={`${entry.date}-${idx}`} className={rowClass(idx)}>
                  <div className={`lb-rank lb-rank-badge lb-rank-${idx < 3 ? ['gold','silver','bronze'][idx] : 'default'}`}>
                    {rankLabel(idx)}
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
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Rules Modal ──────────────────────────────────────────────────────────────
interface RulesModalProps {
  onClose: () => void;
}

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
            <span className="modal-header-icon">
              <Icon name="wave" size={22} color="#22d3ee" />
            </span>
            <div>
              <h2>How to Play</h2>
              <p>Surf Rush · Web3 Edition</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} type="button" aria-label="Close">✕</button>
        </div>

        <div className="modal-content">
          {/* Objective */}
          <div className="modal-section">
            <div className="modal-section-title">
              <span className="icon">Objective</span>
            </div>
            <div className="modal-items">
              <div className="modal-item">
                <span className="modal-item-icon"><Icon name="surf" size={16} color="#22d3ee" /></span>
                <span>Survive as long as possible on the endless ocean while dodging obstacles.</span>
              </div>
              <div className="modal-item">
                <span className="modal-item-icon"><Icon name="coin" size={16} color="#f59e0b" /></span>
                <span>Collect coin boxes and power-up boxes to increase your score and combo.</span>
              </div>
              <div className="modal-item">
                <span className="modal-item-icon"><Icon name="chain" size={16} color="#a855f7" /></span>
                <span>Save your high score on-chain and claim daily in-game rewards.</span>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="modal-section">
            <div className="modal-section-title">
              <span className="icon">Controls</span>
            </div>
            <div className="modal-controls-grid">
              <span className="ctrl-key">◀ / A</span>
              <span className="ctrl-desc">Move left</span>
              <span className="ctrl-key">▶ / D</span>
              <span className="ctrl-desc">Move right</span>
              <span className="ctrl-key">Space / P</span>
              <span className="ctrl-desc">Pause game</span>
              <span className="ctrl-key">Swipe</span>
              <span className="ctrl-desc">Swipe left or right on mobile</span>
            </div>
          </div>

          {/* Power-ups */}
          <div className="modal-section">
            <div className="modal-section-title">
              <span className="icon">Power-Ups &amp; Boxes</span>
            </div>
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

          {/* Obstacles */}
          <div className="modal-section">
            <div className="modal-section-title">
              <span className="icon">Obstacles</span>
            </div>
            <div className="modal-items">
              <div className="modal-item"><span className="modal-item-icon modal-item-icon--text">Rock</span><span>Rock — solid object blocking the lane</span></div>
              <div className="modal-item"><span className="modal-item-icon modal-item-icon--text">Shark</span><span>Shark — lurks beneath the surface</span></div>
              <div className="modal-item"><span className="modal-item-icon modal-item-icon--text">Jelly</span><span>Jellyfish — drifts unpredictably</span></div>
              <div className="modal-item"><span className="modal-item-icon"><Icon name="wave" size={16} color="#22d3ee" /></span><span>Rogue Wave — crashing wall of water</span></div>
            </div>
          </div>

          {/* ISSUE 6 FIX — Coin Economy with Score vs Coin clarity */}
          <div className="modal-section">
            <div className="modal-section-title">
              <span className="icon"><Icon name="coin" size={14} color="#f59e0b" /></span> Scores vs Coins
            </div>
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
                  <li>Spent on Extra Lives (100 coins)</li>
                  <li>Future: Power-ups, Unlockables, Reward Store</li>
                  <li>Unused coins stay in your balance</li>
                </ul>
              </div>
            </div>
            <div className="modal-items" style={{ marginTop: 8 }}>
              <div className="modal-item">
                <span className="modal-item-icon"><Icon name="gift" size={16} color="#f59e0b" /></span>
                <span>Claim +500 free coins every 24 hours via the Daily Reward — no wallet needed.</span>
              </div>
              <div className="modal-item">
                <span className="modal-item-icon"><Icon name="chain" size={16} color="#a855f7" /></span>
                <span>On-chain redemption of coins will be enabled once the reward contract is deployed.</span>
              </div>
            </div>
          </div>

          {/* Blockchain */}
          <div className="modal-section">
            <div className="modal-section-title">
              <span className="icon"><Icon name="chain" size={14} color="#22d3ee" /></span> Blockchain Features
            </div>
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

  const [wallet, setWalletState]       = useState<WalletState>({ address: null, provider: null, signer: null, chainId: null, networkName: null });
  const [walletError, setWalletError]  = useState<string | null>(null);

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

  useEffect(() => {
    const saved = localStorage.getItem('surfRushLastClaim');
    if (saved) setLastClaimTime(parseInt(saved, 10));
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

  useEffect(() => {
    initTelegram();
    const tgUser = getTelegramUser();
    if (tgUser) {
      const name = tgUser.username ? `@${tgUser.username}` : tgUser.first_name;
      setPlayerName(name);
      playerNameRef.current = name;
    } else {
      const name = 'Surfer';
      setPlayerName(name);
      playerNameRef.current = name;
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
      onGameOver: (score, coins) => {
        setFinalScore(score);
        setFinalCoins(coins);

        const prev = getLeaderboard();
        const top  = prev.length > 0 ? prev[0].score : 0;
        setIsNewRecord(score > top);

        runCountRef.current += 1;
        const displayName = playerNameRef.current && playerNameRef.current !== 'Surfer'
          ? playerNameRef.current
          : `Surfer #${runCountRef.current}`;

        const updated = saveToLeaderboard({
          name:  displayName,
          score,
          coins,
          date:  new Date().toISOString(),
        });
        setLeaderboard(updated);
        setScreen('gameover');
      },
    });

    engineRef.current = engine;
  }, []);

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
    requestAnimationFrame(() => {
      engineRef.current?.start();
    });
  }, []);

  const restartGame = useCallback(() => {
    setScreen('playing');
    setTxPhase('idle');
    setConnectPhase('idle');
    setTxMessage(null);
    setClaimMessage(null);
    setClaimSuccess(false);
    txInFlightRef.current = false;
    setLives(0);
    requestAnimationFrame(() => {
      engineRef.current?.restart();
    });
  }, []);

  const handleBuyLife = useCallback(() => {
    if (lives > 0) {
      setLives(l => l - 1);
      setScreen('playing');
      requestAnimationFrame(() => {
        engineRef.current?.addLife(0);
      });
    } else if (finalCoins >= EXTRA_LIFE_COST) {
      setFinalCoins(c => c - EXTRA_LIFE_COST);
      setScreen('playing');
      requestAnimationFrame(() => {
        engineRef.current?.addLife(EXTRA_LIFE_COST);
      });
    }
  }, [lives, finalCoins]);

  const togglePause = useCallback(() => {
    engineRef.current?.togglePause();
  }, []);

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
      setWallet(connected);
      setWalletError(null);
      setConnectPhase('confirmed');
      setTxMessage(`${getWalletName()} connected: ${shortenAddress(connected.address!)}`);
    } catch (err: any) {
      if (err.code === 'DEEPLINK_REDIRECT') {
        setConnectPhase('idle');
        setTxMessage('Opening MetaMask Mobile… return here after connecting.');
        return;
      }

      if (err.code === 'NO_WALLET') {
        const msg = err.message;
        setWalletError(msg);
        setConnectPhase('failed');
        setTxMessage(msg);
        return;
      }

      if (
        err.code === 4001 ||
        err.message?.includes('rejected') ||
        err.message?.includes('denied') ||
        err.message?.includes('cancelled') ||
        err.message?.includes('User rejected')
      ) {
        const msg = 'Connection cancelled. Tap "Connect Wallet" to try again.';
        setWalletError(msg);
        setConnectPhase('failed');
        setTxMessage(msg);
        return;
      }

      const msg = err instanceof Error ? err.message : 'Failed to connect wallet.';
      setWalletError(msg);
      setConnectPhase('failed');
      setTxMessage(msg);
    } finally {
      connectInFlightRef.current = false;
    }
  }, [setWallet]);

  const handleDisconnectWallet = useCallback(() => {
    setWallet(disconnectWallet());
    setConnectPhase('idle');
    setTxPhase('idle');
    setTxMessage(null);
    setWalletError(null);
  }, [setWallet]);

  const handleCopyAddress = useCallback(() => {
    if (!walletRef.current.address) return;
    navigator.clipboard.writeText(walletRef.current.address).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  }, []);

  const handleSaveScoreOnChain = useCallback(async () => {
    if (txInFlightRef.current) return;

    if (!REWARD_CONTRACT_DEPLOYED) {
      setTxPhase('failed');
      setTxMessage('On-chain saving is currently unavailable — no deployed contract is configured.');
      return;
    }

    const signer = walletRef.current.signer;
    if (!signer) {
      setTxPhase('failed');
      setTxMessage('Connect your wallet first, then save your score.');
      return;
    }

    txInFlightRef.current = true;
    try {
      setTxPhase('awaiting-approval');
      setTxMessage('Approve the transaction in your wallet…');
      const hash = await saveScoreOnChain(signer, finalScore);
      setTxPhase('submitted');
      setTxMessage(`Transaction submitted: ${shortenAddress(hash)}`);
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

      setFinalCoins((prev) => prev + 500);

      const now = Date.now();
      localStorage.setItem('surfRushLastClaim', String(now));
      setLastClaimTime(now);

      setClaimSuccess(true);
      setClaimMessage('Daily reward claimed! +500 coins added.');
    } finally {
      setClaimLoading(false);
      claimInFlightRef.current = false;
    }
  }, []);

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

      {/* Top Bar */}
      <div className="topbar">
        <div className="brand">
          <span className="brand-icon">
            <Icon name="wave" size={22} color="#22d3ee" />
          </span>
          <div className="brand-text">
            <span className="brand-title">SURF RUSH</span>
            <span className="brand-sub">WEB3</span>
          </div>
        </div>

        <div className="topbar-right">
          <button className="rules-btn" onClick={() => setShowRules(true)} type="button">
            How to Play
          </button>

          {walletError && (
            <div className="wallet-error-inline">{walletError}</div>
          )}

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
        <Hud gameState={gameState} scoreAnim={scoreAnim} comboAnim={comboAnim} />
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
        <canvas
          ref={initEngine}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />

        {screen === 'start' && <StartOverlay onStart={startGame} />}

        {screen === 'gameover' && (
          <GameOverOverlay
            finalScore={finalScore}
            finalCoins={finalCoins}
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

      {/* Coin Shop */}
      <CoinShopPanel />

      {/* Leaderboard (collapsible) */}
      <Leaderboard entries={leaderboard} walletConnected={!!wallet.address} />

      {/* Rules modal */}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}

    </div>
  );
}