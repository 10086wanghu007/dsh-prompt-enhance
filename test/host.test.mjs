import test from 'node:test'
import assert from 'node:assert/strict'

import { apply, inject } from '../index.js'

/** A minimal stand-in for the Host context the plugin actually uses. */
function mount(config, { chunks, selection, onStream } = {}) {
  let definition
  const ctx = {
    effect(fn) {
      return fn()
    },
    commands: {
      register(next) {
        definition = next
        return () => {}
      },
    },
    llm: {
      stream(options) {
        if (onStream !== undefined) onStream(options)
        return (async function* generate() {
          for (const chunk of chunks ?? []) yield chunk
        })()
      },
    },
    agentDefaultModel: {
      currentSelection: () => selection,
    },
  }
  apply(ctx, config)
  return definition
}

function speak(text) {
  return [{ type: 'text-delta', index: 0, text }]
}

const DEFAULT_SELECTION = { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'medium' }

test('registers the prompt-enhance command without recording input', () => {
  const definition = mount(undefined, { selection: DEFAULT_SELECTION })
  assert.equal(definition.name, 'prompt-enhance')
  assert.equal(definition.recordInput, false)
  assert.equal(typeof definition.handler, 'function')
  assert.deepEqual(inject, ['commands', 'llm', 'agentDefaultModel'])
})

test('rewrites the draft and strips a code fence', async () => {
  const definition = mount(undefined, {
    selection: DEFAULT_SELECTION,
    chunks: [...speak('```markdown\n## 目标\n查一下明天上海的天气\n```'), { type: 'finish', reason: { kind: 'stop' } }],
  })
  const result = await definition.handler({ rawInput: ' 查天气 ', signal: undefined })
  assert.deepEqual(result, { kind: 'success', text: '## 目标\n查一下明天上海的天气' })
})

test('strips wrapping quotes', async () => {
  const definition = mount(undefined, {
    selection: DEFAULT_SELECTION,
    chunks: [...speak('“帮我写一个登录页”'), { type: 'finish', reason: { kind: 'stop' } }],
  })
  const result = await definition.handler({ rawInput: '帮我写一个登录页', signal: undefined })
  assert.equal(result.text, '帮我写一个登录页')
})

test('passes the default model selection and reasoning effort through', async () => {
  let seen
  const definition = mount(undefined, {
    selection: DEFAULT_SELECTION,
    onStream: (options) => {
      seen = options
    },
    chunks: [...speak('ok'), { type: 'finish', reason: { kind: 'stop' } }],
  })
  await definition.handler({ rawInput: '你好', signal: undefined })
  assert.equal(seen.provider, 'deepseek')
  assert.equal(seen.model, 'deepseek-chat')
  assert.equal(seen.reasoningEffort, 'medium')
  assert.deepEqual(seen.messages, [{ role: 'user', content: [{ type: 'text', text: '你好' }] }])
  assert.equal(typeof seen.system, 'string')
})

test('a configured provider and model win over the default selection', async () => {
  let seen
  const definition = mount(
    { provider: 'openrouter', model: 'some/model' },
    {
      selection: DEFAULT_SELECTION,
      onStream: (options) => {
        seen = options
      },
      chunks: [...speak('ok'), { type: 'finish', reason: { kind: 'stop' } }],
    },
  )
  await definition.handler({ rawInput: '你好', signal: undefined })
  assert.equal(seen.provider, 'openrouter')
  assert.equal(seen.model, 'some/model')
  assert.equal(seen.reasoningEffort, undefined)
})

test('rejects an empty draft', async () => {
  const definition = mount(undefined, { selection: DEFAULT_SELECTION })
  assert.deepEqual(await definition.handler({ rawInput: '   ', signal: undefined }), {
    kind: 'error',
    text: '没有需要增强的文本。',
  })
})

test('rejects a draft over the configured limit', async () => {
  const definition = mount({ maxInputChars: 5 }, { selection: DEFAULT_SELECTION })
  const result = await definition.handler({ rawInput: 'abcdef', signal: undefined })
  assert.equal(result.kind, 'error')
  assert.match(result.text, /文本过长：6 字符，上限 5 字符/)
})

test('reports a missing default model', async () => {
  const definition = mount(undefined, { selection: undefined })
  const result = await definition.handler({ rawInput: '你好', signal: undefined })
  assert.equal(result.kind, 'error')
  assert.match(result.text, /当前没有可用的默认模型/)
})

test('reports an empty model answer', async () => {
  const definition = mount(undefined, {
    selection: DEFAULT_SELECTION,
    chunks: [{ type: 'finish', reason: { kind: 'stop' } }],
  })
  const result = await definition.handler({ rawInput: '你好', signal: undefined })
  assert.deepEqual(result, { kind: 'error', text: '提示词增强失败：模型没有返回任何内容。' })
})

test('surfaces a failed finish reason', async () => {
  const definition = mount(undefined, {
    selection: DEFAULT_SELECTION,
    chunks: [
      ...speak('partial'),
      { type: 'finish', reason: { kind: 'error', failure: { message: 'boom' } } },
    ],
  })
  const result = await definition.handler({ rawInput: '你好', signal: undefined })
  assert.deepEqual(result, { kind: 'error', text: '提示词增强失败：模型调用失败：boom' })
})

test('surfaces an adapter exception', async () => {
  let definition
  const ctx = {
    effect: (fn) => fn(),
    commands: { register: (next) => ((definition = next), () => {}) },
    llm: {
      stream() {
        throw new Error('adapter missing')
      },
    },
    agentDefaultModel: { currentSelection: () => DEFAULT_SELECTION },
  }
  apply(ctx, undefined)
  const result = await definition.handler({ rawInput: '你好', signal: undefined })
  assert.deepEqual(result, { kind: 'error', text: '提示词增强失败：adapter missing' })
})