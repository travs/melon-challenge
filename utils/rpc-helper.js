// send async method calls to the testRPC
var Web3 = require('web3');
var web3 = new Web3();
web3.setProvider(new web3.providers.HttpProvider('http://localhost:8545'));

// BEGIN CODE BLOCK (from @mpolci https://git.io/vSc4y)
function rpc(method, arg) {
  var req = {
    jsonrpc: "2.0",
    method: method,
    id: new Date().getTime()
  };
  if (arg) req.params = arg;

  return new Promise((resolve, reject) => {
    web3.currentProvider.sendAsync(req, (err, result) => {
      if (err) return reject(err)
      if (result && result.error) {
        return reject(new Error("RPC Error: " + (result.error.message || result.error)))
      }
      resolve(result)
    })
  })
}
// END CODE BLOCK

function increaseTime(seconds){
  rpc('evm_increaseTime', [seconds]);
}

function mineBlock(){
  rpc('evm_mine');
}

module.exports = {
  increaseTime,
  mineBlock
}
