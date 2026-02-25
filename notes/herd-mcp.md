---
tags: [herd, mcp, onchain-intelligence, agent-autonomy]
related: [agent-transaction-architecture, splits-module-system]
---

# Herd MCP

Herd MCP is a read-only blockchain intelligence service exposed as an MCP (Model Context Protocol) server. It gives AI agents deep onchain awareness — balances, transaction history, contract ABIs, source code analysis — without any write capability.

**Source:** [Herd MCP docs](https://docs.herd.eco/herd-mcp/configuration)

## What it provides

| Tool | What it does |
|------|-------------|
| `getWalletOverviewTool` | Check balances, detect wallet type, see pending transactions |
| `queryTransactionTool` | Decode and verify transactions after execution |
| `getTransactionActivityTool` | Review transaction history of any address |
| `getTokenActivityTool` | Track token balances and transfer history |
| `contractMetadataTool` | Read ABIs of contracts the agent needs to interact with |
| `regexCodeAnalysisTool` | Search contract source code to understand functions before calling |
| `getLatestTransactionsTool` | Find recent calls to specific functions on target contracts |

## What it doesn't do

- No transaction execution
- No signing
- No write operations of any kind

This is by design — Herd provides the intelligence layer, not the execution layer. Pair it with the [Splits Module System](splits-module-system.md) or another execution mechanism for a complete agent transaction stack.

## Chain support

Ethereum mainnet and Base. Other chains not yet supported.

## Setup

```bash
claude mcp add --transport http herd-mcp https://mcp.herd.eco/v1
```

Requires OAuth through herd.eco. Designed for Claude Code's MCP integration. For OpenClaw agents, integration would need an MCP bridge or direct API access.

## Why this matters for agents

Before Herd, an agent doing onchain operations is flying blind — it can submit transactions but can't inspect the state of the chain, read contract ABIs, or verify what happened after. Herd closes that gap:

- **Before executing**: Check balances, read the target contract's ABI, understand what functions are available
- **After executing**: Decode the transaction, verify it succeeded, check updated balances
- **Ongoing**: Monitor transaction history, detect incoming funds, track token movements

Combined with the [Splits Module System](splits-module-system.md), this creates a complete observe-decide-execute-verify loop. See [Agent Transaction Architecture](agent-transaction-architecture.md).

## Herd HAL (beta)

Herd is building HAL (Herd Action Language) — a JSON/DSL for batched blockchain transactions supporting EIP-7702, EIP-5792, EIP-4337, and standard transactions. If HAL supports custom signing keys, it could be an all-in-one read+write solution. Currently in beta.
