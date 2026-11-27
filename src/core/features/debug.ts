import { ref } from 'vue'
import * as vscode from 'vscode'
import { useStorage } from '@vueuse/core'
import * as monaco from 'monaco-editor'
import { isSupported, loadPlugin } from '../native/autox'
import getAutoxBridge from '../native/autox/bridge.d'

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
export const debugRunning = ref(false)
export const debugStopped = ref<DebugStopped | null>(null)
export const debugValue = ref('')

/** path -> 断点行号(1-based)。持久化到 localStorage：换文件/重进编辑器不丢 */
export const debugBreakpoints = useStorage<Record<string, number[]>>('debugBreakpoints', {})

let plugin: DebugPluginApi | null = null
const editors = new Set<monaco.editor.ICodeEditor>()
const decorationIds = new Map<monaco.editor.ICodeEditor, string[]>()

const CSS_BREAKPOINT = 'autox-debug-breakpoint'
const CSS_CURRENT = 'autox-debug-current-line'

function pathOf(model: monaco.editor.ITextModel | null): string {
  return model?.uri.path ?? ''
}

function decorationsFor(editor: monaco.editor.ICodeEditor) {
  const model = editor.getModel()
  const path = pathOf(model)
  const result: monaco.editor.IModelDeltaDecoration[] = []
  for (const line of debugBreakpoints.value[path] ?? []) {
    result.push({
      range: new monaco.Range(line, 1, line, 1),
      options: {
        isWholeLine: false,
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
  for (const editor of editors) {
    if (!editor.getModel()) continue
    const previous = decorationIds.get(editor) ?? []
    decorationIds.set(editor, editor.deltaDecorations(previous, decorationsFor(editor)))
  }
}

function revealStoppedLine() {
  const stopped = debugStopped.value
  if (!stopped) return
  for (const editor of editors) {
    const path = pathOf(editor.getModel())
    if (path && stopped.url.endsWith(path)) {
      editor.revealLineInCenter(stopped.line)
    }
  }
}

/** setup_monaco 里每创建一个编辑器就注册进来，用来画断点/当前行 */
export function registerDebugEditor(editor: monaco.editor.ICodeEditor) {
  editors.add(editor)
  editor.onDidDispose(() => {
    editors.delete(editor)
    decorationIds.delete(editor)
  })
  editor.onMouseDown((e) => {
    if (e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) {
      const line = e.target.position?.lineNumber
      if (line) void toggleBreakpoint(line)
    }
  })
  refreshDebugDecorations()
}

function currentPath(): string {
  return vscode.window.activeTextEditor?.document.uri.path ?? ''
}

export async function toggleBreakpoint(line: number, path = currentPath()) {
  if (!path) return
  const list = debugBreakpoints.value[path] ?? []
  const enabled = !list.includes(line)
  const next = enabled ? [...list, line].sort((a, b) => a - b) : list.filter((l) => l !== line)
  debugBreakpoints.value = { ...debugBreakpoints.value, [path]: next }
  refreshDebugDecorations()
  if (plugin && debugRunning.value) {
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
  // 重新下发当前文件已有的断点（原生 stop 时会清空）
  for (const line of debugBreakpoints.value[path] ?? []) {
    await plugin.toggleBreakpoint(JSON.stringify({ line, enabled: true })).catch(() => { })
  }
  await plugin.start(JSON.stringify({ path }))
  debugRunning.value = true
  debugStopped.value = null
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
}

void setupDebug()
