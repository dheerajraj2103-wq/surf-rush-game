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

// ─── Icon constants — single source of truth used in HUD, modal, leaderboard,
//     result screen, and power-up bar so every screen always matches the game ──
const ICON = {
  coin:    '\uD83E\uDE99',  // 🪙
  shield:  '\uD83D\uDEE1\uFE0F',  // 🛡️
  magnet:  '\uD83E\uDDF2',  // 🧲
  speed:   '\u26A1',         // ⚡
  combo:   '\uD83D\uDD25',   // 🔥
  coinCut: '\uD83D\uDC80',   // 💀
  freeze:  '\u2744\uFE0F',   // ❄️
  slow:    '\uD83C\uDF00',   // 🌀
  trophy:  '\uD83C\uDFC6',   // 🏆
  gift:    '\uD83C\uDF81',   // 🎁
  surf:    '\uD83C\uDFC4',   // 🏄
  wave:    '\uD83C\uDF0A',   // 🌊
  chain:   '\u26D3\uFE0F',   // ⛓️
  heart:   '\u2764\uFE0F',   // ❤️
  shop:    '\uD83D\uDED2',   // 🛒
} as const;

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
          <span className="emoji-icon">{ICON.coin}</span> {gameState.coins}
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
            <span className="emoji-icon">{ICON.wave}</span>
            <span className="emoji-icon">{ICON.wave}</span>
            <span className="emoji-icon">{ICON.wave}</span>
          </div>
          <h1 className="start-title">SURF RUSH</h1>
          <div className="start-badge">
            <span className="emoji-icon">{ICON.chain}</span> WEB3 EDITION
          </div>
        </div>

        <p className="start-desc">
          Ride the waves. Dodge obstacles.<br />
          Collect rewards. Earn on-chain.
        </p>

        <div className="feature-chips">
          <div className="chip"><span className="emoji-icon">{ICON.surf}</span> Surf</div>
          <div className="chip"><span className="emoji-icon">{ICON.shield}</span> Power-ups</div>
          <div className="chip"><span className="emoji-icon">{ICON.chain}</span> On-chain</div>
          <div className="chip"><span className="emoji-icon">{ICON.gift}</span> Daily Rewards</div>
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
            <span>📱 Swipe on mobile</span>
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
        <div className="section-icon"><span className="emoji-icon">{ICON.shop}</span></div>
        <span className="section-title">Coin Shop</span>
        <span className="section-badge">{ICON.coin} Use your coins</span>
        <span className="collapse-chevron">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="coin-shop-body">
          <p className="coin-shop-intro">
            Coins you collect during each run can be spent on the Game Over screen
            or saved for future unlocks.
          </p>
          <div className="coin-shop-items">
            <div className="shop-item">
              <div className="shop-item-icon"><span className="emoji-icon">{ICON.heart}</span></div>
              <div className="shop-item-info">
                <span className="shop-item-name">Extra Life</span>
                <span className="shop-item-desc">Continue your run from where you fell</span>
              </div>
              <div className="shop-item-cost">
                <span className="emoji-icon">{ICON.coin}</span> {EXTRA_LIFE_COST}
              </div>
            </div>
            <div className="shop-item shop-item-locked">
              <div className="shop-item-icon"><span className="emoji-icon">{ICON.shield}</span></div>
              <div className="shop-item-info">
                <span className="shop-item-name">Shield Power-up</span>
                <span className="shop-item-desc">Start your next run with a shield active</span>
              </div>
              <div className="shop-item-cost shop-item-cost--locked">Coming soon</div>
            </div>
            <div className="shop-item shop-item-locked">
              <div className="shop-item-icon"><span className="emoji-icon">{ICON.magnet}</span></div>
              <div className="shop-item-info">
                <span className="shop-item-name">Magnet Boost</span>
                <span className="shop-item-desc">Start with 6s magnet effect active</span>
              </div>
              <div className="shop-item-cost shop-item-cost--locked">Coming soon</div>
            </div>
            <div className="shop-item shop-item-locked">
              <div className="shop-item-icon"><span className="emoji-icon">{ICON.chain}</span></div>
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
        {isNewRecord && <div className="new-record-banner">{ICON.trophy} NEW RECORD!</div>}

        <div className="gameover-header">
          <h2 className="gameover-title">WIPEOUT!</h2>
          <p className="gameover-sub">Your run has ended. Continue or claim your rewards.</p>
        </div>

        {/* Score card */}
        <div className="score-card">
          <div className="score-card-row">
            <span className="sc-label">Final Score</span>
            <span className="sc-value score-highlight">{finalScore.toLocaleString()}</span>
          </div>
          <div className="score-card-divider" />
          <div className="score-card-row">
            <span className="sc-label">Coins Collected</span>
            <span className="sc-value">
              <span className="emoji-icon">{ICON.coin}</span> {finalCoins}
            </span>
          </div>
          <p className="coins-note">
            <span className="emoji-icon">{ICON.coin}</span> Coins can be spent below — Buy Extra Life or future rewards.
          </p>
        </div>

        {/* Extra Life / Continue section */}
        <div className="extra-life-card">
          <div className="extra-life-header">
            <span className="emoji-icon">{ICON.heart}</span>
            <span className="extra-life-title">Continue Your Run?</span>
            <span className="extra-life-lives">
              {lives > 0 ? `${lives} ${lives === 1 ? 'life' : 'lives'} remaining` : 'No free lives left'}
            </span>
          </div>
          <div className="extra-life-actions">
            {lives > 0 && (
              <button
                className="action-btn primary-action extra-life-btn"
                onClick={onBuyLife}
                type="button"
              >
                <span className="emoji-icon">{ICON.heart}</span> Use 1 Life &amp; Continue
                <span className="extra-life-badge">{lives} left</span>
              </button>
            )}
            <button
              className={`action-btn extra-life-btn ${canAffordLife ? 'buy-life-action' : 'buy-life-action--disabled'}`}
              onClick={canAffordLife ? onBuyLife : undefined}
              type="button"
              disabled={!canAffordLife}
              title={canAffordLife ? undefined : `Need ${EXTRA_LIFE_COST} coins to buy a life (you have ${finalCoins})`}
            >
              <span className="emoji-icon">{ICON.coin}</span> Buy Life
              <span className="extra-life-cost-badge">
                {EXTRA_LIFE_COST} {ICON.coin}
              </span>
              {!canAffordLife && (
                <span className="extra-life-short">
                  Need {EXTRA_LIFE_COST - finalCoins} more
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Daily Reward */}
        <div className="daily-reward-card">
          <div className="dr-header">
            <span><span className="emoji-icon">{ICON.gift}</span> Daily Reward</span>
            <span className="dr-timer">{canClaimReward ? 'Ready now!' : timeUntilNextClaim}</span>
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
                ? <><span className="emoji-icon">{ICON.gift}</span> Claim +500 Coins</>
                : <>\u23F3 Next claim in {timeUntilNextClaim}</>}
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
            📲 Share on Telegram
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
                {txLoading ? <span className="spinner" /> : <><span className="emoji-icon">{ICON.chain}</span> Save Score On-Chain</>}
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
}

function Leaderboard({ entries }: LeaderboardProps) {
  // Collapsible — starts closed; click header to open/close
  const [open, setOpen] = useState(false);

  const rankLabel = (i: number) => {
    if (i === 0) return '\uD83E\uDD47'; // 🥇
    if (i === 1) return '\uD83E\uDD48'; // 🥈
    if (i === 2) return '\uD83E\uDD49'; // 🥉
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
      {/* Clickable header toggles the list */}
      <button
        className="section-header section-header-btn"
        onClick={() => setOpen(o => !o)}
        type="button"
        aria-expanded={open}
      >
        <div className="section-icon">
          <span className="emoji-icon">{ICON.trophy}</span>
        </div>
        <span className="section-title">Leaderboard</span>
        <span className="section-badge">{entries.length} entries</span>
        <span className="collapse-chevron">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        entries.length === 0 ? (
          <div className="lb-empty">Play a run to appear on the leaderboard!</div>
        ) : (
          <div className="lb-list">
            {entries.map((entry, idx) => (
              <div key={`${entry.date}-${idx}`} className={rowClass(idx)}>
                <div className="lb-rank">{rankLabel(idx)}</div>
                <div className="lb-info">
                  <span className="lb-name">{entry.name}</span>
                  <span className="lb-date">{new Date(entry.date).toLocaleDateString()}</span>
                </div>
                <div className="lb-scores">
                  <span className="lb-score">{entry.score.toLocaleString()}</span>
                  <span className="lb-coins">
                    <span className="emoji-icon">{ICON.coin}</span> {entry.coins}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
}

// ─── Rules Modal ──────────────────────────────────────────────────────────────
interface RulesModalProps {
  onClose: () => void;
}

function RulesModal({ onClose }: RulesModalProps) {
  // Power-up list — icons EXACTLY match game.ts boxEmoji() and the HUD power-up bar
  const powerups = [
    { icon: ICON.shield,  name: 'Shield',      desc: 'Absorbs one collision' },
    { icon: ICON.magnet,  name: 'Magnet',      desc: 'Attracts coins for 6s' },
    { icon: ICON.speed,   name: 'Speed Boost', desc: '1.6× speed for 5s' },
    { icon: ICON.combo,   name: 'Combo Up',    desc: '+1 score multiplier' },
    { icon: ICON.coinCut, name: 'Coin Cut',    desc: 'Lose 20 coins · avoid!' },
    { icon: ICON.freeze,  name: 'Freeze',      desc: 'Stops movement for 1.2s' },
    { icon: ICON.slow,    name: 'Slow Wave',   desc: 'Halves speed for 4s' },
    { icon: ICON.coin,    name: 'Coin Box',    desc: 'Collects coins × combo' },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="rules-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-left">
            <span className="modal-header-icon emoji-icon">{ICON.wave}</span>
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
              <span className="icon emoji-icon">🎯</span> Objective
            </div>
            <div className="modal-items">
              <div className="modal-item">
                <span className="modal-item-icon emoji-icon">{ICON.surf}</span>
                <span>Survive as long as possible on the endless ocean while dodging obstacles.</span>
              </div>
              <div className="modal-item">
                <span className="modal-item-icon emoji-icon">{ICON.coin}</span>
                <span>Collect coin boxes and power-up boxes to increase your score and combo.</span>
              </div>
              <div className="modal-item">
                <span className="modal-item-icon emoji-icon">{ICON.chain}</span>
                <span>Save your high score on-chain and claim daily in-game rewards.</span>
              </div>
            </div>
          </div>

          {/* Controls */}
          <div className="modal-section">
            <div className="modal-section-title">
              <span className="icon">🎮</span> Controls
            </div>
            <div className="modal-controls-grid">
              <span className="ctrl-key">◀ / A</span>
              <span className="ctrl-desc">Move left</span>
              <span className="ctrl-key">▶ / D</span>
              <span className="ctrl-desc">Move right</span>
              <span className="ctrl-key">Space / P</span>
              <span className="ctrl-desc">Pause game</span>
              <span className="ctrl-key">📱 Swipe</span>
              <span className="ctrl-desc">Swipe left or right on mobile</span>
            </div>
          </div>

          {/* Power-ups — icons match the actual game boxes exactly */}
          <div className="modal-section">
            <div className="modal-section-title">
              <span className="icon">✨</span> Power-Ups &amp; Boxes
            </div>
            <div className="modal-powerup-grid">
              {powerups.map(p => (
                <div className="modal-powerup-item" key={p.name}>
                  <span className="pu-icon emoji-icon">{p.icon}</span>
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
              <span className="icon">🚧</span> Obstacles
            </div>
            <div className="modal-items">
              <div className="modal-item"><span className="modal-item-icon emoji-icon">\uD83E\uDEA8</span><span>Rock — solid object blocking the lane</span></div>
              <div className="modal-item"><span className="modal-item-icon emoji-icon">\uD83E\uDD88</span><span>Shark — lurks beneath the surface</span></div>
              <div className="modal-item"><span className="modal-item-icon emoji-icon">\uD83E\uDEBC</span><span>Jellyfish — drifts unpredictably</span></div>
              <div className="modal-item"><span className="modal-item-icon emoji-icon">{ICON.wave}</span><span>Rogue Wave — crashing wall of water</span></div>
            </div>
          </div>

          {/* Coin Economy */}
          <div className="modal-section">
            <div className="modal-section-title">
              <span className="icon emoji-icon">{ICON.coin}</span> Coin Economy
            </div>
            <div className="modal-items">
              <div className="modal-item">
                <span className="modal-item-icon emoji-icon">{ICON.coin}</span>
                <span>Collect coin boxes during your run to earn coins (×your current combo multiplier).</span>
              </div>
              <div className="modal-item">
                <span className="modal-item-icon emoji-icon">{ICON.heart}</span>
                <span>Spend <strong>{EXTRA_LIFE_COST} coins</strong> to buy an Extra Life and continue your run after a wipeout.</span>
              </div>
              <div className="modal-item">
                <span className="modal-item-icon emoji-icon">{ICON.gift}</span>
                <span>Claim +500 free coins every 24 hours via the Daily Reward — no wallet needed.</span>
              </div>
              <div className="modal-item">
                <span className="modal-item-icon emoji-icon">{ICON.chain}</span>
                <span>On-chain redemption of coins will be enabled once the reward contract is deployed.</span>
              </div>
            </div>
          </div>

          {/* Blockchain */}
          <div className="modal-section">
            <div className="modal-section-title">
              <span className="icon emoji-icon">{ICON.chain}</span> Blockchain Features
            </div>
            <div className="modal-items">
              <div className="modal-item"><span className="modal-item-icon">◈</span><span>Connect MetaMask to unlock on-chain score saving</span></div>
              <div className="modal-item"><span className="modal-item-icon emoji-icon">\uD83D\uDCCA</span><span>Save your high score permanently on-chain after each run</span></div>
              <div className="modal-item"><span className="modal-item-icon emoji-icon">{ICON.gift}</span><span>Daily Reward is local (no wallet needed) — +500 coins, once per 24h</span></div>
              <div className="modal-item"><span className="modal-item-icon emoji-icon">📱</span><span>On Android, tap Connect Wallet to open in MetaMask Mobile</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  // Refs
  const canvasRef     = useRef<HTMLCanvasElement | null>(null);
  const gameAreaRef   = useRef<HTMLDivElement | null>(null);
  const engineRef     = useRef<GameEngine | null>(null);
  const playerNameRef = useRef<string>('Surfer');
  const runCountRef   = useRef<number>(0); // used to generate unique fallback names

  const walletRef = useRef<WalletState>({ address: null, provider: null, signer: null, chainId: null, networkName: null });

  // Screens & game state
  const [screen, setScreen]           = useState<Screen>('start');
  const [gameState, setGameState]     = useState<GameState | null>(null);
  const [finalScore, setFinalScore]   = useState(0);
  const [finalCoins, setFinalCoins]   = useState(0);
  const [isNewRecord, setIsNewRecord] = useState(false);

  // Extra Life / Lives system
  // Lives are NOT persistent between sessions — they reset to 0 each run.
  // Players can purchase a life using coins during the Game Over screen.
  const [lives, setLives] = useState(0);

  // Wallet
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

  // Live network change listener
  useEffect(() => {
    const unsubscribe = subscribeToChainChanges((chainId, networkName) => {
      if (!walletRef.current.address) return;
      setWallet({ ...walletRef.current, chainId, networkName });
    });
    return unsubscribe;
  }, [setWallet]);

  // Leaderboard / player
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [playerName, setPlayerName]   = useState<string>('Surfer');

  // HUD animations
  const [scoreAnim, setScoreAnim] = useState(false);
  const [comboAnim, setComboAnim] = useState(false);
  const prevCombo = useRef(1);
  const prevScore = useRef(0);

  // UI
  const [showRules, setShowRules] = useState(false);

  // Daily reward
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

  // Claim reward state (separate from wallet tx state)
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [claimSuccess, setClaimSuccess] = useState(false);
  const claimInFlightRef = useRef(false);
  const canClaimRewardRef = useRef(canClaimReward);
  useEffect(() => { canClaimRewardRef.current = canClaimReward; }, [canClaimReward]);

  // ── Telegram + leaderboard init ────────────────────────────────────────────
  useEffect(() => {
    initTelegram();
    const tgUser = getTelegramUser();
    if (tgUser) {
      const name = tgUser.username ? `@${tgUser.username}` : tgUser.first_name;
      setPlayerName(name);
      playerNameRef.current = name;
    } else {
      // Fallback: meaningful label instead of generic "Player"
      const name = 'Surfer';
      setPlayerName(name);
      playerNameRef.current = name;
    }
    setLeaderboard(getLeaderboard());
  }, []);

  useEffect(() => {
    playerNameRef.current = playerName;
  }, [playerName]);

  // ── HUD animations ─────────────────────────────────────────────────────────
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

  // ── Engine creation ────────────────────────────────────────────────────────
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

        // Build a meaningful name: Telegram name, or "Surfer #N"
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

  // ── Keyboard controls ──────────────────────────────────────────────────────
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

  // ── Touch controls ─────────────────────────────────────────────────────────
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

  // ── Game actions ───────────────────────────────────────────────────────────
  const startGame = useCallback(() => {
    setScreen('playing');
    setTxPhase('idle');
    setConnectPhase('idle');
    setTxMessage(null);
    setClaimMessage(null);
    setClaimSuccess(false);
    txInFlightRef.current = false;
    setLives(0); // lives reset each fresh run
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

  /**
   * Buy an Extra Life using coins and continue the run.
   * Uses lives first (free), otherwise deducts EXTRA_LIFE_COST coins.
   * The engine resumes from the exact point of death with a temporary shield.
   */
  const handleBuyLife = useCallback(() => {
    if (lives > 0) {
      // Use a free life
      setLives(l => l - 1);
      setScreen('playing');
      requestAnimationFrame(() => {
        engineRef.current?.addLife(0);
      });
    } else if (finalCoins >= EXTRA_LIFE_COST) {
      // Spend coins
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

  // ── Wallet actions ─────────────────────────────────────────────────────────
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

  // ── Active power-up effects ────────────────────────────────────────────────
  const activeEffects = gameState
    ? ([
        gameState.hasShield                    && { icon: ICON.shield, label: 'Shield', color: '#06b6d4' },
        Date.now() < gameState.magnetUntil     && { icon: ICON.magnet, label: 'Magnet', color: '#f97316' },
        Date.now() < gameState.speedBoostUntil && { icon: ICON.speed,  label: 'Boost',  color: '#10b981' },
        Date.now() < gameState.freezeUntil     && { icon: ICON.freeze, label: 'Frozen', color: '#60a5fa' },
        Date.now() < gameState.slowUntil       && { icon: ICON.slow,   label: 'Slow',   color: '#0d9488' },
      ] as (false | { icon: string; label: string; color: string })[]).filter(Boolean)
    : [];

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="app">

      {/* Top Bar */}
      <div className="topbar">
        <div className="brand">
          <span className="brand-icon emoji-icon">{ICON.wave}</span>
          <div className="brand-text">
            <span className="brand-title">SURF RUSH</span>
            <span className="brand-sub">WEB3</span>
          </div>
        </div>

        <div className="topbar-right">
          <button className="rules-btn" onClick={() => setShowRules(true)} type="button">
            📜 How to Play
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
          {(activeEffects as { icon: string; label: string; color: string }[]).map((fx) => (
            <div className="powerup-badge" key={fx.label} style={{ borderColor: fx.color, color: fx.color }}>
              <span className="emoji-icon">{fx.icon}</span>
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
      <Leaderboard entries={leaderboard} />

      {/* Rules modal */}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}

    </div>
  );
}