# MansaTrade – Smart Contract Tests

Tests for the MansaTrade P2P EVM contract using Hardhat 3, the native Node.js test runner, and viem.

## Requirements

- Node.js >= 22
- npm >= 10

## Setup

```bash
cd contract/hardhat
npm install
```

## Running the tests

```bash
npx hardhat test nodejs
```

## Structure

```
contract/hardhat/
├── contracts/src/
│   ├── Counter.sol
│   └── MansaTrade.sol
├── test/
│   ├── Counter.ts
│   └── MansaTrade.ts
└── hardhat.config.ts
```

> `MansaTrade.sol` is kept in `contracts/src/` with the pragma updated to
> `>=0.8.17 <=0.8.28` so it compiles cleanly alongside the rest of the project.
> The original file under `contract/p2pContract_eth/` is untouched.
