---
tags: [smart-accounts, signing, erc-4337, eip-1271]
related: [x402-smart-accounts, passkey-auth-agents, session-keys]
---

# Smart Account Signing

ERC-4337 smart accounts don't sign like EOAs. Understanding the difference matters for any agent trying to interact with them programmatically.

## EOA signing (simple)

An EOA has a private key. To sign:
1. Hash the message (EIP-712 typed data, personal sign, etc.)
2. ECDSA sign with the private key (secp256k1 curve)
3. Return 65 bytes: `r`, `s`, `v`

Verification: `ecrecover(hash, signature)` returns the signer address. If it matches, the signature is valid.

## Smart account signing (EIP-1271)

A smart account is a contract. It can't "hold" a private key. Instead, it implements:

```solidity
function isValidSignature(bytes32 hash, bytes memory signature) 
    external view returns (bytes4 magicValue);
```

The contract defines its own validation logic. It might:
- Check a single owner's ECDSA signature
- Verify a multisig threshold
- Validate a WebAuthn/passkey signature (P-256 curve)
- Check a session key's authorization
- Any arbitrary logic

## Splits smart accounts specifically

Splits uses a `MultiSignerAuth` pattern with a front/back hash approach:
- Signers are stored as 32-byte hashes (front half) and raw bytes (back half)
- Supports up to 256 signers with configurable thresholds
- EIP-712 domain separator uses `SplitMessage(bytes32 hash)` typehash for replay protection
- Primary signers are WebAuthn passkeys (P-256), not EOA keys (secp256k1)

The account also includes `ModuleManager` and `FallbackManager` (similar to Safe's architecture), which could enable [session key](session-keys.md) support through modules.

## Why this matters for agents

Most crypto tooling assumes EOA signing. When an agent needs to sign on behalf of a smart account, the entire signing pipeline changes:
- Different curve (P-256 vs secp256k1 for passkey-based accounts)
- Browser-bound authentication (WebAuthn)
- Wrapped signature format (authenticator data + client data JSON + raw signature)
- Domain-bound challenges

This is the fundamental reason agents can't easily operate smart accounts today. The workaround is either [browser automation](passkey-auth-agents.md) or [session keys](session-keys.md).
