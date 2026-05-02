# MansaTrade – Hardhat 3 Test Suite

P2P smart-contract tests for the MansaTrade EVM contract, written with the native Node.js test runner and [viem](https://viem.sh/).

---

## Requirements

| Tool | Version |
|------|---------|
| Node.js | >= 22 |
| npm | >= 10 |

---

## Setup

From the repo root, navigate to the hardhat project and install dependencies:

```shell
cd contract/hardhat
npm install
```

---

## Running Tests

Run only the TypeScript (node:test) tests — this is what you want for the MansaTrade suite:

```shell
npx hardhat test nodejs
```

Run all tests (TypeScript + Solidity):

```shell
npx hardhat test
```

---

## Project Structure

```
contract/hardhat/
├── contracts/
│   └── src/
│       ├── Counter.sol       # sample counter contract
│       └── MansaTrade.sol    # main P2P trade contract
├── test/
│   ├── Counter.ts            # counter tests
│   └── MansaTrade.ts         # createOffer tests  ← new
├── hardhat.config.ts
└── package.json
```

---

## What was fixed to get tests running

- **Compiler cache** – the environment has no outbound internet access so the Solidity compiler could not be auto-downloaded. Fixed by installing `solc` via npm and seeding the Hardhat compiler cache manually (`~/.cache/hardhat-nodejs/compilers-v3/`).

- **Foundry test collision** – `Counter.t.sol` imports `forge-std` / `ds-test` which are Foundry-only and break the Hardhat compiler step. Fixed by setting `paths.sources` to `contracts/src/` so only actual contracts are compiled; the Foundry test file stays untouched but is no longer picked up.

- **Pragma mismatch** – the original `mansatrade.sol` pins `pragma solidity 0.8.17;` while the installed compiler is `0.8.28`. The copy in `contracts/src/` uses `>=0.8.17 <=0.8.28` so the existing compiler can handle it without changing the original file.

---

## Deploying to Sepolia

Set your private key first:

```shell
npx hardhat keystore set SEPOLIA_PRIVATE_KEY
```

Then deploy:

```shell
npx hardhat ignition deploy --network sepolia ignition/modules/Counter.ts
```
