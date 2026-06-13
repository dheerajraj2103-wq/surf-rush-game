# Surf Rush – MVP

Surf Rush is a small, endless surfing game built as a Telegram Mini App and browser game.
Players move left/right across 3 lanes, dodge obstacles (rocks, sharks, jellyfish, waves),
and collect mystery boxes that grant coins, shields, speed boosts, combo multipliers, or
negative effects (coin cuts, freezes, slow waves).

This MVP includes:

- A React + TypeScript + Vite frontend with a canvas-based game engine
- A local leaderboard stored in `localStorage`
- MetaMask wallet connection via Ethers.js v6
- A `SurfRushRewards` Solidity smart contract for saving high scores and claiming rewards
- A Hardhat project to compile, test, and deploy the contract
- Telegram Mini App support via the Telegram WebApp SDK

## Project Structure

```
surf-rush-mvp/
├── frontend/
│   ├── package.json
│   ├── index.html
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── styles.css
│       ├── game.ts
│       ├── wallet.ts
│       └── telegram.ts
├── contracts/
│   ├── package.json
│   ├── hardhat.config.ts
│   ├── contracts/
│   │   └── SurfRushRewards.sol
│   └── scripts/
│       └── deploy.ts
├── README.md
├── TELEGRAM_SETUP.md
└── SUBMISSION_CHECKLIST.md
```

## 1. Running the Frontend Locally

```bash
cd frontend
npm install
npm run dev
```

This starts a Vite dev server (default: `http://localhost:5173`). Open it in your browser
to play the game.

### Controls

- **Desktop browser:** Arrow Keys / A & D to move, Space to pause.
- **Mobile browser / Telegram:** Swipe left/right, or use the on-screen ◀ ▶ buttons.

## 2. Smart Contract – Compile, Test, Deploy

```bash
cd contracts
npm install
npx hardhat compile
```

### Configure environment variables

Create a `.env` file inside `contracts/` (do **not** commit this file):

```
PRIVATE_KEY=your_wallet_private_key_here
SECURECHAIN_RPC_URL=https://rpc.your-securechain-endpoint.example
SECURECHAIN_CHAIN_ID=1234
```

Replace the RPC URL and chain ID with the actual values for SecureChain Mainnet (or any
EVM-compatible network you want to deploy to, including local testnets).

### Deploy

```bash
npx hardhat run scripts/deploy.ts --network securechain
```

The script prints the deployed contract address. Copy this address into:

```
frontend/src/wallet.ts -> CONTRACT_ADDRESS
```

### Fund the contract

The contract needs a balance to pay out rewards. Either:

- Call `deposit()` with some value, or
- Send native tokens directly to the contract address (the `receive()` function accepts
  plain transfers).

## 3. Connecting the Wallet (Frontend)

1. Open the game in a browser with MetaMask installed.
2. Click **Connect Wallet** in the top bar.
3. Approve the connection request in MetaMask.
4. After a game over, you can:
   - **Save Score On-Chain** – calls `saveScore(score)` on the deployed contract.
   - **Claim Daily Reward** – calls `claimReward()`, subject to the cooldown defined in
     the contract.

> Note: `CONTRACT_ADDRESS` in `frontend/src/wallet.ts` defaults to the zero address.
> You must update it after deploying the contract, or wallet transactions will fail.

## 4. Deploying the Frontend

Any static hosting provider that supports Vite builds works (e.g. Vercel, Netlify):

```bash
cd frontend
npm install
npm run build
```

This produces a `dist/` folder you can deploy. On Vercel:

1. Import the `frontend/` folder as a new project.
2. Framework preset: **Vite**.
3. Build command: `npm run build`
4. Output directory: `dist`

## 5. Local Leaderboard

For this MVP, the leaderboard is stored in the browser's `localStorage` (key:
`surfRushLeaderboard`). Each completed game saves the player's name (Telegram username if
available, otherwise "Player"), score, coins, and timestamp. The top 10 scores are kept,
sorted descending by score.

## 6. Telegram Mini App

See [`TELEGRAM_SETUP.md`](./TELEGRAM_SETUP.md) for full instructions on registering a bot
with BotFather and configuring the Mini App URL.

## 7. Submission Checklist

See [`SUBMISSION_CHECKLIST.md`](./SUBMISSION_CHECKLIST.md) for the list of deliverables
required for the EtherAuthority internship submission.
