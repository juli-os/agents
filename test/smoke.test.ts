// Pure-function contract smoke — no tmux, no network, runs anywhere.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveTmuxBin, TMUX_BIN, tmuxEnv, inputBoxState,
  tmuxAttachCommand, normalizeStopStatus, parseCallMode, extractPlanBlock,
} from '../src/index.ts';

describe('resolveTmuxBin (broken GUI PATH fallback)', () => {
  it('found on PATH → bare name (respecting self-installed overrides)', () => {
    const exists = (p: string) => p === '/usr/bin/tmux';
    assert.equal(resolveTmuxBin('/usr/bin:/bin', exists), 'tmux');
  });
  it('not on PATH → homebrew absolute path', () => {
    const exists = (p: string) => p === '/opt/homebrew/bin/tmux';
    assert.equal(resolveTmuxBin('/usr/bin:/bin', exists), '/opt/homebrew/bin/tmux');
  });
  it('nowhere at all → keep the bare name so the ENOENT stays explicit', () => {
    assert.equal(resolveTmuxBin('/usr/bin:/bin', () => false), 'tmux');
  });
  it('process-level TMUX_BIN is a string', () => {
    assert.equal(typeof TMUX_BIN, 'string');
  });
});

describe('pure-function smoke', () => {
  it('inputBoxState three states', () => {
    assert.equal(inputBoxState('x', ''), 'cleared');
    assert.equal(inputBoxState('prompt\n❯', 'prompt'), 'cleared');
    assert.equal(inputBoxState('prompt\nbusy', 'prompt'), 'in-box');
    assert.equal(inputBoxState('other', 'prompt'), 'absent');
  });
  it('tmuxAttachCommand: first element is the tmux binary and -S is present', () => {
    const cmd = tmuxAttachCommand('/tmp/s.sock', 'foo');
    assert.equal(cmd[0], 'tmux');
    assert.ok(cmd.includes('-S'));
    assert.ok(cmd.includes('foo'));
  });
  it('normalizeStopStatus', () => {
    assert.equal(normalizeStopStatus(''), 'done');
    assert.equal(normalizeStopStatus('blocked'), 'blocked');
  });
  it('parseCallMode falls back to plan on unknown values', () => {
    assert.equal(parseCallMode('whatever'), 'plan');
    assert.equal(parseCallMode('query'), 'query');
  });
  it('extractPlanBlock parses a plan block', () => {
    const text = 'before\n```plan\n{"session":"a","summary":"b","brief":"c"}\n```\nafter';
    const plan = extractPlanBlock(text);
    assert.ok(plan);
    assert.equal(plan.session, 'a');
  });
});

describe('tmuxEnv (launchd bare-env locale immunity, 2026-10-10 incident)', () => {
  it('no locale at all → inject LC_ALL=C.UTF-8', () => {
    const saved = { ...process.env };
    delete process.env.LANG; delete process.env.LC_ALL; delete process.env.LC_CTYPE;
    try {
      assert.equal(tmuxEnv()['LC_ALL'], 'C.UTF-8');
    } finally { Object.assign(process.env, saved); }
  });
  it('UTF-8 locale already declared → passed through unchanged (explicit config not overridden)', () => {
    const saved = { ...process.env };
    process.env['LANG'] = 'en_US.UTF-8'; delete process.env.LC_ALL; delete process.env.LC_CTYPE;
    try {
      assert.equal(tmuxEnv(), process.env);
    } finally { Object.assign(process.env, saved); }
  });
  it('non-UTF-8 locale (ISO-8859-1) → also injected', () => {
    const saved = { ...process.env };
    process.env['LANG'] = 'en_US.ISO-8859-1'; delete process.env.LC_ALL; delete process.env.LC_CTYPE;
    try {
      assert.equal(tmuxEnv()['LC_ALL'], 'C.UTF-8');
    } finally { Object.assign(process.env, saved); }
  });
});
