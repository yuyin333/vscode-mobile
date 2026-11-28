/**
 * 大文件模式的判定规则（纯函数，便于单测；副作用都在 largeFileMode.ts）。
 *
 * 手机 WebView 的内存/CPU 都紧张：几千行以上的脚本一旦开启语义高亮、代码折叠、
 * 缩进参考线这些「每次编辑都要重算」的特性，输入会明显掉帧甚至卡住。
 */
export const LARGE_FILE_LINES = 5000

/** 只关「持续计算」的项：语法高亮、折行、字号这些静态渲染的保留，不然没法读代码 */
export const LARGE_FILE_OVERRIDES: Record<string, unknown> = {
  'editor.semanticHighlighting.enabled': false,
  'editor.occurrencesHighlight': false,
  'editor.codeLens': false,
  'editor.folding': false,
  'editor.guides.indentation': false,
  'editor.minimap.enabled': false,
  'breadcrumbs.enabled': false,
}

/** 只依赖 uri.scheme 与 lineCount，方便测试时传轻量对象 */
export interface LargeFileCandidate {
  uri: { scheme: string }
  lineCount: number
}

export function isLargeDocument(doc: LargeFileCandidate | undefined | null): boolean {
  if (!doc) return false
  // 只看用户脚本；settings.json 之类不参与
  if (doc.uri.scheme !== 'autox') return false
  return doc.lineCount > LARGE_FILE_LINES
}
