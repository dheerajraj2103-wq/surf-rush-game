import { BrowserProvider, Contract, JsonRpcSigner } from 'ethers';

// ---- Smart contract config ----
// Replace this with the deployed contract address after running the Hardhat deploy script.
export const CONTRACT_ADDRESS = '0x0000000000000000000000000000000000000000';

export const CONTRACT_ABI = [
  'function saveScore(uint256 score) external',
  'function claimReward() external',
  'function getPlayerScore(address player) external view returns (uint256)',
  'function canClaim(address player) external view returns (bool)',
  'function hasClaimedToday(address player) external view returns (bool)',
  'event ScoreSaved(address indexed player, uint256 score)',
  'event RewardClaimed(address indexed player, uint256 amount)'
];

export interface WalletState {
  address: string | null;
  provider: BrowserProvider | null;
  signer: JsonRpcSigner | null;
}

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
      isBraveWallet?: boolean;
      isCoinbaseWallet?: boolean;
    };
  }
}

/**
 * Returns true if the device is a mobile device (Android or iOS).
 */
export function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
}

/**
 * Returns true if we are currently running INSIDE MetaMask Mobile's browser,
 * Brave Mobile wallet, or another injected mobile wallet provider.
 */
export function isInjectedWalletAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.ethereum !== 'undefined';
}

/**
 * Legacy alias kept for callers in App.tsx.
 * On desktop this is the same as checking window.ethereum exists.
 * On mobile we return true so the flow continues to the deep-link path.
 */
export function isMetaMaskAvailable(): boolean {
  // Always return true — the connect flow itself decides whether to deep-link
  // or call eth_requestAccounts. Returning false here blocks the entire flow
  // on Android Chrome / Firefox / Opera where window.ethereum is undefined.
  return true;
}

/**
 * Returns a human-readable label for the detected wallet provider.
 * Used in status messages so users know which wallet is being used.
 */
export function getWalletName(): string {
  if (!window.ethereum) return 'Wallet';
  if (window.ethereum.isBraveWallet) return 'Brave Wallet';
  if (window.ethereum.isCoinbaseWallet) return 'Coinbase Wallet';
  if (window.ethereum.isMetaMask) return 'MetaMask';
  return 'Wallet';
}

/**
 * Opens MetaMask Mobile deep-link so the dapp loads inside MetaMask's browser.
 * Falls back to the MetaMask download page if the app is not installed.
 *
 * @param currentUrl - The full URL of this dapp (window.location.href).
 */
export function openMetaMaskMobileDeepLink(currentUrl: string): void {
  // Strip the protocol from the URL for the deep-link format.
  const dappUrl = currentUrl.replace(/^https?:\/\//, '');
  // metamask.app.link/dapp/<url> opens MetaMask Mobile and navigates to the dapp.
  const deepLink = `https://metamask.app.link/dapp/${dappUrl}`;
  window.location.href = deepLink;
}

/**
 * Main wallet connection function.
 *
 * Desktop  : calls eth_requestAccounts directly via window.ethereum.
 * Mobile (no injected provider) : redirects to MetaMask Mobile deep-link.
 * Mobile (inside MetaMask browser) : calls eth_requestAccounts normally.
 *
 * Throws a typed error so callers can distinguish user-rejection (code 4001)
 * from missing-wallet errors (code 'NO_WALLET') and deep-link redirects
 * (code 'DEEPLINK_REDIRECT').
 */
export async function connectWallet(): Promise<WalletState> {
  // ── Case 1: injected provider present (desktop extension OR MetaMask Mobile browser)
  if (isInjectedWalletAvailable()) {
    const accounts = (await window.ethereum!.request({
      method: 'eth_requestAccounts',
    })) as string[];

    if (!accounts || accounts.length === 0) {
      throw Object.assign(
        new Error('No accounts returned. Please unlock your wallet and try again.'),
        { code: 'NO_ACCOUNTS' }
      );
    }

    const provider = new BrowserProvider(window.ethereum!);
    const signer = await provider.getSigner();

    return {
      address: accounts[0] ?? null,
      provider,
      signer,
    };
  }

  // ── Case 2: mobile device without an injected provider
  // Redirect to MetaMask Mobile so the dapp opens in its built-in browser.
  if (isMobileDevice()) {
    openMetaMaskMobileDeepLink(window.location.href);
    // Throw a special error so the caller can show a "redirecting…" message
    // and NOT show the generic "no wallet found" error.
    throw Object.assign(
      new Error('Redirecting to MetaMask Mobile…'),
      { code: 'DEEPLINK_REDIRECT' }
    );
  }

  // ── Case 3: desktop without any wallet extension installed
  throw Object.assign(
    new Error(
      'No wallet found. Please install MetaMask (metamask.io) or enable Brave Wallet, then refresh the page.'
    ),
    { code: 'NO_WALLET' }
  );
}

export function disconnectWallet(): WalletState {
  return { address: null, provider: null, signer: null };
}

export function getContract(signer: JsonRpcSigner): Contract {
  return new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
}

export async function saveScoreOnChain(signer: JsonRpcSigner, score: number): Promise<string> {
  const contract = getContract(signer);
  const tx = await contract.saveScore(BigInt(score));
  await tx.wait();
  return tx.hash;
}

export async function claimRewardOnChain(signer: JsonRpcSigner): Promise<string> {
  const contract = getContract(signer);
  const tx = await contract.claimReward();
  await tx.wait();
  return tx.hash;
}

export async function getPlayerScoreOnChain(signer: JsonRpcSigner, address: string): Promise<number> {
  const contract = getContract(signer);
  const score: bigint = await contract.getPlayerScore(address);
  return Number(score);
}

export async function canClaimOnChain(signer: JsonRpcSigner, address: string): Promise<boolean> {
  const contract = getContract(signer);
  return await contract.canClaim(address);
}