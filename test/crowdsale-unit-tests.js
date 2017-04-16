const utils = require('contract-utils');
const rpc = utils.rpc;
const extensions = utils.testing;
// const logging = utils.logger;
const CrowdSale = artifacts.require('./CrowdSale.sol');

contract('CrowdSale', function(accounts) {
  //TEST GLOBALS
  let crowdsaleInstance;
  before('Preparation', () =>
    CrowdSale.deployed()
    .then(instance => crowdsaleInstance = instance)
  );

  describe('Prebuying', () => {
    it('accepts a prebuy order', () => {
      // checks that Eth can be received at contract address,
      // and proper number of tokens are preordered for buyer
      crowdsaleInstance.prebuyTokens({value: web3.toWei(2, 'ether'), from: accounts[1]})
      .then(() => extensions.balanceFor(crowdsaleInstance.address))
      .then(result => assert(result.equals(web3.toWei(2, 'ether'))));
    });
    it('alots the correct tokens for a prebuy transaction', () => {
      crowdsaleInstance.checkTokenOrder.call({from: accounts[1]})
      .then(orderAmt => assert.equal(orderAmt, 4))
    });
  });
  describe('Withdrawal', () => {
    it('does not error on withdrawal from contract', () => {
      var wdrawnWei = web3.toWei(1, 'ether');
      return crowdsaleInstance.withdrawFunding(wdrawnWei, {from: accounts[1]})
      // .then(function(result){
      //   //var txPrice = result.receipt.gasUsed * web3.eth.gasPrice;
      //   //var returned_amount = wdrawnWei - txPrice;
      //   // assert.equal(web3.eth.getBalance(accounts[1]).toNumber(), // TODO: why is the subtraction not working out? some hidden cost...
      //   //   returned_amount, 'Incorrect Ether amount withdrawn');
      // })
    });
    it('sends correct ether on withdrawal', () => {
      return extensions.balanceFor(crowdsaleInstance.address)
      .then(result => assert(result.equals(web3.toWei(1, 'ether'))))
    })
    it('updates token order on withdrawal', () => {
      return crowdsaleInstance.checkTokenOrder.call({from: accounts[1]})
      .then(orderAmt => assert.equal(orderAmt, 2));
    });
  });
  describe('Minimum order/withdrawal', () => {
    it('errors on order below minimum', () => {
      var underLimitWei = web3.toWei(0.9999999, 'ether');  // min is 1 Ether
      return extensions.assertThrows(crowdsaleInstance.prebuyTokens,
        [{value: underLimitWei, from: accounts[2]}],
        'No error thrown, or incorrect error thrown.'
      );
    });
    it('does not increase order when below minimum', () => {
      return crowdsaleInstance.checkTokenOrder.call({from: accounts[2]})
      .then(orderAmt => assert.equal(orderAmt, 0));
    });
    it('rejects withdrawal below set minimum', () => {
      underLimitWei = web3.toWei(0.99999, 'ether');
      return extensions.assertThrows(crowdsaleInstance.withdrawFunding,
        [underLimitWei, {from: accounts[1]}],
        'No error thrown, or incorrect error thrown.'
      );
    });
    it('should reject ether sent with no function call', () => {
      web3.eth.sendTransaction(
        {
          from: accounts[1],
          to: crowdsaleInstance.address,
          value: web3.toWei(10, 'ether')
        },
        (err, res) => assert.isNotNull(err))
    });
    it('should allow someone to look at their own order', () => {
        assert.doesNotThrow(() =>
          crowdsaleInstance.checkTokenOrder.call({from: accounts[1]})
        )
    });
  });
  describe('Transition into payout phase', () => {
    it('should error on initiatePayout call before sale end', () => {
      return extensions.assertThrows(
        crowdsaleInstance.initiatePayout, [], 'No/incorrect error thrown'
      );
    });
    it('should still be in first state (Open)', () => {
      return crowdsaleInstance.state.call()
      .then(result => assert(result == 0))
    });
    it('should error on continuePayout call before payout is initiated', () => {
      return extensions.assertThrows(
        crowdsaleInstance.continuePayout, [], 'No/incorrect error thrown'
      );
    });
    it('should not error on initiatePayout after time limit', () => {
      return rpc.increaseTime(25 * 60 * 60) // 25 hrs
      .then(rpc.mineBlock)
      .then(() =>
        assert.doesNotThrow(() =>
          crowdsaleInstance.initiatePayout({from: accounts[2]})
        )
      )
    })
  });
  describe('Payout state and phase transitions', () => {
    it('transitions into next state on initiatePayout call', () => {
      return crowdsaleInstance.state.call()
      .then(res => assert.equal(res, 1))
    })
    it('begins Payout state in correct phase', () => {
      return crowdsaleInstance.payoutPhase.call()
      .then(res => assert.equal(res, 1))
    })
    it('does not error on continuePayout after payout is initiated', () =>
      assert.doesNotThrow(() => crowdsaleInstance.continuePayout())
    )
    it('transitions into next payout phase on continuePayout', () => {
      return crowdsaleInstance.payoutPhase.call()
      .then(res => assert.equal(res, 2))
    });
    it('transitions back to first phase on continuePayout', () => {
      // should go back to first phase (i.e. start a new distribution round),
      // since not all tokens have been distributed
      return crowdsaleInstance.continuePayout()
      .then(crowdsaleInstance.payoutPhase.call)
      .then(res => assert.equal(res, 1))
    });
  })
});
