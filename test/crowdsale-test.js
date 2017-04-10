const Web3 = require("web3");
const TestRPC = require("ethereumjs-testrpc");
const rpc = require("../utils/rpc-helper.js");
const extensions = require("../utils/test-extensions.js");
const logging = require("../utils/contract-logger.js");
const CrowdSale = artifacts.require("./CrowdSale.sol");
const sim = require("../utils/simulation-utils.js");
const childProcess = require('child_process');
var web3 = new Web3();
web3.setProvider(new web3.providers.HttpProvider('http://localhost:8545'));

// TEST PARAMETERS
var deployer = web3.eth.accounts[0];
var address_1 = web3.eth.accounts[1];
var address_2 = web3.eth.accounts[2];

// EVENT LOGGING
logging.logContract(CrowdSale);

// TESTS
contract('CrowdSale', function(accounts) {
  it("should accept a prebuy order", function() {
    // checks that Eth can be received at contract address,
    // and proper number of tokens are preordered for buyer
    var sentWei = web3.toWei(2, 'ether');
    return CrowdSale.deployed()
      .then(function(instance) {
        return instance.prebuyTokens({value: sentWei, from: address_1});
      })
      .then(function(){
        return CrowdSale.deployed(); // get our contract instance again
      })
      .then(function(instance) {
        assert.equal(web3.eth.getBalance(instance.address).toNumber(),
          sentWei, "Correct Ether not in contract's address.");
        return instance.checkTokenOrder.call({from: address_1}); // returns a value
      })
      .then(function(orderAmt){
          assert.equal(orderAmt, 4, "Incorrect number of tokens on order");
      });
  });
  it("should allow withdrawal from contract", function() {
    // checks that requested Eth is removed from contract address,
    // and proper number of tokens for address are also removed
    var wdrawnWei = web3.toWei(1, 'ether');
    return CrowdSale.deployed()
      .then(function(instance) {
        return instance.withdrawFunding(wdrawnWei, {from: address_1});
      })
      .then(function(result){
        //var txPrice = result.receipt.gasUsed * web3.eth.gasPrice;
        //var returned_amount = wdrawnWei - txPrice;
        // assert.equal(web3.eth.getBalance(address_1).toNumber(), // why is the subtraction not working out? some hidden cost...
        //   returned_amount, "Incorrect Ether amount withdrawn");
        return CrowdSale.deployed();
      })
      .then(function(instance){
        assert.equal(web3.eth.getBalance(instance.address).toNumber(),
          web3.toWei(1, 'ether'), "Incorrect Ether left at contract address");
        return instance.checkTokenOrder.call({from: address_1});
      })
      .then(function(orderAmt){
        assert.equal(orderAmt, 2, "Incorrect tokens on order after withdrawal");
      });
  });
  it("should reject orders below the lower limit", function () {
    // checks that a buyer cannot purchase below the lower funding limit
    var underLimitWei = web3.toWei(0.9999999, 'ether');  // min is 1 Ether
    return CrowdSale.deployed()
      .then(function(instance) {
        return extensions.assertThrows(instance.prebuyTokens,
          [{value: underLimitWei, from: address_2}],
          "No error thrown, or incorrect error thrown.");
      })
      .then(function(){
        return CrowdSale.deployed();  // get the contract instance
      })
      .then(function(instance){
        return instance.checkTokenOrder.call({from: address_2});
      })
      .then(function(orderAmt){
        assert.equal(orderAmt, 0, "Order under limit was erroneously accepted");
      })
  });
  it("should reject withdrawal below set minimum", function () {
    // checks that buyer cannot withdraw below a certain amount
    underLimitWei = web3.toWei(0.99999, 'ether');
    return CrowdSale.deployed()
      .then(function(instance) {
        return extensions.assertThrows(instance.withdrawFunding,
        [underLimitWei, {from: address_1}],
          "No error thrown, or incorrect error thrown.");
      })
  });
  it("should allow someone to look at their own order", function(){
    return CrowdSale.deployed()
      .then(function(instance) {
        assert.doesNotThrow(function(){
          return instance.checkTokenOrder.call({from: address_1});
        })
      })
  });
  it("should not allow an initiatePayout call before sale ends", function(){
    return CrowdSale.deployed()
      .then(function(instance) {
        return extensions.assertThrows(instance.initiatePayout,
          [], "No/incorrect error thrown");
      })
      .then(function(){
        return CrowdSale.deployed();
      })
      .then(function(instance){
        return instance.state.call();
      })
      .then(function(result){
        assert(result == 0, "We are not in the first stage when we should be.");
      })
  });
  it("should not allow continuePayout before payout is initiated", function(){
    return CrowdSale.deployed()
      .then(function(instance) {
        return extensions.assertThrows(instance.continuePayout,
          [], "No/incorrect error thrown");
      })
  });
  it("should allow initiatePayout after time limit", function(){
    var timeAdvance = 25 * 60 * 60; // 25 hrs
    return rpc.increaseTime(timeAdvance)
    .then(function(){
      return rpc.mineBlock();
    })
    .then(function(){
      return CrowdSale.deployed();
    })
    .then(function(instance){
      assert.doesNotThrow(function(){
        return instance.initiatePayout({from: address_2});
      });
    })
    .then(function(){
      return CrowdSale.deployed();
    })
    .then(function(instance){
      return instance.state.call();
    })
    .then(function(result){
      assert.equal(result, 1, "We are not in the payout state.");
    })
    .then(function(){
      return CrowdSale.deployed();
    })
    .then(function(instance){
      return instance.payoutPhase.call();
    })
    .then(function(result){
      assert.equal(result.toNumber(), 1, "We are not in the correct phase of payout.");
    })
  });
  it("should allow continuePayout after payout is initiated", function(){
    return CrowdSale.deployed()
    .then(function(instance){
      assert.doesNotThrow(function() {
        return instance.continuePayout({from: address_1});
      });
    })
    .then(function(){
      return CrowdSale.deployed();
    })
    .then(function(instance){
      return instance.payoutPhase.call();
    })
    .then(function(result) {
      assert.equal(result.toNumber(), 2, "We did not transition to the correct payout phase.");
    });
  });
  it("should transition through payout phases correctly", function(){
    return CrowdSale.deployed()
    .then(function(instance){
      return instance.continuePayout({from: address_1});
    })
    .then(function(){
      return CrowdSale.deployed();
    })
    .then(function(instance){
      return instance.payoutPhase.call();
    })
    .then(function(result){
      // should go back to first phase (i.e. start a new distribution round),
      // since not all tokens have been distributed
      assert.equal(result.toNumber(), 1,
        "Did not transition back to first payout phase");
    })
  });
});

var promises = [];

describe.skip("Fullscale test", function(){
contract("CrowdSale", function(accounts){
  it("can sustain a large crowdsale", function(){
    return CrowdSale.deployed()
      .then(function(instance){
        for(let i=1; i<accounts.length; i++){
          promises.push(sim.safeCall(function(){
            instance.prebuyTokens({
              value: web3.toWei(1,'ether'),//sim.randomWei(),
              from: accounts[i]
            });
          }));
        }
        return Promise.all(promises);
      })
      .then(function(){
        return CrowdSale.deployed();
      })
      .then(function(instance){
        var timeAdvance = 25 * 60 * 60; // 25 hrs
        rpc.mineBlock();  // advance to next block
        //rpc.increaseTime(timeAdvance); //fast-forward with next block
        instance.payOut({from: deployer, gas: 4000000});
      })
  });
})
})
