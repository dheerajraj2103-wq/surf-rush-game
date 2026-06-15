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
import { initTelegram, getTelegramUser, isInsideTelegram, shareScore } from './telegram';

type Screen = 'start' | 'playing' | 'gameover';

const TELEGRAM_BOT_USERNAME = 'your_bot_username';

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [screen, setScreen] = useState<Screen>('start');
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [finalScore, setFinalScore] = useState(0);
  const [finalCoins, setFinalCoins] = useState(0);
  const [isNewRecord, setIsNewRecord] = useState(false);

  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    provider: null,
    signer: null
  });
  const [walletError, setWalletError] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);
  const [txLoading, setTxLoading] = useState(false);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [playerName, setPlayerName] = useState<string>('Player');

  const [scoreAnim, setScoreAnim] = useState(false);
  const [comboAnim, setComboAnim] = useState(false);
  const prevCombo = useRef(1);
  const prevScore = useRef(0);

  // Rules modal
  const [showRules, setShowRules] = useState(false);

  // Daily reward cooldown
  const [lastClaimTime, setLastClaimTime] = useState<number | null>(null);
  const [timeUntilNextClaim, setTimeUntilNextClaim] = useState('Ready now!');

  const loadLastClaim = useCallback(() => {
    const saved = localStorage.getItem('surfRushLastClaim');
    if (saved) {
      const time = parseInt(saved);
      setLastClaimTime(time);
    }
  }, []);

  const updateTimeUntilClaim = useCallback(() => {
    if (!lastClaimTime) {
      setTimeUntilNextClaim('Ready now!');
      return;
    }
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000;
    const next = lastClaimTime + cooldown;
    if (now >= next) {
      setTimeUntilNextClaim('Ready now!');
    } else {
      const rem = next - now;
      const h = Math.floor(rem / (3600000));
      const m = Math.floor((rem % 3600000) / 60000);
      setTimeUntilNextClaim(`${h}h ${m}m`);
    }
  }, [lastClaimTime]);

  useEffect(() => {
    loadLastClaim();
  }, [loadLastClaim]);

  useEffect(() => {
    const interval = setInterval(updateTimeUntilClaim, 30000);
    updateTimeUntilClaim();
    return () => clearInterval(interval);
  }, [updateTimeUntilClaim]);

  const canClaim = !lastClaimTime || Date.now() - lastClaimTime >= 24 * 60 * 60 * 1000;

  useEffect(() => {
    initTelegram();
    const tgUser = getTelegramUser();
    if (tgUser) {
      setPlayerName(tgUser.username ? `@${tgUser.username}` : tgUser.first_name);
    }
    setLeaderboard(getLeaderboard());
  }, []);

  useEffect(() => {
    if (gameState) {
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
    }
  }, [gameState]);

  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new GameEngine(canvasRef.current, {
      onStateChange: (state) => setGameState(state),
      onGameOver: (score, coins) => {
        setFinalScore(score);
        setFinalCoins(coins);

        const prevLeaderboard = getLeaderboard();
        const topScore = prevLeaderboard.length > 0 ? prevLeaderboard[0].score : 0;
        setIsNewRecord(score > topScore);

        const updated = saveToLeaderboard({
          name: playerName,
          score,
          coins,
          date: new Date().toISOString()
        });
        setLeaderboard(updated);
        setScreen('gameover');
      }
    });

    engineRef.current = engine;
    return () => { engine.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerName]);

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

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (screen !== 'playing') return;
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') {
        engineRef.current?.moveLeft();
      } else if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') {
        engineRef.current?.moveRight();
      } else if (e.key === ' ' || e.key.toLowerCase() === 'p') {
        engineRef.current?.togglePause();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [screen]);

  useEffect(() => {
    const area = canvasRef.current?.parentElement;
    if (!area) return;

    let touchStartX = 0;

    const onTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0]?.clientX ?? 0;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const endX = e.changedTouches[0]?.clientX ?? 0;
      const delta = endX - touchStartX;
      if (Math.abs(delta) < 30) return;
      if (delta > 0) engineRef.current?.moveRight();
      else engineRef.current?.moveLeft();
    };

    area.addEventListener('touchstart', onTouchStart);
    area.addEventListener('touchend', onTouchEnd);

    return () => {
      area.removeEventListener('touchstart', onTouchStart);
      area.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  const handleConnectWallet = useCallback(async () => {
    setWalletError(null);
    if (!isMetaMaskAvailable()) {
      setWalletError('MetaMask not found. Install it or open in a MetaMask-enabled browser.');
      return;
    }
    try {
      const newWallet = await connectWallet();
      setWallet(newWallet);
    } catch (err) {
      setWalletError(err instanceof Error ? err.message : 'Failed to connect wallet.');
    }
  }, []);

  const handleDisconnectWallet = useCallback(() => {
    setWallet(disconnectWallet());
  }, []);

  const handleSaveScoreOnChain = useCallback(async () => {
    if (!wallet.signer) {
      setWalletError('Connect your wallet first.');
      return;
    }
    try {
      setTxLoading(true);
      setTxStatus('Saving score on-chain...');
      const hash = await saveScoreOnChain(wallet.signer, finalScore);
      setTxStatus(`✅ Score saved successfully! Tx: ${shortenAddress(hash)}`);
    } catch (err) {
      setTxStatus(err instanceof Error ? `❌ ${err.message}` : '❌ Transaction failed.');
    } finally {
      setTxLoading(false);
    }
  }, [wallet.signer, finalScore]);

  const handleClaimReward = useCallback(async () => {
    if (!wallet.signer) {
      setWalletError('Connect your wallet first.');
      return;
    }
    if (!canClaim) {
      setTxStatus('❌ Daily reward cooldown active. Please wait.');
      return;
    }
    try {
      setTxLoading(true);
      setTxStatus('Claiming daily reward...');
      const hash = await claimRewardOnChain(wallet.signer);
      
      const now = Date.now();
      localStorage.setItem('surfRushLastClaim', now.toString());
      setLastClaimTime(now);
      
      setTxStatus(`✅ Daily reward claimed! Tx: ${shortenAddress(hash)}`);
    } catch (err) {
      setTxStatus(err instanceof Error ? `❌ ${err.message}` : '❌ Claim failed.');
    } finally {
      setTxLoading(false);
    }
  }, [wallet.signer, canClaim]);

  const handleShareScore = useCallback(() => {
    shareScore(finalScore, TELEGRAM_BOT_USERNAME);
  }, [finalScore]);

  const activeEffects = gameState ? [
    gameState.hasShield && { icon: '🛡️', label: 'Shield', color: '#06b6d4' },
    Date.now() < gameState.magnetUntil && { icon: '🧲', label: 'Magnet', color: '#f97316' },
    Date.now() < gameState.speedBoostUntil && { icon: '⚡', label: 'Boost', color: '#10b981' },
    Date.now() < gameState.freezeUntil && { icon: '❄️', label: 'Frozen', color: '#60a5fa' },
    Date.now() < gameState.slowUntil && { icon: '🌀', label: 'Slow', color: '#0d9488' },
  ].filter(Boolean) : [];

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
            📜 Rules
          </button>
          {walletError && <div className="wallet-error-inline">{walletError}</div>}
          {wallet.address ? (
            <button className="wallet-btn connected" onClick={handleDisconnectWallet}>
              <span className="wallet-dot" /> {shortenAddress(wallet.address)}
            </button>
          ) : (
            <button className="wallet-btn" onClick={handleConnectWallet}>
              <span className="wallet-icon">◈</span> Connect
            </button>
          )}
        </div>
      </div>

      {/* HUD */}
      {screen === 'playing' && gameState && (
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
      )}

      {screen === 'playing' && activeEffects.length > 0 && (
        <div className="powerup-bar">
          {(activeEffects as any[]).map((fx) => (
            <div className="powerup-badge" key={fx.label} style={{ borderColor: fx.color, boxShadow: `0 0 10px ${fx.color}55` }}>
              <span>{fx.icon}</span>
              <span style={{ color: fx.color }}>{fx.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Game Area */}
      <div className="game-area">
        <canvas ref={canvasRef} />

        {/* Start Screen */}
        {screen === 'start' && (
          <div className="overlay start-overlay">
            <div className="start-content">
              <div className="start-logo">
                <div className="start-waves">🌊🌊🌊</div>
                <h1 className="start-title">SURF RUSH</h1>
                <div className="start-badge">WEB3 EDITION</div>
              </div>
              <p className="start-desc">
                Ride the waves. Dodge obstacles.<br />
                Collect rewards. Earn on-chain.
              </p>
              <div className="feature-chips">
                <div className="chip">⚡ Power-ups</div>
                <div className="chip">🛡️ Shields</div>
                <div className="chip">🔗 On-chain</div>
                <div className="chip">🏆 Leaderboard</div>
              </div>
              <div className="controls-hint">
                {isInsideTelegram() ? '👆 Swipe left/right' : 'Arrow keys / A D • Space to pause'}
              </div>
              <button className="play-btn" onClick={startGame}>
                <span className="play-btn-icon">▶</span> START SURFING
              </button>
            </div>
          </div>
        )}

        {/* Game Over */}
        {screen === 'gameover' && (
          <div className="overlay gameover-overlay">
            <div className="gameover-modal">
              {isNewRecord && <div className="new-record-banner">🏆 NEW RECORD!</div>}
              <h2 className="gameover-title">WIPEOUT!</h2>

              <div className="score-card">
                <div className="score-card-row">
                  <span className="sc-label">Final Score</span>
                  <span className="sc-value score-highlight">{finalScore.toLocaleString()}</span>
                </div>
                <div className="score-card-divider" />
                <div className="score-card-row">
                  <span className="sc-label">🪙 Coins</span>
                  <span className="sc-value">{finalCoins}</span>
                </div>
              </div>

              {/* Daily Reward */}
              <div className="daily-reward-card">
                <div className="dr-header">
                  <span>🎁 Daily Reward</span>
                  <span className="dr-timer">{timeUntilNextClaim}</span>
                </div>
                <p className="dr-desc">+500 coins • One claim every 24 hours</p>
                <button
                  className="action-btn chain-action"
                  onClick={handleClaimReward}
                  disabled={txLoading || !canClaim}
                >
                  {txLoading ? <span className="spinner" /> : 'Claim Daily Reward'}
                </button>
              </div>

              <div className="gameover-actions">
                <button className="action-btn primary-action" onClick={restartGame}>
                  ↺ Surf Again
                </button>
                <button className="action-btn telegram-action" onClick={handleShareScore}>
                  📲 Share on Telegram
                </button>
                {wallet.address ? (
                  <button
                    className="action-btn chain-action save-btn"
                    onClick={handleSaveScoreOnChain}
                    disabled={txLoading}
                  >
                    {txLoading ? <span className="spinner" /> : '⛓️ Save Score On-Chain'}
                  </button>
                ) : (
                  <button className="action-btn wallet-action" onClick={handleConnectWallet}>
                    ◈ Connect Wallet
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
        )}
      </div>

      {/* Mobile Controls */}
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
      <div className="leaderboard">
        <div className="lb-header">
          <span className="lb-icon">🏆</span>
          <h3 className="lb-title">LEADERBOARD</h3>
        </div>
        {leaderboard.length === 0 ? (
          <div className="lb-empty">
            No scores yet. Ride the waves!
          </div>
        ) : (
          <div className="lb-list">
            {leaderboard.map((entry, idx) => (
              <div key={`${entry.date}-${idx}`} className={`lb-row ${idx < 3 ? `lb-top-${idx}` : ''}`}>
                <div className="lb-rank">
                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                </div>
                <div className="lb-info">
                  <span className="lb-name">{entry.name}</span>
                </div>
                <div className="lb-scores">
                  <span className="lb-score">{entry.score.toLocaleString()}</span>
                  <span className="lb-date">{new Date(entry.date).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rules Modal */}
      {showRules && (
        <div className="modal-overlay" onClick={() => setShowRules(false)}>
          <div className="rules-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>SURF RUSH WEB3</h2>
              <button className="modal-close" onClick={() => setShowRules(false)}>✕</button>
            </div>
            <div className="modal-content">
              <section>
                <h3>Objective</h3>
                <ul>
                  <li>Surf as long as possible</li>
                  <li>Avoid obstacles</li>
                  <li>Collect coins &amp; power-ups</li>
                  <li>Save your best score on-chain</li>
                </ul>
              </section>
              <section>
                <h3>Controls</h3>
                <ul>
                  <li>Left/Right arrows or A/D</li>
                  <li>Swipe on mobile</li>
                  <li>Space to pause</li>
                </ul>
              </section>
              <section>
                <h3>Daily Reward</h3>
                <p>Claim 500 bonus coins once every 24 hours per wallet.</p>
              </section>
              <section>
                <h3>Blockchain</h3>
                <ul>
                  <li>Connect MetaMask</li>
                  <li>Save score permanently</li>
                  <li>Claim daily rewards</li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;