# MansaTrade

A peer-to-peer crypto trading contract built on Ethereum. The idea is simple — sellers post offers, buyers lock crypto into the contract as escrow, and once fiat is confirmed the funds get released automatically. Works with both native ETH and ERC-20 tokens.

---

## Getting started

```bash
cd contract/hardhat
npm install
```

To run the tests locally:

```bash
npx hardhat test
```

No external node needed — Hardhat spins up an in-memory network automatically.

To deploy to Sepolia you'll need two env vars:

```bash
export SEPOLIA_RPC_URL=your-rpc-url
export SEPOLIA_PRIVATE_KEY=your-private-key

npx hardhat ignition deploy ignition/modules/Counter.ts --network sepolia
```

---

## Tests

Written in TypeScript using Node's built-in test runner (`node:test`) and Hardhat's viem integration. Every test deploys a fresh contract instance so nothing bleeds between cases.

**Counter.ts** — just checks that the example counter works and that the Hardhat/viem setup is wired up correctly, not really important but good to have passing.

**MansaTrade.ts** covers everything:

- `createOffer` — checks field storage, index auto-increment, per-user offer tracking, global array growth
- `updateOffer` — verifies mutable fields update and that non-owners get rejected
- `cancelOffer` — checks the status flips to false, ownership guard
- `createOrder` — ETH value matching, order field storage, the `CreateOrder` event, and that the order shows up under both parties' profiles
- `buyerConfirm` — sets the payment-sent flag, only the offer owner can call it
- `confirmOrder` — funds released to seller, order marked complete, `bought` counter on the offer updates, can't double-confirm, can't confirm before buyer has paid
- `cancelOrder` — crypto refunded, status set to 2, can't cancel a completed order
- user management — profile creation, region updates, thumbs up/down, can't rate yourself

---

## What it does

MansaTrade cuts out the middleman for crypto/fiat trades. Instead of trusting a centralized exchange, the smart contract holds the funds while the two parties settle payment off-chain (bank transfer, PayPal, whatever they agree on). Once both sides confirm, the contract releases everything and takes a small fee.

There are three main roles:

- **Seller** — posts an offer and confirms when they've received the fiat
- **Buyer** — locks crypto in escrow, sends fiat off-chain, then marks it as paid
- **Admin / Owner** — can update fees, verify users, and step in on disputes

---

## Project layout

```
contract/hardhat/
├── contracts/src/
│   ├── MansaTrade.sol       the main contract
│   ├── MockERC20.sol        minimal ERC-20, only used in tests
│   └── Counter.sol          example contract from the hardhat template
├── test/
│   ├── MansaTrade.ts        full test suite
│   └── Counter.ts           basic tests for the counter example
├── ignition/modules/
│   └── Counter.ts           deployment script
├── scripts/
│   └── send-op-tx.ts        example of sending a tx on OP L2
└── hardhat.config.ts        hardhat config
```

---

## How a trade works

1. Seller calls `createOffer()` with the token they're selling, the fiat currency and rate, accepted payment methods, and min/max limits  
2. Buyer finds an offer and calls `createOrder()`, sending the crypto along with it — funds go into escrow  
3. Buyer sends fiat off-chain then calls `buyerConfirm()` to signal they've paid  
4. Seller checks their bank/PayPal/etc, then calls `confirmOrder()` — this releases the crypto to the buyer minus fees  
5. If something goes wrong at any point, `cancelOrder()` refunds the escrowed crypto back to the buyer — can be triggered by either party or the admin  

---

## Fees

The default fee is `45`, which represents 0.45% charged to each side (so roughly 0.90% total per trade). Fees are collected in the same transaction as settlement and split between two addresses: the first gets 80% (`fir_fee`) and the second gets 20% (`sec_fee`). Both the fee rate and the split can be changed by the admin.

---

## Data structures

**Offer** — everything about a seller's listing: token address, fiat currency, rate, payment options, min/max trade size, how much has been bought so far, and whether the offer is still active. Zero address for `token_address` means it's an ETH offer.

**Order** — represents one trade against an offer, stores the seller, payment details, amount in escrow, which offer it came from, and a status value: 0 is pending, 1 is done, 2 is cancelled.

**User** — a lightweight profile for anyone who interacts with the contract, tracks verified status, thumbs up/down reputation, region, and indexes of all their offers and orders.

---

## Contracts

**MansaTrade.sol** — the core of the project. Handles offers, orders, users and fee distribution. Bundles its own `SafeERC20` and `SafeMath` libraries so there are no external dependencies.

**MockERC20.sol** — a bare-bones ERC-20 with a `mint()` function, purely for testing the token payment path. Not meant to be deployed anywhere real.

**Counter.sol** — the default example contract that comes with the Hardhat template, left in for reference.
