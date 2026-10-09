# @juli-os/agents — the execution substrate (L0)

The bottom layer of the [juli-os](https://github.com/juli-os) ladder: a tmux-based
agent session runtime. Everything an agent host needs to **run sessions reliably**
and nothing it doesn't — zero npm dependencies, Node built-ins only.

## What you get

- **tmux client** with confirmed delivery (`sendTextConfirmed` polls the input
  box reset — a swallowed Enter is re-sent, never the text), session provisioning,
  and a startup-time binary resolver that survives GUI-launched processes with a
  gutted `PATH` (the homebrew ENOENT class of failure)
- **PTY attach** — `expect`-wrapped interactive terminals for xterm-style frontends
- **Provisioning dispatch** — create-or-reuse session, cold-start `claude` pull-up,
  pane probes to tell "awaiting input" from "still working"
- **Self-healing** — snapshot/recover loop, zombie fingerprints, context gate
  (auto-compact on threshold with cooldown)
- **Claude Code hooks** — spec-driven install of Stop/SessionStart/PermissionRequest
  hooks so agent events flow back to your service
- **Skills** — markdown skill registry with prompt expansion
- **ACP executor** — protocol-level completion, preferred over tmux async when present
- **Orchestrator & voice-call scaffolding** — hook manager, command registry,
  session assessor, and the staged-plan (discuss → proposed → confirmed) call flow

## Install

```bash
npm install @juli-os/agents
```

Node ≥ 22.5 (type-stripping). TypeScript source in this repo, compiled JS on npm.

## Usage

```ts
import { createTmuxClient, resolveTmuxBin } from '@juli-os/agents';

const tmux = createTmuxClient({ socketPath: '/tmp/my.sock' });
if (!(await tmux.hasSession('worker-1'))) {
  await tmux.newSession('worker-1', '/srv/work');
}
// Confirmed delivery: polls the input box; a swallowed Enter is retried, not the text.
const res = await tmux.sendTextConfirmed('worker-1', 'claude "fix the failing test"');
```

CLI inspector (no side effects):

```bash
npx juli-agents bin                  # which tmux binary the runtime resolved
npx juli-agents sessions -S /tmp/my.sock
npx juli-agents has worker-1 -S /tmp/my.sock && echo alive
```

## Where it sits

| consumes | provides |
|---|---|
| nothing (zero deps) | tmux/PTY sessions, confirmed delivery, dispatch, hooks, snapshots, skills, ACP |

Up the ladder: [`@juli-os/ledger`](https://github.com/juli-os/ledger) records what
agents do, [`@juli-os/routing`](https://github.com/juli-os/routing) decides where
work goes, [`@juli-os/artifacts`](https://github.com/juli-os/artifacts) registers
what they produce.

## Locale note

Comments and a few operator-facing strings (e.g. the staged-plan voice prompt
contract) are Chinese in this first release — they are runtime behavior, not
chrome, and are translated via the export pipeline rather than by editing source.

## License

Apache-2.0
