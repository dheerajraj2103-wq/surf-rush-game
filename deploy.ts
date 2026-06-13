import { ethers } from 'hardhat';

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log('Deploying contracts with account:', deployer.address);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log('Account balance:', ethers.formatEther(balance), 'native tokens');

  // Initial reward = 0.001 native token per claim, 24h cooldown.
  const rewardAmount = ethers.parseEther('0.001');
  const claimCooldown = 24 * 60 * 60; // 24 hours in seconds

  const SurfRushRewards = await ethers.getContractFactory('SurfRushRewards');
  const contract = await SurfRushRewards.deploy(rewardAmount, claimCooldown);
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  console.log('SurfRushRewards deployed to:', address);
  console.log('Reward amount (wei):', rewardAmount.toString());
  console.log('Claim cooldown (seconds):', claimCooldown);
  console.log('');
  console.log('Next steps:');
  console.log('1. Copy this address into frontend/src/wallet.ts as CONTRACT_ADDRESS.');
  console.log('2. Fund the contract by calling deposit() or sending native tokens to this address.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
