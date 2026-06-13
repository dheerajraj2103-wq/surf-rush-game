# Submission Checklist – Surf Rush (EtherAuthority Internship)

Use this checklist to confirm the MVP is complete and ready for submission.

## Frontend

- [ ] `cd frontend && npm install` completes without errors
- [ ] `npm run dev` starts the Vite dev server successfully
- [ ] Game loads in browser and renders the canvas
- [ ] Player can move left/right using:
  - [ ] Keyboard (Arrow Keys / A & D)
  - [ ] On-screen ◀ ▶ buttons
  - [ ] Swipe gestures (mobile)
- [ ] Obstacles (rocks, sharks, jellyfish, waves) appear and increase in frequency over time
- [ ] Mystery boxes appear with both positive and negative effects:
  - [ ] Coins, Shield, Magnet, Speed Boost, Combo
  - [ ] Coin Cut, Freeze Trap, Slow Wave
- [ ] Score and coin counters update during gameplay
- [ ] Pause/resume works (Space key or pause button)
- [ ] Game Over screen displays final score and coins
- [ ] "Play Again" restarts the game
- [ ] Local leaderboard displays top scores (stored in `localStorage`)

## Wallet / Web3

- [ ] "Connect Wallet" button connects MetaMask successfully
- [ ] Connected wallet address is displayed (shortened)
- [ ] "Disconnect" returns wallet state to disconnected
- [ ] Appropriate error message shown if MetaMask is not installed

## Smart Contract

- [ ] `cd contracts && npm install` completes without errors
- [ ] `npx hardhat compile` compiles `SurfRushRewards.sol` successfully
- [ ] Contract includes:
  - [ ] `saveScore(uint256 score)`
  - [ ] `claimReward()`
  - [ ] `getPlayerScore(address player)`
  - [ ] `canClaim(address player)`
  - [ ] `hasClaimedToday(address player)`
  - [ ] `deposit()`
  - [ ] `withdraw(uint256 amount)` (owner only)
- [ ] `.env` file created with `PRIVATE_KEY`, `SECURECHAIN_RPC_URL`, `SECURECHAIN_CHAIN_ID`
- [ ] `npx hardhat run scripts/deploy.ts --network securechain` deploys successfully
- [ ] Deployed contract address copied into `frontend/src/wallet.ts` (`CONTRACT_ADDRESS`)
- [ ] Contract funded via `deposit()` or direct transfer

## On-Chain Integration

- [ ] After Game Over, "Save Score On-Chain" sends a transaction successfully
- [ ] "Claim Daily Reward" sends a transaction successfully (respecting cooldown)
- [ ] Transaction hash / status is displayed to the user

## Telegram Mini App

- [ ] Bot created via BotFather
- [ ] Frontend deployed to an HTTPS URL
- [ ] Menu Button configured to open the deployed URL
- [ ] Game loads correctly inside Telegram's in-app browser
- [ ] Telegram username (if available) is used as the leaderboard display name
- [ ] "Share Score on Telegram" opens the Telegram share dialog
- [ ] `TELEGRAM_BOT_USERNAME` updated in `frontend/src/App.tsx`

## Deployment

- [ ] Frontend deployed (e.g. Vercel/Netlify) and publicly accessible
- [ ] Smart contract deployed to target network (SecureChain Mainnet or chosen testnet)
- [ ] README.md instructions verified end-to-end on a clean checkout

## Documentation

- [ ] `README.md` reviewed and accurate
- [ ] `TELEGRAM_SETUP.md` reviewed and accurate
- [ ] This checklist completed and included in submission
