pragma solidity 0.4.8;

contract CrowdSale {
/*
Implements a pseudonymous, equitable, timed, fund-and-release(??) crowdsale.
*/

    address admin;
    uint public saleEnd;                    // end time for the sale
    uint private quota;                     // max tokens per person this round
    uint private remainingTokens;           // undistributed tokens
    uint constant totalTokenSupply = 50000; // number of MLN tokens for sale
    uint constant tokenPrice = 500 finney;  // price of tokens (e.g. 0.5 ETH)
    uint constant minTransaction = 1 ether; // minimum prebuy or withdrawal
    uint constant defaultBatchSize = 10;           // number of users in each payment batch
    uint private iBatch = 0;                // position in the current batch
    mapping (address => uint) private unfulfilledOrders; // MLN ordered by address
    mapping (address => uint) private tokensOwned;  // MLN owned by address
    address[] public buyers;                       // list of buyers' addresses
    address[] private prunedBuyers;
    address[] private remBuyers;

    enum State {
    Open,
    Payout,
    Closed
    }

    enum PayoutPhase {
    Pre,
    Pruning,
    Distributing,
    Refunding,
    Post
    }

    // STATE VARIABLES
    State public state;
    PayoutPhase public payoutPhase;

    // EVENTS
    event LogPrebuy(address _from, uint _numWei, uint _numTokens);
    event LogWithdrawal(address _addr, uint _numWei, uint _numTokens);
    event LogPayout(address _to, uint _numTokens);
    event LogQuotaUpdate(uint _q);
    event LogRefund(address _to, uint _numWei);
    event LogDebug(uint _v);

    // MODIFIERS
    modifier onlyAdmin () {
        if(msg.sender != admin) throw;
        _;
    }

    modifier inState (State query) {
        if(state != query) throw;
        _;
    }

    modifier inPayoutPhase (PayoutPhase query) {
        // fails silently
        if(payoutPhase == query) _;
    }

    modifier timedTransition () {
        if(now > saleEnd)
            state = State.Payout;
        _;
    }

    modifier batchProcess (uint batchSize, uint maximum) {
        for (uint i=0; i < batchSize; i++) {
            if(iBatch < maximum) {
                _;
                iBatch += 1;
            } else {
                nextPayoutPhase();
                return; //break loop
            }
        }
    }

    // CONSTRUCTOR
    function CrowdSale (uint saleHours) {
        admin = msg.sender;
        state = State.Open;
        payoutPhase = PayoutPhase.Pre;
        saleEnd = now + (saleHours * 1 hours);
    }

    // USER INTERFACE
    function prebuyTokens () public inState(State.Open) payable {
        // Send ETH to this function, and order for sender's address is updated.
        // ETH is held at this contract's address.
        if(msg.value < minTransaction) throw;
        uint numPreboughtTokens = msg.value / tokenPrice; // division is truncated
        unfulfilledOrders[msg.sender] += numPreboughtTokens;
        buyers.push(msg.sender);
        LogPrebuy(msg.sender, msg.value, numPreboughtTokens);
    }

    function withdrawFunding (uint amt) public inState(State.Open) {
        // Call this function with the amount user want's refunded to their address.
        // ETH (amt) withdrawn to user's address, and their order is updated.
        if(amt < minTransaction) throw;
        uint nMln = unfulfilledOrders[msg.sender];
        uint nEth = nMln * tokenPrice;
        if(nEth < amt) throw;
        uint numTokens = amt / tokenPrice;
        unfulfilledOrders[msg.sender] -= numTokens;
        if(!msg.sender.send(amt)) throw;
        LogWithdrawal(msg.sender, amt, numTokens);
    }

    function checkTokenOrder () constant public inState(State.Open) returns (uint){
        // get the number of tokens currently on order for an address.
        return unfulfilledOrders[msg.sender];
    }

    //BUSINESS LOGIC
    function initiatePayout () public timedTransition inState(State.Payout)
    inPayoutPhase(PayoutPhase.Pre) {
        // set variables/state for multi-stage equitable payouts
        remainingTokens = totalTokenSupply;
        remBuyers = buyers;
        payoutPhase = PayoutPhase.Pruning;
    }

    function continuePayout () public inState(State.Payout) {
        // transaction sent to this function performs the next required action
        if(payoutPhase == PayoutPhase.Pruning) pruneOrderBatch();
        else if(payoutPhase == PayoutPhase.Distributing) processOrderBatch();
        else if(payoutPhase == PayoutPhase.Refunding) refundOrderBatch();
    }

    // HELPER FUNCTIONS
    function nextPayoutPhase () private inState(State.Payout) {
        // set pre-conditions for next phase of payout, and transition to it
        if(payoutPhase == PayoutPhase.Pruning) {
            quota = remainingTokens / remBuyers.length;
            LogQuotaUpdate(quota);
            delete remBuyers;
            remBuyers = prunedBuyers;
            if(remainingTokens > 0) {
                // pruning -> distributing
                payoutPhase = PayoutPhase.Distributing;
                iBatch = 0;
            }
            else if(remainingTokens == 0) {
                // pruning -> refunding
                payoutPhase = PayoutPhase.Refunding;
            }
        }
        else if(payoutPhase == PayoutPhase.Distributing){
            // distributing -> pruning
            delete prunedBuyers; //empty prunedBuyers
            payoutPhase = PayoutPhase.Pruning;
            iBatch = 0;
        }
        else if(payoutPhase == PayoutPhase.Refunding){
            // refunding -> closed
            payoutPhase = PayoutPhase.Post;
            state = State.Closed;
        }
    }

    function pruneOrderBatch () private inState(State.Payout)
    inPayoutPhase(PayoutPhase.Pruning)
    batchProcess(defaultBatchSize, remBuyers.length) {
        // remove buyers with no unfulfilled order remaining in next batch
        address addr = remBuyers[iBatch];
        if(unfulfilledOrders[addr] != 0)
            prunedBuyers.push(addr);
    }

    function processOrderBatch () private inState(State.Payout)
    inPayoutPhase(PayoutPhase.Distributing)
    batchProcess(defaultBatchSize, remBuyers.length) {
        // fulfill the next batch of orders
        address addr = remBuyers[iBatch];
        uint thisOrderAmt;
        if (unfulfilledOrders[addr] > quota) thisOrderAmt = quota;
        else thisOrderAmt = unfulfilledOrders[addr];    // order < quota
        tokensOwned[addr] += thisOrderAmt;
        unfulfilledOrders[addr] -= thisOrderAmt;
        LogPayout(addr, thisOrderAmt); // log token attribution
        remainingTokens -= thisOrderAmt; // subtract from remaining tokens
    }

    function refundOrderBatch () private inState(State.Payout)
    inPayoutPhase(PayoutPhase.Refunding)
    batchProcess(defaultBatchSize, remBuyers.length) {
        // refund orders still unfulfilled at the end of payout (if any)
        address addr = remBuyers[iBatch];
        uint amtToRefund = unfulfilledOrders[addr] * tokenPrice;
        unfulfilledOrders[addr] -= amtToRefund; // refunded
        if(!addr.send(amtToRefund)) throw;
    }
}
