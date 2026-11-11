// facade 的 createAgentBackend 包装注入回归（2026-11-12 第 6 步剥离配套）：
// 终端器件平移进 @juli-os/baton 后，baton 侧的 hookSpecs 组装缺省空组——
// 本包 facade 包装把 defaultHookSpecs 注入进去，两分枝产出与剥离前逐字一致
//（原断言自 backend.test.ts 随器件搬去 baton，行为锚留在本仓）。herdr 分枝
// 经 baton 的 fake server 锚（不碰真 herdr）。
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentBackend, defaultHookSpecs } from '../src/index.ts';
import { startFakeHerdr, type FakeHerdr } from '@juli-os/baton';

describe('createAgentBackend（facade 包装注入 defaultHookSpecs）', () => {
  it('tmux 分枝：hookSpecs 产出 = defaultHookSpecs（display-message 反查会话名）', () => {
    const b = createAgentBackend({});
    const specs = b.hookSpecs('/dist/cli/hook.js', 'pw', 'http://127.0.0.1:7170');
    assert.deepEqual(specs, defaultHookSpecs('/dist/cli/hook.js', 'pw', 'http://127.0.0.1:7170'));
    assert.equal(specs.length, 6);
    assert.ok(specs.some((s) => s.event === 'Stop' && s.command.includes('display-message')));
  });

  it('herdr 分枝：JULI_HERDR_SESSION env 解析会话名（无 display-message）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agents-hook-injection-'));
    const fake = await startFakeHerdr(join(dir, 'herdr.sock'));
    try {
      const b = createAgentBackend({
        backend: 'herdr',
        herdrSession: 'juli-injection-test',
        herdrSocketPath: fake.socketPath,
        dataDir: dir,
      });
      const specs = b.hookSpecs('/dist/cli/hook.js', 'pw', 'http://127.0.0.1:7170');
      assert.equal(specs.length, 6);
      for (const s of specs) {
        assert.ok(!s.command.includes('display-message'), s.command);
        assert.ok(s.command.includes('"$JULI_HERDR_SESSION"'), s.command);
      }
    } finally {
      await fake.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
