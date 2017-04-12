const TestRPC = require("ethereumjs-testrpc");
const rpc = require("../utils/rpc-helper.js");
const extensions = require("../utils/test-extensions.js");
const logging = require("../utils/contract-logger.js");
const sim = require("../utils/simulation-utils.js");
const CrowdSale = artifacts.require("./CrowdSale.sol");

require('./crowdsale-unit-tests.js'); // this forces unit tests to run first (stackoverflow.com/a/28229621)

// LOGGING
logging.logContract(CrowdSale);

describe("Small Sample Crowdsale", function(){
contract("CrowdSale", function(accounts){
  it("should accept 3 initial large buys", function(){
    return CrowdSale.deployed()
    .then(function(instance){
      return instance.prebuyTokens({value: web3.toWei(10000, 'ether'), from: accounts[1]});
    })
    .then(CrowdSale.deployed)
    .then(function(instance){
      return instance.prebuyTokens({value: web3.toWei(15000, 'ether'), from: accounts[2]});
    })
    .then(CrowdSale.deployed)
    .then(function(instance){
      return instance.prebuyTokens({value: web3.toWei(5000, 'ether'), from: accounts[3]});
    })
  });
  it("should transition to payout state after time limit", function(){
    return CrowdSale.deployed()
    .then(() => rpc.increaseTime(25 * 60 * 60)) // advance past end of sale time
    .then(rpc.mineBlock)
    .then(CrowdSale.deployed)
    .then(instance => instance.initiatePayout())  // pre -> pruning
    .then(CrowdSale.deployed)
    .then(instance => instance.payoutPhase.call())
    .then(res => assert.equal(1, res, "Not in 1st pruning phase."))
  });
  it("should transition through first round", function(){
    return CrowdSale.deployed()                   // (round 1)
    .then(instance => instance.continuePayout())  // pruning -> distributing
    .then(CrowdSale.deployed)
    .then(instance => instance.payoutPhase.call())
    .then(res => assert.equal(2, res, "Not in 1st distributing phase."))
    .then(CrowdSale.deployed)
    .then(instance => instance.continuePayout())  // distributing -> pruning
  });
  it("should transition through second round", function(){
    return CrowdSale.deployed()                   // (round 2)
    .then(instance => instance.payoutPhase.call())
    .then(res => assert.equal(1, res, "Not in 2nd pruning phase."))
    .then(CrowdSale.deployed)
    .then(instance => instance.continuePayout())  // pruning -> distributing
    .then(CrowdSale.deployed)
    .then(instance => instance.payoutPhase.call())
    .then(res => assert.equal(2, res, "Not in 2nd distributing phase."))
    .then(CrowdSale.deployed)
    .then(instance => instance.continuePayout())  // distributing -> pruning
  });
  it("should transition through to refund phase", function(){
    return CrowdSale.deployed()                   // (refund round)
    .then(instance => instance.payoutPhase.call())
    .then(res => assert.equal(1, res, "Not in final pruning phase."))
    .then(CrowdSale.deployed)
    .then(instance => instance.continuePayout())  // pruning -> refunding
    .then(CrowdSale.deployed)
    .then(instance => instance.payoutPhase.call())
    .then(res => assert.equal(3, res, "Not in refunding phase."))
  });
  it("should allow withdrawals in refund phase", function(){
    return CrowdSale.deployed()
    .then(function(instance) {
      assert.doesNotThrow(function(){
        return instance.withdrawRefund({from: accounts[2]});
      });
    });
  });
  it("should error on refund to account with no unfulfilled order", function(){
    return CrowdSale.deployed()
    .then(function(instance) {
      extensions.assertThrows(function(){
        return instance.withdrawRefund({from: accounts[3]});
      });
    });
  });
  it("should end with account balances within 0.001ETH of expected", function () {
    var initBalance = web3.toBigNumber(web3.toWei(50000, 'ether'));
    var tolerance = web3.toWei(0.001, 'ether');

    return extensions.balanceFor(accounts[1])
    .then(function(endBalance){
      var expectedBalance = initBalance.minus(web3.toWei(10000, 'ether')); //sent 15000, refunded 5000
      var accountError = endBalance.minus(expectedBalance);
      assert(accountError.lessThan(tolerance), 'Account 1 does not have the correct amount.');
    })
    .then(() => extensions.balanceFor(accounts[2]))
    .then(function(endBalance){
      var expectedBalance = initBalance.minus(web3.toWei(10000, 'ether')); //sent 10000
      var accountError = endBalance.minus(expectedBalance);
      assert(accountError.lessThan(tolerance), 'Account 2 does not have the correct amount.');
    })
    .then(() => extensions.balanceFor(accounts[3]))
    .then(function(endBalance){
        var expectedBalance = initBalance.minus(web3.toWei(5000, 'ether')); //sent 5000
        var accountError = endBalance.minus(expectedBalance);
        assert(accountError.lessThan(tolerance), 'Account 3 does not have the correct amount.');
    });
  });
  it("should end with correct token balances for each account", function(){
    return CrowdSale.deployed()
    .then((instance) => instance.checkTokensOwned.call({from: accounts[1]}))
    .then((res) => assert.equal(res, 20000))
    .then(CrowdSale.deployed)
    .then((instance) => instance.checkTokensOwned.call({from: accounts[2]}))
    .then((res) => assert.equal(res, 20000))
    .then(CrowdSale.deployed)
    .then((instance) => instance.checkTokensOwned.call({from: accounts[3]}))
    .then((res) => assert.equal(res, 10000))
  });
})
})
