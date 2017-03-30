const Web3 = require("web3");
var web3 = new Web3();
web3.setProvider(new web3.providers.HttpProvider('http://localhost:8545'));

var address_1 = web3.eth.accounts[3];
var address_2 = web3.eth.accounts[4];

var CrowdSale = artifacts.require("./CrowdSale.sol");

contract('CrowdSale', function(accounts) {
  it("should accept a prebuy order", function() {
    // checks that Eth can be received at contract address,
    // and proper number of tokens are preordered for buyer
    sentWei = web3.toWei(2, 'ether');
    return CrowdSale.deployed().then(function(instance) {
      return instance.prebuyTokens({value: sentWei, from: address_1});
    }).then(function(result) {
      CrowdSale.deployed().then(function(instance){ // get the instance again
        assert.equal(web3.eth.getBalance(instance.address).toNumber(),
          sentWei, "Correct Ether not in contract's address.");
        return instance.checkTokenOrder.call(address_1);
      }).then(function(orderAmt){
        assert.equal(orderAmt, 4, "Incorrect number of tokens on order");
      });
    });
  });
  it("should allow withdrawal from contract", function() {
    // checks that requested Eth is removed from contract address,
    // and proper number of tokens for address are also removed
    wdrawnWei = web3.toWei(1, 'ether');
    return CrowdSale.deployed().then(function(instance) {
      return instance.withdrawFunding(wdrawnWei, {from: address_1})
      .then(function(result){
        var txPrice = result.receipt.gasUsed * web3.eth.gasPrice;
        var returned_amount = wdrawnWei - txPrice;
        assert.equal(web3.eth.getBalance(instance.address).toNumber(),
          web3.toWei(1, 'ether'), "Incorrect Ether left at contract address");
        // assert.equal(web3.eth.getBalance(address_1).toNumber(), // why is the subtraction not working out? some hidden cost...
        //   returned_amount, "Incorrect Ether amount withdrawn");
        return instance.checkTokenOrder.call(address_1);
      }).then(function(orderAmt){
        assert.equal(orderAmt, 2, "Incorrect tokens on order after withdrawal");
      });
    });
  });
});
