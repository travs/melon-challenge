const TestRPC = require("ethereumjs-testrpc");

module.exports = {
  networks: {
    development: {
      network_id: "*", // Match any network id
      provider: new TestRPC.provider()
    }
  },
  mocha: {
    slow: 1000,
    ui: 'bdd',
    bail: true
  }
};
