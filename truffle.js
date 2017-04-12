const TestRPC = require("ethereumjs-testrpc");

module.exports = {
  networks: {
    development: {
      network_id: "*", // Match any network id
      provider: new TestRPC.provider({
        "accounts": [
          {"balance": '0xA968163F0A57B400000'},
          {"balance": '0xA968163F0A57B400000'},
          {"balance": '0xA968163F0A57B400000'},
          {"balance": '0xA968163F0A57B400000'}
        ]
      })
    }
  },
  mocha: {
    slow: 3000,
    ui: "bdd",
    bail: true,  // quit testing on first error
    reporter: 'spec'
  }
};
