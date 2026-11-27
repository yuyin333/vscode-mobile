import * as monaco from 'monaco-editor'

/**
 * 键盘遮挡处理。
 *
 * 原生侧把「被键盘盖住的高度（设备 px）」通过 app.onImeHeight 下发；
 * 这里换算成 CSS px 写到 `--autox-ime-height`，样式表据此把工作区高度减去它，
 * 于是编辑器内容不会被键盘盖住。
 *
 * 为什么要自己做：只靠 Android 的 adjustResize 在悬浮键盘/平板上不生效，
 * 那些设备上窗口根本不会 resize，WebView 依旧全高。
 */
export function applyImeHeight(devicePx: number) {
  const dpr = window.devicePixelRatio || 1
  const cssPx = Math.max(0, Number(devicePx) || 0) / dpr
  document.documentElement.style.setProperty('--autox-ime-height', `${Math.round(cssPx)}px`)
  if (cssPx <= 0) return
  // 工作区变矮后光标可能落到可视区外，主动滚回来
  requestAnimationFrame(() => {
    for (const editor of monaco.editor.getEditors()) {
      if (!editor.hasTextFocus()) continue
      const position = editor.getPosition()
      if (position) editor.revealPositionInCenterIfOutsideViewport(position)
    }
  })
}

// 真机排查：debug 包可用 CDP 调 __autoxIme(600) 验证让位效果
;(window as any).__autoxIme = applyImeHeight
