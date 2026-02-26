---
tags: [passkeys, webauthn, agent-autonomy, browser-automation, guide]
related: [passkey-auth-agents, splits-teams-agent-setup, module-system-setup]
---

# Passkey Authentication for AI Agents on macOS

WebAuthn passkeys are designed for humans. They assume a person is sitting at a device, touching a fingerprint sensor or typing a password. AI agents need to work around this. This guide documents how to authenticate passkey dialogs programmatically on macOS so an agent can sign transactions, accept invites, and interact with passkey-protected web applications.

This is relevant to any web application that uses passkeys for authentication, not only Splits Teams. The mechanism is the same everywhere: the browser triggers a system dialog, and the agent needs to dismiss it with the correct credentials.

---

## How passkeys work (the parts that matter)

1. A web application calls `navigator.credentials.get()` (authentication) or `navigator.credentials.create()` (registration)
2. The browser hands the request to the OS platform authenticator
3. On macOS, the `coreautha` process spawns a system dialog asking for user verification
4. The user authenticates via Touch ID or device password
5. The Secure Enclave signs the challenge with the stored P-256 key
6. The signed assertion returns to the browser, which passes it back to the web application

Every step assumes a human is present. The agent's job is to handle step 4 programmatically.

---

## Prerequisites

- **macOS** (this guide is macOS-specific; the `coreautha` process and AppleScript automation do not exist on other platforms)
- **Chrome browser** (Safari's WebAuthn implementation does not work reliably with browser automation tools like Playwright)
- **Browser automation tool** (Playwright, Puppeteer, or equivalent) to navigate the web application and trigger the passkey flow
- **The machine's login password** (not Touch ID -- biometrics cannot be automated)
- **Accessibility permissions** for the process running AppleScript (System Settings > Privacy & Security > Accessibility)
- **Screen Recording permissions** if using screen capture tools alongside automation

---

## Critical constraint: password, not Touch ID

When creating a passkey, the human must authenticate with the **machine's login password**, not Touch ID. If the passkey is created with Touch ID, every subsequent authentication will require a physical fingerprint -- which the agent cannot provide.

During initial passkey setup, if the system dialog defaults to Touch ID, click "Use Password" or the equivalent option to switch to password-based verification. This is a one-time decision that affects every future authentication with that passkey.

If a passkey was already created with Touch ID, the human will need to delete it and create a new one using the password method.

---

## The authentication flow

When a web application triggers passkey authentication:

1. The browser shows a brief loading state ("Waiting for signature..." or similar)
2. macOS spawns the `coreautha` process, which renders a system-level dialog
3. The dialog has a password field and an OK button
4. The agent types the password and clicks OK
5. The Secure Enclave signs, the dialog dismisses, and the browser receives the assertion

The `coreautha` dialog is a system process, not a browser element. Playwright, Puppeteer, and other browser automation tools cannot see or interact with it. You must use macOS-native automation (AppleScript via `osascript` or the System Events framework).

---

## AppleScript for passkey authentication

```applescript
tell application "System Events"
    tell process "coreautha"
        keystroke "<MACHINE_PASSWORD>"
        delay 0.5
        click button "OK" of window 1
    end tell
end tell
```

Replace `<MACHINE_PASSWORD>` with the actual machine login password.

### Running it from a script

```bash
osascript -e 'tell application "System Events" to tell process "coreautha" to keystroke "<MACHINE_PASSWORD>"'
sleep 0.5
osascript -e 'tell application "System Events" to tell process "coreautha" to click button "OK" of window 1'
```

Or as a single command:

```bash
osascript -e '
tell application "System Events"
    tell process "coreautha"
        keystroke "YOUR_PASSWORD"
        delay 0.5
        click button "OK" of window 1
    end tell
end tell
'
```

### Running it from Node.js

```javascript
import { execSync } from 'child_process';

function authenticatePasskey(password) {
    const script = `
        tell application "System Events"
            tell process "coreautha"
                keystroke "${password}"
                delay 0.5
                click button "OK" of window 1
            end tell
        end tell
    `;
    execSync(`osascript -e '${script}'`);
}
```

---

## Timing

The `coreautha` dialog does not appear instantly. There is a variable delay between the browser triggering the WebAuthn request and the system dialog rendering. In practice:

- The dialog typically appears within 1-3 seconds of the browser request
- If the agent runs the AppleScript before the dialog exists, it will fail silently or throw an error
- If the agent waits too long, some applications may time out the request

A reliable pattern:

1. Trigger the passkey flow in the browser (click the submit/sign button)
2. Poll for the `coreautha` process to appear
3. Once detected, wait a short additional delay for the dialog to fully render
4. Execute the AppleScript

### Polling for the dialog

```bash
# Wait for coreautha to appear, up to 10 seconds
for i in $(seq 1 20); do
    if pgrep -x coreautha > /dev/null 2>&1; then
        sleep 0.5  # Let the dialog render
        break
    fi
    sleep 0.5
done
```

Or in Node.js:

```javascript
import { execSync } from 'child_process';

async function waitForCoreautha(timeoutMs = 10000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            execSync('pgrep -x coreautha', { stdio: 'ignore' });
            await new Promise(r => setTimeout(r, 500));  // Let dialog render
            return true;
        } catch {
            await new Promise(r => setTimeout(r, 500));
        }
    }
    return false;
}
```

---

## Creating a new passkey

Passkey creation (`navigator.credentials.create()`) follows the same pattern as authentication, with one addition: the system may present a choice between Touch ID and password. The agent (or the human during initial setup) must select the password option.

The flow:

1. Navigate to the passkey creation page in the web application
2. Click the "Create passkey" or equivalent button
3. The system dialog appears with options for Touch ID and password
4. Select "Use Password" (or equivalent)
5. Type the machine password and confirm
6. The passkey is created and stored in the Secure Enclave

After creation, all subsequent authentications with this passkey will use the password method.

---

## Limitations

**Device-bound.** Passkeys are stored in the Secure Enclave of the specific machine. They are not exportable. If the agent moves to a different machine, a new passkey must be created (requiring human involvement for the initial setup).

**One machine at a time.** The agent can only authenticate on the machine where the passkey was created. There is no remote signing capability.

**Chrome only for automation.** Safari's WebAuthn behavior with Playwright is unreliable. Use Chrome.

**Dialog naming may change.** The `coreautha` process name is an implementation detail of macOS. Apple could rename it in a future OS update. If the AppleScript stops working after a macOS update, check `ps aux | grep -i auth` to find the new process name.

**Password in plaintext.** The machine password must be available to the agent in plaintext for the AppleScript to work. Store it with the same security considerations as any other secret.

**No concurrent authentication.** If multiple passkey requests fire simultaneously, the system dialog handles them sequentially. Queue passkey operations rather than parallelizing them.

---

## When to use passkeys vs. other authentication methods

Passkey authentication through browser automation is a means of last resort. It is slow (full browser render + system dialog round-trip), fragile (timing-dependent), and device-bound. Prefer alternatives when they exist:

| Method | Speed | Reliability | Setup cost | Use when |
|--------|-------|-------------|-----------|----------|
| Module system (`executeFromModule`) | Fast | High | One-time passkey auth | Agent needs autonomous onchain execution |
| API keys / tokens | Fast | High | Varies | Service provides an API |
| EOA signing (private key) | Fast | High | Generate key | No smart account features needed |
| Passkey via browser automation | Slow | Medium | Passkey creation + password | No other option exists |

The [Module System Guide](module-system-setup.md) documents how to use a single passkey authentication to enable autonomous execution, eliminating the need for passkey auth on every transaction.

---

## Troubleshooting

**AppleScript error: "process coreautha does not exist."** The dialog has not appeared yet. Increase the polling timeout or add a longer initial delay after triggering the passkey flow.

**AppleScript error: "not allowed assistive access."** The process running the AppleScript does not have Accessibility permissions. Grant it in System Settings > Privacy & Security > Accessibility.

**Password rejected.** Verify the machine login password is correct. The passkey dialog uses the same password as the macOS login screen.

**Dialog appears but AppleScript does not interact with it.** The dialog may not have focus, or Screen Recording permissions may be missing. Try bringing the dialog to focus first:

```applescript
tell application "System Events"
    tell process "coreautha"
        set frontmost to true
        delay 0.3
        keystroke "<PASSWORD>"
        delay 0.5
        click button "OK" of window 1
    end tell
end tell
```

**Browser times out waiting for passkey.** The entire flow (dialog appear + password + sign) typically needs to complete within 30-60 seconds. If AppleScript execution is delayed, the browser may abandon the request. Trigger the AppleScript promptly after detecting `coreautha`.
