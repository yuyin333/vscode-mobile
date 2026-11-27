import { ref } from 'vue'
import * as vscode from 'vscode'
import { useStorage } from '@vueuse/core'
import * as monaco from 'monaco-editor'
import { isSupported, loadPlugin } from '../native/autox'
import getAutoxBridge from '../native/autox/bridge.d'
import { t } from '../i18n'

type CodeEditor = monaco.editor.ICodeEditor

/**
 * 断点调试（web 侧）。
 *
 * 调试内核在原生：Debugger + Dim（Rhino 自带），原生负责执行脚本、挂断点、暂停/单步，
 * 这里只做三件事：启动/停止、把断点行号存下来同步给原生、把暂停事件画到编辑器上。
 *
 * 注意：原生调试跑的是「磁盘上的文件」，未保存的修改不参与调试（与旧编辑器一致）。
 */
interface DebugPluginApi {
  start(data: string): Promise<string | undefined>
  stop(data: string): Promise<string | undefined>
  toggleBreakpoint(data: string): Promise<string | undefined>
  clearBreakpoints(data: string): Promise<string | undefined>
  resume(data: string): Promise<string | undefined>
  stepOver(data: string): Promise<string | undefined>
  stepInto(data: string): Promise<string | undefined>
  stepOut(data: string): Promise<string | undefined>
  eval(data: string): Promise<string | undefined>
}

export interface DebugStopped {
  url: string
  line: number
  reason: string
}

export const debugSupported = ref(false)
/**
 * 是否在工具栏显示调试入口。
 * 已真机跑通：断点命中 → eval → 单步 → 继续。
 * 原生 Debugger 只能跑在脚本进程，主进程经 ScriptBinder 转发 + 250ms 轮询暂停状态。
 */
export const debugUiEnabled = ref(true)
export const debugRunning = ref(false)
export const debugStopped = ref<DebugStopped | null>(null)
export const debugValue = ref('')

/** path -> 断点行号(1-based)。持久化到 localStorage：换文件/重进编辑器不丢 */
export const debugBreakpoints = useStorage<Record<string, number[]>>('debugBreakpoints', {})

let plugin: DebugPluginApi | null = null
const editors = new Set<CodeEditor>()
const decorationIds = new Map<CodeEditor, string[]>()
const attached = new WeakSet<CodeEditor>()

const CSS_BREAKPOINT = 'autox-debug-breakpoint'
const CSS_BREAKPOINT_LINE = 'autox-debug-breakpoint-line'
const CSS_CURRENT = 'autox-debug-current-line'

function pathOf(model: monaco.editor.ITextModel | null): string {
  return model?.uri.path ?? ''
}

function decorationsFor(editor: monaco.editor.ICodeEditor) {
  const model = editor.getModel()
  const path = pathOf(model)
  const result: monaco.editor.IModelDeltaDecoration[] = []
  for (const line of debugBreakpoints.value[path] ?? []) {
    // 整行底色 +（若可用）glyph 圆点：手机屏上 glyph margin 往往不可见/太窄，
    // 只靠圆点用户看不出断点到底有没有下上
    result.push({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: true,
        className: CSS_BREAKPOINT_LINE,
        glyphMarginClassName: CSS_BREAKPOINT,
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      },
    })
  }
  const stopped = debugStopped.value
  // 原生给的 url 是文件绝对路径，与 model.uri.path 一致（autox:// 的 path 就是设备路径）
  if (stopped && path && stopped.url.endsWith(path)) {
    result.push({
      range: new monaco.Range(stopped.line, 1, stopped.line, 1),
      options: {
        isWholeLine: true,
        className: CSS_CURRENT,
        stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
      },
    })
  }
  return result
}

export function refreshDebugDecorations() {
  for (const editor of allEditors()) {
    if (!editor.getModel()) continue
    const previous = decorationIds.get(editor) ?? []
    decorationIds.set(editor, editor.deltaDecorations(previous, decorationsFor(editor)))
  }
}

function revealStoppedLine() {
  const stopped = debugStopped.value
  if (!stopped) return
  for (const editor of allEditors()) {
    const path = pathOf(editor.getModel())
    if (path && stopped.url.endsWith(path)) {
      editor.revealLineInCenter(stopped.line)
    }
  }
}

/** 已注册过监听器的编辑器；setup_monaco 的动态 import 可能晚于首次创建，所以这里兜底 */
function allEditors(): CodeEditor[] {
  const set = new Set<CodeEditor>(editors)
  for (const e of monaco.editor.getEditors()) set.add(e)
  for (const e of set) attachEditor(e)
  return [...set]
}

export interface TouchMenuState {
  // 相对 WebView 视口的 CSS px
  x: number
  y: number
}

/** 长按菜单状态；null = 不显示 */
export const touchMenu = ref<TouchMenuState | null>(null)

/** 当前有焦点的编辑器，供长按菜单执行动作 */
let activeEditor: CodeEditor | null = null

export function getActiveEditor(): CodeEditor | null {
  if (activeEditor && activeEditor.getModel()) return activeEditor
  const list = monaco.editor.getEditors()
  activeEditor = list.find((e) => e.hasTextFocus()) ?? list[0] ?? null
  return activeEditor
}

export function closeTouchMenu() {
  touchMenu.value = null
}

export function selectWordAtCursor() {
  const editor = getActiveEditor()
  const position = editor?.getPosition()
  const model = editor?.getModel()
  if (!editor || !position || !model) return
  const word = model.getWordAtPosition(position)
  if (word) {
    editor.setSelection(new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn))
  }
}

export function selectCurrentLine() {
  const editor = getActiveEditor()
  const position = editor?.getPosition()
  const model = editor?.getModel()
  if (!editor || !position || !model) return
  editor.setSelection(new monaco.Range(position.lineNumber, 1, position.lineNumber, model.getLineMaxColumn(position.lineNumber)))
}

export function selectAllText() {
  const editor = getActiveEditor()
  const model = editor?.getModel()
  if (editor && model) editor.setSelection(model.getFullModelRange())
}

export function runClipboardAction(action: 'copy' | 'cut' | 'paste') {
  const editor = getActiveEditor()
  if (!editor) return
  const id = action === 'copy'
    ? 'editor.action.clipboardCopyAction'
    : action === 'cut'
      ? 'editor.action.clipboardCutAction'
      : 'editor.action.clipboardPasteAction'
  void (editor as unknown as { getAction?: (id: string) => { run: () => Promise<void> } | null })
    .getAction?.(id)?.run()
}

function attachEditor(editor: CodeEditor) {
  if (attached.has(editor)) return
  attached.add(editor)
  editors.add(editor)
  editor.onDidDispose(() => {
    editors.delete(editor)
    decorationIds.delete(editor)
  })
  // 换文件后要重画：断点是按 path 存的
  editor.onDidChangeModel(() => refreshDebugDecorations())
  editor.onDidFocusEditorWidget?.(() => { activeEditor = editor })
  // 长按（Android 触发 contextmenu）弹我们自己的菜单：
  // VS Code 自带菜单里全是 Go to Definition / Refactor 这类手机上用不到的东西，
  // 而「选择单词/整行/全选」在触屏上才是刚需。捕获阶段拦掉原生菜单。
  const domNode = editor.getDomNode()
  domNode?.addEventListener('contextmenu', (event) => {
    event.preventDefault()
    event.stopPropagation()
    activeEditor = editor
    const target = (editor as unknown as {
      getTargetAtClientPoint?: (x: number, y: number) => { position?: monaco.Position } | null
    }).getTargetAtClientPoint?.(event.clientX, event.clientY)
    if (target?.position) editor.setPosition(target.position)
    touchMenu.value = { x: event.clientX, y: event.clientY }
  }, true)
  editor.onMouseDown((e) => {
    // 手机上没有鼠标悬停提示，glyph margin 又窄，行号栏也一起当作断点开关
    const type = e.target.type
    if (
      type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
      type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS
    ) {
      const line = e.target.position?.lineNumber
      if (line) void toggleBreakpoint(line)
    }
  })
}

/** setup_monaco 里每创建一个编辑器就注册进来，用来画断点/当前行 */
export function registerDebugEditor(editor: CodeEditor) {
  attachEditor(editor)
  refreshDebugDecorations()
}

/**
 * 取当前文件路径。
 * 这个 fork 里 `vscode.window.activeTextEditor` 不一定可靠（workbench 只挂了一个编辑器实例），
 * 拿到空串会让断点存不下来，所以逐级回退到 monaco 的编辑器/模型。
 */
function currentPath(): string {
  const active = vscode.window.activeTextEditor?.document.uri.path
  if (active) return active
  const list = monaco.editor.getEditors()
  const focused = list.find((e) => e.hasTextFocus()) ?? list[0]
  return pathOf(focused?.getModel() ?? null)
}

export async function toggleBreakpoint(line: number, path = currentPath()) {
  if (!path) return
  const list = debugBreakpoints.value[path] ?? []
  const enabled = !list.includes(line)
  const next = enabled ? [...list, line].sort((a, b) => a - b) : list.filter((l) => l !== line)
  debugBreakpoints.value = { ...debugBreakpoints.value, [path]: next }
  refreshDebugDecorations()
  // 不论是否在运行都同步给原生：脚本进程里保留一份，start 时少一次往返；
  // 脚本进程没起来时原生会吞掉（debug.ts 的 catch），断点仍以 web 侧为准
  if (plugin) {
    plugin.toggleBreakpoint(JSON.stringify({ line, enabled })).catch(() => { })
  }
}

export async function clearBreakpoints() {
  const path = currentPath()
  if (path) debugBreakpoints.value = { ...debugBreakpoints.value, [path]: [] }
  refreshDebugDecorations()
  if (plugin) plugin.clearBreakpoints('{}').catch(() => { })
}

export async function startDebug(path = currentPath()) {
  if (!plugin || !path) return
  // 原生按行号下断点，行号来自磁盘文件；未保存的修改会让行号错位
  const doc = vscode.workspace.textDocuments.find((d) => d.uri.path === path)
  if (doc?.isDirty) {
    await vscode.window.showWarningMessage('调试运行的是已保存到磁盘的内容，请先保存再调试')
  }
  // 必须先置 true：短脚本可能在 start 返回前就跑完并发出 onExited，
  // 若在 await 之后再置 true，会把已经复位成 false 的状态又改回运行中
  debugRunning.value = true
  debugStopped.value = null
  try {
    // 重新下发当前文件已有的断点（原生 stop 时会清空）
    for (const line of debugBreakpoints.value[path] ?? []) {
      await plugin.toggleBreakpoint(JSON.stringify({ line, enabled: true })).catch(() => { })
    }
    await plugin.start(JSON.stringify({ path }))
  } catch (e) {
    debugRunning.value = false
    throw e
  }
  refreshDebugDecorations()
}

export async function stopDebug() {
  if (!plugin) return
  await plugin.stop('{}').catch(() => { })
  debugRunning.value = false
  debugStopped.value = null
  refreshDebugDecorations()
}

export async function step(action: 'resume' | 'stepOver' | 'stepInto' | 'stepOut') {
  if (!plugin) return
  debugStopped.value = null
  refreshDebugDecorations()
  await plugin[action]('{}').catch(() => { })
}

export async function evaluate(expr: string): Promise<string> {
  if (!plugin || !expr) return ''
  const value = await plugin.eval(JSON.stringify({ expr })).catch(() => undefined)
  return value ?? ''
}

export async function setupDebug(): Promise<void> {
  if (!(await isSupported())) return
  try {
    plugin = await loadPlugin<DebugPluginApi>('DebugPlugin')
    debugSupported.value = typeof plugin.start === 'function'
  } catch (e) {
    console.warn('DebugPlugin unavailable:', e)
    return
  }
  if (!debugSupported.value) return

  const bridge = await getAutoxBridge()
  bridge.registerHandler('debug.onStopped', (data) => {
    try {
      const stopped = JSON.parse(data) as DebugStopped
      debugRunning.value = true
      debugStopped.value = stopped
      debugValue.value = ''
      refreshDebugDecorations()
      revealStoppedLine()
    } catch (e) {
      console.warn('bad debug.onStopped payload:', data)
    }
  })
  bridge.registerHandler('debug.onRunning', () => {
    debugRunning.value = true
  })
  bridge.registerHandler('debug.onExited', () => {
    debugRunning.value = false
    debugStopped.value = null
    refreshDebugDecorations()
  })

  // 打开文件后才创建编辑器，且 setup_monaco 可能比它晚；等编辑器出现再画一次，
  // 否则上次留下的断点要等用户手动点一下才显示
  let tries = 0
  const timer = setInterval(() => {
    tries++
    if (allEditors().length > 0) {
      refreshDebugDecorations()
      clearInterval(timer)
      return
    }
    if (tries > 60) clearInterval(timer)
  }, 1000)
}

void setupDebug()

// ---------------------------------------------------------------------------
// 真机排查钩子：编辑器的问题（gutter 命中、当前文档路径）只靠截图猜代价太高，
// debug 包的 WebView 已开 CDP，这里把状态和动作暴露到 window，便于
// `node tools/cdp_eval.mjs "__autoxDebug.state()"` 直接看。
// 不带任何敏感信息，只读编辑器内部状态。
// ---------------------------------------------------------------------------
;(window as any).__autoxDebug = {
  state: () => ({
    supported: debugSupported.value,
    uiEnabled: debugUiEnabled.value,
    running: debugRunning.value,
    stopped: debugStopped.value,
    breakpoints: debugBreakpoints.value,
    path: currentPath(),
    registeredEditors: editors.size,
    monacoEditors: monaco.editor.getEditors().length,
    models: monaco.editor.getModels().map((m) => ({ scheme: m.uri.scheme, path: m.uri.path })),
    activePath: vscode.window.activeTextEditor?.document.uri.path ?? null,
    documents: vscode.workspace.textDocuments.map((d) => ({
      scheme: d.uri.scheme, path: d.uri.path, dirty: d.isDirty,
    })),
  }),
  toggle: (line: number) => toggleBreakpoint(line),
  start: (path?: string) => startDebug(path),
  stop: () => stopDebug(),
  step: (action: 'resume' | 'stepOver' | 'stepInto' | 'stepOut') => step(action),
  evaluate: (expr: string) => evaluate(expr),
}

