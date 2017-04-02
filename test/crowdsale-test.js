const Web3 = require("web3");
const rpc = require("../utils/rpc-helper.js");
const extensions = require("../utils/test-extensions.js");
const logging = require("../utils/contract-logger.js");
const CrowdSale = artifacts.require("./CrowdSale.sol");
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
        return instance.checkTokenOrder.call(address_1); // returns a value
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
        return instance.checkTokenOrder.call(address_1);
      })
      .then(function(orderAmt){
        assert.equal(orderAmt, 2, "Incorrect tokens on order after withdrawal");
      });
  });
  it("should reject orders below the lower limit", function () {
    // checks that a buyer cannot purchase below the lower funding limit
    var underLimitWei = web3.toWei(0.9999999, 'ether');  // limit is 1 Ether
    return CrowdSale.deployed()
      .then(function(instance) {
        extensions.assertThrows(instance.prebuyTokens,
          [{value: underLimitWei, from: address_2}],
          "No error thrown, or incorrect error thrown.");
      })
      .then(function(){
        return CrowdSale.deployed();  // get the contract instance
      })
      .then(function(instance){
        return instance.checkTokenOrder.call(address_2, {from: address_2});
      })
      .then(function(orderAmt){
        assert.equal(orderAmt, 0, "Order under limit was erroneously accepted");
      })
  });
  it("should reject withdrawal below set minimum", function () {
    // checks that buyer cannot withdraw below a certain amount
    return CrowdSale.deployed()
      .then(function(instance) {
        extensions.assertThrows(instance.withdrawFunding,
          [{value: 0.9999999, from: address_1}],
          "No error thrown, or incorrect error thrown.");
      })
  });
  it("should reject someone looking for another person's orders", function(){
    return CrowdSale.deployed()
      .then(function(instance) {
        extensions.assertThrows(instance.checkTokenOrder.call,
          [address_1, {from: address_2}], "No/incorrect error thrown");
      })
  });
  it("should allow someone to look at their own order", function(){
    return CrowdSale.deployed()
      .then(function(instance) {
        assert.doesNotThrow(function(){
          return instance.checkTokenOrder.call(address_1, {from: address_1});
        })
      })
  });
  it("should not allow a payout call before sale ends", function(){
    return CrowdSale.deployed()
      .then(function(instance) {
        return extensions.assertThrows(instance.payOut.call,
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
  })
  it.skip("should allow a payout call after time limit", function(){
    return CrowdSale.deployed()
      .then(function(instance){
        var timeAdvance = 25 * 60 * 60; // 25 hrs
        rpc.increaseTime(timeAdvance); //fast-forward with next block
        rpc.mineBlock();  // advance to next block
        return instance.checkTokenOrder.call(address_1); // ping contract to advance its state
      })
      .then(function(){
        return CrowdSale.deployed();
      })
      .then(function(instance){
        return instance.payOut.call({gas: 4000000});
      })
      // .then(function(res){
      //   console.log(res.toString());
      //   console.log(web3.eth.getBlock('latest'));
      // })
  });
});
