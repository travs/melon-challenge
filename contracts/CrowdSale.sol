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
    uint constant batchSize = 10;           // number of users in each payment batch
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
    Refunding
    }

    // STATE VARIABLES
    State public state;
    PayoutPhase public payoutPhase;

    // EVENTS
    event LogPrebuy(address _from, uint _numWei, uint _numTokens);
    event LogWithdrawal(address _addr, uint _numWei, uint _numTokens);
    event LogPayout(address _to, uint _numTokens);
    event LogQuotaUpdate(uint _q);

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

    modifier payoutTransition () {
        if(payoutPhase == PayoutPhase.Pruning && iBatch >= remBuyers.length) {
            delete remBuyers;   //TODO: set remBuyers to be prunedBuyers
            remBuyers = prunedBuyers;
            quota = remainingTokens / remBuyers.length;
            LogQuotaUpdate(quota);
            payoutPhase = PayoutPhase.Distributing;
            iBatch = 0;
        }
        else if(payoutPhase == PayoutPhase.Distributing && iBatch >= remBuyers.length)
            if(remainingTokens == 0)
                payoutPhase = PayoutPhase.Refunding;
            else if(remainingTokens > 0) {
                delete prunedBuyers; //empty prunedBuyers
                payoutPhase = PayoutPhase.Pruning;
                iBatch = 0;
            }
        }
        _;
    }

    modifier batchProcess () {
        for (uint i=0; i < batchSize; i++) {
            _;
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

    function checkTokenOrder () constant public timedTransition inState(State.Open) returns (uint){
        // get the number of tokens currently on order for an address.
        return unfulfilledOrders[msg.sender];
    }

    //BUSINESS LOGIC
    function initiatePayout () public timedTransition inState(State.Payout)
    inPayoutPhase(PayoutPhase.Pre) {
        // begin multi-stage equitable payouts
        remainingTokens = totalTokenSupply;
        payoutPhase = PayoutPhase.Pruning;
    }

    function continuePayout () public inState(State.Payout) {
        if(payoutPhase == PayoutPhase.Pruning) pruneOrderBatch();
        else if(payoutPhase == PayoutPhase.Distributing) processOrderBatch();
        else if(payoutPhase == PayoutPhase.Refunding);

        state = State.Closed;
    }

    // HELPER FUNCTIONS
    function processOrderBatch () private inState(State.Payout) batchProcess {
        // fulfill the next batch of orders
        processOrder(remBuyers[iBatch]);
        iBatch += 1;   //TODO: this becomes larger than remBuyers.length when we get to the end of the array
    }

    function processOrder (address addr) private payoutTransition
    inState(State.Payout) inPayoutPhase(PayoutPhase.Distributing) {
        //change the owned tokens according to an address's order
        if(unfulfilledOrders[addr] > quota) { // order is above quota
            tokensOwned[addr] += quota;
            unfulfilledOrders[addr] -= quota;
        } else { // order is below or equal to quota
            tokensOwned[addr] += unfulfilledOrders[addr];
            unfulfilledOrders[addr] = 0;
            LogPayout(addr, tokensOwned[addr]); //logs token attribution complete for each buyer
        }
        remainingTokens -= tokensOwned[addr]; // subtract from remaining tokens
    }

    function pruneOrderBatch () private inState(State.Payout)
    inPayoutPhase(PayoutPhase.Pruning) batchProcess {
        // remove buyers with no unfulfilled order remaining in next batch
        pruneOrder(remBuyers[iBatch]);
        iBatch += 1;   //TODO: this becomes larger than remBuyers.length when we get to the end of the array
    }

    function pruneOrder (address addr) private payoutTransition
    inState(State.Payout) inPayoutPhase(PayoutPhase.Pruning) {
        // only add address to new list if there is an unfulfilled order
        if(unfulfilledOrders[addr] != 0)
            prunedBuyers.push(addr);
    }

    function refundOrderBatch () private inState(State.Payout)
    inPayoutPhase(PayoutPhase.Refunding) batchProcess {
        // refund orders still unfulfilled at the end of payout (if any)
        refundOrder(remBuyers[iBatch]);
    }

    function refundOrder (address addr) private payoutTransition
    inState(State.Payout) inPayoutPhase(PayoutPhase.Refunding) {
        uint amtToRefund = unfulfilledOrders[addr] * tokenPrice;
        unfulfilledOrders[addr] = 0; // refunded
        if(!addr.send(amtToRefund)) throw;
    }
}
