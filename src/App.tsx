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

  // Daily reward system (frontend cooldown with localStorage)
  const [lastClaimTime, setLastClaimTime] = useState<number | null>(null);
  const [timeUntilNextClaim, setTimeUntilNextClaim] = useState<string>('');

  const loadLastClaim = useCallback(() => {
    const saved = localStorage.getItem('surfRushLastClaim');
    if (saved) {
      setLastClaimTime(parseInt(saved));
    }
  }, []);

  const updateTimeUntilClaim = useCallback(() => {
    if (!lastClaimTime) {
      setTimeUntilNextClaim('Ready now!');
      return;
    }
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000; // 24 hours
    const nextClaim = lastClaimTime + cooldown;
    if (now >= nextClaim) {
      setTimeUntilNextClaim('Ready now!');
    } else {
      const remaining = nextClaim - now;
      const hours = Math.floor(remaining / (1000 * 60 * 60));
      const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      setTimeUntilNextClaim(`${hours}h ${minutes}m`);
    }
  }, [lastClaimTime]);

  useEffect(() => {
    loadLastClaim();
  }, [loadLastClaim]);

  useEffect(() => {
    const interval = setInterval(updateTimeUntilClaim, 30000); // update every 30s
    updateTimeUntilClaim();
    return () => clearInterval(interval);
  }, [updateTimeUntilClaim]);

  const canClaimReward = !lastClaimTime || Date.now() - lastClaimTime >= 24 * 60 * 60 * 1000;

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
    if (!wallet.signer) { setWalletError('Connect your wallet first.'); return; }
    try {
      setTxLoading(true);
      setTxStatus('Saving score on-chain...');
      const hash = await saveScoreOnChain(wallet.signer, finalScore);
      setTxStatus(`✅ Score saved! Tx: ${shortenAddress(hash)}`);
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
    if (!canClaimReward) {
      setTxStatus('❌ Daily reward already claimed. Try again later.');
      return;
    }
    try {
      setTxLoading(true);
      setTxStatus('Claiming daily reward...');
      const hash = await claimRewardOnChain(wallet.signer);
      
      // Update local cooldown
      const now = Date.now();
      localStorage.setItem('surfRushLastClaim', now.toString());
      setLastClaimTime(now);
      
      setTxStatus(`✅ Daily reward claimed! +500 coins. Tx: ${shortenAddress(hash)}`);
    } catch (err) {
      setTxStatus(err instanceof Error ? `❌ ${err.message}` : '❌ Claim failed.');
    } finally {
      setTxLoading(false);
    }
  }, [wallet.signer, canClaimReward]);

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
      {/* ── Top Bar ── */}
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
              <span className="wallet-icon">◈</span> Connect
            </button>
          )}
        </div>
      </div>

      {/* ── HUD ── */}
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

      {/* Active power-up badges */}
      {screen === 'playing' && activeEffects.length > 0 && (
        <div className="powerup-bar">
          {(activeEffects as { icon: string; label: string; color: string }[]).map((fx) => (
            <div className="powerup-badge" key={fx.label} style={{ borderColor: fx.color, boxShadow: `0 0 10px ${fx.color}55` }}>
              <span>{fx.icon}</span>
              <span style={{ color: fx.color }}>{fx.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Game Canvas Area ── */}
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
                Ride the endless waves.<br />
                Master the surf. Claim your glory.
              </p>

              <div className="feature-chips">
                <div className="chip">🏄‍♂️ Surfboard</div>
                <div className="chip">🪨 Rocks & Sharks</div>
                <div className="chip">🛡️ Power-ups</div>
                <div className="chip">⛓️ On-Chain</div>
              </div>

              <div className="controls-hint">
                {isInsideTelegram()
                  ? '👆 Swipe left/right to surf'
                  : '⬅ ➡ Arrow keys or A/D to move · Space to pause'}
              </div>

              <button className="play-btn" onClick={startGame}>
                <span className="play-btn-icon">🌊</span>
                <span>START SURFING</span>
              </button>

              <button className="secondary-btn" onClick={() => setShowRules(true)}>
                📜 How to Play
              </button>
            </div>
          </div>
        )}

        {/* Game Over Screen */}
        {screen === 'gameover' && (
          <div className="overlay gameover-overlay">
            <div className="gameover-modal">
              {isNewRecord && (
                <div className="new-record-banner">🏆 NEW RECORD!</div>
              )}

              <h2 className="gameover-title">WIPEOUT!</h2>

              <div className="score-card">
                <div className="score-card-row">
                  <span className="sc-label">Final Score</span>
                  <span className="sc-value score-highlight">{finalScore.toLocaleString()}</span>
                </div>
                <div className="score-card-divider" />
                <div className="score-card-row">
                  <span className="sc-label">🪙 Coins Collected</span>
                  <span className="sc-value">{finalCoins}</span>
                </div>
              </div>

              {/* Daily Reward Section */}
              <div className="daily-reward-card">
                <div className="dr-header">
                  <span>🎁 Daily Reward</span>
                  <span className="dr-timer">{timeUntilNextClaim}</span>
                </div>
                <p className="dr-desc">Claim 500 bonus coins once every 24 hours</p>
                <button 
                  className="action-btn chain-action dr-claim"
                  onClick={handleClaimReward}
                  disabled={txLoading || !canClaimReward}
                >
                  {txLoading ? <span className="spinner" /> : 'Claim Daily Reward'}
                </button>
              </div>

              <div className="gameover-actions">
                <button className="action-btn primary-action" onClick={restartGame}>
                  ↺ Surf Again
                </button>

                <button className="action-btn telegram-action" onClick={handleShareScore}>
                  <span>📲</span> Share on Telegram
                </button>

                {wallet.address ? (
                  <div className="chain-actions">
                    <button
                      className="action-btn chain-action"
                      onClick={handleSaveScoreOnChain}
                      disabled={txLoading}
                    >
                      {txLoading ? <span className="spinner" /> : '⛓️'} Save Score On-Chain
                    </button>
                  </div>
                ) : (
                  <button className="action-btn wallet-action" onClick={handleConnectWallet}>
                    ◈ Connect Wallet to Save Score
                  </button>
                )}
              </div>

              {txStatus && (
                <div className={`tx-status ${txStatus.startsWith('✅') ? 'tx-success' : txStatus.startsWith('❌') ? 'tx-error' : 'tx-pending'}`}>
                  {txStatus}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Mobile Controls ── */}
      {screen === 'playing' && (
        <div className="controls">
          <button className="ctrl-btn" onPointerDown={() => engineRef.current?.moveLeft()}>
            <span>◀</span>
          </button>
          <button className="ctrl-btn pause-btn" onPointerDown={togglePause}>
            {gameState?.isPaused ? '▶' : '⏸'}
          </button>
          <button className="ctrl-btn" onPointerDown={() => engineRef.current?.moveRight()}>
            <span>▶</span>
          </button>
        </div>
      )}

      {/* ── Leaderboard ── */}
      <div className="leaderboard">
        <div className="lb-header">
          <span className="lb-icon">🏆</span>
          <h3 className="lb-title">LEADERBOARD</h3>
        </div>

        {leaderboard.length === 0 ? (
          <div className="lb-empty">
            <p>No scores yet.</p>
            <p>Ride the waves and claim your spot!</p>
          </div>
        ) : (
          <div className="lb-list">
            {leaderboard.map((entry, idx) => (
              <div
                key={`${entry.date}-${idx}`}
                className={`lb-row ${idx === 0 ? 'lb-first' : idx === 1 ? 'lb-second' : idx === 2 ? 'lb-third' : ''}`}
              >
                <div className="lb-rank">
                  {idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`}
                </div>
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
                <h3>🎯 Objective</h3>
                <ul>
                  <li>Surf as long as possible on the endless ocean</li>
                  <li>Avoid deadly obstacles like rocks and sharks</li>
                  <li>Collect coins and power-ups</li>
                  <li>Achieve the highest score</li>
                  <li>Save your score on-chain for immortality</li>
                </ul>
              </section>

              <section>
                <h3>🎮 Controls</h3>
                <ul>
                  <li><strong>Desktop:</strong> Arrow keys or A/D to move left/right</li>
                  <li><strong>Mobile:</strong> Swipe left/right or use on-screen buttons</li>
                  <li>Space or P to pause</li>
                </ul>
              </section>

              <section>
                <h3>🏆 Scoring</h3>
                <ul>
                  <li>Distance survived contributes to score</li>
                  <li>Coins multiply your rewards</li>
                  <li>Combos increase score multiplier</li>
                  <li>Power-ups give temporary advantages</li>
                </ul>
              </section>

              <section>
                <h3>✨ Rewards & Power-ups</h3>
                <ul>
                  <li>🪙 Coins - Collect for points</li>
                  <li>🛡️ Shield - Temporary protection</li>
                  <li>🧲 Magnet - Attract nearby coins</li>
                  <li>⚡ Speed Boost - Temporary speed increase</li>
                </ul>
              </section>

              <section>
                <h3>⛓️ Blockchain Features</h3>
                <ul>
                  <li>Connect MetaMask wallet</li>
                  <li>Save high scores permanently on-chain</li>
                  <li>Claim daily rewards (500 bonus coins every 24h)</li>
                </ul>
              </section>

              <div className="modal-footer">
                <p>Master the waves. Become a legend.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;