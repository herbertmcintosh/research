---
tags: [x402, smart-accounts, signing, splits]
related: [x402-protocol, smart-account-signing, session-keys, agent-financial-autonomy]
---

# x402 and Smart Accounts

Can a smart account (like a Splits team account) make x402 payments directly? **Almost, but not today.** The onchain pieces work. The gap is in signing infrastructure.

## What works (onchain)

### USDC accepts smart account signatures

Circle's USDC implements `SignatureChecker` in its `transferWithAuthorization`:
- If `from` is an EOA → verifies via `ecrecover`
- If `from` is a contract → calls `isValidSignature(hash, signature)` on the contract (EIP-1271)

Source: [circlefin/stablecoin-evm SignatureChecker.sol](https://github.com/circlefin/stablecoin-evm/blob/master/contracts/util/SignatureChecker.sol)

### Splits accounts implement EIP-1271

Splits team accounts are ERC-4337 smart accounts with `isValidSignature` (EIP-1271). The implementation at `0x15ec0fa66a0d96a64d67c58368641fbe9325f3fa` (Base) includes both EIP-1271 and ERC-4337 entry point support.

### The onchain flow would be:
1. x402 client signs an EIP-3009 `TransferWithAuthorization` where `from` = Splits account
2. Facilitator calls `transferWithAuthorization` on USDC
3. USDC sees `from` is a contract → calls `SplitsAccount.isValidSignature(hash, signature)`
4. Splits account verifies against its configured signers
5. Transfer executes

## What breaks (offchain)

### Gap 1: Passkeys can't sign outside the browser

Splits accounts use WebAuthn passkeys (P-256 curve, not secp256k1). Passkeys are bound to:
- A relying party domain (`splits.org`)
- A platform authenticator (Secure Enclave)
- The browser's WebAuthn API (`navigator.credentials.get()`)

There is no way to invoke a passkey from Node.js. See [Passkey Authentication for Agents](passkey-auth-agents.md).

### Gap 2: x402 SDK assumes EOA signers

The SDK expects `signer.signTypedData()` to return a 65-byte ECDSA secp256k1 signature. A smart account signer would return a WebAuthn-wrapped P-256 signature. The SDK doesn't validate signature format, so a custom signer returning the right bytes would likely work — but nobody has built this.

### Gap 3: No programmatic signing API from Splits

Splits only supports signing through the web UI. No `POST /api/sign` endpoint exists.

## The path forward: Session keys

The cleanest solution is [session keys](session-keys.md) — temporary EOA keys authorized to act on behalf of the smart account, with spending limits and expiry. One passkey interaction to authorize, then the agent signs x402 directly with the session key.

The smart account architecture (ERC-4337 + ModuleManager) supports this. The UX doesn't exist yet.

## Summary

| Layer | Status | Gap |
|-------|--------|-----|
| USDC onchain (EIP-3009 + EIP-1271) | ✅ | None |
| Splits smart account (EIP-1271) | ✅ | None |
| x402 SDK (custom signers) | 🟡 | Accept non-EOA signer output |
| Splits signing API | ❌ | No programmatic signing |
| Passkey access outside browser | ❌ | Platform limitation; session keys are the workaround |
