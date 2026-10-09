// Pure-function contract smoke — no tmux, no network, runs anywhere.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTmuxBin, TMUX_BIN, inputBoxState,
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
