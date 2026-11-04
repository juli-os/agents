// herdr 真机冒烟（herdr 二进制不在或 JULI_HERDR_LIVE=0 时跳过）：随机一次性
// namespace（绝不碰默认 session），走 createHerdrClient 全链——server 自动
// 拉起、创建舞步（tab env 注入）、sendText/抓屏、命名观测面（前台进程名/
// pane cwd）、杀会话、server 停机清理。不上 claude（那是 e2e 面）；这里锚
// 的是 herdr 适配层与真身 server 的协议契约（0.9.5 实测口径，见 herdr.ts
// 文件头）。
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHerdrClient, herdrSocketPath } from '../src/platform/agents/herdr.ts';

const binOk = (() => {
  try {
    execFileSync('herdr', ['--version'], { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
})();
const live = binOk && process.env['JULI_HERDR_LIVE'] !== '0';
const ns = `juli-smoke-${Date.now().toString(36)}`;

describe('herdr 真机冒烟（一次性 namespace）', { skip: live ? false : 'herdr 不在或 JULI_HERDR_LIVE=0' }, () => {
  after(() => {
    if (!live) return;
    try {
      execFileSync('herdr', ['--session', ns, 'server', 'stop'], { timeout: 5000, stdio: 'ignore' });
    } catch { /* 已停/未起 */ }
  });

  it('server 自动拉起 + 创建舞步 + env 注入 + 发送/抓屏 + 杀会话', { timeout: 30_000 }, async () => {
    const dir = mkdtempSync(join(tmpdir(), 'herdr-live-'));
    const client = createHerdrClient({ session: ns, log: () => undefined });
    try {
      // ① 创建（socket 缺失 → 自动拉起 headless server）
      const created = await client.newSession('juli-smoke-agent', dir);
      assert.equal(created.ok, true);
      assert.equal(existsSync(herdrSocketPath(ns)), true);
      assert.equal(await client.hasSession('juli-smoke-agent'), true);

      // ② 命名观测面：前台进程名与 pane cwd。shell 启动期（zprofile/zshrc
      // 里的 init 命令）前台可能是别的命令——轮询等它落回 zsh（probePane 对
      // 瞬态非 shell 的容忍同理，就绪循环兜底）。
      let fg = '';
      for (let i = 0; i < 25 && fg.trim() !== 'zsh'; i++) {
        fg = await client.foregroundCommandOf('juli-smoke-agent');
        if (fg.trim() === 'zsh') break;
        await new Promise((r) => setTimeout(r, 200));
      }
      assert.equal(fg.trim(), 'zsh');
      assert.ok((await client.panePathOf('juli-smoke-agent')).length > 0);

      // ③ tab env 注入（0.9.5 唯一验证生效的路径）：JULI_HERDR_SESSION 进 shell
      const marker = `SMOKE_${Date.now().toString(36)}`;
      client.setEnv({ SMOKE_PROBE: marker });
      await client.newSession('juli-smoke-env2', dir);
      const sent = await client.sendText('juli-smoke-env2', `echo PROBE=$SMOKE_PROBE SESSION=$JULI_HERDR_SESSION`);
      assert.equal(sent.ok, true);
      // shell 里等回显落屏再抓（真实 IO 时序，最多 3s）
      let text = '';
      for (let i = 0; i < 15 && !text.includes(marker); i++) {
        await new Promise((r) => setTimeout(r, 200));
        const cap = await client.capturePane('juli-smoke-env2', 30);
        if (cap.ok) text = cap.value;
      }
      assert.ok(text.includes(marker));
      assert.ok(text.includes('SESSION=juli-smoke-env2'));

      // ④ 杀会话（workspace.close）→ hasSession 翻脸
      const killed = await client.killSession('juli-smoke-agent');
      assert.equal(killed.ok, true);
      assert.equal(await client.hasSession('juli-smoke-agent'), false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
