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
  isMetaMaskAvailable,
  saveScoreOnChain,
  claimRewardOnChain,
  WalletState
} from './wallet';
import { initTelegram, getTelegramUser, shareScore } from './telegram';

type Screen = 'start' | 'playing' | 'gameover';

const TELEGRAM_BOT_USERNAME = 'your_bot_username';

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

// ─── Wallet Panel ─────────────────────────────────────────────────────────────
interface WalletPanelProps {
  address: string;
  onDisconnect: () => void;
  onCopy: () => void;
  copyFeedback: boolean;
}

function WalletPanel({ address, onDisconnect, onCopy, copyFeedback }: WalletPanelProps) {
  return (
    <div className="wallet-panel">
      <div className="wallet-panel-icon">◈</div>
      <div className="wallet-panel-info">
        <div className="wallet-panel-label">Connected Wallet</div>
        <div className="wallet-panel-address">{address}</div>
        <div className="wallet-panel-status">
          <span className="wallet-dot" />
          <span className="wallet-panel-net">Ethereum Mainnet</span>
        </div>
      </div>
      <div className="wallet-panel-actions">
        <button className="copy-addr-btn" onClick={onCopy}>
          {copyFeedback ? '✓ Copied' : 'Copy'}
        </button>
        <button className="disconnect-btn" onClick={onDisconnect}>
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
        <span className="hud-value coin-val">🪙 {gameState.coins}</span>
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
          <div className="start-waves">🌊🌊🌊</div>
          <h1 className="start-title">SURF RUSH</h1>
          <div className="start-badge">⛓ WEB3 EDITION</div>
        </div>

        <p className="start-desc">
          Ride the waves. Dodge obstacles.<br />
          Collect rewards. Earn on-chain.
        </p>

        <div className="feature-chips">
          <div className="chip">🏄 Surf</div>
          <div className="chip">🛡️ Power-ups</div>
          <div className="chip">⛓️ On-chain</div>
          <div className="chip">🎁 Daily Rewards</div>
        </div>

        <button className="play-btn" onClick={onStart}>
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

// ─── Game Over Overlay ────────────────────────────────────────────────────────
interface GameOverOverlayProps {
  finalScore: number;
  finalCoins: number;
  isNewRecord: boolean;
  timeUntilNextClaim: string;
  canClaimReward: boolean;
  txLoading: boolean;
  txStatus: string | null;
  // Pass the full wallet state so handlers are never stale
  wallet: WalletState;
  onRestart: () => void;
  onShare: () => void;
  onSaveOnChain: () => void;
  onConnectWallet: () => void;
  onClaimReward: () => void;
}

function GameOverOverlay({
  finalScore,
  finalCoins,
  isNewRecord,
  timeUntilNextClaim,
  canClaimReward,
  txLoading,
  txStatus,
  wallet,
  onRestart,
  onShare,
  onSaveOnChain,
  onConnectWallet,
  onClaimReward,
}: GameOverOverlayProps) {
  return (
    // pointer-events: all ensures clicks are never swallowed by the canvas below
    <div className="overlay gameover-overlay" style={{ pointerEvents: 'all' }}>
      <div className="gameover-modal" onClick={(e) => e.stopPropagation()}>
        {isNewRecord && <div className="new-record-banner">🏆 NEW RECORD!</div>}

        <div className="gameover-header">
          <h2 className="gameover-title">WIPEOUT!</h2>
          <p className="gameover-sub">Your run has ended. Claim your rewards below.</p>
        </div>

        <div className="score-card">
          <div className="score-card-row">
            <span className="sc-label">Final Score</span>
            <span className="sc-value score-highlight">{finalScore.toLocaleString()}</span>
          </div>
          <div className="score-card-divider" />
          <div className="score-card-row">
            <span className="sc-label">Coins Collected</span>
            <span className="sc-value">🪙 {finalCoins}</span>
          </div>
        </div>

        {/* Daily reward — shows prompt to connect wallet if not connected */}
        <div className="daily-reward-card">
          <div className="dr-header">
            <span>🎁 Daily Reward</span>
            <span className="dr-timer">{timeUntilNextClaim}</span>
          </div>
          <p className="dr-desc">+500 coins · Claimable once every 24 hours</p>

          {wallet.signer ? (
            <button
              className="action-btn chain-action"
              style={{ marginTop: '8px' }}
              onClick={onClaimReward}
              disabled={txLoading || !canClaimReward}
            >
              {txLoading
                ? <span className="spinner" />
                : canClaimReward
                  ? '🎁 Claim Daily Reward'
                  : `⏳ Next claim in ${timeUntilNextClaim}`}
            </button>
          ) : (
            // Wallet not connected — show inline connect prompt instead of silently failing
            <button
              className="action-btn wallet-action"
              style={{ marginTop: '8px' }}
              onClick={onConnectWallet}
              disabled={txLoading}
            >
              {txLoading ? <span className="spinner" /> : '◈ Connect Wallet to Claim'}
            </button>
          )}
        </div>

        <div className="gameover-actions">
          <button className="action-btn primary-action" onClick={onRestart}>
            ↺ Surf Again
          </button>

          <button className="action-btn telegram-action" onClick={onShare}>
            📲 Share on Telegram
          </button>

          {wallet.signer ? (
            <button
              className="action-btn chain-action"
              onClick={onSaveOnChain}
              disabled={txLoading}
            >
              {txLoading ? <span className="spinner" /> : '⛓️ Save Score On-Chain'}
            </button>
          ) : (
            <button
              className="action-btn wallet-action"
              onClick={onConnectWallet}
              disabled={txLoading}
            >
              {txLoading ? <span className="spinner" /> : '◈ Connect Wallet to Save Score'}
            </button>
          )}
        </div>

        {txStatus && (
          <div className={`tx-status ${txStatus.startsWith('✅') ? 'tx-success' : 'tx-error'}`}>
            {txStatus}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────
interface LeaderboardProps {
  entries: LeaderboardEntry[];
}

function Leaderboard({ entries }: LeaderboardProps) {
  const rankLabel = (i: number) => {
    if (i === 0) return '🥇';
    if (i === 1) return '🥈';
    if (i === 2) return '🥉';
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
      <div className="section-header">
        <div className="section-icon">🏆</div>
        <span className="section-title">Leaderboard</span>
        <span className="section-badge">{entries.length} entries</span>
      </div>
      {entries.length === 0 ? (
        <div className="lb-empty">Play to appear on the leaderboard!</div>
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
                <span className="lb-coins">🪙 {entry.coins}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Rules Modal ──────────────────────────────────────────────────────────────
interface RulesModalProps {
  onClose: () => void;
}

function RulesModal({ onClose }: RulesModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="rules-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-left">
            <span className="modal-header-icon">🌊</span>
            <div>
              <h2>How to Play</h2>
              <p>Surf Rush · Web3 Edition</p>
            </div>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="modal-content">
          <div className="modal-section">
            <div className="modal-section-title">
              <span className="icon">🎯</span> Objective
            </div>
            <div className="modal-items">
              <div className="modal-item">
                <span className="modal-item-icon">🏄</span>
                <span>Survive as long as possible on the endless ocean while dodging obstacles.</span>
              </div>
              <div className="modal-item">
                <span className="modal-item-icon">🪙</span>
                <span>Collect coins and power-up boxes to increase your score and combo.</span>
              </div>
              <div className="modal-item">
                <span className="modal-item-icon">⛓️</span>
                <span>Save your high score on-chain and claim daily blockchain rewards.</span>
              </div>
            </div>
          </div>

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

          <div className="modal-section">
            <div className="modal-section-title">
              <span className="icon">✨</span> Power-Ups
            </div>
            <div className="modal-powerup-grid">
              <div className="modal-powerup-item">
                <span className="pu-icon">🛡️</span>
                <div className="pu-info">
                  <span className="pu-name">Shield</span>
                  <span className="pu-desc">Absorbs one collision</span>
                </div>
              </div>
              <div className="modal-powerup-item">
                <span className="pu-icon">🧲</span>
                <div className="pu-info">
                  <span className="pu-name">Magnet</span>
                  <span className="pu-desc">Attracts coins for 6s</span>
                </div>
              </div>
              <div className="modal-powerup-item">
                <span className="pu-icon">⚡</span>
                <div className="pu-info">
                  <span className="pu-name">Speed Boost</span>
                  <span className="pu-desc">1.6× speed for 5s</span>
                </div>
              </div>
              <div className="modal-powerup-item">
                <span className="pu-icon">🔥</span>
                <div className="pu-info">
                  <span className="pu-name">Combo Up</span>
                  <span className="pu-desc">+1 score multiplier</span>
                </div>
              </div>
              <div className="modal-powerup-item">
                <span className="pu-icon">💀</span>
                <div className="pu-info">
                  <span className="pu-name">Coin Cut</span>
                  <span className="pu-desc">Lose 20 coins · avoid!</span>
                </div>
              </div>
              <div className="modal-powerup-item">
                <span className="pu-icon">❄️</span>
                <div className="pu-info">
                  <span className="pu-name">Freeze</span>
                  <span className="pu-desc">Stops movement for 1.2s</span>
                </div>
              </div>
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">
              <span className="icon">🚧</span> Obstacles
            </div>
            <div className="modal-items">
              <div className="modal-item"><span className="modal-item-icon">🪨</span><span>Rock — solid object blocking the lane</span></div>
              <div className="modal-item"><span className="modal-item-icon">🦈</span><span>Shark — lurks beneath the surface</span></div>
              <div className="modal-item"><span className="modal-item-icon">🪼</span><span>Jellyfish — drifts unpredictably</span></div>
              <div className="modal-item"><span className="modal-item-icon">🌊</span><span>Rogue Wave — crashing wall of water</span></div>
            </div>
          </div>

          <div className="modal-section">
            <div className="modal-section-title">
              <span className="icon">⛓️</span> Blockchain Features
            </div>
            <div className="modal-items">
              <div className="modal-item"><span className="modal-item-icon">◈</span><span>Connect MetaMask to unlock on-chain features</span></div>
              <div className="modal-item"><span className="modal-item-icon">📊</span><span>Save your high score permanently on-chain after each run</span></div>
              <div className="modal-item"><span className="modal-item-icon">🎁</span><span>Claim +500 coins as a daily reward once every 24 hours</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
function App() {
  // Refs
  const canvasRef     = useRef<HTMLCanvasElement | null>(null);
  const gameAreaRef   = useRef<HTMLDivElement | null>(null);
  const engineRef     = useRef<GameEngine | null>(null);
  const playerNameRef = useRef<string>('Player');

  // Keep a ref to wallet so async callbacks always read the latest value
  // without needing wallet in their useCallback dep arrays (which would
  // recreate the handlers and cause stale-closure issues in GameOverOverlay).
  const walletRef = useRef<WalletState>({ address: null, provider: null, signer: null });

  // Screens & game state
  const [screen, setScreen]           = useState<Screen>('start');
  const [gameState, setGameState]     = useState<GameState | null>(null);
  const [finalScore, setFinalScore]   = useState(0);
  const [finalCoins, setFinalCoins]   = useState(0);
  const [isNewRecord, setIsNewRecord] = useState(false);

  // Wallet — kept in both state (for rendering) and ref (for async handlers)
  const [wallet, setWalletState]       = useState<WalletState>({ address: null, provider: null, signer: null });
  const [walletError, setWalletError]  = useState<string | null>(null);
  const [txStatus, setTxStatus]        = useState<string | null>(null);
  const [txLoading, setTxLoading]      = useState(false);
  const [copyFeedback, setCopyFeedback] = useState(false);

  /** Sets wallet in both state and ref so async handlers are never stale. */
  const setWallet = useCallback((w: WalletState) => {
    walletRef.current = w;
    setWalletState(w);
  }, []);

  // Leaderboard / player
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [playerName, setPlayerName]   = useState<string>('Player');

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

  // ── Daily reward timer ─────────────────────────────────────────────────────
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

  // ── Telegram + leaderboard init ────────────────────────────────────────────
  useEffect(() => {
    initTelegram();
    const tgUser = getTelegramUser();
    if (tgUser) {
      const name = tgUser.username ? `@${tgUser.username}` : tgUser.first_name;
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

        const updated = saveToLeaderboard({
          name:  playerNameRef.current,
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
    setTxStatus(null);
    setTxLoading(false);
    engineRef.current?.start();
  }, []);

  const restartGame = useCallback(() => {
    setScreen('playing');
    setTxStatus(null);
    setTxLoading(false);
    engineRef.current?.restart();
  }, []);

  const togglePause = useCallback(() => {
    engineRef.current?.togglePause();
  }, []);

  // ── Wallet actions ─────────────────────────────────────────────────────────
  // FIX: handleConnectWallet now also clears txStatus so the game-over modal
  // feedback area is reset, and sets a success txStatus when connection works
  // so the user gets visible in-modal confirmation.
  const handleConnectWallet = useCallback(async () => {
    setWalletError(null);
    setTxStatus(null);

    if (!isMetaMaskAvailable()) {
      const msg = 'MetaMask not found. Install MetaMask or open in a MetaMask-enabled browser.';
      setWalletError(msg);
      setTxStatus(`❌ ${msg}`);
      return;
    }

    try {
      setTxLoading(true);
      setTxStatus('Connecting wallet…');
      const connected = await connectWallet();
      setWallet(connected);
      setTxStatus(`✅ Wallet connected: ${shortenAddress(connected.address!)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to connect wallet.';
      setWalletError(msg);
      setTxStatus(`❌ ${msg}`);
    } finally {
      setTxLoading(false);
    }
  }, [setWallet]);

  const handleDisconnectWallet = useCallback(() => {
    setWallet(disconnectWallet());
    setTxStatus(null);
    setWalletError(null);
  }, [setWallet]);

  const handleCopyAddress = useCallback(() => {
    if (!walletRef.current.address) return;
    navigator.clipboard.writeText(walletRef.current.address).then(() => {
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    });
  }, []);

  // FIX: reads signer from walletRef.current (always latest) instead of
  // closing over wallet.signer at hook-creation time. This means the handler
  // works immediately after connectWallet() resolves, even though the
  // GameOverOverlay received the handler before the wallet was connected.
  const handleSaveScoreOnChain = useCallback(async () => {
    const signer = walletRef.current.signer;
    if (!signer) {
      setTxStatus('❌ Connect your wallet first, then save your score.');
      return;
    }
    try {
      setTxLoading(true);
      setTxStatus('Saving score on-chain… approve in MetaMask.');
      const hash = await saveScoreOnChain(signer, finalScore);
      setTxStatus(`✅ Score saved! Tx: ${shortenAddress(hash)}`);
    } catch (err: any) {
      if (err.code === 4001 || err.message?.includes('rejected') || err.message?.includes('denied')) {
        setTxStatus('❌ Transaction cancelled.');
      } else {
        setTxStatus(`❌ ${err.message || 'Transaction failed.'}`);
      }
    } finally {
      setTxLoading(false);
    }
  }, [finalScore]); // finalScore is the only value not in a ref

  // FIX: same pattern — reads signer from walletRef so it's never stale.
  // Also uses a ref for canClaimReward so it doesn't need to be a dep.
  const canClaimRewardRef = useRef(canClaimReward);
  useEffect(() => { canClaimRewardRef.current = canClaimReward; }, [canClaimReward]);

  const handleClaimReward = useCallback(async () => {
    const signer = walletRef.current.signer;

    if (!signer) {
      // User clicked "Claim Daily Reward" without a wallet connected.
      // Show clear in-modal feedback instead of silently failing.
      setTxStatus('❌ Connect your wallet first, then claim your reward.');
      return;
    }

    if (!canClaimRewardRef.current) {
      setTxStatus('❌ Daily reward already claimed. Check back in 24 hours.');
      return;
    }

    try {
      setTxLoading(true);
      setTxStatus('Waiting for wallet approval… approve in MetaMask.');
      const hash = await claimRewardOnChain(signer);
      const now  = Date.now();
      localStorage.setItem('surfRushLastClaim', String(now));
      setLastClaimTime(now);
      setTxStatus(`✅ Reward claimed! Tx: ${shortenAddress(hash)}`);
    } catch (err: any) {
      if (err.code === 4001 || err.message?.includes('rejected') || err.message?.includes('denied')) {
        setTxStatus('❌ Transaction cancelled.');
      } else {
        setTxStatus('❌ Transaction failed. Please try again.');
      }
    } finally {
      setTxLoading(false);
    }
  }, []); // no deps — reads everything from refs

  const handleShareScore = useCallback(() => {
    shareScore(finalScore, TELEGRAM_BOT_USERNAME);
  }, [finalScore]);

  // ── Active power-up effects ────────────────────────────────────────────────
  const activeEffects = gameState
    ? ([
        gameState.hasShield                    && { icon: '🛡️', label: 'Shield', color: '#06b6d4' },
        Date.now() < gameState.magnetUntil     && { icon: '🧲', label: 'Magnet', color: '#f97316' },
        Date.now() < gameState.speedBoostUntil && { icon: '⚡', label: 'Boost',  color: '#10b981' },
        Date.now() < gameState.freezeUntil     && { icon: '❄️', label: 'Frozen', color: '#60a5fa' },
        Date.now() < gameState.slowUntil       && { icon: '🌀', label: 'Slow',   color: '#0d9488' },
      ] as (false | { icon: string; label: string; color: string })[]).filter(Boolean)
    : [];

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className="app">

      {/* Top Bar */}
      <div className="topbar">
        <div className="brand">
          <span className="brand-icon">🌊</span>
          <div className="brand-text">
            <span className="brand-title">SURF RUSH</span>
            <span className="brand-sub">WEB3</span>
          </div>
        </div>

        <div className="topbar-right">
          <button className="rules-btn" onClick={() => setShowRules(true)}>
            📜 How to Play
          </button>

          {walletError && (
            <div className="wallet-error-inline">{walletError}</div>
          )}

          {wallet.address ? (
            <button className="wallet-btn connected" onClick={handleDisconnectWallet}>
              <span className="wallet-dot" />
              {shortenAddress(wallet.address)}
            </button>
          ) : (
            <button className="wallet-btn" onClick={handleConnectWallet}>
              <span className="wallet-icon">◈</span> Connect Wallet
            </button>
          )}
        </div>
      </div>

      {/* Wallet Panel */}
      {wallet.address && (
        <WalletPanel
          address={wallet.address}
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
              <span>{fx.icon}</span>
              <span>{fx.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Game area */}
      <div
        className="game-area"
        ref={gameAreaRef}
        style={{ minHeight: screen === 'playing' ? '55vh' : '520px' }}
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
            txLoading={txLoading}
            txStatus={txStatus}
            wallet={wallet}
            onRestart={restartGame}
            onShare={handleShareScore}
            onSaveOnChain={handleSaveScoreOnChain}
            onConnectWallet={handleConnectWallet}
            onClaimReward={handleClaimReward}
          />
        )}
      </div>

      {/* Mobile controls */}
      {screen === 'playing' && (
        <div className="controls">
          <button className="ctrl-btn" onPointerDown={() => engineRef.current?.moveLeft()}>◀</button>
          <button className="ctrl-btn pause-btn" onPointerDown={togglePause}>
            {gameState?.isPaused ? '▶' : '⏸'}
          </button>
          <button className="ctrl-btn" onPointerDown={() => engineRef.current?.moveRight()}>▶</button>
        </div>
      )}

      {/* Leaderboard */}
      <Leaderboard entries={leaderboard} />

      {/* Rules modal */}
      {showRules && <RulesModal onClose={() => setShowRules(false)} />}

    </div>
  );
}

export default App;
