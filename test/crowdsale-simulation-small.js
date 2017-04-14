const utils = require('contract-utils');
const rpc = utils.rpc;
const extensions = utils.testing;
const logging = utils.logger;
const CrowdSale = artifacts.require('./CrowdSale.sol');

require('./crowdsale-unit-tests.js'); // this forces unit tests to run first (stackoverflow.com/a/28229621)

// LOGGING
logging.logContract(CrowdSale);

describe('Small Sample Crowdsale', function(){
contract('CrowdSale', function(accounts){
  //DATA
  let prebuys = [
    {value: web3.toWei(10000, 'ether'), from: accounts[1]},
    {value: web3.toWei(15000, 'ether'), from: accounts[2]},
    {value: web3.toWei(5000, 'ether'), from: accounts[3]}
  ];
  //TEST GLOBALS
  let crowdsaleInstance;
  before('Preparation', () =>
    CrowdSale.deployed().then(instance => crowdsaleInstance = instance)
  );

  it('should accept 3 initial large buys', () => {
    return crowdsaleInstance.prebuyTokens(prebuys[0])
    .then(() => crowdsaleInstance.prebuyTokens(prebuys[1]))
    .then(() => crowdsaleInstance.prebuyTokens(prebuys[2]))
  });
  it('should transition to payout state after time limit', () => {
    return rpc.increaseTime(25 * 60 * 60) // advance past end of sale time
    .then(rpc.mineBlock)
    .then(crowdsaleInstance.initiatePayout)  // pre -> pruning
    .then(crowdsaleInstance.payoutPhase.call)
    .then(res => assert.equal(1, res, 'Not in 1st pruning phase.'))
  });
  it('should transition through first round', () => {
    return crowdsaleInstance.continuePayout()     // pruning -> distributing
    .then(crowdsaleInstance.payoutPhase.call)
    .then(res => assert.equal(2, res, 'Not in 1st distributing phase.'))
    .then(crowdsaleInstance.continuePayout)       // distributing -> pruning
  });
  it('should transition through second round', () => {
    return crowdsaleInstance.payoutPhase.call()
    .then(res => assert.equal(1, res, 'Not in 2nd pruning phase.'))
    .then(crowdsaleInstance.continuePayout)      // pruning -> distributing
    .then(crowdsaleInstance.payoutPhase.call)
    .then(res => assert.equal(2, res, 'Not in 2nd distributing phase.'))
    .then(crowdsaleInstance.continuePayout)      // distributing -> pruning
  });
  it('should transition through to refund phase', () => {
    return crowdsaleInstance.payoutPhase.call()
    .then(res => assert.equal(1, res, 'Not in final pruning phase.'))
    .then(crowdsaleInstance.continuePayout)      // pruning -> refunding
    .then(crowdsaleInstance.payoutPhase.call)
    .then(res => assert.equal(3, res, 'Not in refunding phase.'))
  });
  it('should allow withdrawals in refund phase', () => {
    assert.doesNotThrow(() => {
      crowdsaleInstance.withdrawRefund({from: accounts[2]});
    })
  });
  it('should error on refund to account with no unfulfilled order', () => {
    return extensions.assertThrows(
      crowdsaleInstance.withdrawRefund, [{from: accounts[3]}], 'Incorrect error thrown'
    );
  });
  it('should end with account balances within 0.001ETH of expected', function () {
    var initBalance = web3.toBigNumber(web3.toWei(50000, 'ether'));
    var tolerance = web3.toWei(0.001, 'ether');

    return extensions.balanceFor(accounts[1])
    .then(endBalance => {
      var expectedBalance = initBalance.minus(web3.toWei(10000, 'ether')); //sent 15000, refunded 5000
      var accountError = endBalance.minus(expectedBalance);
      assert(accountError.lessThan(tolerance), 'Account 1 does not have the correct amount.');
    })
    .then(() => extensions.balanceFor(accounts[2]))
    .then(endBalance => {
      var expectedBalance = initBalance.minus(web3.toWei(10000, 'ether')); //sent 10000
      var accountError = endBalance.minus(expectedBalance);
      assert(accountError.lessThan(tolerance), 'Account 2 does not have the correct amount.');
    })
    .then(() => extensions.balanceFor(accounts[3]))
    .then(endBalance => {
      var expectedBalance = initBalance.minus(web3.toWei(5000, 'ether')); //sent 5000
      var accountError = endBalance.minus(expectedBalance);
      assert(accountError.lessThan(tolerance), 'Account 3 does not have the correct amount.');
    });
  });
  it('should end with correct token balances for each account', () => {
    crowdsaleInstance.checkTokensOwned.call({from: accounts[1]})
    .then(res => assert.equal(res, 20000))
    .then(() => crowdsaleInstance.checkTokensOwned.call({from: accounts[2]}))
    .then(res => assert.equal(res, 20000))
    .then(() => crowdsaleInstance.checkTokensOwned.call({from: accounts[3]}))
    .then(res => assert.equal(res, 10000))
  });
})
})
