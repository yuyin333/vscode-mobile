import * as vscode from 'vscode'
import { isSupported, loadPlugin } from '../native/autox'

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

export async function setupDraft(): Promise<void> {
  if (!(await isSupported())) return
  const plugin = await loadPlugin<DraftPlugin>('AppController')
  if (typeof (plugin as any).saveDraft !== 'function') {
    console.warn('AppController.saveDraft 不可用（旧 APK），草稿功能停用')
    return
  }

  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const lastFlushed = new Map<string, string>()

  const cancelTimer = (path: string) => {
    const timer = timers.get(path)
    if (timer) {
      clearTimeout(timer)
      timers.delete(path)
    }
  }

  const flush = async (path: string, content: string) => {
    if (content.length > MAX_DRAFT_CHARS) return
    if (lastFlushed.get(path) === content) return
    try {
      await plugin.saveDraft(JSON.stringify({ path, content }))
      lastFlushed.set(path, content)
    } catch (e) {
      console.warn('saveDraft failed:', path, e)
    }
  }

  const schedule = (doc: vscode.TextDocument) => {
    const path = draftPathOf(doc)
    if (!path) return
    cancelTimer(path)
    timers.set(path, setTimeout(() => {
      timers.delete(path)
      if (!doc.isDirty) return
      void flush(path, doc.getText())
    }, DEBOUNCE_MS))
  }

  vscode.workspace.onDidChangeTextDocument((e) => schedule(e.document))

  vscode.workspace.onDidSaveTextDocument((doc) => {
    const path = draftPathOf(doc)
    if (!path) return
    cancelTimer(path)
    lastFlushed.delete(path)
    plugin.clearDraft(JSON.stringify({ path })).catch(() => { })
  })

  // 切后台/被系统回收前的最后一次机会：立刻落盘所有脏文档
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return
    for (const doc of vscode.workspace.textDocuments) {
      const path = draftPathOf(doc)
      if (path && doc.isDirty) {
        cancelTimer(path)
        void flush(path, doc.getText())
      }
    }
  })
}

// 与 features/intellisense 一致：import 即生效，由 core/app.ts 引入
void setupDraft()

