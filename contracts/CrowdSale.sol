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
  address[] buyers;                       // list of buyers' addresses

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
  event LogArbitrary(string _s);

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
    uint numTokens = amt / tokenPrice;
    unfulfilledOrders[msg.sender] -= numTokens;
    if(!msg.sender.send(amt)) throw;
    LogWithdrawal(msg.sender, msg.value, numTokens);
  }

  function checkTokenOrder (address addr) public timedTransition returns (uint){
    // get the number of tokens currently on order for an address.
    // users can only check their own balance, but admin can check anyone's.
    if(msg.sender != addr && msg.sender != admin) throw;
    return unfulfilledOrders[addr];
  }

  //BUSINESS LOGIC
  function payOut () public timedTransition inState(State.Payout) onlyAdmin {
    // begin multi-stage equitable payouts
    LogQuotaUpdate(123456);
    LogWithdrawal(msg.sender, 1, 1);

    uint remainingTokens = totalTokenSupply; // undistributed tokens
    pruneOrders(); // remove buyers that decided to completely refund
    return;

    uint quota = totalTokenSupply / buyers.length;
    LogQuotaUpdate(quota);
    while (quota > 0) { // TODO: this can be refactored a bit
      for (uint i=0; i < buyers.length; i++) {
        if(unfulfilledOrders[buyers[i]] > quota) { // order is above quota
          tokensOwned[buyers[i]] += quota;
          remainingTokens -= quota; // subtract from remaining tokens
          unfulfilledOrders[buyers[i]] -= quota;
        }
        else { // order is below or equal to quota
          tokensOwned[buyers[i]] += unfulfilledOrders[buyers[i]];
          remainingTokens -= tokensOwned[buyers[i]]; // subtract from remaining tokens
          unfulfilledOrders[buyers[i]] = 0;
          LogPayout(buyers[i], tokensOwned[buyers[i]]); //logs when token attribution complete for each buyer
        }
      }
      pruneOrders();  // remove buyers from list if their order is filled
      quota = remainingTokens / buyers.length;
      LogQuotaUpdate(quota);
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
  function pruneOrders () private inState(State.Payout) {
    // remove buyers with no unfulfilled order remaining
    address[] finalBuyers;
    for (uint i=0; i < buyers.length; i++){
      if(unfulfilledOrders[buyers[i]] != 0){
        finalBuyers.push(buyers[i]);
      }
    }
    LogArbitrary("here");
    return;
    buyers = finalBuyers;
  }
}
