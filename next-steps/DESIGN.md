# next-steps 常用语栏设计说明

状态:已实现并安装,版本 1.1.0。分支 `feat/phrase-bar`,基线为 upstream `f60f045` 中的 next-steps 1.0.0。

依据标记:「实测」= 本会话读过的文件或运行过的命令;「推断」= 由实测材料推出、未运行验证;「未验证」= 尚无证据。类型定义指 Claude Code 2.1.295 生成的 `.claude-plugin/types/claude-code/index.d.ts`(在交互会话中以 `--plugin-dir` 加载本插件时生成,已被该目录的 `.gitignore` 排除)。

## 一、决策

| # | 决策 | 结论 |
|---|---|---|
| D1 | 形态 | 并入 next-steps,一个模块独占上方区域 |
| D3 | 中断按钮 | 不做 |
| D4 | 一行放不下 | 换行,不设「更多」 |
| D6 | 名称与版本 | 保持 `next-steps`,版本 1.0.0 → 1.1.0 |
| D7 | 持久安装途径 | 插件目录自带 `marketplace.json`(第六节) |
| D9 | 建议的排列 | 由竖排改为横排,按宽度换行 |
| D11 | 按钮分三类 | 推断建议、目标模板、固定常用语;模板与固定常用语分为 `templates`、`phrases` 两个配置项 |
| D12 | 显示时机 | 与原版一致:一轮结束后才显示,下一轮开始、按 0、按下任一按钮时整栏隐藏 |
| D13 | 按下行为 | 推断建议与目标模板填入输入框作草稿;只有固定常用语直接以用户身份发送 |
| D14 | 数字快捷键 | 建议 1-3、dismiss 0;模板在前、固定常用语在后,按配置顺序从 4 编号到 9,之后的按钮无数字 |
| D15 | 默认配置 | `phrases`:问题在哪、提交合并、做完发版、全部推送;`templates`:空 |

已被取代的决策:D2(常用语一律直接发送,由 D13 取代)、D8(常用语不设数字,由 D14 取代);随 D12 一并取消「运行中按下排队、提示已排队」。

合并的理由:行数溢出、数字快捷键、钩子链顺序三处冲突都源于两个 mod 共用上方区域;合并后由一个模块统一排版,三处冲突在结构上不再存在。

## 二、需求来源

| 需求 | 来源 |
|---|---|
| 输入框上方一排常用语按钮 | Lakr233 帖子截图(iGhostVT 键盘自定义键) |
| 按钮显示短标签,发出的可以是长文本 | iamcheyan 评论 |
| 与原版建议功能共存;建议横排换行 | XuXu |
| 按钮分三类;长指令里的目标由模型填 | XuXu |
| 数字快捷键;先隐藏再展示;只有固定常用语直接发送 | XuXu |

## 三、原版行为(next-steps 1.0.0,实测 upstream `hooks/register.tsx`)

- `turn.complete`:回答长度达到 `minAnswerChars` 时 fork 会话,生成至多 3 条建议。
- 上方区域:运行中、有问卷或无建议时不画;有建议时竖排画「next:」、1/2/3、0 dismiss。
- 按 1/2/3 调 `$.prompt.fill`;第一条同时作为 `$.prompt.suggest` 的灰字。`turn.start` 隐藏建议。

## 四、设计

### 4.1 显示状态

`view` 有四种取值:

| 取值 | 何时进入 | 画什么 |
|---|---|---|
| `hidden` | 会话开始、`turn.start`、按 0、按下任一按钮 | 什么都不画 |
| `phrases` | 回答过短不 fork,或 fork 没给出建议 | 模板与固定常用语 |
| `loading` | 回答结束且触发 fork | 「next steps…」、模板与固定常用语 |
| `offer` | fork 给出建议 | 建议、模板与固定常用语 |

运行中(`isWorking`)与有问卷(`hasSurvey`)时不画。`isWorking` 判断沿用原版;由于 `turn.start` 已置为 `hidden`,删除它测试仍全部通过(变异检查实测),属于第二道保险。

### 4.2 布局

80 列、一轮结束且有建议时(实测交互会话):

```
next:  1: 告知技术栈：PostgreSQL 后端  2: 告知技术栈：静态博客用 Pagefind
3: 先写 1 万篇样本和 k6 压测脚本  0: dismiss
4: 问题在哪  5: 提交合并  6: 做完发版  7: 全部推送
```

- 从上到下:推断建议、目标模板、固定常用语;各块分别按宽度换行。
- 换行由插件按宽度自算,画成若干行 `Box`,不用 `flexWrap`:行数预算需要在渲染前知道行数。
- 元素宽度:带数字的按钮 = `n: ` 加标签宽度(plain 按钮带 hotkey 时画成 `1: label`,实测类型定义 ButtonProps.plain 注释);元素间隔 2 格。
- 显示宽度:中日韩及全角字符、emoji 按 2 格,组合符号 0 格,其它 1 格(交互会话中与实际绘制一致,实测)。
- 单个元素比 `bodyColumns` 还宽时截断并加 `…`。

### 4.3 行数预算

- 树高超过 `maxRows` 时上方区域改为滚动,且裸数字不再触发任何按钮(实测,类型定义 AbovePrompt.maxRows 注释)。
- 固定常用语块最先占行,超过 `maxRows` 时只画前 `maxRows` 行;模板块占剩余行;建议块再占剩余行,放不下时从第 3 条建议往前删,dismiss 保留,一条建议都放不下时不画建议块(第一条仍以 Tab 灰字出现)。

### 4.4 固定常用语

- 配置每条写 `标签|文本`,没有 `|` 时标签即文本;空白条目跳过。
- 按下:整栏隐藏,`void $.prompt.submit({ text, asUser: true })`。模型读到的是不带插件包装的原文;对话记录标注「Prompt from the next-steps plugin」;`@file` 引用不展开(实测,类型定义 PromptSubmitArgs.asUser 注释与交互会话)。
- 以 `/` 开头的改走 `$.command.run({ command, args })`,`command` 不带斜杠(`submit` 拒绝 `/` 开头的文本,实测二进制报错字符串)。
- 用户自己的配置,不经过针对模型输出的 `clean()` 过滤。

### 4.5 目标模板

- 模板文本含 `[目标]`。`templates` 非空时,fork 提示词附上全部模板原文,要求回复 `{"goal": ..., "next": [...]}`;没有模板时提示词不提目标,回复只含 `next`。
- `goal` 是模型输出,经 `clean()` 过滤并限 60 字符。
- 按钮显示「标签：目标」;没有目标时只显示标签。
- 按下:整栏隐藏,`$.prompt.fill` 填入替换后的全文;没有目标时填入原模板,`[目标]` 留给用户改。
- 目标在回答过短、不 fork 的轮次保留;fork 给出空目标、失败或未作答时清空,避免把旧话题的目标连同自主执行授权填进去。

### 4.6 数字快捷键

- 空输入框里单独输入数字并停顿即按下对应按钮(实测,类型定义 ButtonProps.hotkey 注释;交互会话中输入 4 发出「问题在哪」)。
- 固定常用语按下即发送,误触数字会直接发出一条消息;这是 D14 接受的代价。
- 同一画面两个按钮用同一数字时后画的生效;建议与模板、常用语的数字范围不重叠,不存在这种情况。

### 4.7 配置项

| 键 | 类型 | 默认 |
|---|---|---|
| `minAnswerChars` | number | 80 |
| `suggestSkills` | boolean | true |
| `templates` | string,`multiple: true` | 空 |
| `phrases` | string,`multiple: true` | 问题在哪、提交合并、做完发版、`全部推送|把当前经手的所有工作区提交并推送，最终保证每一个工作区都是干净的。然后检查一下相关的pr还有没有没处理的。` |

`multiple` 列表不出现在 `/config` 面板(实测,manifest-reference 文档),修改方式为编辑 `settings.json` 的 `pluginConfigs`,或 `claude plugin configure`。

## 五、与原版的行为差异

- 建议由竖排改为横排并按宽度换行,去掉开头空行。
- 建议之下增加目标模板与固定常用语;回答过短或无建议时也显示这两块。
- fork 回复格式由数组改为 `{"goal"?, "next"}` 对象。
- 行数不足时裁剪建议条数(原版不检查 `maxRows`)。

## 六、安装

```bash
claude plugin marketplace add ./next-steps
claude plugin install next-steps@xuxu-next-steps
claude plugin disable next-steps@claude-community
```

- fork 根目录的市场名为 `claude-community`,与本机已注册的官方市场同名,不能原样注册(实测);因此在插件目录下放 `marketplace.json`,以插件目录本身为市场根(条目 `source: "./"`),不改 upstream 文件。
- 本地路径注册的市场就地加载,改代码后 `/reload-plugins` 即生效(实测,`claude plugin list` 显示 `Read from: /Users/apple/xuxu/Common_Expressions/next-steps`)。
- 开发期可用 `claude --plugin-dir ./next-steps`;该方式的配置键为 `next-steps@inline`,与安装后的 `next-steps@xuxu-next-steps` 分开保存(实测,mods/reference 文档)。

## 七、测试

`claude plugin test ./next-steps` 运行 `tests/register.test.ts`。测试用 `on(...)` 注册位于所有插件之下的钩子,截获 `prompt.submit`、`prompt.fill`、`command.run`、`ui.toast`,以 `model.fork`、`command.list` 提供建议数据,以 `linesOf` 把渲染树还原成逐行文本后断言字面量。

覆盖:显示时机(新会话、运行中、回答过短、无建议、按 0、问卷);固定常用语的发送、长文本、`标签|文本` 解析、斜杠命令、数字 4-9 编号;建议填草稿与超宽截断;30/80/200 列宽度;`maxRows` 1-5 的让出顺序;模板的提示词、目标显示与填草稿、无目标时保留占位、目标保留与清空、转义序列过滤。

## 八、验证结果

已验证(实测):

- 27 项测试全部通过;21 处破坏性修改中 20 处被测试发现,未发现的一处为 4.1 所述的 `isWorking` 判断(脚本 `/tmp/ccmod_research/mutate.py`)。
- `tsc -p tsconfig.json`(TypeScript 5.9.3)无错误;`claude plugin validate ./next-steps` 通过。
- 已安装到本机配置并停用原版;新会话加载 1.1.0。
- 交互会话:会话开始时上方区域为空;一轮结束后显示 `4: 问题在哪  5: 提交合并  6: 做完发版  7: 全部推送`;空输入框输入 4 后发出「问题在哪」,对话记录标注来自插件;运行中整栏隐藏,结束后先显示「next steps…」再显示按钮。
- 交互会话(模板仍为默认时):推断出的目标与对话中的验收标准一致,如「继续推进：1 万篇文章下全文搜索响应 P95 低于 200ms」。

未验证:

- 模板按下后在真实输入框中的填入效果(测试中已断言 `prompt.fill` 的文本)。
- iGhostVT 里点按能否触发按钮:取决于 iGhostVT 是否转发鼠标事件。

## 九、不做

中断按钮(D3)、「更多」面板(D4)、常用语附件(`submit` 不接受附件)、向 upstream 提 PR(只读镜像,外部 PR 自动关闭,实测 `README.md`)。
