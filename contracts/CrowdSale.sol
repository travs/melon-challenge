pragma solidity 0.4.8;

contract CrowdSale {
    /*
    Implements an equitable, timed, fund-and-release crowdsale.
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
        if(msg.sender != admin)
            throw;
        _;
    }

    modifier inState (State query) {
        if(state != query)
            throw;
        _;
    }

    modifier inPayoutPhase (PayoutPhase query) {
        // fails silently
        if(payoutPhase == query)
            _;
    }

    modifier timedTransition () {
        if(now > saleEnd)
            state = State.Payout;
        _;
    }

    modifier hasOrder () {
        if(unfulfilledOrders[msg.sender] == 0)
            throw;
        _;
    }

    modifier isAboveMinTransaction (uint num) {
        if(num < minTransaction)
            throw;
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

    //Pre:  In State.Open; Sent value is greater than minimum deposit
    //Post: Token order for sender's address increased; Contract receives ETH
    function prebuyTokens ()
        public
        payable
        inState(State.Open)
        isAboveMinTransaction(msg.value)
    {
        uint numPreboughtTokens = msg.value / tokenPrice; // division is truncated
        unfulfilledOrders[msg.sender] += numPreboughtTokens;
        buyers.push(msg.sender);
        LogPrebuy(msg.sender, msg.value, numPreboughtTokens);
    }

    //Pre:  In State.Open; Requested withdrawal greater than minimum allowable
    //Post: Token order for sender's address is reduced; ETH sent back to sender
    function withdrawFunding (uint amt) public
        inState(State.Open)
        hasOrder
        isAboveMinTransaction(amt)
    {
        uint nMln = unfulfilledOrders[msg.sender];
        uint nEth = nMln * tokenPrice;
        if(nEth < amt)
            throw;
        uint numTokens = amt / tokenPrice;
        unfulfilledOrders[msg.sender] -= numTokens;
        if(msg.sender.send(amt))
            LogWithdrawal(msg.sender, amt, numTokens);
        else
            unfulfilledOrders[msg.sender] += numTokens;
    }

    //Pre:  In State.Payout and Refunding phase; Sender has an unfulfilled order
    //Post: Sender receives ETH refund of their unfulfilled order
    function withdrawRefund () public
        inState(State.Payout)
        inPayoutPhase(PayoutPhase.Refunding)
        hasOrder
    {
        uint amtToRefund = unfulfilledOrders[msg.sender] * tokenPrice;
        unfulfilledOrders[msg.sender] = 0;
        if(msg.sender.send(amtToRefund))
            LogRefund(msg.sender, amtToRefund);   // log success
        else
            unfulfilledOrders[msg.sender] = amtToRefund;  // failure
    }

    //Pre:  In State.Open
    //Post: Returns number of tokens currently on order for sender
    function checkTokenOrder () public constant
        inState(State.Open)
        returns (uint)
    {
        return unfulfilledOrders[msg.sender];
    }

    //Pre:  None
    //Post: Returns number of tokens owned by sender
    function checkTokensOwned () public constant returns (uint)
    {
        return tokensOwned[msg.sender];
    }

    function () {throw;} // throw as fallback

    // BUSINESS LOGIC

    //Pre:  Sale time is up; Transitioned to State.Payout and Pre phase
    //Post: Variables and state for multi-stage equitable payouts are set
    function initiatePayout () public
        timedTransition
        inState(State.Payout)
        inPayoutPhase(PayoutPhase.Pre)
    {
        remainingTokens = totalTokenSupply;
        remBuyers = buyers;
        payoutPhase = PayoutPhase.Pruning;
    }

    //Pre:  In State.Payout
    //Post: Next function required for this phase is called.
    function continuePayout () public
        inState(State.Payout)
    {
        if(payoutPhase == PayoutPhase.Pruning)
            pruneOrderBatch();
        else if(payoutPhase == PayoutPhase.Distributing)
            processOrderBatch();
    }

    // PRIVATE HELPER FUNCTIONS

    //Pre:  In State.Payout
    //Post: Pre-conditions for next phase are set, and phase transitioned to
    function nextPayoutPhase () private
        inState(State.Payout)
    {
        if (payoutPhase == PayoutPhase.Pruning && remainingTokens > 0) {
            // pruning -> distributing
            payoutPhase = PayoutPhase.Distributing;
            delete remBuyers;
            remBuyers = prunedBuyers;
            quota = remainingTokens / remBuyers.length;
            LogQuotaUpdate(quota);
            iBatch = 0;
        } else if (payoutPhase == PayoutPhase.Pruning && remainingTokens == 0) {
            // pruning -> refunding
            payoutPhase = PayoutPhase.Refunding;
        } else if (payoutPhase == PayoutPhase.Distributing){
            // distributing -> pruning
            payoutPhase = PayoutPhase.Pruning;
            delete prunedBuyers;
            iBatch = 0;
        } else if (payoutPhase == PayoutPhase.Refunding){
            // refunding -> closed
            payoutPhase = PayoutPhase.Post;
            state = State.Closed;
        }
    }

    //Pre:  In State.Payout and Pruning phase
    //Post: Batch of buyers with unfulfilled orders are added to updated list
    function pruneOrderBatch () private
        inState(State.Payout)
        inPayoutPhase(PayoutPhase.Pruning)
        batchProcess(defaultBatchSize, remBuyers.length)
    {
        address addr = remBuyers[iBatch];
        if(unfulfilledOrders[addr] != 0)
            prunedBuyers.push(addr);
    }

    //Pre:  In State.Payout and Distributing phase
    //Post: Batch of token orders are filled up to quota amount
    function processOrderBatch () private
        inState(State.Payout)
        inPayoutPhase(PayoutPhase.Distributing)
        batchProcess(defaultBatchSize, remBuyers.length)
    {
        address addr = remBuyers[iBatch];
        uint thisOrderAmt;
        if (unfulfilledOrders[addr] > quota)
            thisOrderAmt = quota;
        else
            thisOrderAmt = unfulfilledOrders[addr];    // order < quota
        unfulfilledOrders[addr] -= thisOrderAmt;
        remainingTokens -= thisOrderAmt; // subtract from remaining tokens
        tokensOwned[addr] += thisOrderAmt;
        LogPayout(addr, thisOrderAmt); // log token attribution
    }
}
