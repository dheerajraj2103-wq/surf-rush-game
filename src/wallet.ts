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
 * Returns true if any EIP-1193 compatible wallet provider is available.
 * Works with MetaMask, Brave Wallet, Coinbase Wallet, Opera Wallet, etc.
 */
export function isMetaMaskAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.ethereum !== 'undefined';
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

export async function connectWallet(): Promise<WalletState> {
  if (!window.ethereum) {
    throw new Error(
      'No wallet found. Please install MetaMask, enable Brave Wallet, or use a Web3-enabled browser.'
    );
  }

  // Request account access — this triggers the wallet popup in all EIP-1193 browsers.
  // Throws with code 4001 if the user rejects.
  const accounts = (await window.ethereum.request({
    method: 'eth_requestAccounts',
  })) as string[];

  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts returned. Please unlock your wallet and try again.');
  }

  const provider = new BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();

  return {
    address: accounts[0] ?? null,
    provider,
    signer,
  };
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