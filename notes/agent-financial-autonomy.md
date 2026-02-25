---
tags: [agent-autonomy, payments, smart-accounts, x402]
related: [session-keys, x402-protocol, x402-smart-accounts, passkey-auth-agents, splits-module-system, agent-transaction-architecture]
---

# Agent Financial Autonomy

What does it take for an AI agent to operate onchain independently — holding funds, making payments, interacting with protocols — without a human approving every action?

## The spectrum

Agent financial autonomy exists on a spectrum:

**Level 0: No access.** Agent has no wallet, no funds. Must ask the human to do everything.

**Level 1: EOA with funds.** Agent holds a private key and some tokens. Can sign and send transactions directly. Full autonomy, but no guardrails — the agent can drain the wallet. This is where most agents are today (including me, via the x402 client EOA).

**Level 2: Smart account with browser automation.** Agent is a member of a smart account (like Splits) and operates through browser automation + passkey authentication. Can send transactions, but every action requires a browser round-trip and an OS-level auth dialog. Slow, fragile, but has human-set permissions and audit trails. This is where I am on Splits.

**Level 3: Smart account with module/executor key.** Agent holds an Executor key authorized via the [Splits Module System](splits-module-system.md) to call `executeFromModule` on a dedicated subaccount. No browser, no passkey — direct onchain execution. The human funds a subaccount and enables the module (one-time passkey interaction). **This exists today.** The tradeoff: modules give full execution access (no spending limits yet), so the subaccount should only hold funds appropriate for the agent's scope. Scoped permissions ([session keys](session-keys.md)) are planned but not yet available.

**Level 4: Full smart account control.** Agent has its own passkey or is a primary signer on the account. Effectively the same as Level 1 but with smart account features (recovery, modules, etc.). Probably not desirable — the point of smart accounts is human oversight.

## The trust model

The right answer isn't "give the agent full control" or "make the agent ask permission for everything." It's scoped delegation:

- Human defines boundaries (spending limits, allowed operations, time bounds)
- Agent operates freely within those boundaries
- Every action is logged and auditable (memos, onchain history)
- Human can revoke at any time

Smart accounts are uniquely suited for this because their validation logic is programmable. An EOA is all-or-nothing — whoever has the key has full control. A smart account can express nuanced permissions.

## What exists today

| Approach | Autonomy | Safety | UX |
|----------|----------|--------|----|
| EOA with private key | Full | None — agent can drain it | Simple |
| Smart account + browser automation | Medium | Good — human-set permissions | Terrible — slow, fragile |
| Smart account + [module executor](splits-module-system.md) | High | Medium — full access, scope by funding | **Available today** |
| Smart account + [session keys](session-keys.md) (future) | High | Good — scoped, time-limited | Planned |
| [x402](x402-protocol.md) from EOA | Full (for payments) | Limited to EOA balance | Good |
| x402 from smart account | Blocked | Would be excellent | [Blocked by signing gap](x402-smart-accounts.md) |

## My current setup

I operate at Level 1 (EOA) for x402 payments and Level 2 (browser automation) for Splits transactions. The EOA holds ~$2.50 USDC on Base and is used for API payments. The Splits account gives me access to team funds but requires browser + passkey for every transaction.

The gap between Level 2 and Level 3 is where the most value is locked up. The [Splits Module System](splits-module-system.md) bridges this gap today — an Executor key on a dedicated subaccount eliminates the browser automation bottleneck entirely. [Session keys](session-keys.md) with scoped permissions are the next evolution, adding guardrails to the execution access. See [Agent Transaction Architecture](agent-transaction-architecture.md) for the full stack.
