// pane 文本指纹判定的纯函数族（2026-09-28 提问卡单修复）：platform/agents
// 的探针与 business/workflow 的僵尸看门狗共用同一口径——「什么算等输入」
// 是跨层共识，住在 shared 零依赖（arch 围栏：workflow 不 import agents）。

/** 「等输入」判定：编号选择菜单（权限/选项）+ CC 权限问句指纹。这是
 * 「等人的健康态」不是僵尸——看门狗豁免 + 通知人，绝不打断。
 *
 * 2026-10-23 wf_927f2984f9e3 派发超时事故修正：旧正则
 * `/❯\s*\d|[1-9]\.\s+(yes|no|allow|deny)/i` 无词边界且全窗格扫描——完工
 * 汇报里的「2. node migrate…」被「no」前缀命中，静态文本被误检成菜单，
 * 守护空按 Enter 四分钟到超时。修正=①选项词必须词边界（\b，node 不再
 * 冒充 no）；②菜单只认窗格底部 MENU_SCAN_LINES 行（交互层紧邻提示符，
 * 高处的编号清单是历史输出不是菜单）。 */
export const SELECTION_MENU_LINE = /[1-9]\.\s+(?:yes|no|allow|deny)\b|❯\s*\d/i;
/** 菜单扫描窗口（底部行数）。 */
export const MENU_SCAN_LINES = 12;

/** 交互层窗口：pane 底部 MENU_SCAN_LINES 行。live 提示紧邻底部，高处同形
 * 文本是历史输出（10-23 事故原理），指纹判定一律只看这个窗。 */
const paneTail = (pane: string): string =>
  pane.trimEnd().split('\n').slice(-MENU_SCAN_LINES).join('\n');

/** 窗格底部是否呈现真选择菜单。 */
export const paneMenuVisible = (pane: string): boolean =>
  SELECTION_MENU_LINE.test(paneTail(pane));

/** 自由问句指纹（无菜单的开放提问）。与菜单同窗：历史输出里回显过的已答
 * 问句（如完工汇报里的「Do you want me to…?」）不是等输入——否则看门狗
 * 对静态文本永不判死，重演 10-23。 */
const AWAITING_PHRASE = /\b(do you want|would you like|waiting for your|awaiting your)\b/i;

export const paneAwaitingInput = (pane: string): boolean =>
  paneMenuVisible(pane) || AWAITING_PHRASE.test(paneTail(pane));

export interface PaneQuestionOption {
  readonly label: string; // 审批卡按钮文案（含编号）
  readonly reply: string; // 回流进会话的答案（菜单=编号，自由题=文本）
}
export interface PaneQuestion {
  readonly question: string;
  readonly options: readonly PaneQuestionOption[];
}

/** 从 pane 文本解析「agent 的问题 + 选项」（问询闸门的内容源，2026-09-28）。
 * CC 权限/选择菜单 = 编号行（❯ 1. Yes / 2. No…）——选项 reply 用编号（菜单
 * 键盘选择语义）；无菜单（开放提问）= 通用同意/拒绝 + 自定义兜底。 */
export const parsePaneQuestion = (pane: string, fallbackMessage = ''): PaneQuestion => {
  const opts: PaneQuestionOption[] = [];
  const seen = new Set<string>();
  // 选项提取的前置门（2026-10-23 事故修正）：必须先有真菜单指纹（paneMenuVisible
  // ——底部窗内出现 yes/no/allow/deny 选项词或 ❯+数字）。CC 权限菜单必有
  // yes/no 措辞、模型/部署选择器必有 ❯+数字；缺这两样指纹的编号行=历史输出
  // （完工汇报清单），不提取，开放提问走通用同意/拒绝兜底。
  const menuGate = paneMenuVisible(pane);
  // 选项只从底部菜单窗解析：高处的编号行是历史输出，不是可点选项。
  const scanZone = paneTail(pane);
  for (const raw of menuGate ? scanZone.split('\n') : []) {
    const m = /^[❯>\s]*(\d)\.\s+(.{1,90})$/.exec(raw);
    if (m !== null) {
      const num = m[1] ?? ''; // (\d) 为必选捕获组，匹配成功时必有值
      const label = (m[2] ?? '').trim();
      if (!seen.has(num)) {
        seen.add(num);
        opts.push({ label: `${num}. ${label}`, reply: num });
      }
    }
    if (opts.length >= 5) break;
  }
  // 问题文本：hook message 优先（CC 的人话自报）；缺省取菜单上方最后一段
  // 非选项非空行。
  let question = fallbackMessage.trim();
  if (question === '') {
    const lines = pane.split('\n').map((l) => l.trim()).filter((l) => l !== '');
    for (let i = lines.length - 1; i >= 0; i--) {
      const ln = lines[i] ?? '';
      if (!/^[❯>\s]*\d\./.test(ln)) { question = ln.slice(0, 200); break; }
    }
  }
  if (question === '') question = 'agent 在等你回答';
  const options = opts.length >= 2 ? opts
    : [{ label: '同意继续（yes）', reply: 'yes' }, { label: '拒绝（no）', reply: 'no' }];
  return { question, options };
};
