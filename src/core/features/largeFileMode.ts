import * as vscode from 'vscode'
import {
  getUserConfiguration,
  updateUserConfiguration,
} from '@codingame/monaco-vscode-configuration-service-override'

/**
 * 大文件模式。
 *
 * 手机 WebView 的内存/CPU 都紧张：几千行以上的脚本一旦开启语义高亮、代码折叠、
 * 缩进参考线这些「每次编辑都要重算」的特性，输入会明显掉帧甚至卡住。
 * 超过阈值时临时关掉这些开销大户，离开大文件后按原样恢复。
 *
 * 阈值 5000 行：2000 行太激进，正常业务脚本也会过线；5000 行以上才真的开始难编辑。
 */
const LARGE_FILE_LINES = 5000

/** 只关「持续计算」的项：语法高亮、折行、字号这些静态渲染的保留，不然没法读代码 */
const OVERRIDES: Record<string, unknown> = {
  'editor.semanticHighlighting.enabled': false,
  'editor.occurrencesHighlight': false,
  'editor.codeLens': false,
  'editor.folding': false,
  'editor.guides.indentation': false,
  'editor.minimap.enabled': false,
  'breadcrumbs.enabled': false,
}

/** 进入大文件前的完整配置快照；null 表示当前不在大文件模式 */
let savedConfig: string | null = null

function isLargeDocument(doc: vscode.TextDocument | undefined): boolean {
  if (!doc) return false
  // 只看用户脚本；settings.json 之类不参与
  if (doc.uri.scheme !== 'autox') return false
  return doc.lineCount > LARGE_FILE_LINES
}

async function sync(): Promise<void> {
  const doc = vscode.window.activeTextEditor?.document
  const large = isLargeDocument(doc)

  if (large && savedConfig === null) {
    try {
      // 快照整份配置而不是逐个键：离开时整体写回，避免"原本没设过的键"留下痕迹
      savedConfig = await getUserConfiguration()
      const config = JSON.parse(savedConfig)
      Object.assign(config, OVERRIDES)
      await updateUserConfiguration(JSON.stringify(config, null, 2))
      vscode.window.setStatusBarMessage(
        `大文件模式：${doc!.lineCount} 行，已关闭语义高亮/代码折叠等以保持流畅`,
        6000,
      )
    } catch (e) {
      savedConfig = null
      console.warn('大文件模式应用失败:', e)
    }
    return
  }

  if (!large && savedConfig !== null) {
    try {
      await updateUserConfiguration(savedConfig)
    } catch (e) {
      console.warn('大文件模式恢复失败:', e)
    }
    savedConfig = null
  }
}

export function setupLargeFileMode(): void {
  vscode.window.onDidChangeActiveTextEditor(() => { void sync() })
  // 打开文件是异步的：启动瞬间 activeTextEditor 往往还是空的，补两次判断
  setTimeout(() => { void sync() }, 1200)
  setTimeout(() => { void sync() }, 3000)
}

void setupLargeFileMode()
