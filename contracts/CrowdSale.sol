pragma solidity 0.4.8;

contract CrowdSale {
  /*
    Implements a pseudonymous, equitable, timed, fund-and-release(??) crowdsale.
  */

  address admin;
  uint public saleEnd;                    // end time for the sale
  uint constant totalTokenSupply = 50000; // number of MLN tokens for sale
  uint constant tokenPrice = 500 finney;  // price of tokens (e.g. 0.5 ETH)
  uint constant minTransaction = 1 ether; // minimum prebuy or withdrawal
  mapping (address => uint) private unfulfilledOrders; // MLN ordered by address
  mapping (address => uint) private tokensOwned;  // MLN owned by address
  address[] public buyers;                       // list of buyers' addresses
  address[] finalBuyers;

  enum State {
    Open,
    Payout,
    Closed
  }

  // STATE VARIABLES
  State public state;

  // EVENTS
  event LogPrebuy(address _from, uint _numWei, uint _numTokens);
  event LogWithdrawal(address _addr, uint _numWei, uint _numTokens);
  event LogPayout(address _to, uint _numTokens);
  event LogQuotaUpdate(uint _q);
  event LogDebug(uint _a);

  // MODIFIERS
  modifier onlyAdmin () {
    if(msg.sender != admin) throw;
    _;
  }

  modifier inState (State query) {
    if(state != query) throw;
    _;
  }

  modifier timedTransition () {
    if(now > saleEnd)
      state = State.Payout;
    _;
  }

  // CONSTRUCTOR
  function CrowdSale (uint saleHours) {
    admin = msg.sender;
    state = State.Open;
    saleEnd = now + (saleHours * 1 hours);
  }

  // USER INTERFACE
  function prebuyTokens () public timedTransition inState(State.Open) payable {
    // Send ETH to this function, and order for sender's address is updated.
    // ETH is held at this contract's address.
    if(msg.value < minTransaction) throw;
    uint numPreboughtTokens = msg.value / tokenPrice; // division is truncated
    unfulfilledOrders[msg.sender] += numPreboughtTokens;
    buyers.push(msg.sender);
    LogPrebuy(msg.sender, msg.value, numPreboughtTokens);
  }

  function withdrawFunding (uint amt) public timedTransition inState(State.Open) {
    // Call this function with the amount user want's refunded to their address.
    // ETH (amt) withdrawn to user's address, and their order is updated.
    if(amt < minTransaction) throw;
    uint nMln = unfulfilledOrders[msg.sender];
    uint nEth = nMln * tokenPrice;
    if(nEth < amt) throw;
    uint numTokens = amt / tokenPrice;
    unfulfilledOrders[msg.sender] -= numTokens;
    if(!msg.sender.send(amt)) throw;
    LogWithdrawal(msg.sender, msg.value, numTokens);
  }

  function checkTokenOrder () public timedTransition inState(State.Open) returns (uint){
    // get the number of tokens currently on order for an address.
    return unfulfilledOrders[msg.sender];
  }

  //BUSINESS LOGIC
  function payOut () public timedTransition onlyAdmin {
    // begin multi-stage equitable payouts
    uint remainingTokens = totalTokenSupply; // undistributed tokens
    address[] remBuyers = pruneOrders(); // remove buyers that decided to completely refund

    uint quota = totalTokenSupply / remBuyers.length;
    LogQuotaUpdate(quota);
    LogDebug(remBuyers.length);

    while (remBuyers.length > 0) { // TODO: this can be refactored a bit*/
      for (uint i=0; i < remBuyers.length; i++) {
        if(unfulfilledOrders[remBuyers[i]] > quota) { // order is above quota
          tokensOwned[remBuyers[i]] += quota;
          remainingTokens -= quota; // subtract from remaining tokens
          unfulfilledOrders[remBuyers[i]] -= quota;
        }
        else { // order is below or equal to quota
          tokensOwned[remBuyers[i]] += unfulfilledOrders[remBuyers[i]];
          remainingTokens -= tokensOwned[remBuyers[i]]; // subtract from remaining tokens
          unfulfilledOrders[remBuyers[i]] = 0;
          LogPayout(remBuyers[i], tokensOwned[remBuyers[i]]); //logs when token attribution complete for each buyer
        }
      }
      remBuyers = pruneOrders();  // remove buyers from list if their order is filled
      if(remBuyers.length != 0) {
        quota = remainingTokens / remBuyers.length;
        LogQuotaUpdate(quota);
      }
    }

    // refund orders still unfulfilled at the end of payout (if any)
    uint amtToRefund = 0;
    for (i=0; i < buyers.length; i++) {
      amtToRefund = unfulfilledOrders[buyers[i]] * tokenPrice;
      unfulfilledOrders[buyers[i]] = 0; // refunded
      if(!buyers[i].send(amtToRefund)) throw;
    }
    state = State.Closed;
  }

  // HELPER FUNCTIONS
  function pruneOrders () private inState(State.Payout) returns(address[] storage) {
    // remove buyers with no unfulfilled order remaining, and return the new array
    delete finalBuyers; // empty array
    uint numBuyers = buyers.length;
    for (uint i=0; i < numBuyers; i++){
      if(unfulfilledOrders[buyers[i]] != 0){
        finalBuyers.push(buyers[i]);
      }
    }
    LogDebug(finalBuyers.length);
    return finalBuyers;
  }
}
