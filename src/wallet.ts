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
  chainId: number | null;
  networkName: string | null;
}

// ---- Network detection config ----
// MetaMask (and other EIP-1193 wallets) never exposes the human-readable
// network name a user configured locally — only the numeric chainId via
// eth_chainId. To show a friendly label we maintain our own chainId -> name
// map, the same way Etherscan/Chainlist do. Add custom/private chains here
// as you support them.
//
// IMPORTANT: Replace the placeholder entry below with SecureChain Mainnet's
// actual chain ID (visible in MetaMask under Settings > Networks) so it
// displays as "SecureChain Mainnet" instead of falling back to "Chain <id>".
export const KNOWN_NETWORKS: Record<number, string> = {
  1: 'Ethereum Mainnet',
  11155111: 'Sepolia Testnet',
  137: 'Polygon Mainnet',
  56: 'BNB Smart Chain',
  43114: 'Avalanche C-Chain',
  42161: 'Arbitrum One',
  10: 'Optimism',
  8453: 'Base',
  // TODO: add SecureChain Mainnet's real chain ID, e.g.:
  // 123456: 'SecureChain Mainnet',
};

/**
 * Resolves a chainId to a human-readable network name.
 * Falls back to "Chain <id>" (never a hardcoded/wrong network name) for any
 * chain not yet present in KNOWN_NETWORKS.
 */
export function getNetworkName(chainId: number): string {
  return KNOWN_NETWORKS[chainId] ?? `Chain ${chainId}`;
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

    // Detect the ACTUAL connected chain instead of assuming Ethereum Mainnet.
    // provider.getNetwork() reads the live chainId from the wallet.
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);

    return {
      address: accounts[0] ?? null,
      provider,
      signer,
      chainId,
      networkName: getNetworkName(chainId),
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
  return { address: null, provider: null, signer: null, chainId: null, networkName: null };
}

/**
 * Subscribes to the wallet's 'chainChanged' event so the UI can update the
 * displayed network name immediately when the user switches networks in
 * MetaMask, without needing to reconnect or reload the page.
 *
 * Per EIP-1193, 'chainChanged' fires with the new chainId as a 0x-prefixed
 * hex string.
 *
 * @param onChange - called with the new chainId (decimal) and its resolved name
 * @returns an unsubscribe function — call this in a useEffect cleanup
 */
export function subscribeToChainChanges(
  onChange: (chainId: number, networkName: string) => void
): () => void {
  if (typeof window === 'undefined' || !window.ethereum?.on) {
    return () => {};
  }

  const handler = (...args: unknown[]) => {
    const chainIdHex = args[0] as string;
    const chainId = parseInt(chainIdHex, 16);
    onChange(chainId, getNetworkName(chainId));
  };

  window.ethereum.on('chainChanged', handler);
  return () => window.ethereum?.removeListener?.('chainChanged', handler);
}

export function getContract(signer: JsonRpcSigner): Contract {
  return new Contract(CONTRACT_ADDRESS, CONTRACT_ABI, signer);
}

/**
 * Classifies any error thrown by ethers or a wallet provider and returns a
 * clean, human-readable message string.
 *
 * Ethers v6 uses string codes like 'ACTION_REJECTED', 'CALL_EXCEPTION',
 * 'INSUFFICIENT_FUNDS', 'NETWORK_ERROR', 'TIMEOUT' etc. — NOT the numeric
 * EIP-1193 code 4001 that MetaMask used to surface directly.  Both patterns
 * are checked here so the handlers in App.tsx always get a typed result
 * instead of having to duplicate these checks.
 */
export type TxErrorKind =
  | 'rejected'      // user pressed Reject in wallet
  | 'reverted'      // contract reverted (e.g. canClaim returned false)
  | 'funds'         // not enough ETH for gas
  | 'network'       // RPC connectivity issue
  | 'timeout'       // tx.wait() timed out
  | 'unknown';      // anything else

export interface TxError {
  kind: TxErrorKind;
  message: string;
}

export function classifyTxError(err: unknown): TxError {
  const e = err as any;
  const code: unknown    = e?.code;
  const msg: string      = (e?.message ?? e?.reason ?? String(err)).toLowerCase();
  const info: string     = JSON.stringify(e?.info ?? e?.data ?? '').toLowerCase();

  // ── User rejected ──────────────────────────────────────────────────────────
  // Ethers v6: ACTION_REJECTED  |  EIP-1193 legacy: 4001
  if (
    code === 'ACTION_REJECTED' ||
    code === 4001 ||
    msg.includes('user rejected') ||
    msg.includes('user denied') ||
    msg.includes('rejected') ||
    msg.includes('denied') ||
    msg.includes('cancelled') ||
    msg.includes('cancel')
  ) {
    return { kind: 'rejected', message: 'Transaction rejected. Tap the button to try again.' };
  }

  // ── Contract reverted ──────────────────────────────────────────────────────
  // Ethers v6: CALL_EXCEPTION  |  receipt.status === 0
  if (
    code === 'CALL_EXCEPTION' ||
    msg.includes('execution reverted') ||
    msg.includes('revert') ||
    msg.includes('call exception')
  ) {
    // Try to extract a human-readable revert reason if present
    const reason =
      e?.reason ||
      e?.data?.message ||
      (info.includes('already claimed') ? 'Reward already claimed today.' : null);
    return {
      kind: 'reverted',
      message: reason
        ? `Transaction reverted: ${reason}`
        : 'Transaction was reverted by the contract. Check eligibility and try again.',
    };
  }

  // ── Insufficient funds ─────────────────────────────────────────────────────
  if (
    code === 'INSUFFICIENT_FUNDS' ||
    msg.includes('insufficient funds') ||
    msg.includes('insufficient balance')
  ) {
    return { kind: 'funds', message: 'Insufficient ETH for gas fees. Please top up your wallet.' };
  }

  // ── Network / RPC ──────────────────────────────────────────────────────────
  if (
    code === 'NETWORK_ERROR' ||
    code === 'SERVER_ERROR' ||
    msg.includes('network') ||
    msg.includes('could not connect') ||
    msg.includes('failed to fetch')
  ) {
    return { kind: 'network', message: 'Network error. Check your connection and try again.' };
  }

  // ── Timeout ────────────────────────────────────────────────────────────────
  if (code === 'TIMEOUT' || msg.includes('timeout') || msg.includes('timed out')) {
    return { kind: 'timeout', message: 'Transaction timed out. It may still confirm — check your wallet.' };
  }

  // ── Fallback ───────────────────────────────────────────────────────────────
  const rawMsg = (err as any)?.message || String(err);
  return {
    kind: 'unknown',
    message: rawMsg.length < 180 ? rawMsg : 'Transaction failed. Please try again.',
  };
}

/**
 * Wraps tx.wait() with a hard timeout so the UI never hangs forever.
 * ethers v6 tx.wait() can block indefinitely on slow / unresponsive RPCs.
 *
 * @param tx      - The ContractTransactionResponse returned by a write call.
 * @param ms      - Timeout in milliseconds (default 60 s).
 * @returns         The transaction hash on success.
 * @throws          A typed TxError-compatible error on timeout, revert, or other failure.
 */
async function waitForTx(
  tx: { wait: () => Promise<unknown>; hash: string },
  ms = 60_000
): Promise<string> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(Object.assign(
        new Error(`Transaction timed out after ${ms / 1000}s. It may still confirm — check your wallet.`),
        { code: 'TIMEOUT' }
      ));
    }, ms);
  });

  try {
    const receipt = await Promise.race([tx.wait(), timeoutPromise]);

    // ethers v6: tx.wait() returns null when the tx was replaced/cancelled,
    // and throws CALL_EXCEPTION for revert.  A null receipt means the tx is
    // gone (dropped or replaced) — treat it as an error so the UI unlocks.
    if (receipt === null || receipt === undefined) {
      throw Object.assign(
        new Error('Transaction dropped or replaced. Please try again.'),
        { code: 'CALL_EXCEPTION' }
      );
    }

    // Check receipt.status if present (0 = reverted, 1 = success)
    const status = (receipt as any)?.status;
    if (status === 0) {
      throw Object.assign(
        new Error('Transaction was reverted by the contract.'),
        { code: 'CALL_EXCEPTION' }
      );
    }

    return tx.hash;
  } finally {
    clearTimeout(timeoutId!);
  }
}

export async function saveScoreOnChain(signer: JsonRpcSigner, score: number): Promise<string> {
  const contract = getContract(signer);
  // contract.saveScore() submits the transaction and returns a response object.
  // waitForTx() then waits for the on-chain confirmation with a 60 s timeout.
  const tx = await (contract.saveScore(BigInt(score)) as Promise<{ wait: () => Promise<unknown>; hash: string }>);
  return waitForTx(tx);
}

export async function claimRewardOnChain(signer: JsonRpcSigner): Promise<string> {
  const contract = getContract(signer);
  // contract.claimReward() submits the transaction and returns a response object.
  // waitForTx() then waits for the on-chain confirmation with a 60 s timeout.
  const tx = await (contract.claimReward() as Promise<{ wait: () => Promise<unknown>; hash: string }>);
  return waitForTx(tx);
}

export async function getPlayerScoreOnChain(signer: JsonRpcSigner, address: string): Promise<number> {
  const contract = getContract(signer);
  const score: bigint = await contract.getPlayerScore(address) as bigint;
  return Number(score);
}

export async function canClaimOnChain(signer: JsonRpcSigner, address: string): Promise<boolean> {
  const contract = getContract(signer);
  return await contract.canClaim(address) as boolean;
}