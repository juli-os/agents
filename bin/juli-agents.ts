#!/usr/bin/env node
// juli-agents — L0 inspection CLI. Zero-side-effect probes against the local
// tmux world: which binary the runtime resolved, which sessions exist on a
// socket, and whether a session is alive. For dispatching work use the engine.
import { createTmuxClient, resolveTmuxBin, TMUX_BIN } from '../src/index.ts';

const args = process.argv.slice(2);
const socketIdx = args.indexOf('-S');
const socketPath = socketIdx >= 0 ? args[socketIdx + 1] : undefined;
const command = args.find((a) => !a.startsWith('-') && a !== socketPath) ?? 'help';

const help = (): void => {
  console.log(`juli-agents — L0 execution substrate inspector

USAGE
  juli-agents bin                 print the tmux binary this runtime resolved
  juli-agents sessions [-S sock]  list sessions on a socket (default socket)
  juli-agents has <name> [-S sock]  exit 0 if the session exists
  juli-agents help                this help`);
};

const main = async (): Promise<void> => {
  if (command === 'help') return help();
  if (command === 'bin') {
    console.log(`bin=${TMUX_BIN} (resolveTmuxBin with process PATH)`);
    console.log(`resolveTmuxBin('/usr/bin:/bin:/usr/sbin:/sbin')=${resolveTmuxBin('/usr/bin:/bin:/usr/sbin:/sbin')}`);
    return;
  }
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
