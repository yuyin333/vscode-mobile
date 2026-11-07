import * as prettier from 'prettier'
import * as vscode from 'vscode'
import userConfiguration from '../features/userConfiguration'
import { ref, watchEffect } from 'vue'
import { useStorage } from '@vueuse/core'

// 默认开启：VSIX 版 prettier 扩展依赖 extension-file:// 协议（WebView 里不可用，激活必然失败），
// 所以「格式化」改走随包内置的 prettier，避免开箱即坏。
export const enable = useStorage<boolean>('prettier.enable', true)
const options: prettier.Options = {
    // parser: 'babel',
    // plugins: [babel, estree, typescript, html, markdown]
}

watchEffect(() => {
    const cnf = JSON.parse(userConfiguration.value)
    if (cnf['prettier.enable'] !== undefined) {
        enable.value = cnf['prettier.enable']
    }
    options.semi = cnf['prettier.semi']
    options.arrowParens = cnf['prettier.arrowParens']
    options.bracketSameLine = cnf['prettier.bracketSameLine']
    options.bracketSpacing = cnf['prettier.bracketSpacing']
    options.embeddedLanguageFormatting = cnf['prettier.embeddedLanguageFormatting']
    options.endOfLine = cnf['prettier.endOfLine']
    options.htmlWhitespaceSensitivity = cnf['prettier.htmlWhitespaceSensitivity']
    options.insertPragma = cnf['prettier.insertPragma']
    options.jsxSingleQuote = cnf['prettier.jsxSingleQuote']
    options.printWidth = cnf['prettier.printWidth']
    options.proseWrap = cnf['prettier.proseWrap']
    options.quoteProps = cnf['prettier.quoteProps']
    options.requirePragma = cnf['prettier.requirePragma']
    options.singleAttributePerLine = cnf['prettier.singleAttributePerLine']
    options.singleQuote = cnf['prettier.singleQuote']
    options.tabWidth = cnf['prettier.tabWidth']
    options.trailingComma = cnf['prettier.trailingComma']
    options.useTabs = cnf['prettier.useTabs']
    options.vueIndentScriptAndStyle = cnf['prettier.vueIndentScriptAndStyle']
})

async function install() {
    if (enable.value) {
        const plugins: any[] = [
            await import('prettier/plugins/babel'),
            await import('prettier/plugins/estree'),
            await import('prettier/plugins/typescript'),
            await import('prettier/plugins/html'),
            await import('prettier/plugins/markdown')
        ]
        options.plugins = plugins
    }
}

export async function prettierFormat() {
    const editor = vscode.window.activeTextEditor
    if (!editor) return
    await install()
    options.filepath = editor.document.fileName
    const oldCode = editor.document.getText()
    if (await prettier.check(oldCode, options)) return
    const code = await prettier.format(oldCode, options)
    await editor.edit((builder) => {
        // 获取文本的范围
        const fullRange = new vscode.Range(0, 0, editor.document.lineCount, 0);
        builder.replace(fullRange, code)
    })
}

// 注册成标准「格式化文档」提供者：VS Code 的格式化命令/快捷键与工具栏共用内置 prettier，
// 不再依赖激活失败的 VSIX 扩展（它需要 extension-file:// 协议，WebView 里不可用）。
vscode.languages.registerDocumentFormattingEditProvider(
    [{ language: 'javascript' }, { language: 'typescript' }, { language: 'json' }],
    {
        async provideDocumentFormattingEdits(document) {
            await install()
            const text = document.getText()
            const formatted = await prettier.format(text, {
                ...options,
                filepath: document.fileName
            })
            if (formatted === text) return []
            const fullRange = new vscode.Range(
                document.positionAt(0),
                document.positionAt(text.length)
            )
            return [vscode.TextEdit.replace(fullRange, formatted)]
        }
    }
)
install()