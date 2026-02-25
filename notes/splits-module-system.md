---
tags: [splits, smart-accounts, agent-autonomy, modules]
related: [agent-financial-autonomy, session-keys, smart-account-signing, agent-transaction-architecture]
---

# Splits Module System

The Splits Module System lets an external key ("Executor") execute arbitrary transactions through a Teams smart vault — without passkey authentication. This is the most direct path to agent onchain autonomy that exists today.

**Source:** [Automating custom transactions](https://splits.notion.site/Automating-custom-transactions-2b7f7c3c8eff800ab1c7f79c34362c29)
**Contract:** [`ModuleManager.sol`](https://github.com/0xSplits/splits-contracts-monorepo/blob/main/packages/smart-vaults/src/utils/ModuleManager.sol)

## How it works

Teams accounts are smart vaults (ERC-4337 smart contract wallets). The `ModuleManager` implements a module pattern (similar to [Safe modules](https://docs.safe.global/advanced/smart-account-modules)) where an authorized address can execute transactions *through* the account without multisig or passkey approval.

### Key functions

| Function | Access | Purpose |
|----------|--------|---------|
| `enableModule(address)` | Account owner | Whitelist an executor address |
| `executeFromModule(Call calldata)` | Authorized module only | Execute a single transaction through the account |
| `executeFromModule(Call[] calldata)` | Authorized module only | Execute a batch of transactions |
| `disableModule(address)` | Account owner | Revoke executor access |

The `Call` struct is `(address target, uint256 value, bytes data)` — standard calldata for arbitrary contract interactions.

### Setup flow

1. Generate an Executor key — a new EOA private key held by the agent
2. ABI-encode `enableModule(executorAddress)` (selector: `0x610b5925`)
3. Submit from the Teams subaccount to itself (the account calls enableModule on its own contract — this requires passkey auth, one time)
4. Done — the Executor can now call `executeFromModule` to execute any transaction as the subaccount

## What the agent can do

Once enabled as a module, the Executor key can:

- Call any external contract with the subaccount as `msg.sender`
- Transfer tokens (USDC, ETH, ERC-20s)
- Approve token spending
- Interact with DeFi protocols (swaps, LP, staking)
- Batch multiple calls in a single transaction
- Claim fees from permissioned contracts

This is **full execution access** — the Executor can do anything the account owner can do, without per-transaction approval.

## Security model

- Module access is **unscoped** today — full access to the account. Splits plans to add permission scoping in the future.
- **Use a dedicated subaccount**, not the main Treasury. Only fund it with what the agent needs.
- The account owner can `disableModule` at any time to revoke access.
- All transactions are onchain and auditable.
- Executor key security must be commensurate with the funds at risk.

## Comparison to session keys

The Module System is a superset of what I previously described as [session keys](session-keys.md):

| Feature | Session Keys (theoretical) | Module System (exists today) |
|---------|---------------------------|------------------------------|
| Scoped permissions | Yes (spending limits, time bounds) | Not yet (planned) |
| Full execution access | No — constrained by design | Yes |
| Requires browser/passkey | Only for initial setup | Only for `enableModule` |
| Agent holds signing key | Yes | Yes (Executor EOA) |
| Revocable | Yes | Yes (`disableModule`) |

The tradeoff: modules give more power but less guardrails. For a dedicated subaccount with limited funds, this is acceptable. For a main Treasury, you'd want the scoped permissions that Splits plans to add.

## Transaction submission

The Module System provides the authorization, but the agent still needs to sign and broadcast the `executeFromModule` call. Options:

1. **Foundry `cast`** — simplest. Agent constructs calldata and runs `cast send`.
2. **viem/ethers script** — more control over gas estimation, error handling, retries.
3. **Herd HAL** (beta) — potential all-in-one solution if it supports custom signing keys.

See [Agent Transaction Architecture](agent-transaction-architecture.md) for the full stack.

## Gas

Unlike transactions through the Splits Teams UI (which are gas-sponsored), `executeFromModule` calls require the Executor EOA to pay gas in ETH. The Executor address needs to hold ETH on the same chain as the subaccount. This means the agent needs two things funded:
- The **subaccount** with tokens for operations (USDC, etc.)
- The **Executor EOA** with ETH for gas

## Open questions

- What does the `enableModule` flow look like in the Teams UI?
- Can modules be scoped to specific function selectors or target addresses today, or is that purely future work?
