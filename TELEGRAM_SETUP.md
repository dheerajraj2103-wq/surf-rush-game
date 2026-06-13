# Telegram Mini App Setup – Surf Rush

This guide explains how to register a Telegram bot and configure it to launch Surf Rush
as a Telegram Mini App (Web App).

## 1. Create a Bot with BotFather

1. Open Telegram and search for **@BotFather**.
2. Send `/newbot`.
3. Choose a display name for your bot (e.g. `Surf Rush Game`).
4. Choose a unique username ending in `bot` (e.g. `surf_rush_game_bot`).
5. BotFather will reply with a bot token. Save this token somewhere safe — it is **not**
   used by this frontend-only MVP, but you may need it later if you add a backend or bot
   server.

## 2. Deploy the Frontend

Before configuring the Mini App, your frontend must be deployed and reachable over
**HTTPS** (Telegram requires HTTPS for Web Apps).

```bash
cd frontend
npm install
npm run build
```

Deploy the resulting `dist/` folder to Vercel, Netlify, or any static host that provides
an HTTPS URL, e.g.:

```
https://surf-rush.vercel.app
```

## 3. Set the Mini App URL (Menu Button)

1. In Telegram, open a chat with **@BotFather**.
2. Send `/mybots` and select your bot.
3. Choose **Bot Settings** → **Menu Button**.
4. Select **Configure Menu Button**.
5. Send your deployed HTTPS URL, e.g. `https://surf-rush.vercel.app`.
6. Send a short label for the button, e.g. `Play Surf Rush`.

Now, when users open a chat with your bot, they will see a **"Play Surf Rush"** button
that opens the game inside Telegram's in-app browser using the Telegram WebApp SDK.

## 4. (Optional) Set Up the Game via /newgame

If you want the game to also be launchable via the Telegram Games platform (inline game
button in chats):

1. Send `/newgame` to **@BotFather**.
2. Select your bot.
3. Provide a short name, title, description, and a screenshot/GIF of the game.
4. When prompted for the game URL, provide the same deployed HTTPS URL as above.

This step is optional for the MVP — the **Menu Button** method in step 3 is sufficient
for most evaluators to open and play the game inside Telegram.

## 5. How the Frontend Detects Telegram

The frontend includes the Telegram WebApp script in `frontend/index.html`:

```html
<script src="https://telegram.org/js/telegram-web-app.js"></script>
```

`frontend/src/telegram.ts` then:

- Calls `Telegram.WebApp.ready()` and `expand()` on load.
- Reads `Telegram.WebApp.initDataUnsafe.user` to get the player's Telegram username
  (used as their display name on the local leaderboard).
- Uses `Telegram.WebApp.openTelegramLink()` (when available) to share scores via
  Telegram's share dialog.

If the app is opened in a normal browser (not Telegram), all of the above are safely
skipped — the game falls back to a generic "Player" name and uses `window.open` for
sharing.

## 6. Update the Bot Username for Sharing

In `frontend/src/App.tsx`, update:

```ts
const TELEGRAM_BOT_USERNAME = 'your_bot_username';
```

Replace `'your_bot_username'` with your actual bot username (without the `@`), so the
"Share Score on Telegram" button links to the correct bot.

## 7. Testing

1. Open your bot in Telegram.
2. Tap the **Play Surf Rush** menu button.
3. The game should load inside Telegram's in-app browser.
4. Play a round, reach Game Over, and tap **Share Score on Telegram** to verify the share
   link opens correctly.
5. To test wallet features inside Telegram, you'll need a mobile wallet that supports
   in-app browser dApp connections (e.g. MetaMask mobile's in-app browser), or test wallet
   features separately in a desktop browser with the MetaMask extension.
