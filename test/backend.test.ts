// createAgentBackend（tmux|herdr 正交后端工厂）的接缝测试：同一消费面下两
// 后端的行为差异全部收敛在 backend.ts——引擎侧不再有任何 backend 分枝。
// herdr 分枝经 fake server 锚 attach/env 注入路径；tmux 分枝用死 socket 锚
// 尽力语义（失败记日志不抛）。真机链路见 herdr-live.test.ts。
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, statSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createAgentBackend } from '../src/platform/agents/backend.ts';
import { startFakeHerdr, type FakeHerdr } from '../src/platform/agents/herdr.ts';
import { defaultHookSpecs } from '../src/platform/agents/hooks.ts';

const tick = (ms = 250): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('createAgentBackend（tmux 分枝——缺省后端，零行为变化）', () => {
  it('kind/describe：默认 tmux，socket 透传', () => {
    const b = createAgentBackend({});
    assert.equal(b.kind, 'tmux');
    assert.equal(b.describe, 'tmux socket=default');
    assert.equal(createAgentBackend({ socketPath: '/tmp/x.sock' }).describe, 'tmux socket=/tmp/x.sock');
  });

  it('hookSpecs = defaultHookSpecs（display-message 反查会话名）', () => {
    const b = createAgentBackend({});
    const specs = b.hookSpecs('/dist/cli/hook.js', 'pw', 'http://127.0.0.1:7170');
    assert.deepEqual(specs, defaultHookSpecs('/dist/cli/hook.js', 'pw', 'http://127.0.0.1:7170'));
    assert.ok(specs.some((s) => s.event === 'Stop' && s.command.includes('display-message')));
  });

  it('bootCommand 原样返回（无包装）', () => {
    const b = createAgentBackend({});
    assert.equal(b.bootCommand("claude --model 'x'", 'juli-reply'), "claude --model 'x'");
  });

  it('applyEnv 尽力语义：死 socket 不抛、失败记日志', async () => {
    const logs: string[] = [];
    const b = createAgentBackend({ socketPath: '/nonexistent/juli-test.sock', log: (m) => logs.push(m) });
    b.applyEnv([['ANTHROPIC_API_KEY', 'sk-x']]);
    await tick();
    assert.ok(logs.some((m) => m.includes('set-environment') && m.includes('跳过')));
  });

  it('attach：会话不存在明确报错不代建', async () => {
    const b = createAgentBackend({ socketPath: '/nonexistent/juli-test.sock' });
    const r = await b.attach('no-such', { cols: 80, rows: 24 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.error.message.includes('不代建'));
  });

  it('listSync：无 server 归一空名单', () => {
    const b = createAgentBackend({ socketPath: '/nonexistent/juli-test.sock' });
    assert.deepEqual(b.listSync(), []);
  });

  it('terminal 覆盖位（测试接缝）：产物走注入件、applyEnv 绝不触真 tmux', async () => {
    const seen: string[] = [];
    const fake = {
      async setEnv(vars: Record<string, string>) { seen.push(...Object.keys(vars)); return { ok: true as const, value: undefined }; },
    };
    const b = createAgentBackend({ terminal: fake as never });
    assert.equal(b.terminal, fake);
    b.applyEnv([['ANTHROPIC_API_KEY', 'sk-x']]);
    await new Promise((r) => setTimeout(r, 50));
    assert.deepEqual(seen, ['ANTHROPIC_API_KEY']);
  });
});

describe('createAgentBackend（herdr 分枝——fake server）', () => {
  let dir: string;
  let fake: FakeHerdr;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'backend-test-'));
    fake = await startFakeHerdr(join(dir, 'herdr.sock'));
  });
  after(async () => {
    await fake.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const backend = () => createAgentBackend({
    backend: 'herdr',
    herdrSession: 'juli-backend-test',
    herdrSocketPath: fake.socketPath,
    dataDir: dir,
  });

  it('kind/describe/terminal：herdr 客户端就位', () => {
    const b = backend();
    assert.equal(b.kind, 'herdr');
    assert.equal(b.describe, 'herdr session=juli-backend-test');
    assert.equal(b.terminal.socketPath, undefined);
  });

  it('hookSpecs：JULI_HERDR_SESSION env 解析会话名（无 display-message）', () => {
    const specs = backend().hookSpecs('/dist/cli/hook.js', 'pw', 'http://127.0.0.1:7170');
    assert.equal(specs.length, 6);
    for (const s of specs) {
      assert.ok(!s.command.includes('display-message'), s.command);
      assert.ok(s.command.includes('"$JULI_HERDR_SESSION"'), s.command);
    }
  });

  it('bootCommand：source env 文件 + 会话名 env 前缀 + 原命令', () => {
    const b = backend();
    const cmd = b.bootCommand('claude', 'juli-reply');
    assert.ok(cmd.includes(`. '${join(dir, 'agent-env.sh')}'`), cmd);
    assert.ok(cmd.includes("JULI_HERDR_SESSION='juli-reply'"), cmd);
    assert.ok(cmd.endsWith('claude'), cmd);
  });

  it('applyEnv：0600 env 文件落盘 + 新建 workspace 的 tab env 注入', async () => {
    const b = backend();
    b.applyEnv([['ANTHROPIC_API_KEY', 'sk-backend'], ['ANTHROPIC_BASE_URL', 'https://api.test']]);
    const file = join(dir, 'agent-env.sh');
    assert.ok(existsSync(file));
    assert.equal(statSync(file).mode & 0o777, 0o600);
    const body = readFileSync(file, 'utf8');
    assert.ok(body.includes("export ANTHROPIC_API_KEY='sk-backend'"), body);
    // 注入面：之后新建的会话 tab env 带上
    const r = await b.terminal.newSession('juli-env-probe', '/tmp');
    assert.equal(r.ok, true);
    const tab = fake.requests.filter((x) => x.method === 'tab.create').at(-1)!;
    const env = tab.params['env'] as Record<string, string>;
    assert.equal(env['ANTHROPIC_API_KEY'], 'sk-backend');
    assert.equal(env['JULI_HERDR_SESSION'], 'juli-env-probe');
  });

  it('applyEnv 尽力语义（R2 #1）：落盘失败记日志不抛、注入面照常更新', async () => {
    const logs: string[] = [];
    const blocked = join(dir, 'not-a-dir'); // 占位文件：mkdirSync(其子路径) 必炸
    writeFileSync(blocked, 'x');
    const b = createAgentBackend({
      backend: 'herdr',
      herdrSession: 'juli-backend-test',
      herdrSocketPath: fake.socketPath,
      dataDir: join(blocked, 'sub'),
      log: (m) => logs.push(m),
    });
    b.applyEnv([['ANTHROPIC_API_KEY', 'sk-x']]);
    assert.ok(logs.some((m) => m.includes('落盘失败')), logs.join(' | '));
    // 注入面仍生效：新建会话 tab env 带上
    const r = await b.terminal.newSession('juli-fallback-probe', '/tmp');
    assert.equal(r.ok, true);
    const tab = fake.requests.filter((x) => x.method === 'tab.create').at(-1)!;
    assert.equal((tab.params['env'] as Record<string, string>)['ANTHROPIC_API_KEY'], 'sk-x');
  });

  it('attach：会话不存在明确报错不代建（不拉起 TUI）', async () => {
    const b = backend();
    const r = await b.attach('no-such', { cols: 80, rows: 24 });
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.error.message.includes('不代建'));
  });

  it('listSync：server 缺席（CLI 查询不自动拉起）归一空名单', () => {
    const b = createAgentBackend({
      backend: 'herdr',
      herdrSession: `juli-absent-${Date.now().toString(36)}`,
    });
    assert.deepEqual(b.listSync(), []);
  });
});
