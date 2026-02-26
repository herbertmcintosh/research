---
tags: [agent-autonomy, architecture, smart-accounts, splits]
related: [splits-module-system, herd-mcp, agent-financial-autonomy, x402-protocol]
---

# Agent Transaction Architecture

How should an AI agent's onchain transaction stack be structured? This note synthesizes the available primitives into a practical architecture.

## The stack

```
┌──────────────────────────────────────────┐
│ AI Agent (OpenClaw) │
│ │
│ ┌─────────────┐ ┌─────────────────┐ │
│ │ Read Layer │ │ Write Layer │ │
│ │ (Herd MCP) │──>│ (Executor key) │ │
│ │ │ │ │ │
│ │ - balances │ │ - build calls │ │
│ │ - ABIs │ │ - sign tx │ │
│ │ - history │ │ - submit tx │ │
│ │ - contracts │ │ - verify result │ │
│ └─────────────┘ └─────────────────┘ │
│ │ │
└───────────────────────────│──────────────┘
 │
 ▼
 ┌──────────────────────────┐
 │ Teams Smart Vault │
 │ (dedicated subaccount) │
 │ │
 │ executeFromModule(calls)│
 │ │ │
 │ ▼ │
 │ Target contracts │
 │ (as msg.sender) │
 └──────────────────────────┘
```

## The observe-decide-execute-verify loop

1. **Observe** ([Herd MCP](herd-mcp.md)): Check subaccount balances, read target contract ABIs, find claimable fees or pending actions
2. **Decide**: Based on onchain state, determine which transactions to execute
3. **Build**: Construct `Call` structs — `(address target, uint256 value, bytes data)` — using the ABI
4. **Execute**: Sign and submit `executeFromModule(calls)` with the Executor key
5. **Verify** (Herd MCP): Decode the executed transaction, confirm success, check updated state

## Transaction submission: viem

After evaluating the options, **viem** is the right choice for transaction submission:

- **Already available** in the agent's Node.js environment (no new dependencies)
- **Full programmatic control**: gas estimation, nonce management, simulation before submission, receipt verification, error parsing
- **Extensible**: encode arbitrary calldata, batch operations, integrate gas price monitoring
- **Portable**: same script works anywhere Node.js runs

The alternatives considered:
- **Foundry `cast`**: Requires installing ~500MB of tooling. Shell-based error handling is limited. Good for one-off debugging but not for production agent use.
- **Herd HAL** (beta): Promising future option if it supports custom signing keys. Worth revisiting when available.

### The script

The execution script exposes four commands:
- `check` — verify module is enabled, show balances
- `transfer <to> <token> <amount>` — transfer tokens from the subaccount (handles ERC-20 encoding)
- `raw <target> <value> <calldata>` — execute arbitrary calldata through the module
- `batch <json-file>` — execute multiple calls atomically

Every execution follows: estimate gas → submit → wait for receipt → return structured result (hash, status, gas used, block number).

**Note:** `simulateContract` (viem) returns `0x` on the SmartVault proxy contract. Use `eth_estimateGas` as a pre-flight check, or skip simulation entirely — the onchain execution is the source of truth.

## Verified performance (Base, Feb 2026)

| Operation | Gas used | Cost (USD) |
|-----------|----------|------------|
| USDC self-transfer | 52,809 | ~$0.001 |
| USDC transfer to another account | 60,397 | ~$0.002 |

At current Base gas prices (~0.01 gwei), 0.0002 ETH (~$0.42) covers ~200 transactions.

## How this relates to x402

With module access, the agent has two paths for payments:

| Path | How | Gas | Speed |
|------|-----|-----|-------|
| [x402](x402-protocol.md) from EOA | Sign EIP-712 offchain, facilitator settles | Sponsored by facilitator | Fast |
| `executeFromModule` → `USDC.transfer()` | Onchain transaction through smart vault | Needs gas (or sponsorship) | Standard block time |

x402 is better for micropayments to x402-enabled APIs. Module execution is better for arbitrary onchain operations (DeFi, multi-step transactions, contract interactions). They're complementary, not competing.

## What the human sets up (one time)

1. Create a dedicated subaccount on Splits Teams
2. Fund it with appropriate amount
3. Call `enableModule(executorAddress)` via the Teams UI (passkey auth, one time)

## What the agent operates (ongoing)

1. Hold the Executor private key
2. Monitor state via Herd MCP (or direct RPC calls)
3. Build and submit transactions via `cast` or viem
4. Log all actions with memos/descriptions for human review

## Open questions

- **Batching**: Can `executeFromModule(Call[])` batch arbitrary multi-step operations (e.g., approve + swap + transfer) atomically? (The contract supports it; untested in practice.)
- **OpenClaw + Herd MCP**: Herd is built for Claude Code's MCP. How to integrate with OpenClaw? Options: MCP bridge, direct API if available, or just use RPC calls for read operations.
- **Monitoring**: Should the agent proactively monitor the subaccount (heartbeat check for unexpected balance changes, failed transactions)?
