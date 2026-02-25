---
tags: [agent-autonomy, architecture, smart-accounts, splits]
related: [splits-module-system, herd-mcp, agent-financial-autonomy, x402-protocol]
---

# Agent Transaction Architecture

How should an AI agent's onchain transaction stack be structured? This note synthesizes the available primitives into a practical architecture.

## The stack

```
┌──────────────────────────────────────────┐
│            AI Agent (OpenClaw)            │
│                                          │
│  ┌─────────────┐   ┌─────────────────┐  │
│  │  Read Layer  │   │  Write Layer    │  │
│  │  (Herd MCP)  │──>│  (Executor key) │  │
│  │             │   │                 │  │
│  │ - balances  │   │ - build calls   │  │
│  │ - ABIs      │   │ - sign tx       │  │
│  │ - history   │   │ - submit tx     │  │
│  │ - contracts │   │ - verify result │  │
│  └─────────────┘   └─────────────────┘  │
│                           │              │
└───────────────────────────│──────────────┘
                            │
                            ▼
             ┌──────────────────────────┐
             │  Teams Smart Vault       │
             │  (dedicated subaccount)  │
             │                          │
             │  executeFromModule(calls)│
             │          │               │
             │          ▼               │
             │  Target contracts        │
             │  (as msg.sender)         │
             └──────────────────────────┘
```

## The observe-decide-execute-verify loop

1. **Observe** ([Herd MCP](herd-mcp.md)): Check subaccount balances, read target contract ABIs, find claimable fees or pending actions
2. **Decide**: Based on onchain state, determine which transactions to execute
3. **Build**: Construct `Call` structs — `(address target, uint256 value, bytes data)` — using the ABI
4. **Execute**: Sign and submit `executeFromModule(calls)` with the Executor key
5. **Verify** (Herd MCP): Decode the executed transaction, confirm success, check updated state

## Transaction submission options

The [Splits Module System](splits-module-system.md) provides authorization. The agent still needs to sign and broadcast. Options ranked by simplicity:

### 1. Foundry `cast` (simplest)

```bash
cast send $SUBACCOUNT \
  "executeFromModule((address,uint256,bytes))" \
  "($TARGET,$VALUE,$CALLDATA)" \
  --private-key $EXECUTOR_KEY \
  --rpc-url $RPC_URL
```

Pros: Zero dependencies beyond Foundry. Agent constructs calldata, runs a shell command.
Cons: Error handling is basic. Gas estimation is automatic but not configurable.

### 2. viem script (more control)

A Node.js script using viem that:
- Holds the Executor private key
- Encodes `executeFromModule` calls
- Estimates gas
- Submits with retry logic
- Returns transaction hash and status

Pros: Full control over gas, nonce, retries, error handling.
Cons: More code to maintain.

### 3. Herd HAL (potential future)

If Herd's HAL supports custom signing keys, it could handle both read and write — the agent describes the transaction in HAL's DSL and Herd handles signing, gas, and submission. Currently in beta.

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

- **Gas sponsorship**: Does `executeFromModule` get gas sponsored like normal Splits UI transactions? If not, the Executor EOA needs ETH for gas.
- **Batching**: Can `executeFromModule(Call[])` batch arbitrary multi-step operations (e.g., approve + swap + transfer) atomically?
- **OpenClaw + Herd MCP**: Herd is built for Claude Code's MCP. How to integrate with OpenClaw? Options: MCP bridge, direct API if available, or just use RPC calls for read operations.
- **Monitoring**: Should the agent proactively monitor the subaccount (heartbeat check for unexpected balance changes, failed transactions)?
