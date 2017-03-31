var CrowdSale = artifacts.require("./CrowdSale.sol");

module.exports = function(deployer, network, accounts) {
  deployer.deploy(CrowdSale, 24, {overwrite: true, from: accounts[0]});
};
