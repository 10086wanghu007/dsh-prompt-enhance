# dsh-prompt-enhance

[![CI](https://github.com/10086wanghu007/dsh-prompt-enhance/actions/workflows/ci.yml/badge.svg)](https://github.com/10086wanghu007/dsh-prompt-enhance/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

给 DeepSeek Harness Web GUI 的输入框加一个 **✦ 提示词增强** 按钮：点一下，把你正在写的草稿交给模型改写成更清晰、更可执行的提示词，并直接替换回输入框。

> 一个 composer 按钮 + 一条 `/prompt-enhance` 命令。命令机制本身不进入模型上下文，不额外消耗 token；只有那一次改写调用会按模型价目计费。

---

## 功能

- **一键改写草稿**：按钮位于输入框右侧、发送键左边（`conversation.input.right` 插槽）。
- **保留原意与事实**：改写规则要求保留原语言、保留全部具体信息（名称、数字、路径、命令、代码、链接），不编造原文没有的事实。
- **结构化增强**：补全目标、约束、输出形式与验收标准，去掉寒暄与重复。
- **跟随输入框状态**：草稿为空、或输入框处于提交/裁决中时按钮禁用；请求进行中显示旋转图标并防止重复点击。
- **可撤销**：改写结果写入输入框的历史栈，`Ctrl+Z` 即可退回原文。
- **中英双语**：按界面语言自动切换提示文案，插件管理中的名称与描述同样本地化。
- **可配置**：系统提示词、长度上限、超时、模型均可通过 plugin 配置覆盖，无需改代码。
- **纯客户端 + 宿主半**：没有自带网络请求、没有文件访问、没有遥测。

## 安装

需要已安装 DeepSeek Harness（Web GUI / desktop profile）。插件由两半组成：宿主半注册命令，客户端半渲染按钮。

### 方式一：通过 Plugin Manager（推荐）

把本仓库克隆到任意目录，然后让 Harness 从**目录**安装：

```bash
git clone https://github.com/10086wanghu007/dsh-prompt-enhance.git
```

```
plugin_manager action=install_bundle target="<本仓库的绝对路径>"
```

安装会把这个目录以 `link:` 依赖的形式挂进当前 profile，**不复制文件**，因此之后 `git pull` 或直接改文件都会立即生效（客户端模块的改动需要刷新页面或重启 Harness 才会重新加载）。

### 方式二：手动登记

在 profile 的 `package.json` 中：

```jsonc
{
  "dependencies": { "dsh-prompt-enhance": "link:<本仓库的绝对路径>" },
  "dsh": { "profile": { "bundles": [/* …, */ "dsh-prompt-enhance"] } }
}
```

随后安装依赖（profile 目录内 `pnpm install --offline` 或让 Harness 自动同步），重启 Harness。

安装完成的标准是：输入框右侧出现 ✦ 按钮，且插件列表里能看到「提示词增强」。

## 使用

1. 在输入框写下草稿，例如「帮我写一个登录页，要支持手机号验证码」。
2. 点 ✦，等待 1–3 秒。
3. 草稿被替换成增强后的提示词，接着补充或直接发送。

也可以在输入框里手动输入斜杠命令达到同样效果：

```
/prompt-enhance 帮我写一个登录页
```

两种方式走的是同一条命令，行为完全一致。

## 配置

默认值一般够用。要调整，在你的 profile patch（`<profile>/cordis.patch.yml`）里按 id 覆盖本插件的行；**覆盖会替换整份 config**，所以要写全你要的字段：

```yaml
- id: prompt-enhance
  config:
    systemPrompt: |
      你是提示词改写器……（你的规则）
    maxInputChars: 12000
    timeoutMs: 180000
    provider: qiwen
    model: deepseek-v4.1-flash-1017
    temperature: 0.3
    maxTokens: 2048
```

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `systemPrompt` | string | 内置中文改写规则 | 改写指令。想换风格（更简短 / 更适合代码 / 英文输出）改这里 |
| `maxInputChars` | number | `12000` | 草稿字符上限，超出直接报错且不调用模型（1–100000） |
| `timeoutMs` | number | `180000` | 单次改写超时，超时中止请求（5000–600000） |
| `provider` | string | 空 → 用默认模型 | 指定模型服务商 |
| `model` | string | 空 → 用默认模型 | 指定模型 id |
| `temperature` | number | 不传 | 0–2 |
| `maxTokens` | number | 不传 | 输出上限（1–32000） |

`provider` 与 `model` 任意一个留空时，插件回落到 Harness 的全局默认模型（`agentDefaultModel`），并沿用其 `reasoningEffort`。

## 成本与隐私

- **每次点击 = 一次模型调用**：输入是「系统提示词 + 草稿」，输出是改写结果。对话历史不参与，因此通常比正常发一条消息便宜。
- 会话里会留下一条淡色的 `/prompt-enhance` 记录，内容是改写结果。这是命令通道的固有行为：命令执行会写入会话日志并在模型历史之外渲染结算结果，而那份文本正是回传给按钮的载荷，无法既作载荷又隐藏。**该记录不进入模型上下文、不产生 token。**
- 只有草稿文本会发给你配置的模型服务商；插件自身不发起其他网络请求，也不收集数据。

## 已知限制

- 只处理纯文本草稿，不带输入框里的附件。
- 改写是一次性的请求-响应，没有逐字预览流。
- 客户端半必须运行在 Harness Web GUI（依赖 `@deepseek-ai/dsh-client-ui-conversation` 提供输入框插槽）；仅 CLI 环境只能使用 `/prompt-enhance` 命令。

## 工作原理

```
点击 ✦
  └─ client.js: ctx.remote.commands.execute(sessionId, "/prompt-enhance <草稿>", [])
       └─ index.js: 命令 handler
            └─ ctx.llm.stream({ provider, model, system, messages })
                 └─ 累积 text-delta → 去掉多余围栏/引号 → { kind:'success', text }
       └─ 结果回给客户端 → inputActions.setDraft(增强后的文本)
```

浏览器端的静态插件模块拿不到模型接口，所以模型调用在宿主半完成；客户端只通过 Remote 命令通道取回文本。

## 目录结构

```
index.js            宿主半：注册命令、调用模型、清洗输出
client.js           客户端半：输入框按钮、i18n、状态与错误提示
cordis.patch.yml    插入插件行的 bundle patch
locale/{en,zh}.json 插件管理中的名称与描述
icon.svg            插件图标
test/host.test.mjs  宿主半单元测试（node:test，无网络）
```

## 开发

```bash
npm test      # 运行单元测试（Node ≥ 20，无需安装依赖）
npm run check # 两个入口文件的语法检查
```

测试用桩 ctx 覆盖了正常改写、围栏与引号清理、模型选择透传、空输入、超长、无默认模型、模型空输出、失败 finish、适配器异常等路径。

## 兼容性

面向 DSH NEXT 的 Web GUI 与 desktop profile 验证。依赖的公开接口：`commands.register` / `commands.execute`（Remote）、`llm.stream`、`agentDefaultModel.currentSelection`、客户端 `slots` 与 `locale` 服务。这些是 Harness 的稳定插件接口，但 Harness 仍在快速迭代，大版本升级后建议先跑一遍 `npm test` 并实际点一次按钮。

## License

MIT，见 [LICENSE](LICENSE)。

---

## English

A composer button for the DeepSeek Harness Web GUI. Clicking the ✦ button next to the send button sends the current draft through one model call that rewrites it into a clearer, more executable prompt, then replaces the draft in place.

Because static client bundles cannot reach the model, the browser half calls a Host-side slash command over the Remote protocol; the Host half performs the single `llm.stream` call and returns the rewritten text. Command execution never enters model context, so the command machinery costs no tokens — only the rewrite call is billed.

Install by pointing `plugin_manager install_bundle` at a checkout of this repository (it is linked, not copied), or register it manually in the profile. Configure via an id-targeted override of the `prompt-enhance` row: `systemPrompt`, `maxInputChars`, `timeoutMs`, `provider`, `model`, `temperature`, `maxTokens`.

Known limitation: each click appends one muted `/prompt-enhance` transcript row containing the rewritten text, because that text is both the command's rendered result and the payload handed back to the button.

MIT licensed.