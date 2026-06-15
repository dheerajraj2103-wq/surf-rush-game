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

const TELEGRAM_BOT_USERNAME = 'your_bot_username'; // update with your bot's @username

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

  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    provider: null,
    signer: null
  });
  const [walletError, setWalletError] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [playerName, setPlayerName] = useState<string>('Player');

  // Initialize Telegram SDK and pull a display name if available.
  useEffect(() => {
    initTelegram();
    const tgUser = getTelegramUser();
    if (tgUser) {
      setPlayerName(tgUser.username ? `@${tgUser.username}` : tgUser.first_name);
    }
    setLeaderboard(getLeaderboard());
  }, []);

  // Create the game engine once the canvas is mounted.
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new GameEngine(canvasRef.current, {
      onStateChange: (state) => setGameState(state),
      onGameOver: (score, coins) => {
        setFinalScore(score);
        setFinalCoins(coins);
        setScreen('gameover');

        const updated = saveToLeaderboard({
          name: playerName,
          score,
          coins,
          date: new Date().toISOString()
        });
        setLeaderboard(updated);
      }
    });

    engineRef.current = engine;

    return () => {
      engine.stop();
    };
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
    engineRef.current?.restart();
  }, []);

  const togglePause = useCallback(() => {
    engineRef.current?.togglePause();
  }, []);

  // Keyboard controls
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

  // Touch / swipe controls
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
      if (delta > 0) {
        engineRef.current?.moveRight();
      } else {
        engineRef.current?.moveLeft();
      }
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
      setWalletError('MetaMask not found. Install it or open this app in a MetaMask-enabled browser.');
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
      setTxStatus('Saving score on-chain...');
      const hash = await saveScoreOnChain(wallet.signer, finalScore);
      setTxStatus(`Score saved! Tx: ${shortenAddress(hash)}`);
    } catch (err) {
      setTxStatus(err instanceof Error ? `Error: ${err.message}` : 'Transaction failed.');
    }
  }, [wallet.signer, finalScore]);

  const handleClaimReward = useCallback(async () => {
    if (!wallet.signer) {
      setWalletError('Connect your wallet first.');
      return;
    }
    try {
      setTxStatus('Claiming reward...');
      const hash = await claimRewardOnChain(wallet.signer);
      setTxStatus(`Reward claimed! Tx: ${shortenAddress(hash)}`);
    } catch (err) {
      setTxStatus(err instanceof Error ? `Error: ${err.message}` : 'Claim failed.');
    }
  }, [wallet.signer]);

  const handleShareScore = useCallback(() => {
    shareScore(finalScore, TELEGRAM_BOT_USERNAME);
  }, [finalScore]);

  return (
    <div className="app">
      <div className="topbar">
        <div className="title">🌊 SURF RUSH WEB3</div>
        {wallet.address ? (
          <button className="wallet-btn" onClick={handleDisconnectWallet}>
            {shortenAddress(wallet.address)}
          </button>
        ) : (
          <button className="wallet-btn" onClick={handleConnectWallet}>
            Connect Wallet
          </button>
        )}
      </div>

      {walletError && <div className="error-text">{walletError}</div>}

      {gameState && (
        <div className="hud">
          <span>Score: {gameState.score}</span>
          <span>Coins: {gameState.coins}</span>
          <span>Combo: x{gameState.combo}</span>
        </div>
      )}

      <div className="game-area">
        <canvas ref={canvasRef} />

        {screen === 'start' && (
          <div className="overlay">
            <h1>Surf Rush</h1>
            <p>Move left/right to dodge obstacles and collect mystery boxes.</p>
            <p>
              {isInsideTelegram()
                ? 'Use the on-screen arrows or swipe to move.'
                : 'Use Arrow Keys / A & D to move, Space to pause.'}
            </p>
            <button className="primary-btn" onClick={startGame}>
              Start Game
            </button>
          </div>
        )}

        {screen === 'gameover' && (
          <div className="overlay">
            <h1>Game Over</h1>
            <p>Score: {finalScore}</p>
            <p>Coins: {finalCoins}</p>

            <button className="primary-btn" onClick={restartGame}>
              Play Again
            </button>

            <button className="secondary-btn" onClick={handleShareScore}>
              Share Score on Telegram
            </button>

            {wallet.address ? (
              <>
                <button className="secondary-btn" onClick={handleSaveScoreOnChain}>
                  Save Score On-Chain
                </button>
                <button className="secondary-btn" onClick={handleClaimReward}>
                  Claim Daily Reward
                </button>
              </>
            ) : (
              <button className="secondary-btn" onClick={handleConnectWallet}>
                Connect Wallet to Save Score
              </button>
            )}

            {txStatus && <p className="status-text">{txStatus}</p>}
          </div>
        )}
      </div>

      {screen === 'playing' && (
        <div className="controls">
          <button onClick={() => engineRef.current?.moveLeft()}>◀</button>
          <button onClick={togglePause}>
            {gameState?.isPaused ? '▶' : '⏸'}
          </button>
          <button onClick={() => engineRef.current?.moveRight()}>▶</button>
        </div>
      )}

      <div className="leaderboard">
        <h3>Local Leaderboard</h3>
        {leaderboard.length === 0 ? (
          <p className="status-text">No scores yet. Play a round!</p>
        ) : (
          <ol>
            {leaderboard.map((entry, idx) => (
              <li key={`${entry.date}-${idx}`}>
                <span>
                  {idx + 1}. {entry.name}
                </span>
                <span>{entry.score} pts</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

export default App;
