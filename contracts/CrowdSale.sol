pragma solidity ^0.4.8;

contract CrowdSale {
  /*
    Implements a pseudonymous, equitable, timed, fund-and-release(??) crowdsale.
  */

  address admin;

  uint constant totalTokenSupply = 50000; // number of MLN tokens for sale
  uint constant tokenPrice = 500 finney;  // price of tokens (e.g. 0.5 ETH)
  uint public saleEnd;                    // end time for the sale
  enum State {
    Open, Closed
  }

  State public state;

  // modifiers
  modifier onlyAdmin () {
    assert(msg.sender == admin);
    _;
  }

  modifier inState (State query) {
    assert(state == query);
    _;
  }

  // constructor
  function CrowdSale (uint saleHours) {
    admin = msg.sender;
    state = State.Open;
    saleEnd = now + (saleHours * 1 hours);
  }

  // user functionality
  function prebuyTokens () public payable inState(State.Open) {
    // Send ETH to this function, and order for sender's address is updated

  }

  function withdrawFunding (uint amt) public inState(State.Open) {
    // Call this function with the amount user want's refunded to their address
  }

  // business logic


}
