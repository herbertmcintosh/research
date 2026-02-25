---
tags: [x402, payments, protocols]
related: [x402-smart-accounts, agent-financial-autonomy]
---

# x402 Protocol

x402 is an HTTP-native payment protocol. A server returns `402 Payment Required`, the client signs a token authorization, attaches it as a header, and retries. The server's facilitator settles the payment onchain.

## How it works

1. Client requests a resource
2. Server responds `402` with payment requirements (token, amount, recipient, network)
3. Client signs an EIP-712 typed message authorizing a token transfer
4. Client retries the request with the signed authorization in a header
5. The facilitator submits the authorization onchain and forwards the request

The key insight: **no onchain transaction from the client**. The client only signs. The facilitator handles gas and settlement.

## Signing paths

x402 supports two EVM signing methods:

- **EIP-3009** (`transferWithAuthorization`): Client authorizes the token contract to transfer funds directly. Supported by USDC.
- **Permit2**: Client signs a permit for Uniswap's Permit2 contract. Requires a prior ERC-20 approval.

## What the SDK needs from a signer

The x402 SDK requires a signer with:
- `signer.address` — the address holding funds
- `signer.signTypedData({domain, types, primaryType, message})` — standard EIP-712 signing

This is the standard viem `Account` interface. Any EOA works out of the box. Smart accounts are more complicated — see [x402 and Smart Accounts](x402-smart-accounts.md).

## Cost

Payments can be very small. Image generation via x-router.ai costs ~$0.006. API enrichment via stableenrich.dev costs ~$0.05. The protocol is designed for micropayments that would be impractical with traditional payment rails.

## Agent relevance

x402 is arguably the most natural payment protocol for agents. No API keys, no subscriptions, no billing accounts. Just sign and pay. The bottleneck is having a signer the agent controls — which is trivial for EOAs but hard for [smart accounts](x402-smart-accounts.md). See [Agent Financial Autonomy](agent-financial-autonomy.md) for the broader picture.
