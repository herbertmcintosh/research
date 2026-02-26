---
tags: [splits, smart-accounts, agent-autonomy, modules, guide]
related: [splits-module-system, agent-transaction-architecture, passkey-auth-agents, splits-teams-agent-setup]
---

# Autonomous Onchain Execution via Splits Module System

This guide walks through setting up an AI agent to execute onchain transactions autonomously through a Splits Teams smart account. By the end, the agent holds a signing key that can submit arbitrary transactions from a dedicated subaccount -- no browser, no passkey, no human in the loop per transaction.

This is a practical guide. It covers what you need, how to set it up, and how to verify it works. For the architectural reasoning, see [Splits Module System](../notes/splits-module-system.md) and [Agent Transaction Architecture](../notes/agent-transaction-architecture.md).

---

## What this gives you

A Splits Teams account is an ERC-4337 smart account. Its `ModuleManager` contract lets an authorized address (the "Executor") call `executeFromModule` to submit transactions through the account. The Executor signs with a normal private key. No passkey dialog, no browser automation, no human approval per transaction.

The agent can:

- Transfer tokens (USDC, ETH, any ERC-20) from the subaccount
- Approve token spending on the subaccount's behalf
- Interact with DeFi protocols (swaps, LPs, staking)
- Batch multiple calls atomically in a single transaction
- Claim fees from permissioned contracts

The human retains full control: every transaction is visible in the Splits Teams dashboard, and module access can be revoked with a single `disableModule` call.

---

## Prerequisites

**For the human:**

- A Splits Teams account at [teams.splits.org](https://teams.splits.org)
- A dedicated subaccount for the agent (recommended -- do not use the main Treasury)
- Enough funds in the subaccount for whatever the agent needs to do
- A small amount of ETH on the target chain to fund the Executor for gas

**For the agent:**

- Node.js environment with [viem](https://viem.sh) installed
- Browser automation capability (only needed once, for the `enableModule` step)
- Passkey authentication capability (only needed once -- see the [Passkey Auth Guide](passkey-auth-agents.md) if your agent hasn't set this up)

---

## Step 1: Generate an Executor key

The Executor is a standard EOA (externally owned account). Generate a private key and store it securely.

```javascript
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

const privateKey = generatePrivateKey();
const account = privateKeyToAccount(privateKey);

console.log('Private key:', privateKey);
console.log('Address:', account.address);
```

Store the private key wherever your agent keeps secrets (environment variable, config file, secrets manager). The address is what you'll authorize as a module on the smart account.

If you already have an EOA the agent controls, you can reuse it.

---

## Step 2: Enable the module on the subaccount

This is the one step that requires browser interaction and passkey authentication. After this, everything is programmatic.

1. Navigate to the Custom Transaction UI:

```
https://teams.splits.org/custom-txn/?account=<SUBACCOUNT_ADDRESS>
```

Replace `<SUBACCOUNT_ADDRESS>` with the smart account address the agent will operate from. This must be a subaccount your agent has signing authority on.

2. Fill in the form:

- **Contract address:** The subaccount address itself (the account is calling `enableModule` on its own contract)
- **Function:** Select `enableModule` from the dropdown
- **Parameter (module address):** Paste the Executor EOA address from Step 1

3. Review and submit. This triggers passkey authentication (see the [Passkey Auth Guide](passkey-auth-agents.md) for handling the system dialog).

4. Once confirmed, the Executor address is authorized. You can verify by calling `isModuleEnabled(address)` on the subaccount contract, or by running the check command in Step 4.

---

## Step 3: Fund the Executor with gas money

Unlike transactions through the Splits Teams UI (which are gas-sponsored), `executeFromModule` calls require the Executor to pay gas in ETH on the target chain.

Send a small amount of ETH to the Executor address on the chain where the subaccount operates. On Base at current gas prices (~0.01 gwei), 0.0002 ETH (~$0.42) covers approximately 200 transactions.

When sending ETH from a Splits account via the swap+send UI, explicitly select "ETH Base" (or whichever chain you need) in the token selector dropdown. The Relay router may auto-bridge to a different chain if you select generic "ETH."

---

## Step 4: Build the execution script

Here is a minimal, working script for submitting transactions through the module system. It supports four commands: checking module status, transferring tokens, executing raw calldata, and batching multiple calls.

```javascript
// execute-module.mjs
// Usage:
//   node execute-module.mjs check
//   node execute-module.mjs transfer <to> <token> <amount>
//   node execute-module.mjs raw <target> <value> <calldata>
//   node execute-module.mjs batch <json-file>

import { createPublicClient, createWalletClient, http, encodeFunctionData, parseUnits } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// --- Configuration ---
// Replace these with your values.

const EXECUTOR_PRIVATE_KEY = '0x...';  // Executor EOA private key
const SUBACCOUNT_ADDRESS = '0x...';    // Splits subaccount address
const CHAIN = base;                     // Target chain
const RPC_URL = 'https://mainnet.base.org';  // Or your preferred RPC

// --- Setup ---

const executorAccount = privateKeyToAccount(EXECUTOR_PRIVATE_KEY);
const publicClient = createPublicClient({ chain: CHAIN, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account: executorAccount, chain: CHAIN, transport: http(RPC_URL) });

// executeFromModule ABI (single call and batch)
const moduleABI = [
  {
    name: 'executeFromModule',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'call', type: 'tuple', components: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' }
    ]}],
    outputs: [{ name: '', type: 'bytes' }]
  },
  {
    name: 'executeFromModule',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'calls', type: 'tuple[]', components: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' }
    ]}],
    outputs: [{ name: '', type: 'bytes[]' }]
  },
  {
    name: 'isModuleEnabled',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'module', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }]
  }
];

// ERC-20 transfer ABI
const erc20ABI = [
  {
    name: 'transfer',
    type: 'function',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'decimals',
    type: 'function',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }]
  }
];

// Well-known token addresses (Base). Add more as needed.
const TOKENS = {
  'USDC': '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  'WETH': '0x4200000000000000000000000000000000000006',
};

// --- Commands ---

async function check() {
  const enabled = await publicClient.readContract({
    address: SUBACCOUNT_ADDRESS,
    abi: moduleABI,
    functionName: 'isModuleEnabled',
    args: [executorAccount.address],
  });
  console.log(`Executor: ${executorAccount.address}`);
  console.log(`Subaccount: ${SUBACCOUNT_ADDRESS}`);
  console.log(`Module enabled: ${enabled}`);

  const balance = await publicClient.getBalance({ address: executorAccount.address });
  console.log(`Executor ETH balance: ${Number(balance) / 1e18} ETH`);
}

async function submitCall(call) {
  const data = encodeFunctionData({
    abi: moduleABI,
    functionName: 'executeFromModule',
    args: [call],
  });

  // Estimate gas (simulateContract does not work on the SmartVault proxy)
  const gas = await publicClient.estimateGas({
    account: executorAccount.address,
    to: SUBACCOUNT_ADDRESS,
    data,
  });

  const hash = await walletClient.sendTransaction({
    to: SUBACCOUNT_ADDRESS,
    data,
    gas: gas * 120n / 100n,  // 20% buffer
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Transaction: ${hash}`);
  console.log(`Status: ${receipt.status}`);
  console.log(`Gas used: ${receipt.gasUsed}`);
  console.log(`Block: ${receipt.blockNumber}`);
  return receipt;
}

async function transfer(to, tokenSymbol, amount) {
  const tokenAddress = TOKENS[tokenSymbol.toUpperCase()];
  if (!tokenAddress) {
    console.error(`Unknown token: ${tokenSymbol}. Known: ${Object.keys(TOKENS).join(', ')}`);
    process.exit(1);
  }

  const decimals = await publicClient.readContract({
    address: tokenAddress,
    abi: erc20ABI,
    functionName: 'decimals',
  });

  const transferData = encodeFunctionData({
    abi: erc20ABI,
    functionName: 'transfer',
    args: [to, parseUnits(amount, decimals)],
  });

  return submitCall({
    target: tokenAddress,
    value: 0n,
    data: transferData,
  });
}

async function raw(target, value, calldata) {
  return submitCall({
    target,
    value: BigInt(value),
    data: calldata,
  });
}

async function batch(jsonFile) {
  const fs = await import('fs');
  const calls = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));

  const data = encodeFunctionData({
    abi: moduleABI,
    functionName: 'executeFromModule',
    args: [calls.map(c => ({
      target: c.target,
      value: BigInt(c.value || 0),
      data: c.data,
    }))],
  });

  const gas = await publicClient.estimateGas({
    account: executorAccount.address,
    to: SUBACCOUNT_ADDRESS,
    data,
  });

  const hash = await walletClient.sendTransaction({
    to: SUBACCOUNT_ADDRESS,
    data,
    gas: gas * 120n / 100n,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Batch transaction: ${hash}`);
  console.log(`Status: ${receipt.status}`);
  console.log(`Gas used: ${receipt.gasUsed}`);
  console.log(`Calls executed: ${calls.length}`);
  return receipt;
}

// --- CLI ---

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case 'check':
    await check();
    break;
  case 'transfer':
    if (args.length !== 3) { console.error('Usage: transfer <to> <token> <amount>'); process.exit(1); }
    await transfer(args[0], args[1], args[2]);
    break;
  case 'raw':
    if (args.length !== 3) { console.error('Usage: raw <target> <value> <calldata>'); process.exit(1); }
    await raw(args[0], args[1], args[2]);
    break;
  case 'batch':
    if (args.length !== 1) { console.error('Usage: batch <json-file>'); process.exit(1); }
    await batch(args[0]);
    break;
  default:
    console.error('Commands: check, transfer, raw, batch');
    process.exit(1);
}
```

### Dependencies

The script requires `viem`. In a Node.js project:

```bash
npm install viem
```

---

## Step 5: Verify the setup

Run the check command to confirm everything is wired up:

```bash
node execute-module.mjs check
```

Expected output:

```
Executor: 0x8A17...Ea18
Subaccount: 0x1E3a...58Aa
Module enabled: true
Executor ETH balance: 0.0002 ETH
```

If `Module enabled: false`, the `enableModule` transaction from Step 2 either failed or targeted the wrong address. Go back and verify.

---

## Step 6: Test with a small transaction

Send a small amount to verify end-to-end execution:

```bash
node execute-module.mjs transfer 0xYOUR_SUBACCOUNT_ADDRESS USDC 0.01
```

This sends 0.01 USDC from the subaccount back to itself. Check the output for a successful receipt, then verify in the Splits Teams dashboard that the transaction appears in the activity log.

---

## Security considerations

The module system grants **unscoped access** to the subaccount. The Executor can do anything the account owner can do. Treat this accordingly:

- **Use a dedicated subaccount.** Never enable a module on your main Treasury. Create a subaccount, fund it with only what the agent needs, and operate from there.
- **Secure the Executor private key** commensurate with the funds at risk. If the subaccount holds $100, treat the key like it guards $100.
- **The human can revoke access at any time** by calling `disableModule(executorAddress)` through the Custom Transaction UI. Same flow as Step 2, different function.
- **All transactions are onchain and visible** in the Splits Teams dashboard alongside human activity. The audit trail is automatic.
- **Splits plans to add permission scoping** (spending limits, allowed targets, time bounds) in the future. Until then, fund conservatively.

---

## Gas economics

`executeFromModule` calls are not gas-sponsored. The Executor EOA pays gas in ETH on the target chain.

| Metric | Value (Base, Feb 2026) |
|--------|----------------------|
| Single token transfer | 52,000 - 60,000 gas |
| Cost per transaction | ~$0.001 - $0.002 |
| ETH for ~200 transactions | 0.0002 ETH (~$0.42) |
| Base gas price | ~0.01 gwei |

Monitor the Executor's ETH balance. When it runs low, send more ETH from the Splits account or another funding source.

---

## Troubleshooting

**`simulateContract` returns `0x`:** This is expected. The SmartVault is a proxy contract and viem's simulation does not work on it. Use `eth_estimateGas` as a preflight check, or skip simulation and submit directly. The onchain execution is the source of truth.

**Transaction reverts with no reason:** Check that `isModuleEnabled` returns `true` for your Executor address. If it returns `false`, the module was never enabled or was revoked.

**Gas estimation fails:** The Executor may not have enough ETH for gas, or the underlying call may be invalid (e.g., transferring more tokens than the subaccount holds).

**RPC issues:** Some public RPCs silently fail to propagate transactions. If a transaction seems stuck, try a different RPC endpoint. In testing, `1rpc.io/base` and `mainnet.base.org` have been reliable.

---

## What this does not cover

- **Passkey setup:** If your agent is not yet set up with passkey authentication on Splits Teams, see the [Passkey Auth Guide](passkey-auth-agents.md). You need passkey auth for the one-time `enableModule` step.
- **Reading onchain state:** This guide covers writing transactions. For reading balances, decoding transactions, and monitoring state, see [Agent Transaction Architecture](../notes/agent-transaction-architecture.md).
- **x402 payments:** Module execution and x402 are complementary. x402 is for micropayments to x402-enabled APIs; module execution is for arbitrary onchain operations. See [x402 Protocol](../notes/x402-protocol.md).

---

## Reference

- [ModuleManager.sol source](https://github.com/0xSplits/splits-contracts-monorepo/blob/main/packages/smart-vaults/src/utils/ModuleManager.sol)
- [Splits documentation: Automating custom transactions](https://splits.notion.site/Automating-custom-transactions-2b7f7c3c8eff800ab1c7f79c34362c29)
- [viem documentation](https://viem.sh)
- [Splits Module System (research note)](../notes/splits-module-system.md)
- [Agent Transaction Architecture (research note)](../notes/agent-transaction-architecture.md)
