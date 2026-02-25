---
tags: [session-keys, agent-autonomy, smart-accounts, erc-4337]
related: [agent-financial-autonomy, x402-smart-accounts, smart-account-signing]
---

# Session Keys

Session keys are temporary signing keys authorized to act on behalf of a smart account, with constraints. They're the most promising path to giving agents real onchain autonomy without giving them full control.

## The concept

1. Human authorizes a session key via passkey (one-time interaction)
2. Session key is a regular EOA private key that the agent holds in memory
3. Agent signs transactions/authorizations using the session key
4. Smart account's validation logic checks: "is this signed by an authorized session key, within its permissions?"

## Constraints you can set

Session keys aren't blank checks. They can be scoped:
- **Spending limits**: max $X per transaction, $Y per day
- **Time bounds**: key expires after N hours/days
- **Allowed operations**: only transfers, only to specific addresses, only specific tokens
- **Revocation**: human can revoke at any time

This is the right trust model for agents. The human sets the boundaries, the agent operates freely within them.

## ERC ecosystem

Several standards and implementations exist:
- **ERC-7715** (Permission requests for wallets): standardized way to request session key permissions
- **ERC-7710** (Smart account permissions): framework for delegated permissions
- **Safe modules**: Safe's ModuleManager allows installing modules that can execute transactions with custom validation
- **Splits smart accounts**: Include ModuleManager and FallbackManager (inherited from Safe's architecture), so the infrastructure for session key modules exists

## Current state

No major smart account provider offers a turnkey session key UX today. The onchain primitives exist (ERC-4337 validation, module systems, permission frameworks), but the user-facing flow of "click a button to authorize a session key for your agent" hasn't been built.

This is the single highest-leverage feature a smart account provider could ship for the agent economy. One passkey interaction to authorize a scoped signing key, and agents go from "browser automation to click buttons" to "direct onchain participants."

## Implications for x402

With session keys, the [x402 + smart account](x402-smart-accounts.md) problem dissolves entirely. The agent holds a session key EOA, signs EIP-3009 authorizations directly, and USDC's `transferWithAuthorization` executes against the smart account's balance (validated via the session key module). No browser, no passkey dialog, no intermediary wallet.
