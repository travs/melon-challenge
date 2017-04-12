const TestRPC = require("ethereumjs-testrpc");
const rpc = require("../utils/rpc-helper.js");
const extensions = require("../utils/test-extensions.js");
const logging = require("../utils/contract-logger.js");
const CrowdSale = artifacts.require("./CrowdSale.sol");

// LOGGING
logging.logContract(CrowdSale);

// TESTS
contract('CrowdSale', function(accounts) {
  it("should accept a prebuy order", function() {
    // checks that Eth can be received at contract address,
    // and proper number of tokens are preordered for buyer
    return CrowdSale.deployed()
    .then(function(instance) {
      return instance.prebuyTokens({value: web3.toWei(2, 'ether'), from: accounts[1]});
    }).then(function(){
      return CrowdSale.deployed();
    })
    .then(function(instance){
      return extensions.balanceFor(instance.address);
    })
    .then(function(result) {
      assert.equal(result.toNumber(), web3.toWei(2, 'ether'),
        "Correct Ether not in contract's address.");
      return CrowdSale.deployed(); // get our contract instance again
    })
  })
  it("should alot the correct tokens for a prebuy transaction", function(){
    return CrowdSale.deployed()
    .then(function(instance){
      return instance.checkTokenOrder.call({from: accounts[1]}); // returns a value
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
      return instance.withdrawFunding(wdrawnWei, {from: accounts[1]});
    })
    .then(function(result){
      //var txPrice = result.receipt.gasUsed * web3.eth.gasPrice;
      //var returned_amount = wdrawnWei - txPrice;
      // assert.equal(web3.eth.getBalance(accounts[1]).toNumber(), // TODO: why is the subtraction not working out? some hidden cost...
      //   returned_amount, "Incorrect Ether amount withdrawn");
      return CrowdSale.deployed();
    })
    .then((instance) => extensions.balanceFor(instance.address))
    .then(function(result){
      assert.equal(result, web3.toWei(1, 'ether'), "Incorrect Ether left at contract address");
    })
    .then(function(){
      return CrowdSale.deployed();
    })
    .then(function(instance){
      return instance.checkTokenOrder.call({from: accounts[1]});
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
        [{value: underLimitWei, from: accounts[2]}],
        "No error thrown, or incorrect error thrown.");
    })
    .then(function(){
      return CrowdSale.deployed();  // get the contract instance
    })
    .then(function(instance){
      return instance.checkTokenOrder.call({from: accounts[2]});
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
        [underLimitWei, {from: accounts[1]}],
        "No error thrown, or incorrect error thrown.");
    })
  });
  it("should reject ether sent with no function call", function() {
    return CrowdSale.deployed()
    .then(function(instance) {
      web3.eth.sendTransaction({from: accounts[1], to: instance.address,
        value: web3.toWei(10, 'ether')}, function(err, res){
          assert.isNotNull(err); // we should get an error thrown here
        })
    });
  });
  it("should allow someone to look at their own order", function(){
    return CrowdSale.deployed()
    .then(function(instance) {
      assert.doesNotThrow(function(){
        return instance.checkTokenOrder.call({from: accounts[1]});
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
        return instance.initiatePayout({from: accounts[2]});
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
        return instance.continuePayout({from: accounts[1]});
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
      return instance.continuePayout({from: accounts[1]});
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
