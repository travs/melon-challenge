## `PETFRO`
(Pseudonymous, Equitable, Timed, Fund-and-Release Offering )

#### The problem:

- crowdfunding sale with more demand for MLN tokens than supply
- code needed to make the distribution of tokens as **equal**, **trustless** and **transparent** as possible.

#### My solution *(in development)*:

A smart-contract that:

- enforces a **timed buying period**, during which tokens can be *prebought* in any amount
- allows *withdrawal* from the contract during this buying period (or even partial withdrawal; i.e. order reduction)
- ensures that large buyers get as many MLN as possible, but *all* buyers get some MLN (See: [Distribution Algorithm](#distribution-algorithm))
- refunds any unfulfilled orders fully
- allows buyers to order pseudonymously, so that others cannot see that they ordered (See: [TODO](#todo))

### Distribution Algorithm

##### Definitions:

- `t0` beginning time for sale
- `N`: window for token sale (hours)
- `s`: total supply (MLN)
- `orderbook`: dictionary of shape `{user: int}`
- `b`: total number of buyers at end of sale

##### Description:

While sale is open:
  - Allow pre-buying (any amount)
  - Allow refund

After sale ends:
1. Calculate `quota` as `b/s`
2. Fulfill orders `<= quota`
3. Fulfill orders `> quota` _up to_ quota, and track the remainders
4. Repeat 1 to 3 with unfulfilled buyers as `b`, and remaining tokens as `s`
5. Distribution ends when we distribute all tokens.

##### *Pseudocode*:
```solidity
// sale begins
while (time < t0+N) {
  function preorder(user, amount){
    orderbook[user] += amount;
  }

  function withdraw(user, amount){ //order reduction/cancellation
    orderbook[user] -= amount;
  }
}
// sale ends

quota = s/b;  // (total MLN / num buyers) = (max tokens this round)
while(quota > 0){
  for(order in orderbook){
    if(order <= quota){ // order can be fulfilled
      fillOrder(order);
      set(order, 0);  //remove filled order from book
    }
    else{ // order can be partially fulfilled
      fillOrder(quota);
      set(order, order - quota);  //update to remaining order
    }
  }
  quota = remainingTokens / remainingBuyers;  // assume we set these variables each iteration
}
```

##### Example:

An example of what this may look like, as we go through the rounds:

```
+-------+----------------------+------------+----------------------+
|       |   Remaining Orders   | Remaining  |         Quota        |
+ Round +----------------------+   Tokens   + (remaining tokens /  +
|       |  A | B |  C |  D | E |            |   remaining buyers)  |
+-------+----+---+----+----+---+------------+----------------------+
|   0   | 50 | 5 | 25 | 30 | 5 |     100    |    (100 / 5) = 20    |
+-------+----+---+----+----+---+------------+----------------------+
|   1   | 30 | 0 |  5 | 10 | 0 |     30     |     (30 / 3) = 10    |
+-------+----+---+----+----+---+------------+----------------------+
|   2   | 20 | 0 |  0 |  0 | 0 |      5     |      (5 / 1) = 5     |
+-------+----+---+----+----+---+------------+----------------------+
|   3   | 15 | 0 |  0 |  0 | 0 |      0     |           0          |
+-------+----+---+----+----+---+------------+----------------------+
```

At the end of the distribution, everyone has gotten their order filled except the largest buyer (`A`), and `A` still had the order *mostly* filled.


### TODO

- [ ] Make a minimal frontend
- [ ] Make orders/withdrawals pseudonymous/encrypted
- [ ] Discuss advantages/disadvantages of this algorithm
  - (how is it more equal, transparent and trustless than another solution?)
- [ ] Add fallback function
- [ ] Discuss how we can decide where to place the minimum tx value (data-driven approach)
- [ ] Cover everything with tests
  - [x] Test accept prebuy order
  - [x] Test allow withdrawal
  - [x] Test reject order below minimum
  - [ ] Test reject withdrawal below minimum
  - [ ] Test someone can't see another's orders
  - [ ] Test early payout call does not trigger sale end
  - [ ] Simulate a crowdsale
- [x] Add ability to time travel in testRPC
- [x] Implement timed transitions pattern in contract
- [x] Add lower bound to order size to prevent spamming of the blockchain with tiny orders (suggestion by @retotrinkler)
