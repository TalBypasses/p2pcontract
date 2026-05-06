import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { network } from "hardhat";

// ERC20 confirmOrder has an accounting bug (line 250 uses fir_fee instead of
// sec_fee for sec_div), which causes the contract to overdraw its token balance
// and revert.  The bug is captured in the "erc20 bug" describe block below.

describe("MansaTrade", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [deployer, alice, bob] = await viem.getWalletClients();

  async function deploy() {
    // deployer becomes contract owner; alice/bob receive fee splits
    return viem.deployContract("MansaTrade", [
      alice.account.address,
      bob.account.address,
    ]);
  }

  const ZERO_ADDR = "0x0000000000000000000000000000000000000000";

  async function createEthOffer(contract, caller = deployer) {
    return contract.write.createOffer(
      [ZERO_ADDR, "USD", "1.00", "Bank Transfer", "pubkey", "terms", 30, true,
       1000000000000000000n, 100000000000000000n, 900000000000000000n],
      { account: caller.account },
    );
  }

  async function placeOrder(contract, caller = alice, sellAmount = 200000000000000000n) {
    return contract.write.createOrder(
      ["Bank Transfer", "Alice", "alice@test.com", "200", 0n, sellAmount],
      { account: caller.account, value: sellAmount },
    );
  }

  describe("createOffer", async function () {
    it("stores all fields on creation", async function () {
      const c = await deploy();
      await createEthOffer(c);
      const offer = await c.read.getOfferByIndex([0n]);

      assert.equal(offer.owner.toLowerCase(), deployer.account.address.toLowerCase());
      assert.equal(offer.fiat, "USD");
      assert.equal(offer.rate, "1.00");
      assert.equal(offer.payment_options, "Bank Transfer");
      assert.equal(offer.public_key, "pubkey");
      assert.equal(offer.offer_terms, "terms");
      assert.equal(offer.time_limit, 30);
      assert.equal(offer.eth, true);
      assert.equal(offer.token_amount, 1000000000000000000n);
      assert.equal(offer.min_limit, 100000000000000000n);
      assert.equal(offer.max_limit, 900000000000000000n);
      assert.equal(offer.status, true);
      assert.equal(offer.bought, 0n);
      assert.equal(offer.offer_index, 0n);
    });

    it("auto-increments offer_index across different callers", async function () {
      const c = await deploy();
      await createEthOffer(c, deployer);
      await createEthOffer(c, alice);
      const first = await c.read.getOfferByIndex([0n]);
      const second = await c.read.getOfferByIndex([1n]);

      assert.equal(first.offer_index, 0n);
      assert.equal(second.offer_index, 1n);
      assert.equal(second.owner.toLowerCase(), alice.account.address.toLowerCase());
    });

    it("tracks offer indexes under the caller profile", async function () {
      const c = await deploy();
      await createEthOffer(c);
      await createEthOffer(c);
      const indexes = await c.read.getOfferIndexesOfUser([deployer.account.address]);

      assert.equal(indexes.length, 2);
      assert.equal(indexes[0], 0n);
      assert.equal(indexes[1], 1n);
    });

    it("grows the global offers array", async function () {
      const c = await deploy();
      assert.equal((await c.read.getOffers()).length, 0);
      await createEthOffer(c);
      assert.equal((await c.read.getOffers()).length, 1);
    });
  });

  describe("updateOffer", async function () {
    it("lets the owner update mutable fields", async function () {
      const c = await deploy();
      await createEthOffer(c);
      await c.write.updateOffer(
        ["EUR", "PayPal", "new terms", 60, 0n, 500n, 50n, 450n],
        { account: deployer.account },
      );
      const offer = await c.read.getOfferByIndex([0n]);

      assert.equal(offer.fiat, "EUR");
      assert.equal(offer.payment_options, "PayPal");
      assert.equal(offer.offer_terms, "new terms");
      assert.equal(offer.time_limit, 60);
      assert.equal(offer.token_amount, 500n);
      assert.equal(offer.min_limit, 50n);
      assert.equal(offer.max_limit, 450n);
    });

    it("reverts when caller is not the offer owner", async function () {
      const c = await deploy();
      await createEthOffer(c);
      await assert.rejects(
        c.write.updateOffer(
          ["EUR", "PayPal", "terms", 60, 0n, 500n, 50n, 450n],
          { account: alice.account },
        ),
      );
    });
  });

  describe("cancelOffer", async function () {
    it("sets status to false", async function () {
      const c = await deploy();
      await createEthOffer(c);
      await c.write.cancelOffer([0n], { account: deployer.account });
      const offer = await c.read.getOfferByIndex([0n]);

      assert.equal(offer.status, false);
    });

    it("reverts when caller is not the offer owner", async function () {
      const c = await deploy();
      await createEthOffer(c);
      await assert.rejects(
        c.write.cancelOffer([0n], { account: alice.account }),
      );
    });
  });

  describe("createOrder", async function () {
    it("reverts when msg.value does not match sell_amount", async function () {
      const c = await deploy();
      await createEthOffer(c);
      await assert.rejects(
        c.write.createOrder(
          ["Bank Transfer", "Alice", "alice@test.com", "200", 0n, 200000000000000000n],
          { account: alice.account, value: 100000000000000000n },
        ),
      );
    });

    it("records the order with correct fields", async function () {
      const c = await deploy();
      await createEthOffer(c);
      await placeOrder(c);
      const order = await c.read.getOrderByIndex([0n]);

      assert.equal(order.seller.toLowerCase(), alice.account.address.toLowerCase());
      assert.equal(order.sell_amount, 200000000000000000n);
      assert.equal(order.offer_index, 0n);
      assert.equal(order.status, 0);
      assert.equal(order.buyer_confirm, false);
    });

    it("emits CreateOrder with the order index", async function () {
      const c = await deploy();
      await createEthOffer(c);
      await viem.assertions.emitWithArgs(
        placeOrder(c),
        c,
        "CreateOrder",
        [0n],
      );
    });

    it("registers the order under both parties", async function () {
      const c = await deploy();
      await createEthOffer(c);
      await placeOrder(c);

      const sellerOrders = await c.read.getOrderIndexesOfUser([alice.account.address]);
      const offerOwnerOrders = await c.read.getOrderIndexesOfUser([deployer.account.address]);

      assert.equal(sellerOrders[0], 0n);
      assert.equal(offerOwnerOrders[0], 0n);
    });
  });

  describe("buyerConfirm", async function () {
    it("lets the offer owner mark payment sent", async function () {
      const c = await deploy();
      await createEthOffer(c);
      await placeOrder(c);
      await c.write.buyerConfirm([0n], { account: deployer.account });
      const order = await c.read.getOrderByIndex([0n]);

      assert.equal(order.buyer_confirm, true);
    });

    it("reverts when caller is not the offer owner", async function () {
      const c = await deploy();
      await createEthOffer(c);
      await placeOrder(c);
      await assert.rejects(
        c.write.buyerConfirm([0n], { account: alice.account }),
      );
    });
  });

  describe("confirmOrder", async function () {
    it("releases funds, marks order complete, and updates bought", async function () {
      const c = await deploy();
      await createEthOffer(c);
      await placeOrder(c);
      await c.write.buyerConfirm([0n], { account: deployer.account });

      const balanceBefore = await publicClient.getBalance({ address: alice.account.address });
      await c.write.confirmOrder([0n], { account: alice.account });
      const balanceAfter = await publicClient.getBalance({ address: alice.account.address });

      assert.ok(balanceAfter > balanceBefore, "seller should receive funds after confirmation");

      const order = await c.read.getOrderByIndex([0n]);
      assert.equal(order.status, 1);
      assert.equal(order.seller_confirm, true);

      const offer = await c.read.getOfferByIndex([0n]);
      assert.equal(offer.bought, 200000000000000000n);
    });

    it("reverts when buyer has not confirmed yet", async function () {
      const c = await deploy();
      await createEthOffer(c);
      await placeOrder(c);
      await assert.rejects(
        c.write.confirmOrder([0n], { account: alice.account }),
      );
    });

    it("reverts when order is already completed", async function () {
      const c = await deploy();
      await createEthOffer(c);
      await placeOrder(c);
      await c.write.buyerConfirm([0n], { account: deployer.account });
      await c.write.confirmOrder([0n], { account: alice.account });
      await assert.rejects(
        c.write.confirmOrder([0n], { account: alice.account }),
      );
    });
  });

  describe("cancelOrder", async function () {
    it("refunds the seller and sets status to 2", async function () {
      const c = await deploy();
      await createEthOffer(c);
      await placeOrder(c);

      const balanceBefore = await publicClient.getBalance({ address: alice.account.address });
      await c.write.cancelOrder([0n], { account: deployer.account });
      const balanceAfter = await publicClient.getBalance({ address: alice.account.address });

      assert.ok(balanceAfter > balanceBefore, "seller should be refunded on cancel");

      const order = await c.read.getOrderByIndex([0n]);
      assert.equal(order.status, 2);
    });

    it("reverts when order is already completed", async function () {
      const c = await deploy();
      await createEthOffer(c);
      await placeOrder(c);
      await c.write.buyerConfirm([0n], { account: deployer.account });
      await c.write.confirmOrder([0n], { account: alice.account });
      await assert.rejects(
        c.write.cancelOrder([0n], { account: deployer.account }),
      );
    });
  });

  describe("user management", async function () {
    it("createUser initialises a profile", async function () {
      const c = await deploy();
      await c.write.createUser({ account: alice.account });
      const user = await c.read.getUser([alice.account.address]);

      assert.equal(user.user_address.toLowerCase(), alice.account.address.toLowerCase());
      assert.equal(user.verified, false);
      assert.equal(user.thumbs_up, 0n);
      assert.equal(user.thumbs_down, 0n);
    });

    it("updateUser sets region", async function () {
      const c = await deploy();
      await c.write.createUser({ account: alice.account });
      await c.write.updateUser([3], { account: alice.account });
      const user = await c.read.getUser([alice.account.address]);

      assert.equal(user.region, 3);
    });

    it("thumbUser increments thumbs up", async function () {
      const c = await deploy();
      await createEthOffer(c);
      await placeOrder(c);
      await c.write.thumbUser([true, alice.account.address, 0n], { account: deployer.account });
      const user = await c.read.getUser([alice.account.address]);

      assert.equal(user.thumbs_up, 1n);
    });

    it("thumbUser increments thumbs down", async function () {
      const c = await deploy();
      await createEthOffer(c);
      await placeOrder(c);
      await c.write.thumbUser([false, alice.account.address, 0n], { account: deployer.account });
      const user = await c.read.getUser([alice.account.address]);

      assert.equal(user.thumbs_down, 1n);
    });

    it("reverts when rating yourself", async function () {
      const c = await deploy();
      await assert.rejects(
        c.write.thumbUser([true, alice.account.address, 0n], { account: alice.account }),
      );
    });
  });

  describe("erc20 bug — confirmOrder overdrafts the token balance", async function () {
    it("confirmOrder reverts for ERC20 offers because sec_div is paid fir_fee instead of sec_fee", async function () {
      const c = await deploy();
      const token = await viem.deployContract("MockERC20");

      const sellAmount = 1000000n;

      await token.write.mint([alice.account.address, sellAmount], { account: deployer.account });
      await token.write.approve([c.address, sellAmount], { account: alice.account });

      await c.write.createOffer(
        [token.address, "USD", "1.00", "Bank Transfer", "pubkey", "terms", 30, false,
         sellAmount, 100n, sellAmount],
        { account: deployer.account },
      );

      await c.write.createOrder(
        ["Bank Transfer", "Alice", "alice@test.com", "100", 0n, sellAmount],
        { account: alice.account },
      );

      await c.write.buyerConfirm([0n], { account: deployer.account });

      // contract holds sellAmount tokens but tries to send more than that
      // because sec_div receives fir_fee (80%) instead of sec_fee (20%),
      // making the total distribution 105.4% of sellAmount
      await assert.rejects(
        c.write.confirmOrder([0n], { account: alice.account }),
        "expected revert: sec_div overdraft due to fir_fee/sec_fee bug on line 250",
      );
    });
  });
});
