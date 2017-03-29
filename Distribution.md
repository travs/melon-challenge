# Melon Challenge

## Motivation

We are looking for creative ppl that just build stuff because its fun to them.

## Description

We will need a solution for another token-issuance/crowdfund in 2018. We will likely price the token such that we can expect more demand than supply - we're not looking to maximize profit but to only take as much as we need.

## Assumptions

- Total Demand is expressed in _d_ ETH
- Total Supply is expressed in _s_ MLN
- The MLN are offered at a price _p_ such that d >= s * p

## Challenge

Find, describe and code in Solidity one or several contract(s) to solve above distribution problem with assuption of _ d >= s * p_ to be true in an as equal, trustless and transparent way as possible.

## Example

A basic solution that collects and stores all the requests of all the `msg.sender`'s and `msg.value`s

Illustration code:
```
    uint totalSupply = 500000; // Total supply of Melon token
    mapping (address => uint)  melonOwned; // Contract field for storing Melon token balance owned by certain address
    mapping (address => uint)  etherSent; // Contract field for storing how much Ether was sent from certain address
    uint totalEtherSent;
    function request() payable {
        etherSent[msg.sender] = safeAdd(etherSent[msg.sender], msg.value); // Account for Ether sent to this contract in calling transaction
        totalEtherSent = safeAdd(totalEtherSent, msg.value);
    }
```

and then given some time has passed user (prev msg.sender) can trigger this function to receive some Melon token.
Illustration code:

```
    uint public const END_TIME = 1491480000; // Contribution end time in seconds
    modifier is_later_than(uint x) {
        assert(now > x);
        _;
    }
    function receive() 
        is_later_than(END_TIME)
    {
        if (totalEtherSent != 0) {
            melonOwned[msg.sender] = safeMul(etherSent[msg.sender], totalSupply) / totalEtherSent; // Allocates a proportional amount
        }
    }
```

This is only for illustration purposes your completely free in your approach to solve above distribution problem. 

## Bonus Points

- For a solution that does not require user to send and lockup their Ether
- For a solution where requests are hidden (e.g. encrypted) and thus not visible to other user
- Please use a github repository s.t. we can see how your doing

## Can be useful

- [Soldity Docs](http://solidity.readthedocs.io/en/latest/)
- [Online Solidity Compiler](https://ethereum.github.io/browser-solidity/#version=soljson-v0.4.10+commit.f0d539ae.js) for fast and efficient implementations
- [Melon Token and initial contribution contracts](https://github.com/melonproject/melon/) example of what is considered goodlooking code :)
- [Truffle](http://truffleframework.com/docs/getting_started/installation) for more comprehensive projects 

If there are any questions am happy to help.

Wish you the best of luck!