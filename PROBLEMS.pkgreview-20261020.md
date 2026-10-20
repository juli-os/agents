# PROBLEMS.pkgreview-20261020 — @juli-os/agents 逐文件 review & fix 台账

- 日期：2026-10-20；范围：本仓全部 24 个 TS 文件（/tmp/pkgreview-agents.txt），每文件一子 agent 保守修
- 纪律：只修 100% 不改行为项（已发包铁律：公开行为/导出签名/wire 格式/存储布局一律只报告）；test 断言/fixture 不动；零 git 写操作
- 基线快照 /tmp/pkgreview-baseline/agents/；批次报告 /tmp/pkgreview-reports/batch-0*.json
- 验证终态：npm run build + npm test 全绿（见总控汇总）

## 逐文件明细

### bin/juli-agents.ts

fixed=0 reported_only=4

- **P1** L43 [reported-only] has 子命令名字提取不跳旗标——`has -S /tmp/x.sock` 时 name 捕获 '-S'，漏名守卫失效静默 exit 1
- **P2** L10 [reported-only] command 与 socketPath 字符串相等消歧，同名时误判（极端边界）
- **P2** L32 [reported-only] sessions 分支把一切失败与空态同流，诊断型 CLI 误导
- **P2** L26 [reported-only] 硬编码 PATH 的第二行输出未文档化，形似演示残留

### src/contracts/ports.ts

fixed=0 reported_only=1

- **P2** L38 [reported-only] JudgmentQuestion 与 jev.ts JevQuestion 跨文件复制（依赖方向刻意镜像）

### src/index.ts

fixed=0 reported_only=1

- **P2** L36 [reported-only] JudgmentQuestion 出现在 ask 签名里但 facade 未 re-export（下游无法按名引用；词汇缺口非缺陷）

### src/platform/agents/acp.ts

fixed=2 reported_only=3

- **P2** L33 [fixed] Pending.timer 死字段（clearTimeout 用闭包局部变量），删
- **P2** L38 [fixed] AcptThread.cwd 死字段，删
- **P2** L36 [reported-only] AcptThread 疑 AcpThread 笔误（重命名不属可修类别）
- **P2** L174 [reported-only] error/exit 两 handler 的 pending 清算 4 行 copy-paste（抽 helper=重构）
- **P2** L210 [reported-only] clientInfo.version 硬编码 '0.1.0' 而包已 0.1.5（wire 数据禁改）

### src/platform/agents/contextGate.ts

fixed=0 reported_only=3

- **P2** L16 [reported-only] ContextGateState.lastInputTokens 只写不读（公开接口字段+留档语义，禁删）
- **P2** L51 [reported-only] 首个合取项在早退后恒真（化简=重构）
- **P2** L52 [reported-only] nowMs 缺省时冷却检查整体跳过未写入 JSDoc（仅测试可达）

### src/platform/agents/dispatch.ts

fixed=1 reported_only=2

- **P2** L64 [fixed] gateState 值类型字面量逐字复制 ContextGateState，改命名类型（类型擦除零行为）
- **P2** L113 [reported-only] 绑定会话 cwd 比对 fail-open：列举失败/未命中静默放行（疑刻意降级取向）
- **P2** L108 [reported-only] 线索③证伪：hasSession=false→newSession 分支在下游 dispatch-ready.test 有直接覆盖，非缺陷

### src/platform/agents/hooks.ts

fixed=1 reported_only=3

- **P2** L2 [fixed] 头注释过期：称五 hook 实为六（漏 Notification）、用废弃事件名 Permission（dist 剥 CJK 零变化），改真
- **P2** L75 [reported-only] 类型谎言：settings.json hooks.<event> 非数组时 as 后 push 抛 TypeError 被外层 catch 吞成安装失败
- **P2** L43 [reported-only] installClaudeHooks 第 3 参 readFile 注入缝零调用方（公开签名禁删）
- **P2** L1 [reported-only] 范围澄清：parseHookStdin/HookPayload 在 transcript.ts 非本文件

### src/platform/agents/orchestrator.ts

fixed=3 reported_only=6

- **P1** L164 [fixed] decision 类型说谎：LLM 缺 decision 字段时返回 undefined 违反非可选声明（守卫查 ?? 'unknown' 却返回原值）；对已知消费方 undefined≡'unknown' 零行为差，修为回退 'unknown'
- **P2** L237 [fixed] unknown-tool 分支字面量+as 强转改 err() 构造器（仓内惯例）
- **P2** L173 [fixed] 连续双空行与全文风格不一致
- **P1** L185 [reported-only] OrchestratorDeps.clock/callTimeoutMs 声明后全文不读=静默吞掉的假配置项（公开类型面禁删）
- **P1** L299 [reported-only] handle() 命令分支丢弃 toResult 结果——run() 抛异常被静默吞，用户只收到 done 无错误文本
- **P2** L348 [reported-only] 文件尾 makeAllTools/Assessment 冗余再导出（facade 从 tools.ts 取，公开面零贡献；删=改导出签名）
- **P2** L325 [reported-only] registerSkillCommands 的 emitText 参数从未被调用（void 压标记的死接线，下游传的回调永不触发）
- **P2** L108 [reported-only] /switch 命令无条件宣称已切换但无任何切换实现=假成功
- **P2** L258 [reported-only] usage 回调声明 token 可选字段但编排器永不填充（跨文件端口缺口）

### src/platform/agents/pane_probe.ts

fixed=0 reported_only=3

- **P2** L53 [reported-only] liveSelection 正则与 paneAwaitingInput 首分支逐字重复（口径漂移隐患，跨文件）
- **P2** L27 [reported-only] list-panes 取 pane[0] 而 capturePane 取活动 pane——多 pane 会话语义不一致（现网流程不经过）
- **P2** L28 [reported-only] tmux exec 失败静默归并为裸 shell（基础设施错误与真裸 shell 不可区分）

### src/platform/agents/pty.ts

fixed=1 reported_only=1

- **P1** L46 [reported-only] stderr 未 setEncoding——onData 收 Buffer 冒充声明的 string（下游 WS 上 stdout 文本帧/stderr 二进制帧混发；修=改 wire 格式禁改）
- **P2** L65 [fixed] attachTmuxPty 的 JSDoc 错挂在 tmuxAttachCommand 头上，归位

### src/platform/agents/router.ts

零发现。

### src/platform/agents/skills.ts

fixed=2 reported_only=1

- **P2** L6 [fixed] 死 import toResult，删
- **P2** L69 [fixed] find/activate 各写一份 skills.find 查找表达式，提局部闭包
- **P2** L72 [reported-only] 失败分支手写字面量 vs err() 惯例混合（装饰性不动）

### src/platform/agents/snapshot.ts

fixed=2 reported_only=2

- **P2** L6 [fixed] 死 import {join}（自首版引入从未调用），删
- **P2** L92 [fixed] paneWorkDir/paneCommand 逐字 copy-paste，合并 paneField
- **P2** L40 [reported-only] loadSnapshot as 断言只查 Array.isArray 不查元素形状（快照文件自写，风险低）
- **P2** L118 [reported-only] recoverFromSnapshot 丢弃 sendText Result——重发失败仍计 recovered++

### src/platform/agents/tmux.ts

fixed=2 reported_only=2

- **P2** L101 [fixed] 模块级 sleepP 死代码（被局部同名完全遮蔽），删
- **P2** L78 [fixed] 头注释 '~4s' 与实现 20s 矛盾（事故后上调未同步注释），改真
- **P2** L201 [reported-only] sendText 两分支收尾 copy-paste（锁死生产路径不动）
- **P2** L169 [reported-only] listSessions 对任何错误返回 [] 与 listSessionsDetailed 语义不一致且文档未提

### src/platform/agents/tools.ts

fixed=4 reported_only=7

- **P1** L89 [fixed] 模块私有 helper bool 零使用死代码，删
- **P1** L114 [fixed] requireTmux 闭包与模块级 requireTmux2 逐字重复，收口
- **P1** L131 [fixed] 全仓唯一反惯例：19 处 toResult(Promise.reject(...)) 改 err()（返回值逐位相同）
- **P2** L85 [fixed] str/num typeof 收窄后仍 as 断言，局部窄化消除
- **P0** L359 [reported-only] 安全门缺失：run_command 直接 execFile 任意命令不经 isBlockedCommand——send_to_session 拦的 rm -rf 可经 run_command 绕过
- **P1** L216 [reported-only] relay_message 三门全无：不查 isBlockedCommand/hasSession/probePane 直接 sendText 进任意 pane
- **P1** L258 [reported-only] 路径逃逸：save_context/restore_context 的 file 未过 withinCwd——'../..' 可读写工作区外文件
- **P2** L81 [reported-only] ToolsDeps.log 死字段（已发布 .d.ts 禁删）
- **P2** L241 [reported-only] wait_until_idle 竞速 timer 未 clearTimeout（CLI 退出延迟至多 300s）
- **P2** L372 [reported-only] readState 空 catch 吞一切——损坏的 state.json 被下次 set_state 无声覆写
- **P2** L157 [reported-only] send_to_session 双重 probePane（无菜单时多余一次 capturePane）

### src/platform/agents/transcript.ts

fixed=0 reported_only=3

- **P1** L13 [reported-only] HookPayload 低报 hook stdin 真实形状（缺 message 等），下游被迫 as 断言——线索①复核属实；扩宽=公开返回类型变更禁改
- **P2** L13 [reported-only] 同名异物：本文件私有 HookPayload 与 orchestrator 导出的 HookPayload 完全不同形状
- **P2** L26 [reported-only] typeof-obj 守卫放行数组：parseHookStdin('[]') 返回真值 [] 而非 null

### src/platform/agents/voice.ts

fixed=3 reported_only=1

- **P1** L137 [reported-only] createVoiceCall 不校验 mode——非法值首 turn 抛 TypeError 非构造期报错；parseCallMode 未被使用（线索②复核属实）
- **P2** L164 [fixed] isConfirmPhrase 参数重复归一化（函数内已做），删外层
- **P2** L165 [fixed] (this as VoiceCall).confirmPlan() 冗余收窄 cast，删
- **P2** L219 [fixed] 载荷内联形状写两遍，提文件内 type 别名

### src/platform/shared/clock.ts

fixed=0 reported_only=2

- **P2** L1 [reported-only] 家族三仓副本（本仓份是下游消费的权威源）
- **P2** L17 [reported-only] randomIds 用 Math.random（账本主键非令牌+可注入端口，有意取舍）

### src/platform/shared/json.ts

fixed=0 reported_only=4

- **P1** L1 [reported-only] 整文件本仓死代码（家族同形+已发布 .d.ts 面禁删）
- **P2** L1 [reported-only] npm 包发布孤儿 .d.ts（无对应 .js，exports 不可达，tarball 死重）
- **P2** L1 [reported-only] json 家族：l0/l2/routing 逐字节同、ledger 裁剪版——生态事实源已收编 artifacts
- **P2** L29 [reported-only] truncate n=0 返回 '…'（同款边界）

### src/platform/shared/paneFingerprint.ts

fixed=1 reported_only=2

- **P2** L31 [fixed] 死分支 num!=='' 恒真（必选捕获组），删
- **P2** L8 [reported-only] 首分支正则与 pane_probe liveSelection 逐字重复（跨文件，另一 agent 已报）
- **P2** L45 [reported-only] 问题行跳过正则比选项解析正则宽松（边角影响）

### src/platform/shared/result.ts

fixed=0 reported_only=2

- **P2** L1 [reported-only] 整文件本仓死代码+头注释宣称与实际不符（家族同形禁删）
- **P2** L13 [reported-only] 家族副本行为漂移：agents '操作失败' vs 本仓/artifacts 'operation failed'

### test/regression.test.ts

fixed=0 reported_only=2

- **P2** L17 [reported-only] 9 处 as never 强转（字面量本合法；全仓测试惯例禁动）
- **P2** L19 [reported-only] find(...)! 非空断言（失败即 TypeError 响亮）

### test/smoke.test.ts

fixed=0 reported_only=3

- **P2** L20 [reported-only] decideRoute 实参 as never 断言禁用全部类型检查（字面量本可结构满足 Routing；fixture 禁动）
- **P2** L60 [reported-only] FbRecord 实参 as never 伪造部分记录（as FbRecord 更诚实；fixture 禁动）
- **P2** L27 [reported-only] test1/test2 routing fixture 骨架雷同仅值不同（per-test 隔离惯例）

### test/surface.test.ts

零发现。
