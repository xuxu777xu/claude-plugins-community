import type { On, RenderInput } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { describe, expect, test } from 'claude-code/testing'

const NAME = 'next-steps'

const BAND: RenderInput<'AbovePrompt', 'terminal'> = {
  component: 'AbovePrompt',
  surface: 'terminal',
  requestId: 'band',
  viewport: { columns: 80, rows: 40, isFullscreen: true },
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 20,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 19 },
    view: {},
  },
}

const band = (props: Partial<RenderInput<'AbovePrompt', 'terminal'>['props']>): RenderInput<'AbovePrompt', 'terminal'> => ({
  ...BAND,
  props: { ...BAND.props, ...props },
})

const PUSH_ALL = '把当前经手的所有工作区提交并推送，最终保证每一个工作区都是干净的。然后检查一下相关的pr还有没有没处理的。'
const PUSH_AHEAD =
  '继续推进，按照[目标]的标准执行。过程中自行分析问题、持续迭代和更新实现，不需要每一步都等待确认；每完成一个相对完整、可验证的阶段就及时提交 commit，保持提交记录清晰、可回溯。你认为整体已经达到收尾标准后，再调度子 Agent 对当前实现和 diff 做一次完整 review，根据 review 结果继续修正；确认没有明显问题后再结束。'

const SUGGESTIONS = [
  { label: 'run the tests', prompt: 'run the tests you just wrote' },
  { label: 'same for settings', prompt: 'do the same for the settings page' },
  { label: 'review', prompt: '/code-review high' },
]

type World = {
  forkPrompts: string[]
  submits: { text: string; asUser: boolean }[]
  fills: string[]
  runs: { command: string; args: string }[]
  toasts: string[]
}

/** 每次 fork 依次取 replies 的下一条,取到最后一条后一直用它。 */
function worldOf(on: On, replies: readonly object[] = [{ next: SUGGESTIONS }]): World {
  const world: World = { forkPrompts: [], submits: [], fills: [], runs: [], toasts: [] }
  const queue = replies.map(reply => JSON.stringify(reply))

  on('ui.render', () => ({ type: 'Box', props: {}, children: [] }))
  on('ui.invalidate', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.toast', ($, e) => {
    world.toasts.push(e.text)
    return { value: undefined }
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('command.list', () => ({ value: [{ name: 'code-review', description: 'Review the diff', source: 'plugin' }] }))
  on('model.fork', ($, e) => {
    world.forkPrompts.push(e.prompt)
    const text = queue.length > 1 ? (queue.shift() ?? '') : (queue[0] ?? '')
    return {
      value: {
        isAnswered: true,
        text,
        usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
      },
    }
  })
  on('prompt.fill', ($, e) => {
    world.fills.push(e.text)
    return { isFilled: true }
  })
  on('prompt.suggest', () => ({ isShown: true }))
  on('prompt.submit', ($, e) => {
    world.submits.push({ text: e.text, asUser: e.origin.kind === 'plugin' && e.origin.asUser === true })
    return { text: e.text }
  })
  on('command.run', ($, e) => {
    world.runs.push({ command: e.command, args: e.args })
    return {}
  })

  return world
}

type Drawn = { type?: string; props?: Record<string, unknown>; children?: unknown[] } | string | null | undefined

/** 按终端绘制规则把树还原成逐行文本:行 Box 内元素以 columnGap 个空格相连,列 Box 逐行堆叠。 */
function linesOf(tree: unknown): string[] {
  const node = tree as Drawn
  if (node === null || node === undefined) return []
  if (typeof node === 'string') return [node]
  const props = node.props ?? {}
  if (node.type === 'Button') {
    const label = String(props.label ?? '')
    return [typeof props.hotkey === 'string' ? `${props.hotkey}: ${label}` : label]
  }
  if (node.type === 'Text') return [(node.children ?? []).map(child => linesOf(child).join('')).join('')]
  const kids = (node.children ?? []).map(linesOf).filter(lines => lines.length > 0)
  const top = Array.from({ length: Number(props.marginTop ?? 0) }, () => '')
  if (props.flexDirection === 'column') return [...top, ...kids.flat()]
  if (kids.length === 0) return top
  if (kids.some(lines => lines.length > 1)) throw new Error('row Box holds a multi-line child')
  return [...top, kids.map(lines => lines[0]).join(' '.repeat(Number(props.columnGap ?? props.gap ?? 0)))]
}

const WIDE = /[ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦]/u
const cells = (line: string): number => [...line].reduce((sum, char) => sum + (WIDE.test(char) ? 2 : 1), 0)

const settle = async (): Promise<void> => {
  for (let i = 0; i < 50; i++) await Promise.resolve()
}

async function completeTurn($: Engine, turnId = 't1', answer = 'a'.repeat(100)): Promise<void> {
  await $.turn.start({ text: 'do it', turnId })
  await $.turn.complete({ answer, durationMs: 1, isAborted: false, turnId, reason: 'answer' })
  await settle()
}

const PUSH_AHEAD_ENTRY = `继续推进|${PUSH_AHEAD}`
const SUGGESTED_80 = 'next:  1: run the tests  2: same for settings  3: review  0: dismiss'
const PHRASES_80 = '4: 问题在哪  5: 提交合并  6: 做完发版  7: 全部推送'

describe('when the band shows', () => {
  test('a new session shows nothing until a turn ends', async ($, on) => {
    worldOf(on)
    expect(linesOf(await $.ui.render(BAND))).toEqual([])
    await completeTurn($)
    expect(linesOf(await $.ui.render(BAND))).toEqual([SUGGESTED_80, PHRASES_80])
  })

  test('a running turn hides the whole band', async ($, on) => {
    worldOf(on)
    await completeTurn($)
    expect(linesOf(await $.ui.render(BAND))).toEqual([SUGGESTED_80, PHRASES_80])
    await $.turn.start({ text: 'go on', turnId: 't2' })
    expect(linesOf(await $.ui.render(band({ isWorking: true })))).toEqual([])
  })

  test('after an answer too short to guess from, only the phrases show', async ($, on) => {
    const world = worldOf(on)
    await completeTurn($, 't1', 'ok')
    expect(linesOf(await $.ui.render(BAND))).toEqual([PHRASES_80])
    expect(world.forkPrompts).toEqual([])
  })

  test('when the fork guesses nothing, only the phrases show', async ($, on) => {
    worldOf(on, [{ next: [] }])
    await completeTurn($)
    expect(linesOf(await $.ui.render(BAND))).toEqual([PHRASES_80])
  })

  test('0 dismisses the whole band', async ($, on) => {
    worldOf(on)
    await completeTurn($)
    await $.ui.render(BAND)
    await $.ui.press({ plugin: NAME, key: 'dismiss' })
    expect(linesOf(await $.ui.render(BAND))).toEqual([])
  })

  test('a survey takes the band whole', async ($, on) => {
    worldOf(on)
    await completeTurn($)
    expect(linesOf(await $.ui.render(BAND)).length, 'without a survey the band draws').toBe(2)
    expect(linesOf(await $.ui.render(band({ hasSurvey: true })))).toEqual([])
  })
})

describe('fixed phrases', () => {
  test('pressing a phrase submits its text as the person and hides the band', async ($, on) => {
    const world = worldOf(on)
    await completeTurn($)
    await $.ui.render(BAND)
    await $.ui.press({ plugin: NAME, key: 'phrase:0' })
    expect(world.submits).toEqual([{ text: '问题在哪', asUser: true }])
    expect(linesOf(await $.ui.render(BAND))).toEqual([])
  })

  test('a phrase with a label submits its full text', async ($, on) => {
    const world = worldOf(on)
    await completeTurn($)
    await $.ui.render(BAND)
    await $.ui.press({ plugin: NAME, key: 'phrase:3' })
    expect(world.submits).toEqual([{ text: PUSH_ALL, asUser: true }])
  })

  test('configured phrases parse label|text, skip blank lines, and run slash commands', { options: { phrases: ['审查|/code-review high', '  ', '继续'] } }, async ($, on) => {
    const world = worldOf(on, [{ next: [] }])
    await completeTurn($)
    expect(linesOf(await $.ui.render(BAND))).toEqual(['4: 审查  5: 继续'])
    await $.ui.press({ plugin: NAME, key: 'phrase:0' })
    expect(world.runs).toEqual([{ command: 'code-review', args: 'high' }])
    expect(world.submits).toEqual([])
    await completeTurn($, 't2')
    await $.ui.render(BAND)
    await $.ui.press({ plugin: NAME, key: 'phrase:1' })
    expect(world.submits).toEqual([{ text: '继续', asUser: true }])
  })

  test('hotkeys run from 4 to 9 and later buttons go without', { options: { phrases: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] } }, async ($, on) => {
    worldOf(on, [{ next: [] }])
    await completeTurn($)
    expect(linesOf(await $.ui.render(BAND))).toEqual(['4: a  5: b  6: c  7: d  8: e  9: f  g'])
  })
})

describe('suggestions', () => {
  test('1 fills the prompt box with the first suggestion and hides the band', async ($, on) => {
    const world = worldOf(on)
    await completeTurn($)
    await $.ui.render(BAND)
    await $.ui.press({ plugin: NAME, key: 's0' })
    expect(world.fills).toEqual(['run the tests you just wrote'])
    expect(linesOf(await $.ui.render(BAND))).toEqual([])
  })

  test('a label wider than the band is cut to fit', async ($, on) => {
    worldOf(on, [{ next: [{ label: 'x'.repeat(40), prompt: 'long one' }] }])
    await completeTurn($)
    const lines = linesOf(await $.ui.render(band({ bodyColumns: 30 })))
    expect(lines.slice(0, 2)).toEqual(['next:', `1: ${'x'.repeat(26)}…`])
  })
})

describe('fitting the band', () => {
  const PHRASES_30 = ['4: 问题在哪  5: 提交合并', '6: 做完发版  7: 全部推送']

  for (const bodyColumns of [30, 80, 200]) {
    test(`every line fits ${bodyColumns} columns`, async ($, on) => {
      worldOf(on)
      await completeTurn($)
      const lines = linesOf(await $.ui.render(band({ bodyColumns })))
      expect(lines.length > 0).toBe(true)
      for (const line of lines) expect(cells(line) <= bodyColumns, `"${line}" fits ${bodyColumns}`).toBe(true)
    })
  }

  test('30 columns with room for everything', async ($, on) => {
    worldOf(on)
    await completeTurn($)
    expect(linesOf(await $.ui.render(band({ bodyColumns: 30, maxRows: 5 })))).toEqual([
      'next:  1: run the tests',
      '2: same for settings',
      '3: review  0: dismiss',
      ...PHRASES_30,
    ])
  })

  test('short of rows, suggestions go from the last one up and dismiss stays', async ($, on) => {
    worldOf(on)
    await completeTurn($)
    expect(linesOf(await $.ui.render(band({ bodyColumns: 30, maxRows: 4 })))).toEqual([
      'next:  1: run the tests',
      '0: dismiss',
      ...PHRASES_30,
    ])
  })

  test('with no room for one suggestion, only the phrases draw', async ($, on) => {
    worldOf(on)
    await completeTurn($)
    expect(linesOf(await $.ui.render(band({ bodyColumns: 30, maxRows: 3 })))).toEqual(PHRASES_30)
  })

  test('templates give way before the fixed phrases', { options: { templates: ['推进|按[目标]推进'] } }, async ($, on) => {
    worldOf(on, [{ next: [] }])
    await completeTurn($)
    expect(linesOf(await $.ui.render(band({ bodyColumns: 30, maxRows: 3 })))).toEqual([
      '4: 推进',
      '5: 问题在哪  6: 提交合并',
      '7: 做完发版  8: 全部推送',
    ])
    expect(linesOf(await $.ui.render(band({ bodyColumns: 30, maxRows: 2 })))).toEqual([
      '5: 问题在哪  6: 提交合并',
      '7: 做完发版  8: 全部推送',
    ])
  })

  test('fixed phrases taller than the band keep their first rows', async ($, on) => {
    worldOf(on, [{ next: [] }])
    await completeTurn($)
    expect(linesOf(await $.ui.render(band({ bodyColumns: 30, maxRows: 1 })))).toEqual(PHRASES_30.slice(0, 1))
  })
})

describe('templates filled by the fork', () => {
  const GOAL = '可同时并发 100'
  const SENT = PUSH_AHEAD.replace('[目标]', GOAL)
  const PHRASES_AFTER_TEMPLATE = '5: 问题在哪  6: 提交合并  7: 做完发版  8: 全部推送'

  test('by default there are no templates and the fork is not asked for a goal', async ($, on) => {
    const world = worldOf(on)
    await completeTurn($)
    expect(world.forkPrompts.length).toBe(1)
    expect(world.forkPrompts[0]).not.toContain('[目标]')
  })

  test('the fork is handed the templates whose [目标] it fills', { options: { templates: [PUSH_AHEAD_ENTRY] } }, async ($, on) => {
    const world = worldOf(on)
    await completeTurn($)
    expect(world.forkPrompts.length).toBe(1)
    expect(world.forkPrompts[0]).toContain(PUSH_AHEAD)
  })

  test('the guessed goal shows on the button and fills the prompt box with the blank filled', { options: { templates: [PUSH_AHEAD_ENTRY] } }, async ($, on) => {
    const world = worldOf(on, [{ goal: GOAL, next: SUGGESTIONS }])
    await completeTurn($)
    expect(linesOf(await $.ui.render(BAND))).toEqual([SUGGESTED_80, `4: 继续推进：${GOAL}`, PHRASES_AFTER_TEMPLATE])
    await $.ui.press({ plugin: NAME, key: 'template:0' })
    expect(world.fills).toEqual([SENT])
    expect(world.submits).toEqual([])
    expect(linesOf(await $.ui.render(BAND))).toEqual([])
  })

  test('before any goal the template fills the prompt box with its blank left in', { options: { templates: [PUSH_AHEAD_ENTRY] } }, async ($, on) => {
    const world = worldOf(on, [{ goal: '', next: [] }])
    await completeTurn($)
    expect(linesOf(await $.ui.render(BAND))).toEqual(['4: 继续推进', PHRASES_AFTER_TEMPLATE])
    await $.ui.press({ plugin: NAME, key: 'template:0' })
    expect(world.fills).toEqual([PUSH_AHEAD])
    expect(world.submits).toEqual([])
  })

  test('the goal stays through an answer too short to guess from', { options: { templates: [PUSH_AHEAD_ENTRY] } }, async ($, on) => {
    worldOf(on, [{ goal: GOAL, next: [] }])
    await completeTurn($, 't1')
    await completeTurn($, 't2', 'ok')
    expect(linesOf(await $.ui.render(BAND))).toEqual([`4: 继续推进：${GOAL}`, PHRASES_AFTER_TEMPLATE])
  })

  test('a later reply with no goal clears the old one', { options: { templates: [PUSH_AHEAD_ENTRY] } }, async ($, on) => {
    worldOf(on, [{ goal: GOAL, next: [] }, { goal: '', next: [] }])
    await completeTurn($, 't1')
    expect(linesOf(await $.ui.render(BAND))).toEqual([`4: 继续推进：${GOAL}`, PHRASES_AFTER_TEMPLATE])
    await completeTurn($, 't2')
    expect(linesOf(await $.ui.render(BAND))).toEqual(['4: 继续推进', PHRASES_AFTER_TEMPLATE])
  })

  test('terminal escapes in the guessed goal are dropped', { options: { templates: [PUSH_AHEAD_ENTRY] } }, async ($, on) => {
    worldOf(on, [{ goal: `\u001b[31m${GOAL}\u001b[0m`, next: [] }])
    await completeTurn($)
    expect(linesOf(await $.ui.render(BAND))).toEqual([`4: 继续推进：${GOAL}`, PHRASES_AFTER_TEMPLATE])
  })
})
