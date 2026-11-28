import { describe, expect, it } from 'vitest'
import { isLargeDocument, LARGE_FILE_LINES, LARGE_FILE_OVERRIDES } from './largeFileRules'

const doc = (lineCount: number, scheme = 'autox') => ({ uri: { scheme }, lineCount })

describe('isLargeDocument', () => {
  it('超过阈值的脚本进入大文件模式', () => {
    expect(isLargeDocument(doc(LARGE_FILE_LINES + 1))).toBe(true)
    expect(isLargeDocument(doc(20000))).toBe(true)
  })

  it('等于阈值不算大文件（边界是「大于」）', () => {
    expect(isLargeDocument(doc(LARGE_FILE_LINES))).toBe(false)
  })

  it('普通脚本不进入大文件模式', () => {
    expect(isLargeDocument(doc(50))).toBe(false)
    expect(isLargeDocument(doc(4999))).toBe(false)
  })

  it('非 autox 文档即使很长也不处理（settings.json 之类）', () => {
    expect(isLargeDocument(doc(99999, 'file'))).toBe(false)
    expect(isLargeDocument(doc(99999, 'vscode-settings'))).toBe(false)
  })

  it('没有活动文档时安全返回 false', () => {
    expect(isLargeDocument(undefined)).toBe(false)
    expect(isLargeDocument(null)).toBe(false)
  })
})

describe('LARGE_FILE_OVERRIDES', () => {
  it('关闭的是持续计算类特性，保留语法高亮与折行', () => {
    expect(LARGE_FILE_OVERRIDES['editor.semanticHighlighting.enabled']).toBe(false)
    expect(LARGE_FILE_OVERRIDES['editor.occurrencesHighlight']).toBe(false)
    expect(LARGE_FILE_OVERRIDES['editor.folding']).toBe(false)
    expect(LARGE_FILE_OVERRIDES['editor.minimap.enabled']).toBe(false)
    expect(LARGE_FILE_OVERRIDES['breadcrumbs.enabled']).toBe(false)
    // 这几项不能关，否则大文件就没法读了
    expect(LARGE_FILE_OVERRIDES['editor.wordWrap']).toBeUndefined()
    expect(LARGE_FILE_OVERRIDES['editor.fontSize']).toBeUndefined()
  })
})
