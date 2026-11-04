// herdr 执行后端契约（2026-10-31 接入、2026-11-04 随 herdr 下沉进包）：
// createHerdrClient 把 TmuxClient 契约映射到 herdr socket API。全部经进程内
// fake herdr server（NDJSON over unix socket）验证——真机链路（headless
// server 拉起/env 注入/恢复态）在 test/herdr-live.test.ts，herdr 不在则跳过。
//
// 锚死的核心契约：
//   ① 创建舞步：workspace.create(label=会话名,cwd) → tab.create(env 含
//      JULI_HERDR_SESSION) → pane.rename(juli:<会话名>) → 关默认 tab；
//   ② sendText 大文本走 bracketed-paste 包裹 + enter（与 tmux 同款）；
//   ③ 提交确认循环按 pane.read 轮询（吞 Enter 只补 Enter / 丢粘贴补一次）；
//   ④ exec 只翻译封闭形状集，未知形状显性报错；
//   ⑤ workspace label = 会话名（hasSession/listSessions 的键）。
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHerdrClient, startFakeHerdr, paneLabelOf, type FakeHerdr } from '../src/platform/agents/herdr.ts';

const fastSleep = (): Promise<void> => Promise.resolve();

describe('createHerdrClient（fake server 契约）', () => {
  let dir: string;
  let fake: FakeHerdr;

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), 'herdr-client-test-'));
    fake = await startFakeHerdr(join(dir, 'herdr.sock'));
  });
  after(async () => {
    await fake.close();
    rmSync(dir, { recursive: true, force: true });
  });

  const client = () => createHerdrClient({
    socketPath: fake.socketPath,
    session: 'juli-test',
    autoStartServer: false,
    sleep: fastSleep,
    submitConfirmMs: 1000,
    queuedConfirmMs: 500,
  });

  it('创建舞步：workspace(label=cwd) → tab(env 含 JULI_HERDR_SESSION) → pane.rename → 关默认 tab', async () => {
    const c = client();
    const r = await c.newSession('juli-reply', '/tmp/somewhere');
    assert.equal(r.ok, true);
    const methods = fake.requests.map((x) => x.method);
    assert.deepEqual(methods, ['ping', 'workspace.list', 'workspace.create', 'tab.create', 'pane.rename', 'tab.close']);
    const ws = fake.requests[2]!;
    assert.equal(ws.params['label'], 'juli-reply');
    assert.equal(ws.params['cwd'], '/tmp/somewhere');
    assert.equal(ws.params['focus'], false);
    const tab = fake.requests[3]!;
    assert.equal(tab.params['label'], 'agent');
    assert.equal((tab.params['env'] as Record<string, string>)['JULI_HERDR_SESSION'], 'juli-reply');
    assert.equal(fake.requests[4]!.params['label'], paneLabelOf('juli-reply'));
    // 默认 tab = workspace.create 返回的那个 tab_id
    assert.equal(fake.requests[5]!.params['tab_id'], 'w1:t1');
    assert.equal(c.session, 'juli-test');
    assert.equal(c.backend, 'herdr');
  });

  it('hasSession/listSessions 以 workspace label 为键；setEnv 进注入面', async () => {
    const c = client();
    assert.equal(await c.hasSession('juli-reply'), true);
    assert.equal(await c.hasSession('nope'), false);
    assert.deepEqual(await c.listSessions(), ['juli-reply']);
    const e = await c.setEnv({ ANTHROPIC_API_KEY: 'sk-x' });
    assert.equal(e.ok, true);
    // 新建会话的 tab env 带上热注入的键
    await c.newSession('juli-dev', '/tmp/dev');
    const tab = fake.requests.filter((x) => x.method === 'tab.create').at(-1)!;
    assert.equal((tab.params['env'] as Record<string, string>)['ANTHROPIC_API_KEY'], 'sk-x');
    assert.equal((tab.params['env'] as Record<string, string>)['JULI_HERDR_SESSION'], 'juli-dev');
  });

  it('listSessionsDetailed：label 名单 + pane cwd + 前台进程名', async () => {
    const c = client();
    const det = await c.listSessionsDetailed();
    if (!det.ok) throw new Error(det.error.message);
    const reply = det.value.find((s) => s.name === 'juli-reply');
    assert.equal(reply?.path, '/tmp/somewhere');
    assert.equal(reply?.cmd, 'zsh');
    assert.equal(typeof reply?.attached, 'boolean');
  });

  it('sendText：>10 字符走 bracketed-paste 包裹 + enter；短文本直发', async () => {
    const c = client();
    const long = '【feedback 工单】record x\n■ 原文：轮播图太快了';
    const r = await c.sendText('juli-reply', long);
    assert.equal(r.ok, true);
    const sent = fake.requests.filter((x) => x.method === 'pane.send_text').at(-1)!;
    assert.equal(sent.params['text'], `\x1b[200~${long}\x1b[201~`);
    const keys = fake.requests.filter((x) => x.method === 'pane.send_keys').at(-1)!;
    assert.deepEqual(keys.params['keys'], ['enter']);
    await c.sendText('juli-reply', 'hi');
    const short = fake.requests.filter((x) => x.method === 'pane.send_text').at(-1)!;
    assert.equal(short.params['text'], 'hi');
  });

  it('sendTextConfirmed：热会话一次确认通过（首轮即已清）', async () => {
    const c = client();
    const tail = '执行完成后给出简要汇报';
    fake.setReads([`❯ ${tail}（已入记录）\n⎿ …\n❯\nctx:1%`]);
    const r = await c.sendTextConfirmed('juli-reply', `【feedback 工单】record x\n${tail}`);
    if (!r.ok) throw new Error(r.error.message);
    assert.equal(r.value.enters, 0);
    assert.equal(r.value.repasted, false);
  });

  it('sendTextConfirmed：Enter 被吞 → 只补 Enter 绝不重发文本', async () => {
    const c = client();
    const tail = '吞 Enter 场景的末行指纹';
    fake.setReads([`❯ ${tail}`, `❯ ${tail}`, `❯ ${tail}（已入）\n⎿ …\n❯`]);
    const r = await c.sendTextConfirmed('juli-reply', `任务标题行\n${tail}`);
    if (!r.ok) throw new Error(r.error.message);
    assert.ok(r.value.enters >= 1);
    // 补的是 enter 键，不是文本重发：send_text 只出现过一次（首投）
    const sendTextCount = fake.requests.filter(
      (x) => x.method === 'pane.send_text' && (x.params['text'] as string).includes(tail),
    ).length;
    assert.equal(sendTextCount, 1);
  });

  it('sendTextQueued：到期仍在框 = 到达即成立（finalState=in_box）', async () => {
    const c = client();
    const tail = '忙碌会话排队末行';
    fake.setReads([`❯ ${tail}`]); // 恒 in-box
    const r = await c.sendTextQueued('juli-reply', `标题\n${tail}`);
    if (!r.ok) throw new Error(r.error.message);
    assert.equal(r.value.finalState, 'in_box');
  });

  it('capturePane → pane.read(source=recent, lines)', async () => {
    const c = client();
    fake.setReads(['pane 内容']);
    const r = await c.capturePane('juli-reply', 400);
    if (!r.ok) throw new Error(r.error.message);
    assert.equal(r.value, 'pane 内容');
    const read = fake.requests.filter((x) => x.method === 'pane.read').at(-1)!;
    assert.equal(read.params['source'], 'recent');
    assert.equal(read.params['lines'], 400);
  });

  it('命名观测面：foregroundCommandOf/panePathOf/sendKey（exec 逃逸口已收口）', async () => {
    const c = client();
    fake.requests.length = 0;
    assert.equal(await c.foregroundCommandOf('juli-reply'), 'zsh');
    assert.equal(fake.requests[0]!.method, 'pane.list'); // label 扫描寻址
    assert.equal(fake.requests[1]!.method, 'pane.process_info');

    assert.equal(await c.panePathOf('juli-reply'), '/tmp/somewhere');

    const key = await c.sendKey('juli-reply', 'Down');
    assert.equal(key.ok, true);
    assert.deepEqual(
      fake.requests.filter((x) => x.method === 'pane.send_keys').at(-1)!.params['keys'], ['down'],
    );
    // 缺会话的观测面容错为空串（probePane 语义）
    assert.equal(await c.foregroundCommandOf('no-such'), '');
    assert.equal(await c.panePathOf('no-such'), '');
  });

  it('sessionBirthsOf：herdr 无出生时间概念 = 空表（保守回落）', async () => {
    const c = client();
    await c.newSession('juli-eng', '/tmp');
    assert.ok((await c.listSessions()).includes('juli-eng'));
    assert.equal((await c.sessionBirthsOf()).size, 0);
  });

  it('killSession：workspace.close → hasSession 翻脸', async () => {
    const c = client();
    const kill = await c.killSession('juli-reply');
    assert.equal(kill.ok, true);
    assert.ok(fake.requests.filter((x) => x.method === 'workspace.close').at(-1) !== undefined);
    assert.equal(await c.hasSession('juli-reply'), false);
  });

  it('interrupt = ctrl+c；缺会话的 sendText 显性失败', async () => {
    const c = client();
    const r = await c.interrupt('juli-eng');
    assert.equal(r.ok, true);
    assert.deepEqual(
      fake.requests.filter((x) => x.method === 'pane.send_keys').at(-1)!.params['keys'], ['ctrl+c'],
    );
    const miss = await c.sendText('no-such', 'text');
    assert.equal(miss.ok, false);
  });
});
