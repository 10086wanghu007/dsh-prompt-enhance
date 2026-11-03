/**
 * Host half of the Prompt Enhancer bundle.
 *
 * Registers the `/prompt-enhance` command. The Client half invokes it over the
 * Typert remote channel (`ctx.remote.commands.execute`) when the composer button is
 * clicked; the command performs one model call and returns the rewritten text.
 * Command execution never enters model context, so the command machinery itself
 * costs no tokens.
 */

export const inject = ['commands', 'llm', 'agentDefaultModel']

const DEFAULT_SYSTEM_PROMPT = [
  '你是提示词改写器。用户会给你一段草稿，你要在不改变意图的前提下把它改写成更清晰、更可执行的提示词。规则：',
  '1. 保留原文的语言（原文是中文就输出中文）与全部具体事实：名称、数字、路径、命令、代码、链接、时间、条件，不得编造任何新事实。',
  '2. 补全缺失的结构：目标、背景（仅限原文已有的信息）、约束条件、输出形式、验收标准。原文没有的信息只能以待确认的形式提出，不得当作事实写入。',
  '3. 用简洁的条目化结构组织，去掉寒暄、重复与空话；写成对模型的指令，而不是对读者叙述。',
  '4. 以 `/` 或 `!` 开头的命令、URL、纯代码片段保持原样。',
  '5. 只输出改写后的提示词正文，不要任何前言、解释、道歉或代码围栏。',
].join('\n')

const LIMITS = {
  maxInputChars: { min: 1, max: 100000 },
  timeoutMs: { min: 5000, max: 600000 },
  maxTokens: { min: 1, max: 32000 },
}

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function clampNumber(value, fallback, range) {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(range.max, Math.max(range.min, Math.round(n)))
}

/** Normalize the row's `config` from cordis.patch.yml; unknown keys are ignored. */
function normalizeConfig(config) {
  const raw = config !== null && typeof config === 'object' ? config : {}
  return {
    systemPrompt: text(raw.systemPrompt) || DEFAULT_SYSTEM_PROMPT,
    maxInputChars: clampNumber(raw.maxInputChars, 12000, LIMITS.maxInputChars),
    timeoutMs: clampNumber(raw.timeoutMs, 180000, LIMITS.timeoutMs),
    maxTokens:
      raw.maxTokens === undefined || raw.maxTokens === null
        ? undefined
        : clampNumber(raw.maxTokens, 1024, LIMITS.maxTokens),
    temperature:
      raw.temperature === undefined || raw.temperature === null
        ? undefined
        : Math.min(2, Math.max(0, Number(raw.temperature) || 0)),
    provider: text(raw.provider),
    model: text(raw.model),
  }
}

/** Remove the wrappers models add despite being told not to. */
function tidy(output) {
  let value = output.trim()
  const fence = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(value)
  if (fence !== null) value = fence[1].trim()
  const pairs = [
    ['"', '"'],
    ['“', '”'],
    ["'", "'"],
    ['「', '」'],
  ]
  for (const [open, close] of pairs) {
    if (value.length > open.length + close.length && value.startsWith(open) && value.endsWith(close)) {
      value = value.slice(open.length, value.length - close.length).trim()
      break
    }
  }
  return value
}

function combineSignal(signal, timeoutMs) {
  if (typeof AbortSignal === 'undefined') return signal
  const parts = []
  if (signal !== undefined && signal !== null) parts.push(signal)
  if (typeof AbortSignal.timeout === 'function') parts.push(AbortSignal.timeout(timeoutMs))
  if (parts.length === 0) return undefined
  if (parts.length === 1) return parts[0]
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(parts)
  return parts[0]
}

async function enhance(ctx, settings, source, signal) {
  let provider = settings.provider
  let model = settings.model
  let reasoningEffort

  if (provider === '' || model === '') {
    const selection = ctx.agentDefaultModel.currentSelection()
    if (selection === undefined || selection === null || !selection.provider || !selection.model) {
      throw new Error('当前没有可用的默认模型（agentDefaultModel 未配置 provider/model）。')
    }
    if (provider === '') provider = selection.provider
    if (model === '') model = selection.model
    reasoningEffort = selection.reasoningEffort
  }

  const options = {
    provider,
    model,
    system: settings.systemPrompt,
    messages: [{ role: 'user', content: [{ type: 'text', text: source }] }],
    signal: combineSignal(signal, settings.timeoutMs),
  }
  if (reasoningEffort !== undefined) options.reasoningEffort = reasoningEffort
  if (settings.temperature !== undefined) options.temperature = settings.temperature
  if (settings.maxTokens !== undefined) options.maxTokens = settings.maxTokens

  let output = ''
  let failure
  for await (const chunk of ctx.llm.stream(options)) {
    if (chunk === undefined || chunk === null) continue
    if (chunk.type === 'text-delta' && typeof chunk.text === 'string') output += chunk.text
    if (chunk.type === 'finish') {
      const reason = chunk.reason ?? {}
      if (reason.kind !== 'stop' && reason.kind !== 'max-tokens' && reason.kind !== 'tool-calls') {
        failure = reason.failure?.message ?? reason.kind ?? 'unknown'
      }
    }
  }

  const rewritten = tidy(output)
  if (failure !== undefined) throw new Error(`模型调用失败：${failure}`)
  if (rewritten === '') throw new Error('模型没有返回任何内容。')
  return rewritten
}

export function apply(ctx, config) {
  const settings = normalizeConfig(config)

  ctx.effect(() =>
    ctx.commands.register({
      name: 'prompt-enhance',
      description: '把输入框里的草稿改写成更清晰、更可执行的提示词（不进入模型上下文）。',
      input: { hint: '要增强的提示词草稿' },
      recordInput: false,
      handler: async (invocation) => {
        // The command line keeps every byte after the name, including the separator
        // whitespace, so the payload is trimmed before it reaches the model.
        const source = text(invocation.rawInput)
        if (source === '') return { kind: 'error', text: '没有需要增强的文本。' }
        if (source.length > settings.maxInputChars) {
          return {
            kind: 'error',
            text: `文本过长：${source.length} 字符，上限 ${settings.maxInputChars} 字符。`,
          }
        }
        try {
          return { kind: 'success', text: await enhance(ctx, settings, source, invocation.signal) }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          if (error?.name === 'AbortError' || message.toLowerCase().includes('abort')) {
            return {
              kind: 'error',
              text: `增强超时或已取消（上限 ${Math.round(settings.timeoutMs / 1000)} 秒）。`,
            }
          }
          return { kind: 'error', text: `提示词增强失败：${message}` }
        }
      },
    }),
  )
}