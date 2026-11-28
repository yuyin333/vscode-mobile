import * as vscode from 'vscode'
import {
  getUserConfiguration,
  updateUserConfiguration,
} from '@codingame/monaco-vscode-configuration-service-override'
import { isLargeDocument, LARGE_FILE_LINES, LARGE_FILE_OVERRIDES } from './largeFileRules'

/**
 * 大文件模式：超过 LARGE_FILE_LINES 行时临时关掉语义高亮、代码折叠、codeLens、
 * 缩进参考线、minimap、breadcrumbs，离开大文件后按快照整体还原。
 * 判定规则在 largeFileRules.ts（纯函数，有单测）。
 */

/** 进入大文件前的完整配置快照；null 表示当前不在大文件模式 */
let savedConfig: string | null = null

async function sync(): Promise<void> {
  const doc = vscode.window.activeTextEditor?.document
  const large = isLargeDocument(doc)

  if (large && savedConfig === null) {
    try {
      // 快照整份配置而不是逐个键：离开时整体写回，避免"原本没设过的键"留下痕迹
      savedConfig = await getUserConfiguration()
      const config = JSON.parse(savedConfig)
      Object.assign(config, LARGE_FILE_OVERRIDES)
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
