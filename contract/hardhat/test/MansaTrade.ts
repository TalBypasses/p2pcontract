import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

describe("MansaTrade", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [deployer, seller, buyer] = await viem.getWalletClients();

  // deploy a fresh instance for each test to avoid state bleed
  async function deployMansaTrade() {
    const firDiv = seller.account.address;
    const secDiv = buyer.account.address;
    return viem.deployContract("MansaTrade", [firDiv, secDiv]);
  }

  describe("createOffer", async function () {
    it("should store all offer fields correctly on creation", async function () {
      const contract = await deployMansaTrade();

      // using zero address here since we are testing ETH-based offers
      const tokenAddress = "0x0000000000000000000000000000000000000000";
      const fiat = "USD";
      const rate = "1.05";
      const paymentOptions = "Bank Transfer";
      const publicKey = "pubkey123";
      const offerTerms = "No chargebacks";
      const timeLimit = 30;
      const isEth = true;
      const tokenAmount = 1000000000000000000n; // 1 ETH
      const minLimit = 100000000000000000n;      // 0.1 ETH
      const maxLimit = 900000000000000000n;      // 0.9 ETH

      await contract.write.createOffer(
        [
          tokenAddress,
          fiat,
          rate,
          paymentOptions,
          publicKey,
          offerTerms,
          timeLimit,
          isEth,
          tokenAmount,
          minLimit,
          maxLimit,
        ],
        { account: deployer.account },
      );

      const offer = await contract.read.getOfferByIndex([0n]);

      assert.equal(offer.owner.toLowerCase(), deployer.account.address.toLowerCase());
      assert.equal(offer.fiat, fiat);
      assert.equal(offer.rate, rate);
      assert.equal(offer.payment_options, paymentOptions);
      assert.equal(offer.public_key, publicKey);
      assert.equal(offer.offer_terms, offerTerms);
      assert.equal(offer.token_amount, tokenAmount);
      assert.equal(offer.min_limit, minLimit);
      assert.equal(offer.max_limit, maxLimit);
      assert.equal(offer.time_limit, timeLimit);
      assert.equal(offer.eth, isEth);
      assert.equal(offer.status, true);
      assert.equal(offer.bought, 0n);
      assert.equal(offer.offer_index, 0n);
    });

    it("should auto-increment offer_index across multiple creators", async function () {
      const contract = await deployMansaTrade();

      const tokenAddress = "0x0000000000000000000000000000000000000000";

      await contract.write.createOffer(
        [tokenAddress, "EUR", "1.10", "PayPal", "key1", "terms1", 15, true, 500n, 100n, 400n],
        { account: deployer.account },
      );

      await contract.write.createOffer(
        [tokenAddress, "GBP", "0.90", "Venmo", "key2", "terms2", 60, true, 1000n, 200n, 800n],
        { account: seller.account },
      );

      const first  = await contract.read.getOfferByIndex([0n]);
      const second = await contract.read.getOfferByIndex([1n]);

      assert.equal(first.offer_index, 0n);
      assert.equal(second.offer_index, 1n);
      // make sure owner is tracked per offer, not globally
      assert.equal(second.owner.toLowerCase(), seller.account.address.toLowerCase());
    });

    it("should track offer indexes under the caller's profile", async function () {
      const contract = await deployMansaTrade();

      const tokenAddress = "0x0000000000000000000000000000000000000000";

      await contract.write.createOffer(
        [tokenAddress, "USD", "1.00", "Wire", "key", "terms", 30, true, 1000n, 100n, 900n],
        { account: deployer.account },
      );

      await contract.write.createOffer(
        [tokenAddress, "USD", "1.01", "Check", "key2", "terms2", 30, true, 2000n, 100n, 1900n],
        { account: deployer.account },
      );

      const indexes = await contract.read.getOfferIndexesOfUser([deployer.account.address]);

      assert.equal(indexes.length, 2);
      assert.equal(indexes[0], 0n);
      assert.equal(indexes[1], 1n);
    });

    it("should grow the global offers array after each createOffer call", async function () {
      const contract = await deployMansaTrade();

      const tokenAddress = "0x0000000000000000000000000000000000000000";

      // starts empty
      assert.equal((await contract.read.getOffers()).length, 0);

      await contract.write.createOffer(
        [tokenAddress, "USD", "1.00", "Cash", "key", "terms", 30, true, 1000n, 100n, 900n],
        { account: deployer.account },
      );

      const offers = await contract.read.getOffers();
      assert.equal(offers.length, 1);
      assert.equal(offers[0].fiat, "USD");
    });
  });
});
