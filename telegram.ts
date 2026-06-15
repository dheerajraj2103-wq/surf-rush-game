// Minimal wrapper around the Telegram WebApp SDK.
// The script tag in index.html injects window.Telegram.WebApp when running inside Telegram.
// In a normal browser, window.Telegram will be undefined, so everything here is optional-chained.

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
}

declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready: () => void;
        expand: () => void;
        initDataUnsafe?: {
          user?: TelegramUser;
        };
        colorScheme?: string;
        themeParams?: Record<string, string>;
        MainButton?: {
          show: () => void;
          hide: () => void;
          setText: (text: string) => void;
          onClick: (cb: () => void) => void;
        };
        showAlert?: (message: string) => void;
        openTelegramLink?: (url: string) => void;
      };
    };
  }
}

export function initTelegram(): void {
  const tg = window.Telegram?.WebApp;
  if (!tg) return;
  tg.ready();
  tg.expand();
}

export function getTelegramUser(): TelegramUser | null {
  const tg = window.Telegram?.WebApp;
  return tg?.initDataUnsafe?.user ?? null;
}

export function isInsideTelegram(): boolean {
  return Boolean(window.Telegram?.WebApp);
}

export function telegramAlert(message: string): void {
  const tg = window.Telegram?.WebApp;
  if (tg?.showAlert) {
    tg.showAlert(message);
  } else {
    alert(message);
  }
}

export function shareScore(score: number, botUsername: string): void {
  const text = `I scored ${score} points in Surf Rush! Can you beat me?`;
  const url = `https://t.me/${botUsername}`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;

  const tg = window.Telegram?.WebApp;
  if (tg?.openTelegramLink) {
    tg.openTelegramLink(shareUrl);
  } else {
    window.open(shareUrl, '_blank');
  }
}
