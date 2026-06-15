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
    };
  }
}

export function isMetaMaskAvailable(): boolean {
  return typeof window.ethereum !== 'undefined';
}

export async function connectWallet(): Promise<WalletState> {
  if (!window.ethereum) {
    throw new Error('MetaMask is not installed. Please install it to connect your wallet.');
  }

  const provider = new BrowserProvider(window.ethereum);
  const accounts = (await window.ethereum.request({
    method: 'eth_requestAccounts'
  })) as string[];

  const signer = await provider.getSigner();

  return {
    address: accounts[0] ?? null,
    provider,
    signer
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
