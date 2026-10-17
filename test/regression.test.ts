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
