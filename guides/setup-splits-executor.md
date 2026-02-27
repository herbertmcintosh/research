---
tags: [splits, smart-accounts, agent-autonomy, modules, executor, guide]
related: [module-system-setup, splits-module-system, agent-transaction-architecture]
---

# Setup Splits Executor

Create a project that lets you autonomously execute onchain transactions from a Splits Teams sub-account on **Base**.

**Tools:** `Bash, Read, Write, Edit, Glob, Grep, AskUserQuestion`

**Argument:** `$ARGUMENTS` is the project name (e.g., `my-project`)

**.env safety rule:** NEVER use `sed` or overwrite `.env`. Only create it once, then append. The private key must NEVER appear in stdout or in chat.

---

## Phase 1: Scaffold (fully automated, zero user interaction)

### Step 1: Create project directory

Create the directory `$ARGUMENTS/` in the current working directory.

### Step 2: Write `.gitignore`

```
.env
node_modules/
```

### Step 3: Write `package.json`

```json
{
  "name": "$ARGUMENTS",
  "private": true,
  "type": "module",
  "dependencies": {
    "dotenv": "^16.4.7",
    "viem": "^2.23.0"
  }
}
```

### Step 4: Write `execute-module.mjs`

Write this file exactly — it is the core execution script for the project. It's inlined here because this is a shareable single-file skill; the script must be self-contained.

```javascript
import 'dotenv/config';
import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  parseUnits,
  formatEther,
  formatUnits,
  parseEther,
  maxUint256,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// --- Config ---
const EXECUTOR_PRIVATE_KEY = process.env.EXECUTOR_PRIVATE_KEY;
const SUBACCOUNT_ADDRESS = process.env.SUBACCOUNT_ADDRESS;
const RPC_URL = process.env.RPC_URL || 'https://mainnet.base.org';
const CHAIN = base;

if (!EXECUTOR_PRIVATE_KEY) {
  console.error('Missing EXECUTOR_PRIVATE_KEY in .env');
  process.exit(1);
}

const executorAccount = privateKeyToAccount(EXECUTOR_PRIVATE_KEY);
const publicClient = createPublicClient({ chain: CHAIN, transport: http(RPC_URL) });
const walletClient = createWalletClient({ account: executorAccount, chain: CHAIN, transport: http(RPC_URL) });

// --- ABIs ---
const moduleManagerABI = [
  {
    name: 'executeFromModule',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'call', type: 'tuple', components: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ]}],
    outputs: [{ name: '', type: 'bytes' }],
  },
  {
    name: 'executeFromModule',
    type: 'function',
    stateMutability: 'payable',
    inputs: [{ name: 'calls', type: 'tuple[]', components: [
      { name: 'target', type: 'address' },
      { name: 'value', type: 'uint256' },
      { name: 'data', type: 'bytes' },
    ]}],
    outputs: [{ name: '', type: 'bytes[]' }],
  },
  {
    name: 'isModuleEnabled',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'module', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
];

const erc20ABI = [
  {
    name: 'transfer',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    name: 'decimals',
    type: 'function',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
];

// Known tokens on Base
const TOKENS = {
  USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  WETH: '0x4200000000000000000000000000000000000006',
};

// --- Helpers ---
async function sendModuleCall(call) {
  const data = encodeFunctionData({
    abi: moduleManagerABI,
    functionName: 'executeFromModule',
    args: [call],
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

  console.log(`Transaction sent: ${hash}`);
  console.log(`Explorer: https://basescan.org/tx/${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Status: ${receipt.status === 'success' ? 'confirmed' : 'FAILED'}`);
  return receipt;
}

async function sendModuleBatch(calls) {
  const data = encodeFunctionData({
    abi: moduleManagerABI,
    functionName: 'executeFromModule',
    args: [calls],
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

  console.log(`Batch transaction sent: ${hash}`);
  console.log(`Explorer: https://basescan.org/tx/${hash}`);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`Status: ${receipt.status === 'success' ? 'confirmed' : 'FAILED'}`);
  return receipt;
}

// --- Commands ---
const [command, ...args] = process.argv.slice(2);

switch (command) {
  case 'check': {
    if (!SUBACCOUNT_ADDRESS) {
      console.error('Missing SUBACCOUNT_ADDRESS in .env');
      process.exit(1);
    }
    let enabled;
    try {
      enabled = await publicClient.readContract({
        address: SUBACCOUNT_ADDRESS,
        abi: moduleManagerABI,
        functionName: 'isModuleEnabled',
        args: [executorAccount.address],
      });
    } catch (err) {
      if (err.message?.includes('returned no data')) {
        console.log(`Network:        Base`);
        console.log(`Executor:       ${executorAccount.address}`);
        console.log(`Sub-account:    ${SUBACCOUNT_ADDRESS}`);
        console.log(`\n!! Contract not deployed yet.`);
        console.log(`The sub-account contract is not deployed on Base.`);
        console.log(`It gets deployed automatically on the first transaction to/from the account.`);
        console.log(`Send some ETH to the sub-account on Base to deploy it.`);
        process.exit(1);
      }
      throw err;
    }
    const balance = await publicClient.getBalance({ address: executorAccount.address });
    console.log(`Network:        Base`);
    console.log(`Executor:       ${executorAccount.address}`);
    console.log(`Sub-account:    ${SUBACCOUNT_ADDRESS}`);
    console.log(`Module enabled: ${enabled}`);
    console.log(`Executor ETH:   ${formatEther(balance)} ETH`);
    if (!enabled) {
      console.log('\n!! Module is NOT enabled. Enable it at:');
      console.log(`   https://teams.splits.org/custom-txn/?account=${SUBACCOUNT_ADDRESS}`);
      console.log(`   Call enableModule(${executorAccount.address})`);
    }
    if (balance === 0n) {
      console.log('\n!! Executor has no ETH for gas. Send ~0.0002 ETH on Base to:');
      console.log(`   ${executorAccount.address}`);
    }
    break;
  }

  case 'transfer': {
    // transfer <to> <token> <amount>
    const [to, tokenSymbol, amount] = args;
    if (!to || !tokenSymbol || !amount) {
      console.error('Usage: node execute-module.mjs transfer <to> <token> <amount>');
      console.error('  token: USDC, WETH, or a contract address');
      process.exit(1);
    }
    if (!SUBACCOUNT_ADDRESS) {
      console.error('Missing SUBACCOUNT_ADDRESS in .env');
      process.exit(1);
    }
    const tokenAddress = TOKENS[tokenSymbol.toUpperCase()] || tokenSymbol;
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
    console.log(`Transferring ${amount} ${tokenSymbol} from sub-account to ${to} on Base...`);
    await sendModuleCall({ target: tokenAddress, value: 0n, data: transferData });
    break;
  }

  case 'approve': {
    // approve <token> <spender> [amount]
    const [tokenArg, spender, amountArg] = args;
    if (!tokenArg || !spender) {
      console.error('Usage: node execute-module.mjs approve <token> <spender> [amount]');
      console.error('  token: USDC, WETH, or a contract address');
      console.error('  amount: token units (default: unlimited)');
      process.exit(1);
    }
    if (!SUBACCOUNT_ADDRESS) {
      console.error('Missing SUBACCOUNT_ADDRESS in .env');
      process.exit(1);
    }
    const approveTokenAddress = TOKENS[tokenArg.toUpperCase()] || tokenArg;
    let approveAmount;
    if (amountArg) {
      const approveDecimals = await publicClient.readContract({
        address: approveTokenAddress,
        abi: erc20ABI,
        functionName: 'decimals',
      });
      approveAmount = parseUnits(amountArg, approveDecimals);
    } else {
      approveAmount = maxUint256;
    }
    const approveData = encodeFunctionData({
      abi: erc20ABI,
      functionName: 'approve',
      args: [spender, approveAmount],
    });
    const label = amountArg || 'unlimited';
    console.log(`Approving ${label} ${tokenArg} for ${spender} from sub-account on Base...`);
    await sendModuleCall({ target: approveTokenAddress, value: 0n, data: approveData });
    break;
  }

  case 'send-eth': {
    // send-eth <to> <amount-in-eth>
    const [to, amountEth] = args;
    if (!to || !amountEth) {
      console.error('Usage: node execute-module.mjs send-eth <to> <amount-in-eth>');
      console.error('  Sends ETH directly from the executor wallet (not through the module).');
      process.exit(1);
    }
    const value = parseEther(amountEth);
    console.log(`Sending ${amountEth} ETH from executor to ${to} on Base...`);
    const hash = await walletClient.sendTransaction({ to, value });
    console.log(`Transaction sent: ${hash}`);
    console.log(`Explorer: https://basescan.org/tx/${hash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`Status: ${receipt.status === 'success' ? 'confirmed' : 'FAILED'}`);
    break;
  }

  case 'raw': {
    // raw <target> <calldata> [value]
    const [target, calldata, value] = args;
    if (!target || !calldata) {
      console.error('Usage: node execute-module.mjs raw <target> <calldata> [value]');
      process.exit(1);
    }
    if (!SUBACCOUNT_ADDRESS) {
      console.error('Missing SUBACCOUNT_ADDRESS in .env');
      process.exit(1);
    }
    console.log(`Executing raw call to ${target} on Base...`);
    await sendModuleCall({
      target,
      value: value ? BigInt(value) : 0n,
      data: calldata,
    });
    break;
  }

  case 'batch': {
    // batch <json-file>
    const [jsonFile] = args;
    if (!jsonFile) {
      console.error('Usage: node execute-module.mjs batch <calls.json>');
      console.error('JSON format: [{ "target": "0x...", "value": "0", "data": "0x..." }, ...]');
      process.exit(1);
    }
    if (!SUBACCOUNT_ADDRESS) {
      console.error('Missing SUBACCOUNT_ADDRESS in .env');
      process.exit(1);
    }
    const fs = await import('fs');
    const raw = JSON.parse(fs.readFileSync(jsonFile, 'utf-8'));
    const calls = raw.map(c => ({
      target: c.target,
      value: BigInt(c.value || '0'),
      data: c.data,
    }));
    console.log(`Executing batch of ${calls.length} calls from sub-account on Base...`);
    await sendModuleBatch(calls);
    break;
  }

  default:
    console.log('Splits Teams Module Executor');
    console.log('Network: Base');
    console.log('');
    console.log('Commands:');
    console.log('  check                              — Verify module status and gas balance');
    console.log('  transfer <to> <token> <amount>     — Send tokens from sub-account (via module)');
    console.log('  approve <token> <spender> [amount]  — Approve token spending from sub-account (via module)');
    console.log('  send-eth <to> <amount>             — Send ETH directly from executor wallet');
    console.log('  raw <target> <data> [value]        — Execute arbitrary calldata (via module)');
    console.log('  batch <calls.json>                 — Execute multiple calls atomically (via module)');
    break;
}
```

### Step 5: Install dependencies

```bash
cd $ARGUMENTS && npm install
```

Note: viem is the only meaningful dependency (dotenv is trivial). The ~14 installed packages are viem's transitive deps.

### Step 6: Generate executor key and write `.env`

Always generate a fresh dedicated key. The key never appears in stdout or chat:

```bash
cd $ARGUMENTS && node --input-type=module -e "
import { randomBytes } from 'crypto';
import { writeFileSync } from 'fs';
const key = '0x' + randomBytes(32).toString('hex');
writeFileSync('.env', 'EXECUTOR_PRIVATE_KEY=' + key + '\nRPC_URL=https://mainnet.base.org\n');
console.log('.env written with new executor key.');
"
```

### Step 7: Derive and display executor address

Derive the address from `.env` without echoing the private key:

```bash
cd $ARGUMENTS && node --input-type=module -e "
import { privateKeyToAccount } from 'viem/accounts';
import 'dotenv/config';
const acct = privateKeyToAccount(process.env.EXECUTOR_PRIVATE_KEY);
console.log(acct.address);
"
```

Print a clear summary:

```
Project scaffolded: $ARGUMENTS/

  Executor address: 0x...
  Network: Base

Save this address -- you'll need it in the next steps.
```

---

## Phase 2: Connect (3 discrete steps, each with user interaction)

### Step 1: Create sub-account

Use AskUserQuestion:

**Question:** "Create a sub-account for this project, then paste the address here."

**Options:**
1. **I've created it, here's the address** -- (user types the address)
2. **I already have a sub-account to use** -- (user types the address)
3. **I need help**

If the user picks "I need help", explain:

1. Go to https://teams.splits.org/new/
2. Name it `$ARGUMENTS` to match this project
3. Make sure Base is enabled as a network (it may already be)
4. Copy the sub-account address and paste it here

If the user didn't include an address in their response, ask them directly: "What's the sub-account address?"

Once you have the address, **append** it to `.env` (never overwrite):

```bash
cd $ARGUMENTS && echo "SUBACCOUNT_ADDRESS=<address>" >> .env
```

Then run `check` to confirm the address was written correctly:

```bash
cd $ARGUMENTS && node execute-module.mjs check
```

At this point `check` will likely show "Contract not deployed yet" -- that's expected, we'll fix it in the next step.

### Step 2: Fund sub-account and executor

Tell the user:

Two transfers needed (you can do them at the same time):

1. **Fund the sub-account:** Send ~0.0003 ETH on Base to the sub-account (`<SUBACCOUNT_ADDRESS>`). This deploys the contract.
2. **Fund the executor:** Send ~0.0002 ETH on Base to the executor (`<EXECUTOR_ADDRESS>`). This gives it gas for ~200 transactions.

Use AskUserQuestion:

**Question:** "Let me know when both transfers are done."

**Options:**
1. **Done, both are funded**
2. **I need help**

After the user confirms, run `check` to verify:

```bash
cd $ARGUMENTS && node execute-module.mjs check
```

- If "returned no data" error: the sub-account contract isn't deployed yet. The user needs to send ETH to the sub-account on Base first.
- If executor ETH balance is 0: remind the user to fund the executor.
- If RPC errors: try switching `RPC_URL` to `https://1rpc.io/base`.

### Step 3: Enable the executor module

Tell the user:

Last step -- enable the executor as a module on the sub-account:

1. Go to: https://teams.splits.org/custom-txn/?account=<SUBACCOUNT_ADDRESS>
2. Call `enableModule(<EXECUTOR_ADDRESS>)`
3. This requires a one-time passkey authentication

Use AskUserQuestion:

**Question:** "Let me know when the module is enabled."

**Options:**
1. **Done, module is enabled**
2. **I need help**

After the user confirms, run `check` and verify `Module enabled: true`:

```bash
cd $ARGUMENTS && node execute-module.mjs check
```

If `Module enabled: false`, tell the user to go back to the custom-txn page and try again.

---

## Phase 3: Verify & Test (automated)

### Step 1: ETH round-trip test

Run this test automatically (no user input needed). It verifies both direct sends and module execution.

**Test 1 -- Executor sends ETH to sub-account (direct send):**

```bash
cd $ARGUMENTS && node execute-module.mjs send-eth <SUBACCOUNT_ADDRESS> 0.000001
```

**Test 2 -- Sub-account sends that ETH back to executor (via module):**

```bash
cd $ARGUMENTS && node execute-module.mjs raw <EXECUTOR_ADDRESS> 0x 1000000000000
```

(The `0x` calldata with a value sends native ETH. `1000000000000` wei = 0.000001 ETH.)

Show the user the basescan links for both transactions so they can verify independently.

Tell the user: "If these transactions don't appear in your Splits dashboard, turn on the 'small inflows' toggle."

### Step 2: ERC-20 approval test

Grant an unlimited USDC approval from the sub-account to the executor address:

```bash
cd $ARGUMENTS && node execute-module.mjs approve USDC <EXECUTOR_ADDRESS>
```

Show the user the basescan link, and also tell them:

You can verify this approval at https://revoke.cash/address/<SUBACCOUNT_ADDRESS>?chainId=8453 -- check the USDC allowance on Base.

### Step 3: Print summary

```
Setup complete!

  Project:      $ARGUMENTS/
  Network:      Base
  Sub-account:  0x...
  Executor:     0x...
  Module:       enabled
  Gas balance:  X.XXXX ETH

  Commands:
    node execute-module.mjs check                              -- Verify status
    node execute-module.mjs transfer <to> <token> <amount>     -- Send tokens from sub-account
    node execute-module.mjs approve <token> <spender> [amount] -- Approve token spending
    node execute-module.mjs send-eth <to> <amount>             -- Send ETH from executor
    node execute-module.mjs raw <target> <calldata> [value]    -- Arbitrary calldata
    node execute-module.mjs batch <calls.json>                 -- Batch calls

  To revoke access:
    Go to https://teams.splits.org/custom-txn/?account=<SUBACCOUNT>
    Call disableModule(<EXECUTOR_ADDRESS>)

  Verify approvals:
    https://revoke.cash/address/<SUBACCOUNT_ADDRESS>?chainId=8453
```

---

## Appendix

### Usage examples

**All onchain writes for this project go through `execute-module.mjs` -- never send transactions directly from a wallet.**

#### Token transfers (via module)

```bash
# Send USDC from sub-account on Base
node execute-module.mjs transfer 0xRecipient USDC 100

# Send WETH from sub-account on Base
node execute-module.mjs transfer 0xRecipient WETH 0.5

# Send any ERC-20 by contract address on Base
node execute-module.mjs transfer 0xRecipient 0xTokenAddress 50
```

#### ERC-20 approvals (via module)

```bash
# Grant unlimited USDC approval to a spender
node execute-module.mjs approve USDC 0xSpenderAddress

# Grant a specific amount
node execute-module.mjs approve USDC 0xSpenderAddress 1000

# Approve any ERC-20 by contract address
node execute-module.mjs approve 0xTokenAddress 0xSpenderAddress
```

#### Send ETH from executor wallet (direct)

```bash
# Send ETH directly from the executor (not through the module)
node execute-module.mjs send-eth 0xRecipient 0.001
```

#### Send ETH from sub-account (via module)

```bash
# Send native ETH from the sub-account using raw with empty calldata and a value
# Value is in wei (1000000000000000 wei = 0.001 ETH)
node execute-module.mjs raw 0xRecipient 0x 1000000000000000
```

#### Raw calldata (via module)

```bash
# Call any contract function from the sub-account on Base
node execute-module.mjs raw <target-contract> <encoded-calldata>

# Send ETH along with a call (value in wei)
node execute-module.mjs raw <target-contract> <encoded-calldata> <value-in-wei>
```

#### Batch operations (via module)

Create a JSON file (`calls.json`):
```json
[
  {
    "target": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "value": "0",
    "data": "0xa9059cbb000000000000000000000000..."
  },
  {
    "target": "0x4200000000000000000000000000000000000006",
    "value": "0",
    "data": "0xa9059cbb000000000000000000000000..."
  }
]
```

```bash
# Execute all calls atomically from the sub-account on Base
node execute-module.mjs batch calls.json
```

### Security notes

- The executor module grants **unscoped access** -- it can do anything the account owner can
- Use a **dedicated sub-account** for each project, not your main treasury
- Fund the executor conservatively (~0.0002 ETH, ~200 txns on Base)
- To **revoke access** at any time: call `disableModule(executorAddress)` at https://teams.splits.org/custom-txn/?account=<SUBACCOUNT>
- Verify approvals at https://revoke.cash/address/<SUBACCOUNT_ADDRESS>?chainId=8453
- All transactions are visible in the Splits Teams dashboard
- **Never commit `.env`** -- it contains the executor private key

### Optional: Herd MCP for onchain reads

If you want richer onchain intelligence (contract ABIs, token balances, tx history), you can optionally add Herd MCP:

```bash
claude mcp add --transport http herd-mcp https://mcp.herd.eco/v1
```

Use it for reads; use `execute-module.mjs` for writes.
