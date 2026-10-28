// Round-1 review 回归测试 —— 纯函数与工具层行为（无真 tmux/网络/子进程）。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, basename } from 'node:path';
import {
  makeAllTools, isConfirmPhrase, defaultHookSpecs, type TmuxClient, type Tool,
} from '../src/index.ts';

const fakeTmux = (lines: string): TmuxClient => ({
  hasSession: async () => true,
  capturePane: async () => ({ ok: true as const, value: lines }),
} as unknown as TmuxClient);

const findTool = (tools: readonly Tool[], name: string): Tool => {
  const t = tools.find((x) => x.name === name);
  assert.ok(t, `tool ${name} not found`);
  return t;
};

describe('withinCwd 分隔符感知（review #1）', () => {
  it('兄弟目录前缀不再放行（/w/x-secret 不是 /w/x 的子路径）', async () => {
    const root = await mkdtemp(join(tmpdir(), 'juli-wc-'));
    try {
      const tools = makeAllTools({ tmux: null, notifier: null, assessor: null, cwd: root });
      const list = findTool(tools, 'list_directory');
      const sibling = await list.execute({ path: `../${basename(root)}-secret` });
      assert.ok(!sibling.ok);
      assert.match(sibling.error.message, /escapes workspace/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('根本身与根内路径照常放行', async () => {
    const root = await mkdtemp(join(tmpdir(), 'juli-wc-'));
    try {
      const tools = makeAllTools({ tmux: null, notifier: null, assessor: null, cwd: root });
      const exact = await findTool(tools, 'list_directory').execute({ path: '.' });
      assert.ok(exact.ok);
      assert.ok((await findTool(tools, 'write_file').execute({ path: 'sub/a.txt', content: 'x' })).ok);
      const read = await findTool(tools, 'read_file').execute({ path: 'sub/a.txt' });
      assert.ok(read.ok && read.value === 'x');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('read_session_output 越界 offset（review #9）', () => {
  it('offset 超过总行数返回空页（而非负索引从尾部错读）', async () => {
    const tools = makeAllTools({ tmux: fakeTmux('l1\nl2\nl3'), notifier: null, assessor: null, cwd: '/tmp' });
    const r = await findTool(tools, 'read_session_output').execute({ name: 's', offset: 5, lines: 200 });
    assert.ok(r.ok);
    const v = JSON.parse(r.value) as { lines: string; has_more: boolean };
    assert.equal(v.lines, '');
    assert.equal(v.has_more, false);
  });
  it('正常分页不受影响', async () => {
    const tools = makeAllTools({ tmux: fakeTmux('l1\nl2\nl3'), notifier: null, assessor: null, cwd: '/tmp' });
    const r = await findTool(tools, 'read_session_output').execute({ name: 's', offset: 1, lines: 2 });
    assert.ok(r.ok);
    const v = JSON.parse(r.value) as { lines: string };
    assert.equal(v.lines, 'l1\nl2');
  });
});

describe('defaultHookSpecs shell 引号（review #6）', () => {
  it('密码含 $/反引号时单引号包裹（hook 执行时不被 shell 展开）', () => {
    const pw = 'p$w`id`x';
    const specs = defaultHookSpecs('/x/hook.js', pw, 'http://127.0.0.1:7472');
    assert.ok(specs.length > 0);
    for (const s of specs) {
      assert.ok(s.command.includes(`JULI_PASSWORD='${pw}'`), s.command);
      assert.ok(!s.command.includes(`JULI_PASSWORD="${pw}"`), s.command);
      assert.ok(s.command.includes(`JULI_SERVICE_URL='http://127.0.0.1:7472'`), s.command);
    }
  });
  it('密码含单引号走 POSIX 转义', () => {
    const specs = defaultHookSpecs('/x/hook.js', "a'b", '');
    assert.ok(specs[0]!.command.includes("JULI_PASSWORD='a'\\''b'"));
  });
});

describe('isConfirmPhrase 多词英文词边界（review #7）', () => {
  it('否定前缀不派发', () => {
    assert.equal(isConfirmPhrase("don't do it"), false);
    assert.equal(isConfirmPhrase('do not go ahead'), false);
    assert.equal(isConfirmPhrase("don't go ahead"), false);
  });
  it('肯定用法照常确认', () => {
    assert.equal(isConfirmPhrase('do it'), true);
    assert.equal(isConfirmPhrase('please do it'), true);
    assert.equal(isConfirmPhrase('go ahead'), true);
  });
  it('中文与单词英文语义不变', () => {
    assert.equal(isConfirmPhrase('确认'), true);
    assert.equal(isConfirmPhrase('就这样'), true);
    assert.equal(isConfirmPhrase('yes'), true);
    assert.equal(isConfirmPhrase('ok'), true);
    assert.equal(isConfirmPhrase('再想想'), false);
  });
});

// ---- 2026-10-23 wf_927f2984f9e3 派发超时事故：菜单误检回归锁 -----------------
// 事故：完工汇报的编号清单「2. node migrate-dict.mjs…」被无边界正则当成
// 选项「2. no」，静态文本=永不清除的"菜单"，守护空按 Enter 到 240s 超时。
import { paneAwaitingInput, paneMenuVisible, parsePaneQuestion } from '../src/platform/shared/paneFingerprint.ts';

describe('2026-10-23 菜单误检回归', () => {
  // 真实事故窗格（尾部节选，原样特征：编号汇报+空闲提示符）
  const incidentPane = [
    '  1. 停 7788 服务 → 四文件落 ~/Desktop/学习小屋/（dict-seed.mjs / cottage-serve.mjs）',
    '  2. node migrate-dict.mjs：老库 ALTER 加 src 列；4 组 39 词原样在，教材表 cn=482',
    '  3. 活体验证：GET /api/dict=4组39词 ✓；GET /=200 ✓',
    '  4. 结单：settle 成功，workflow.status=completed',
    '',
    '✻ Baked for 7m 32s · done 2:52 PM',
    '────────────────────────────',
    '❯ ',
    '────────────────────────────',
    '  ⏵⏵ auto mode on (shift+tab to cycle) · ← 1 agent',
  ].join('\n');

  it('完工汇报的编号清单不构成菜单/等输入（词边界+底部窗）', () => {
    assert.equal(paneMenuVisible(incidentPane), false);
    assert.equal(paneAwaitingInput(incidentPane), false);
  });

  it('事故窗格不会被 parsePaneQuestion 捏造成问询卡（高处编号行不解析为选项）', () => {
    const q = parsePaneQuestion(incidentPane);
    assert.equal(q.options.some((o) => /migrate-dict/.test(o.label)), false,
      '汇报条目被当成选项');
  });

  it('真菜单（底部 ❯ 1. Yes / 2. No）仍判定为菜单且可解析', () => {
    const menu = ['Do you want to proceed?', '❯ 1. Yes', '  2. No', '  3. No, and tell Claude what to do differently'].join('\n');
    assert.equal(paneMenuVisible(menu), true);
    assert.equal(paneAwaitingInput(menu), true);
    const q = parsePaneQuestion(menu);
    assert.equal(q.options.length >= 2, true);
    assert.equal(q.options[0]?.reply, '1');
  });

  it('词边界：底部的「2. node …」不是选项，「2. no」是', () => {
    assert.equal(paneMenuVisible('1. 开始\n2. node migrate-dict.mjs\n❯ '), false);
    assert.equal(paneMenuVisible('1. Yes\n2. no\n❯ '), true);
  });
});
