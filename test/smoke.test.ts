// Pure-function contract smoke — no tmux, no network, runs anywhere.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTmuxBin, TMUX_BIN, tmuxEnv, inputBoxState,
  tmuxAttachCommand, normalizeStopStatus, parseCallMode, extractPlanBlock,
} from '../src/index.ts';

describe('resolveTmuxBin（GUI 残缺 PATH 兜底）', () => {
  it('PATH 命中 → 裸名（尊重自装覆盖）', () => {
    const exists = (p: string) => p === '/usr/bin/tmux';
    assert.equal(resolveTmuxBin('/usr/bin:/bin', exists), 'tmux');
  });
  it('PATH 查不到 → homebrew 绝对路径', () => {
    const exists = (p: string) => p === '/opt/homebrew/bin/tmux';
    assert.equal(resolveTmuxBin('/usr/bin:/bin', exists), '/opt/homebrew/bin/tmux');
  });
  it('哪里都没有 → 保留裸名让 ENOENT 显性', () => {
    assert.equal(resolveTmuxBin('/usr/bin:/bin', () => false), 'tmux');
  });
  it('进程级 TMUX_BIN 是字符串', () => {
    assert.equal(typeof TMUX_BIN, 'string');
  });
});

describe('纯函数冒烟', () => {
  it('inputBoxState 三态', () => {
    assert.equal(inputBoxState('x', ''), 'cleared');
    assert.equal(inputBoxState('prompt\n❯', 'prompt'), 'cleared');
    assert.equal(inputBoxState('prompt\nbusy', 'prompt'), 'in-box');
    assert.equal(inputBoxState('other', 'prompt'), 'absent');
  });
  it('tmuxAttachCommand 首元素=tmux 二进制且带 -S', () => {
    const cmd = tmuxAttachCommand('/tmp/s.sock', 'foo');
    assert.equal(cmd[0], 'tmux');
    assert.ok(cmd.includes('-S'));
    assert.ok(cmd.includes('foo'));
  });
  it('normalizeStopStatus', () => {
    assert.equal(normalizeStopStatus(''), 'done');
    assert.equal(normalizeStopStatus('blocked'), 'blocked');
  });
  it('parseCallMode 未知值兜底 plan', () => {
    assert.equal(parseCallMode('whatever'), 'plan');
    assert.equal(parseCallMode('query'), 'query');
  });
  it('extractPlanBlock 解析 plan 块', () => {
    const text = 'before\n```plan\n{"session":"a","summary":"b","brief":"c"}\n```\nafter';
    const plan = extractPlanBlock(text);
    assert.ok(plan);
    assert.equal(plan.session, 'a');
  });
});

describe('tmuxEnv（launchd 裸环境 locale 免疫，2026-10-10 事故）', () => {
  it('无任何 locale → 注入 LC_ALL=C.UTF-8', () => {
    const saved = { ...process.env };
    delete process.env.LANG; delete process.env.LC_ALL; delete process.env.LC_CTYPE;
    try {
      assert.equal(tmuxEnv()['LC_ALL'], 'C.UTF-8');
    } finally { Object.assign(process.env, saved); }
  });
  it('已声明 UTF-8 locale → 原样透传（不覆盖显式配置）', () => {
    const saved = { ...process.env };
    process.env['LANG'] = 'en_US.UTF-8'; delete process.env.LC_ALL; delete process.env.LC_CTYPE;
    try {
      assert.equal(tmuxEnv(), process.env);
    } finally { Object.assign(process.env, saved); }
  });
  it('非 UTF-8 locale（ISO-8859-1）→ 也注入', () => {
    const saved = { ...process.env };
    process.env['LANG'] = 'en_US.ISO-8859-1'; delete process.env.LC_ALL; delete process.env.LC_CTYPE;
    try {
      assert.equal(tmuxEnv()['LC_ALL'], 'C.UTF-8');
    } finally { Object.assign(process.env, saved); }
  });
});
