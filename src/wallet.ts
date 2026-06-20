import { BrowserProvider, Contract, JsonRpcSigner } from 'ethers';

// ---- Smart contract config ----
//
// CRITICAL: no reward contract is deployed yet. CONTRACT_ADDRESS is the
// Ethereum zero address — a structural placeholder, not a real contract.
// It has no code at it on any network, so any transaction sent to it is
// not "claiming a reward": it either reverts or (for a plain ETH-value
// call) just burns the sender's gas with no effect. Anyone who approves
// such a transaction in MetaMask is needlessly paying gas for nothing.
//
// Replace this with the real deployed contract address after running the
// Hardhat deploy script — do not remove the ZERO_ADDRESS guard below when
// you do, since it protects against this placeholder ever being live
// again by accident (e.g. a bad env var, a reverted deploy, etc).
export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
export const CONTRACT_ADDRESS = ZERO_ADDRESS;

// Single source of truth for "is there actually a contract to talk to?".
// Every on-chain call (saveScoreOnChain, claimRewardOnChain,
// getPlayerScoreOnChain, canClaimOnChain) checks this BEFORE constructing
// or sending anything, so a placeholder address can never reach
// window.ethereum / MetaMask in the first place.
export function isContractDeployed(): boolean {
  return CONTRACT_ADDRESS.toLowerCase() !== ZERO_ADDRESS.toLowerCase();
}

// Exported so the UI layer can show an accurate, permanent informational
// message (e.g. on the Daily Reward card) without needing to trigger a
// failed transaction first to find out the contract isn't live.
export const REWARD_CONTRACT_DEPLOYED = isContractDeployed();

// Thrown by every on-chain call below when no contract is deployed.
// Distinct `code` so callers (App.tsx) can show a clear, non-alarming
// "this feature isn't live yet" message instead of a generic tx-failed
// error — and so they never need to inspect the address themselves.
export class ContractNotDeployedError extends Error {
  code = 'CONTRACT_NOT_DEPLOYED' as const;
  constructor(action: string) {
    super(
      `${action} is not available yet — no reward contract has been deployed. ` +
      `This is expected: on-chain rewards are disabled until a real contract address replaces the placeholder.`
    );
    this.name = 'ContractNotDeployedError';
  }
}

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

// ---- Transaction / connection phase tracking ----
// BUGFIX: previously App.tsx tracked wallet-connect status and on-chain tx
// status in the same free-form `txStatus: string | null` field, shared
// across the topbar "Connect Wallet" button AND the Game Over screen's
// "Claim Reward" / "Save Score" buttons. That meant leftover status text
// from one flow (e.g. "Connecting…") could still be showing when the user
// moved to a completely different part of the UI, looking like a stuck or
// re-triggered prompt. TxPhase gives each flow its own small, exhaustive
// state machine instead of a shared string, so a phase from one flow can
// never bleed into another's UI.
export type TxPhase =
  | 'idle'
  | 'connecting-wallet'
  | 'awaiting-approval'
  | 'submitted'
  | 'confirmed'
  | 'failed';

export const TX_PHASE_LABEL: Record<TxPhase, string> = {
  'idle':              '',
  'connecting-wallet': 'Connecting Wallet…',
  'awaiting-approval': 'Waiting for Approval…',
  'submitted':         'Transaction Submitted…',
  'confirmed':         'Transaction Confirmed',
  'failed':            'Transaction Failed',
};

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

/**
 * Builds the reward contract instance for read/write calls.
 *
 * SAFETY: throws ContractNotDeployedError instead of returning a Contract
 * bound to the zero address. This is the last line of defense — even if a
 * future call site forgets to check isContractDeployed() first, it's
 * structurally impossible to get a usable Contract object pointed at
 * CONTRACT_ADDRESS while it's still the zero address.
 */
export function getContract(signer: JsonRpcSigner): Contract {
  if (!isContractDeployed()) {
    throw new ContractNotDeployedError('Reward contract access');
  }
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
  | 'rejected'        // user pressed Reject in wallet
  | 'reverted'        // contract reverted (e.g. canClaim returned false)
  | 'funds'           // not enough ETH for gas
  | 'network'         // RPC connectivity issue
  | 'timeout'         // tx.wait() timed out
  | 'not-deployed'    // CONTRACT_ADDRESS is still the zero-address placeholder
  | 'unknown';        // anything else

export interface TxError {
  kind: TxErrorKind;
  message: string;
}

export function classifyTxError(err: unknown): TxError {
  const e = err as any;
  const code: unknown    = e?.code;
  const msg: string      = (e?.message ?? e?.reason ?? String(err)).toLowerCase();
  const info: string     = JSON.stringify(e?.info ?? e?.data ?? '').toLowerCase();

  // ── Contract not deployed ──────────────────────────────────────────────────
  // Checked first and matched on the typed `code`, not message-sniffing, so
  // this can never be misclassified as a generic failure — the whole point
  // is that the UI shows "this feature isn't live yet", not "transaction
  // failed, try again" (which would invite a pointless retry).
  if (code === 'CONTRACT_NOT_DEPLOYED') {
    return { kind: 'not-deployed', message: e.message as string };
  }

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
  // GUARD: checked here, before getContract()/any ethers call, so this
  // rejects synchronously and MetaMask's "Confirm transaction" popup is
  // never triggered for a placeholder address.
  if (!isContractDeployed()) {
    throw new ContractNotDeployedError('Saving your score on-chain');
  }
  const contract = getContract(signer);
  // contract.saveScore() submits the transaction and returns a response object.
  // waitForTx() then waits for the on-chain confirmation with a 60 s timeout.
  const tx = await (contract.saveScore(BigInt(score)) as Promise<{ wait: () => Promise<unknown>; hash: string }>);
  return waitForTx(tx);
}

export async function claimRewardOnChain(signer: JsonRpcSigner): Promise<string> {
  // GUARD: this is the exact call path responsible for the reported issue
  // — MetaMask popping up a transaction targeting the zero address. Checked
  // here, before getContract()/any ethers call, so it rejects synchronously
  // and no signing prompt is ever shown for a placeholder address.
  if (!isContractDeployed()) {
    throw new ContractNotDeployedError('Claiming your reward');
  }
  const contract = getContract(signer);
  // contract.claimReward() submits the transaction and returns a response object.
  // waitForTx() then waits for the on-chain confirmation with a 60 s timeout.
  const tx = await (contract.claimReward() as Promise<{ wait: () => Promise<unknown>; hash: string }>);
  return waitForTx(tx);
}

export async function getPlayerScoreOnChain(signer: JsonRpcSigner, address: string): Promise<number> {
  // GUARD: a view call against an address with no contract code doesn't
  // open MetaMask, but it does throw an opaque "could not decode result"
  // style error from the RPC node. Fail fast with a clear, typed error
  // instead, so callers can treat this the same way as the write calls.
  if (!isContractDeployed()) {
    throw new ContractNotDeployedError('Reading your on-chain score');
  }
  const contract = getContract(signer);
  const score: bigint = await contract.getPlayerScore(address) as bigint;
  return Number(score);
}

export async function canClaimOnChain(signer: JsonRpcSigner, address: string): Promise<boolean> {
  // GUARD: same reasoning as getPlayerScoreOnChain — fail fast and clearly
  // rather than letting an RPC call against the zero address surface a
  // confusing low-level decode error up to the UI.
  if (!isContractDeployed()) {
    throw new ContractNotDeployedError('Checking reward eligibility');
  }
  const contract = getContract(signer);
  return await contract.canClaim(address) as boolean;
}