//anything that may be used as a helper for the larger scale simulation can go in here
Web3 = require('web3');
var web3 = new Web3();
web3.setProvider(new web3.providers.HttpProvider('http://localhost:8545'));

function randomGauss() {
  // Give random number coming from an approximated gaussian distribution.
  // Uses summation of uniform variates to generate the distribution.
  // Number will be between 0 and 1.
  return ((Math.random() + Math.random() + Math.random() +
    Math.random() + Math.random() + Math.random())) / 6;
}

function randomWei () {
  //get a random number of Wei, from a Gaussian distribution between 0 & 100 Eth
  return web3.toWei(randomGauss() * 10, 'ether');
}

function safeCall (func) {
  //wrapper to prevent errors from ruingin program flow
  return Promise.resolve().then(func)
   .then(function(txid) {
     var tx = web3.eth.getTransaction(txid);
     var txr = web3.eth.getTransactionReceipt(txid);
     if (txr.gasUsed === tx.gas) throw new Error("all gas used");
   })
   .catch(function(err) {
     //return err;
   });
}

module.exports = {
  randomWei,
  safeCall
}
