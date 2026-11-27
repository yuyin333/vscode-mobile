import * as monaco from 'monaco-editor'
import { editor } from 'monaco-editor'
import { registerDebugEditor } from './features/debug'

const defaultOptions: editor.IEditorOptions = {
    lineNumbersMinChars: 3,
    // 断点圆点画在 glyph margin 上，关掉这一栏就点不出断点
    glyphMargin: true,
}

monaco.editor.onDidCreateEditor((codeEditor) => {
    console.log('Editor created');

    const options = codeEditor.getRawOptions()
    setTimeout(() => {
        codeEditor.updateOptions(Object.assign(options, defaultOptions))
    }, 500)

    // 断点 gutter 点击 + 断点/当前行装饰
    registerDebugEditor(codeEditor)
})