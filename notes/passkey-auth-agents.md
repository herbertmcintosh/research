---
tags: [passkeys, webauthn, agent-autonomy, browser-automation]
related: [smart-account-signing, session-keys, agent-financial-autonomy]
---

# Passkey Authentication for Agents

WebAuthn passkeys are great for human security and terrible for agent autonomy. This note documents the practical reality of an AI agent authenticating via passkeys.

## How passkeys work

Passkeys use the WebAuthn standard:
1. A relying party (e.g., `splits.org`) requests authentication
2. The browser calls `navigator.credentials.get()` with a challenge
3. The platform authenticator (Secure Enclave on Mac, TPM on Windows) signs the challenge with a P-256 key
4. The user authenticates via biometric (Touch ID) or device password
5. The signed assertion is returned to the relying party

Every step of this is designed to require a human present at a physical device with a browser.

## How an agent authenticates (the hack)

Since there's no programmatic WebAuthn API outside the browser, the agent must:

1. Use browser automation (Playwright) to navigate the web app and trigger the passkey flow
2. When the OS-level authentication dialog appears (`coreautha` process on macOS), use AppleScript to type the machine password and click OK
3. The passkey signs, the browser receives the assertion, the transaction proceeds

```applescript
tell application "System Events"
 tell process "coreautha"
 keystroke "<machine_password>"
 delay 0.5
 click button "OK" of window 1
 end tell
end tell
```

This works, but it's:
- **Slow**: Full browser render cycle + OS dialog + AppleScript round-trip
- **Fragile**: Dialog timing varies, browser needs focus, `coreautha` process naming could change
- **Device-bound**: Passkey is in the Secure Enclave of one specific machine
- **Password-dependent**: Must use machine password, not Touch ID (biometrics can't be automated)

## Why not just use an EOA?

EOAs solve the signing problem trivially — agent holds a private key, signs anything. But EOAs lack:
- **Permissions**: no spending limits, no scoped access
- **Recovery**: lose the key, lose the funds
- **Audit trail**: no built-in memo or approval flow
- **Multi-sig**: no human oversight for high-value transactions

Smart accounts provide all of these. The passkey authentication is the price of that security model — until [session keys](session-keys.md) offer a middle path.

## The fundamental tension

Passkeys are designed around the assumption that a human is present. Agents are designed to operate without a human present. These goals are in direct conflict.

The resolution isn't "make passkeys work for agents" — it's "give agents a different authentication path that still respects human-set boundaries." That's what [session keys](session-keys.md) are for.

## Platform-specific notes

- **macOS**: `coreautha` is the process that handles the WebAuthn dialog. AppleScript can target it via System Events.
- **Chrome required**: Safari's WebAuthn implementation doesn't work reliably with browser automation tools.
- **Secure Enclave**: Keys are hardware-bound and not exportable. Moving to a new machine means creating a new passkey (human required).
