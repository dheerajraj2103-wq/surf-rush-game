import { HardhatUserConfig } from 'hardhat/config';
import '@nomicfoundation/hardhat-toolbox';
import * as dotenv from 'dotenv';

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY || '0x0000000000000000000000000000000000000000000000000000000000000001';
const SECURECHAIN_RPC_URL = process.env.SECURECHAIN_RPC_URL || 'https://rpc.securechain.example';
const SECURECHAIN_CHAIN_ID = Number(process.env.SECURECHAIN_CHAIN_ID || '0');

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.24',
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {},
    securechain: {
      url: SECURECHAIN_RPC_URL,
      chainId: SECURECHAIN_CHAIN_ID,
      accounts: [PRIVATE_KEY]
    }
  }
};

export default config;
