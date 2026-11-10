// boot 竞态回归（2026-11-10 live 实测）：boot 决策必须在就绪循环内——冷
// server 新建的 tab，shell 还在跑启动文件，首轮探针把瞬时前台进程误读为非
// shell 时，旧实现（循环前只判一次）整轮不发引导命令，等满 waitMs 超时后
// tab 永远是裸 shell。循环内自愈 = 首次探到前台是 shell 即发引导命令，
// bootedHere 幂等守卫防重复（REPL 崩回 shell 也不重灌第二条）。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ok } from '../src/platform/shared/result.ts';
import { createProvisioningDispatch } from '../src/platform/agents/dispatch.ts';
import type { TmuxClient } from '../src/platform/agents/tmux.ts';

const READY = '✳ ready\n❯ ';

/** 前台命令与 pane 快照都按探针轮次推进的假终端：foreground 每次调用消费
 * 一项（probePane 每轮恰好调一次），capture 只在探到非 shell 时被消费。 */
const makeTmux = (
  foregroundSeq: readonly string[],
  captureSeq: readonly string[],
) => {
  const sent: string[] = [];
  let fgIdx = 0;
  let capIdx = 0;
  const tmux: TmuxClient = {
    hasSession: async () => true,
    newSession: async () => ok(undefined),
    foregroundCommandOf: async () => foregroundSeq[Math.min(fgIdx++, foregroundSeq.length - 1)] ?? '',
    capturePane: async () => ok(captureSeq[Math.min(capIdx++, captureSeq.length - 1)] ?? ''),
    sendText: async (_name: string, text: string) => { sent.push(text); return ok(undefined); },
    sendTextConfirmed: async (_name: string, text: string) => { sent.push(text); return ok(undefined); },
  } as unknown as TmuxClient;
  return { tmux, sent };
};

describe('createProvisioningDispatch：boot 决策在就绪循环内（冷 server 竞态）', () => {
  it('冷 server 新 tab 首轮探针误读为非 shell：循环内探到 shell 自愈拉起 agent', async () => {
    // probe1 前台是启动文件期的瞬时进程（非 shell、pane 不可读=未就绪）——
    // 旧实现在这里错过唯一一次 boot 判定；probe2 shell 启动文件跑完现形；
    // probe3 claude 就绪。
    const { tmux, sent } = makeTmux(['setup-sh', 'zsh', 'claude'], ['', READY]);
    const dispatch = createProvisioningDispatch({
      tmux, bootCommand: 'claude', waitReadyMs: 1000, pollMs: 1, sleep: async () => undefined,
    });
    const r = await dispatch('email', 'cold-tab', 'TASK');
    assert.equal(r.ok, true, r.ok ? '' : r.error.message);
    assert.deepEqual(sent, ['claude', 'TASK']); // 先自愈拉起，任务最后才发
    assert.equal(sent.filter((x) => x === 'claude').length, 1); // boot 只发一次
  });

  it('bootedHere 幂等守卫：REPL 未起、shell 连续在场，引导命令绝不重灌', async () => {
    const { tmux, sent } = makeTmux(['zsh', 'zsh', 'claude'], [READY]);
    const dispatch = createProvisioningDispatch({
      tmux, bootCommand: 'claude', waitReadyMs: 1000, pollMs: 1, sleep: async () => undefined,
    });
    const r = await dispatch('email', 's1', 'TASK');
    assert.equal(r.ok, true, r.ok ? '' : r.error.message);
    assert.deepEqual(sent, ['claude', 'TASK']);
  });
});
