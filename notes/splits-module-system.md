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

### Setup flow (verified, working)

1. Generate an Executor key — a new EOA private key held by the agent
2. Navigate to `https://teams.splits.org/custom-txn/?account=<subaccount_address>`
3. Contract address = the subaccount itself (it's calling enableModule on its own contract)
4. Select `enableModule` from the function dropdown, paste the Executor EOA address
5. Review → Submit → Passkey auth (one-time)
6. Fund the Executor EOA with a small amount of ETH on the target chain (for gas)
7. Done — the Executor can now call `executeFromModule` for any transaction

### Function signature detail

The `executeFromModule` function takes a tuple parameter, not separate args:

```
executeFromModule((address target, uint256 value, bytes data) call)
```

Selector: `0x57c94f2e` (from `executeFromModule((address,uint256,bytes))`)

**Important:** `simulateContract` (viem) returns `0x` on the SmartVault proxy — simulation doesn't work. Use `eth_estimateGas` as a pre-flight check instead, or skip simulation and submit directly.

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
- All transactions are onchain and auditable — the human sees every tx in the same dashboard they use with teammates.
- Executor key security must be commensurate with the funds at risk.

## Why this works for human-agent collaboration

The module system creates a unique collaboration model:

- **Shared workspace**: The agent operates inside the same Splits Teams dashboard the human uses with their team. Every transaction, memo, and balance is visible alongside human activity.
- **Autonomy with visibility**: The agent can act independently (no passkey bottleneck), but the human is never "flying blind" — all activity is in the transaction log.
- **Graduated trust**: Start with a small subaccount balance. As the agent proves reliable, increase funding. The `disableModule` function is always one click away.
- **Same tools, different access levels**: Humans use passkeys through the UI. Agents use module execution through code. Both work in the same accounts, see the same data.

This mirrors how teams already work with tools like GitHub — everyone has different permission levels, but works in the same shared space with full audit trails.

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

## Transaction submission: viem

After evaluating the options, **viem** is the right tool for transaction submission. See [Agent Transaction Architecture](agent-transaction-architecture.md) for details. Key points:

- Already available in the agent's Node.js environment
- Full programmatic control (gas estimation, nonce management, retries, error parsing)
- ~52-60k gas per single call ≈ $0.001-0.002 on Base

## Gas

Unlike transactions through the Splits Teams UI (which are gas-sponsored), `executeFromModule` calls require the Executor EOA to pay gas in ETH. The Executor address needs to hold ETH on the same chain as the subaccount. This means the agent needs two things funded:
- The **subaccount** with tokens for operations (USDC, etc.)
- The **Executor EOA** with ETH for gas

At current Base gas prices (~0.01 gwei), 0.0002 ETH covers approximately 200 transactions.

**Note on funding the Executor:** When sending ETH from a Splits account that holds USDC (swap+send), explicitly select "ETH Base" in the token selector dropdown. The Relay router may auto-bridge to Optimism if you just select "ETH" generically.

## Verified results

- Executor EOA: holds 0.0002 ETH on Base
- Self-transfer (0.01 USDC): 52,809 gas, success
- Cross-account transfer (0.01 USDC → Operations): 60,397 gas, success
- Both transactions visible in Splits Teams dashboard with full memo trail
