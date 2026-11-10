// herdrAttach agent 在位闸回归（2026-11-10 live 实测）：`herdr agent attach
// <pane>` 只认 pane 上有被识别的 agent——裸 shell 期回 agent_not_found
// （`agent target w1:p2 not found`）、PTY 秒死。会话在但 agent 未在位是合法
// 状态（新建会话/agent 退出/预热未跑），spawn 前必须显式报错让调用方的
// 重试/预热逻辑接住。在位信号 = pane.list 的 agent 字段（herdr PaneInfo.agent）。
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  createHerdrClient, herdrAttach, startFakeHerdr, type FakeHerdr,
} from '../src/platform/agents/herdr.ts';

const fastSleep = (): Promise<void> => Promise.resolve();

describe('herdrAttach：agent 在位闸', () => {
  let dir: string;
  let fake: FakeHerdr;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'herdr-attach-gate-test-'));
    fake = await startFakeHerdr(join(dir, 'herdr.sock'));
  });
  after(async () => {
    await fake.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const client = () => createHerdrClient({
    socketPath: fake.socketPath,
    session: 'juli-gate',
    autoStartServer: false,
    sleep: fastSleep,
    submitConfirmMs: 1000,
    queuedConfirmMs: 500,
  });

  it('裸 shell：agent 未在位 → 明确报错（与 pane 未就绪同形态），不 spawn 必死 PTY', async () => {
    const c = client();
    await c.newSession('juli-bare', '/tmp');
    assert.equal(await c.agentAtPaneOf('juli-bare'), ''); // 新建 pane 无识别 agent
    assert.equal(await c.agentAtPaneOf('ghost'), ''); // 寻址失败同空串
    const attach = herdrAttach({ client: c, session: 'juli-gate', bin: '/nonexistent/herdr-never-spawned' });
    const r = await attach('juli-bare', {}, undefined);
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.match(r.error.message, /agent 未在位/);
      assert.match(r.error.message, /juli-bare/);
      assert.match(r.error.message, /派发链路会自愈拉起/);
    }
  });

  it('agent 在位（托管启动后）：闸放行，attach 起 PTY', async () => {
    const c = client();
    await c.newSession('juli-hot', '/tmp');
    const started = await c.startManagedAgent('juli-hot', { name: 'hot-a', kind: 'zcode' });
    assert.equal(started.ok, true, started.ok ? '' : started.error.message);
    assert.equal(await c.agentAtPaneOf('juli-hot'), 'zcode');
    // bin 指向即时退出的真二进制：证明走到了 spawn（退出码 0）而不碰真 herdr。
    const attach = herdrAttach({ client: c, session: 'juli-gate', bin: '/bin/true' });
    const r = await attach('juli-hot', {}, undefined);
    assert.equal(r.ok, true, r.ok ? '' : r.error.message);
    if (r.ok) assert.equal(await r.value.exit, 0);
  });
});
