// Claude Code hooks 注入（对应 Go internal/ai/agent/hook_config.go）：幂等
// 注入五个 hook 到 ~/.claude/settings.json，事件命令携带 tmux 会话名——
// 干活中的 agent 任何 hook 事件都算僵尸心跳（"any notification counts"）。
// 事件面：Stop=结算、SessionStart/Permission/UserPromptSubmit=心跳/活动。

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { err, ok, type Result } from '../shared/result.ts';
import { TMUX_BIN } from './tmux.ts';

export interface HookSpec {
  /** CC hook 事件名（Stop / SessionStart / PermissionRequest / UserPromptSubmit / PostToolUse）。 */
  readonly event: string;
  /** 工具名白名单（正则 include 过滤，官方机制）：省略=全量。PostToolUse
   * 钉 `^skill__` 只放 skill 工具调用进来——高频工具（Bash/Read/Edit）在
   * CC 层即被筛掉，hook 命令零开销（2026-10-02 skill 追溯，二进制实证
   * skill 工具名 = `skill__<name>` 前缀）。 */
  readonly matcher?: string;
  /** 完整命令行（通常 = `node <dist>/cli/hook.js <verb> "$(tmux ...)" ...`）。 */
  readonly command: string;
}

/** CC settings.json 的 hook 组结构（type: "command" 是官方字段）。 */
interface HookGroup {
  readonly hooks?: readonly { readonly type?: string; readonly command?: string }[];
  readonly matcher?: string;
}

/** 「本服务管理的 hook」判定：按 JULI_* 环境前缀识别，而非路径子串。
 * 0923 事故：清旧逻辑只认 'juli-service' 子串——跨仓注入（skill-dash
 * 工作树 dist）的命令不含它，清不掉还每次重启再追加一份（重复 ×2）；
 * 死端口（7472）与死路径（src/cli/hook.js，loader:1386 的元凶）就此跨
 * 重启存活。JULI_SERVICE_URL=/JULI_PASSWORD= 是所有 juli 变体注入器的
 * 公共指纹，用户自有 hook 不携带；'juli-service' 子串保留兜底。 */
const isJuliManaged = (command: string): boolean =>
  command.includes('JULI_SERVICE_URL=') || command.includes('JULI_PASSWORD=') || command.includes('juli-service');

/** 幂等注入：先清掉本服务管理的旧 hook（值过期也无妨——整体重写），再写入
 * 新集合；用户的其它 hook 不动。端口/地址变更后重启即重写陈旧条目。 */
export const installClaudeHooks = (
  claudeDir: string,
  specs: readonly HookSpec[],
  readFile = (p: string): string | null => {
    try {
      return readFileSync(p, 'utf8');
    } catch {
      return null;
    }
  },
): Result<void, Error> => {
  try {
    const path = join(claudeDir, 'settings.json');
    let settings: Record<string, unknown> = {};
    const raw = readFile(path);
    if (raw !== null) {
      settings = JSON.parse(raw) as Record<string, unknown>;
    }
    const hooksSection = (settings['hooks'] ?? {}) as Record<string, unknown>;

    // 清旧：juli 管理的命令条目整组移除（跨仓变体/死端口/死路径一并清）。
    const cleaned: Record<string, unknown> = {};
    for (const [event, groups] of Object.entries(hooksSection)) {
      if (!Array.isArray(groups)) {
        cleaned[event] = groups;
        continue;
      }
      const kept = (groups as HookGroup[]).filter((g) =>
        !Array.isArray(g?.hooks) || !g.hooks.some((h) => isJuliManaged(h.command ?? '')),
      );
      if (kept.length > 0) cleaned[event] = kept;
    }

    // 注新。matcher 原样写入组（省略时不写键 = CC 语义的全量匹配）。
    for (const spec of specs) {
      const groups = (cleaned[spec.event] as HookGroup[] | undefined) ?? [];
      const group: HookGroup = spec.matcher !== undefined && spec.matcher !== ''
        ? { matcher: spec.matcher, hooks: [{ type: 'command', command: spec.command }] }
        : { hooks: [{ type: 'command', command: spec.command }] };
      groups.push(group);
      cleaned[spec.event] = groups;
    }
    settings['hooks'] = cleaned;
    writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
    return ok(undefined);
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
};

/** 标准五 hook 命令组（tmux 会话名内嵌进命令行——CC 的 stdin 里没有它）。
 * 服务端 /api/* 全量 Bearer 认证，而 claude 派生的 hook 进程没有 JULI_PASSWORD
 * 环境——密码必须内嵌进命令行，否则 Stop 结算永远 401。 */
export const defaultHookSpecs = (hookJsPath: string, password = '', serviceUrl = ''): readonly HookSpec[] => {
  // 会话名子命令的 tmux 二进制与引擎同源走启动期解析（2026-10-08 GUI 残缺
  // PATH 事故同源封堵）：hook 平时跑在会话 login shell（profile 已修 PATH）
  // 里裸名本不出事，但 default-command 被定制或 hook 派生语境一变，Stop
  // 结算/五 hook 全灭——拼成绝对路径后不再依赖派生环境的 PATH。
  const session = `"$(${TMUX_BIN} display-message -p '#{session_name}')"`;
  const envPrefix = password !== '' ? `JULI_PASSWORD=${JSON.stringify(password)} ` : '';
  const urlPrefix = serviceUrl !== '' ? `JULI_SERVICE_URL=${JSON.stringify(serviceUrl)} ` : '';
  const run = (verb: string, extra = ''): string =>
    `${urlPrefix}${envPrefix}node ${JSON.stringify(hookJsPath)} ${verb} ${session}${extra}`;
  return [
    { event: 'Stop', command: run('notify', ' done') },
    { event: 'SessionStart', command: run('claude-start') },
    // 事件名对齐当前 CC 版本：'Permission' 已废弃（新会话启动弹「设置警告
    // →Continue」恢复菜单，Agent 卡在菜单上）——合法事件是 PermissionRequest。
    { event: 'PermissionRequest', command: run('permission') },
    { event: 'UserPromptSubmit', command: run('capture') },
    // Notification（2026-09-28 提问卡单）：CC 在「需要权限/等输入」时自报——
    // CLI 结构化信号比 pane 正则猜屏幕文本稳（输出文本含 "Do you want" 会
    // 误判）。hook → noteAwaiting：僵尸豁免（粘性，任何心跳即清）+ 通知人。
    { event: 'Notification', command: run('awaiting') },
    // PostToolUse + matcher ^(Skill$|skill__)（skill 追溯 2026-10-02；matcher 修
    // 于 2026-10-04 wf_d35bf3a1e198）：CC 实测 tool_name="Skill"（skill 名在
    // tool_input.skill），agentskills.io 规范的 skill__<name> 为兼容保留——
    // 双格式都进 hook，由 parseSkillUsedStdin 判定。高频工具被 matcher 挡在
    // CC 层，量级与既有 hook 同档。
    { event: 'PostToolUse', matcher: '^(Skill$|skill__)', command: run('skill-used') },
  ];
};

/** 解析 CC Stop hook 的服务端状态语义：Go 版 "done"=正常，空值归一为 done。 */
export const normalizeStopStatus = (raw: string): string => (raw === '' ? 'done' : raw);
