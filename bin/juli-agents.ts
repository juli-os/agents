#!/usr/bin/env node
// juli-agents — L0 inspection CLI. Zero-side-effect probes against the local
// tmux world: which binary the runtime resolved, which sessions exist on a
// socket, and whether a session is alive. The `herdr` family additionally
// drives the herdr backend end to end (workspace create → optional managed
// agent start → send/capture → kill) so the zcode-in-herdr path can be tested
// locally from one command line. For production dispatching use the engine.
import {
  createTmuxClient, resolveTmuxBin, TMUX_BIN, createHerdrClient, herdrSocketPath,
} from '../src/index.ts';

const args = process.argv.slice(2);
const socketIdx = args.indexOf('-S');
const socketPath = socketIdx >= 0 ? args[socketIdx + 1] : undefined;
const command = args.find((a) => !a.startsWith('-') && a !== socketPath) ?? 'help';

const flag = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const help = (): void => {
  console.log(`juli-agents — L0 execution substrate inspector

USAGE
  juli-agents bin                 print the tmux binary this runtime resolved
  juli-agents sessions [-S sock]  list sessions on a socket (default socket)
  juli-agents has <name> [-S sock]  exit 0 if the session exists
  juli-agents herdr sessions [--session ns]           list herdr workspaces
  juli-agents herdr start <name> [--session ns] [--cwd dir] [--kind agent]
                      [--arg value]... [--timeout ms]
                                  create a workspace; with --kind also start a
                                  herdr-managed agent in it (e.g. --kind zcode)
  juli-agents herdr send <name> <text...> [--session ns]
                                  submit text with delivery confirmation
  juli-agents herdr capture <name> [lines] [--session ns]
                                  read the pane tail (default 30 lines)
  juli-agents herdr probe <name> [--session ns]
                                  foreground process + cwd of the session pane
  juli-agents herdr kill <name> [--session ns]       close the workspace
  juli-agents help                this help

ENV
  JULI_HERDR_SESSION_NS           default herdr namespace for the herdr family (default 'juli-smoke')`);
};

const herdrSession = (): string => flag('--session') ?? process.env['JULI_HERDR_SESSION_NS'] ?? 'juli-smoke';

const runHerdr = async (): Promise<void> => {
  const sub = args[args.indexOf('herdr') + 1] ?? 'help';
  const ns = herdrSession();
  const client = createHerdrClient({ session: ns, log: (m) => console.error(m) });

  if (sub === 'help' || sub === undefined) return help();

  if (sub === 'sessions') {
    console.log(`socket=${herdrSocketPath(ns)}`);
    const res = await client.listSessionsDetailed();
    const sessions = res.ok ? res.value : [];
    if (!res.ok) console.log(`(unavailable: ${res.error.message.slice(0, 120)})`);
    if (res.ok && sessions.length === 0) console.log('(no workspaces / server not running)');
    for (const s of sessions) {
      console.log(`${s.name}\tcmd=${s.cmd}\tpath=${s.path}`);
    }
    return;
  }

  const name = args[args.indexOf(sub) + 1] ?? '';
  if (!name || name.startsWith('--')) return help();

  if (sub === 'start') {
    const cwd = flag('--cwd') ?? process.cwd();
    const kind = flag('--kind');
    const timeout = flag('--timeout');
    const extraArgs = args.filter((_, i) => args[i - 1] === '--arg');
    const created = await client.newSession(name, cwd);
    if (!created.ok) {
      console.error(`create failed: ${created.error.message}`);
      process.exit(1);
    }
    console.log(`workspace ready: ${name} (ns=${ns}, cwd=${cwd})`);
    if (kind === undefined) return;
    const started = await client.startManagedAgent(name, {
      name,
      kind,
      args: extraArgs,
      ...(timeout !== undefined ? { timeoutMs: Number(timeout) } : {}),
    });
    if (!started.ok) {
      console.error(`agent.start failed: ${started.error.message}`);
      process.exit(1);
    }
    console.log(`managed agent: kind=${started.value.agent} name=${started.value.name} status=${started.value.agent_status} ready=${started.value.interactive_ready}`);
    return;
  }

  if (sub === 'send') {
    const herdrIdx = args.indexOf('send');
    const text = args.slice(herdrIdx + 2).filter((a) => a !== '--session' && a !== ns).join(' ');
    if (text === '') return help();
    const sent = await client.sendTextConfirmed(name, text);
    if (!sent.ok) {
      console.error(`send failed: ${sent.error.message}`);
      process.exit(1);
    }
    console.log(`submitted: enters=${sent.value.enters} repasted=${sent.value.repasted} elapsedMs=${sent.value.elapsedMs}`);
    return;
  }

  if (sub === 'capture') {
    const linesIdx = args.indexOf('capture');
    const rawLines = args[linesIdx + 2];
    const lines = rawLines !== undefined && !rawLines.startsWith('--') ? Number(rawLines) : 30;
    const cap = await client.capturePane(name, lines);
    if (!cap.ok) {
      console.error(`capture failed: ${cap.error.message}`);
      process.exit(1);
    }
    console.log(cap.value);
    return;
  }

  if (sub === 'probe') {
    const fg = await client.foregroundCommandOf(name);
    const path = await client.panePathOf(name);
    console.log(`foreground=${fg || '(unknown)'}\ncwd=${path || '(unknown)'}`);
    return;
  }

  if (sub === 'kill') {
    const killed = await client.killSession(name);
    if (!killed.ok) {
      console.error(`kill failed: ${killed.error.message}`);
      process.exit(1);
    }
    console.log(`closed: ${name}`);
    return;
  }

  help();
};

const main = async (): Promise<void> => {
  if (command === 'help') return help();
  if (command === 'bin') {
    console.log(`bin=${TMUX_BIN} (resolveTmuxBin with process PATH)`);
    console.log(`resolveTmuxBin('/usr/bin:/bin:/usr/sbin:/sbin')=${resolveTmuxBin('/usr/bin:/bin:/usr/sbin:/sbin')}`);
    return;
  }
  if (command === 'herdr') return runHerdr();
  const client = createTmuxClient({ socketPath });
  if (command === 'sessions') {
    const res = await client.listSessionsDetailed();
    const sessions = res.ok ? res.value : [];
    if (sessions.length === 0) {
      console.log('(no sessions / no server on this socket)');
      return;
    }
    for (const s of sessions) {
      console.log(`${s.name}\tattached=${s.attached}\tcmd=${s.cmd}\tpath=${s.path}`);
    }
    return;
  }
  if (command === 'has') {
    const name = args[args.indexOf('has') + 1] ?? '';
    if (name === '') return help();
    process.exit(await client.hasSession(name) ? 0 : 1);
  }
  help();
};

void main();
