import * as vscode from 'vscode'
import { isSupported, loadPlugin } from '../native/autox'
import getAutoxBridge from '../native/autox/bridge.d'

/**
 * 草稿（未保存内容）兜底。
 *
 * 背景：web 侧 files.autoSave=off，用户敲的内容只活在 Monaco 内存里；
 * 一旦 App 被强杀 / 进程被系统回收，内容全丢（原生侧没有任何副本）。
 *
 * 做法：脏文档防抖 1.5s 把全文推给原生 AppController.saveDraft 落盘，
 * 保存成功即 clearDraft；原生在下次打开同一文件时自己弹「恢复」对话框。
 * 原生侧恢复 = 用草稿内容原子写回文件（旧内容留 .bak），所以这里不用管应用内容。
 */
interface DraftPlugin {
  saveDraft(data: string): Promise<string | undefined>
  clearDraft(data: string): Promise<string | undefined>
}

/** 防抖窗口：太短会频繁写盘，太长则强杀时丢太多 */
const DEBOUNCE_MS = 1500
/** 超过这个长度不存草稿：每次全文 JSON 过桥代价太高，这类文件本来也不常见 */
const MAX_DRAFT_CHARS = 2 * 1024 * 1024

function draftPathOf(doc: vscode.TextDocument): string | null {
  // 只有 autox:// 下的文件是用户脚本；settings.json 之类没有草稿意义
  if (doc.uri.scheme !== 'autox') return null
  if (doc.isClosed) return null
  return doc.uri.path
}

let plugin: DraftPlugin | null = null
const timers = new Map<string, ReturnType<typeof setTimeout>>()
const lastFlushed = new Map<string, string>()

function cancelTimer(path: string) {
  const timer = timers.get(path)
  if (timer) {
    clearTimeout(timer)
    timers.delete(path)
  }
}

async function flush(path: string, content: string) {
  if (!plugin) return
  if (content.length > MAX_DRAFT_CHARS) return
  if (lastFlushed.get(path) === content) return
  try {
    await plugin.saveDraft(JSON.stringify({ path, content }))
    lastFlushed.set(path, content)
  } catch (e) {
    console.warn('saveDraft failed:', path, e)
  }
}

function schedule(doc: vscode.TextDocument) {
  const path = draftPathOf(doc)
  if (!path) return
  cancelTimer(path)
  timers.set(path, setTimeout(() => {
    timers.delete(path)
    if (!doc.isDirty) return
    void flush(path, doc.getText())
  }, DEBOUNCE_MS))
}

export async function setupDraft(): Promise<void> {
  if (!(await isSupported())) return
  const loaded = await loadPlugin<DraftPlugin>('AppController')
  if (typeof (loaded as any).saveDraft !== 'function') {
    console.warn('AppController.saveDraft 不可用（旧 APK），草稿功能停用')
    return
  }
  plugin = loaded

  vscode.workspace.onDidChangeTextDocument((e) => schedule(e.document))

  vscode.workspace.onDidSaveTextDocument((doc) => {
    const path = draftPathOf(doc)
    if (!path) return
    cancelTimer(path)
    lastFlushed.delete(path)
    plugin?.clearDraft(JSON.stringify({ path })).catch(() => { })
  })

  // 切后台/被系统回收前的最后一次机会：立刻落盘所有脏文档
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return
    void flushAllDrafts()
  })

  // 原生侧「返回即释放编辑器」在销毁 WebView 前会等这个回执：
  // 1.5s 防抖 + visibilitychange 都赶不上 Activity.finish() 的销毁时机
  getAutoxBridge().then((bridge) => {
    bridge.registerHandler('app.flushDrafts', (_data, callback) => {
      flushAllDrafts().finally(() => callback && callback('ok'))
    })
  }).catch(() => { })
}

/** 立即把所有脏文档落一次草稿；供原生侧销毁前同步等待 */
export async function flushAllDrafts(): Promise<void> {
  if (!plugin) return
  const pending: Promise<void>[] = []
  for (const doc of vscode.workspace.textDocuments) {
    const path = draftPathOf(doc)
    if (!path || !doc.isDirty) continue
    cancelTimer(path)
    pending.push(flush(path, doc.getText()))
  }
  await Promise.all(pending)
}

// 与 features/intellisense 一致：import 即生效，由 core/app.ts 引入
void setupDraft()

