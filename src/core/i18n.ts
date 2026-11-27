import { appLanguage } from './features/appAppearance'

/**
 * 编辑器自带 UI（工具栏 / 调试面板）的文案。
 *
 * 为什么不用 i18n 库：只有两个语言、几十个键，且这里要跟的是 App 的语言设置
 * （由 URL 的 locale 带来），不需要走 VS Code 的 NLS 体系。
 */

const zh: Record<string, string> = {
    menu: '菜单',
    file: '文件',
    edit: '编辑',
    run: '运行',
    debug: '调试',
    stop: '停止',
    breakpoint: '断点',
    undo: '撤销',
    redo: '重做',
    save: '保存',
    openFile: '打开文件',
    openFolder: '打开文件夹',
    findReplace: '查找/替换',
    gotoLine: '跳转',
    foldAll: '折叠/展开',
    runCommand: '执行命令',
    formatDocument: '格式化文档',
    formatError: '格式化出错！',
    openFileFirst: '请打开文件后再运行！',
    noApi: '没有接口！',
    openFileFirstDebug: '请打开文件后再调试！',
    moveCursor: '请先把光标放在要下断点的行',
    breakpointToggled: '第 {line} 行断点已切换',
    paused: '暂停',
    line: '行',
    continue: '继续',
    stepOver: '跳过',
    stepInto: '进入',
    stepOut: '跳出',
    evalPlaceholder: '表达式，如 auto.device.width',
    evaluate: '求值',
    selectWord: '选择单词',
    selectLine: '选择整行',
    selectAll: '全选',
}

const en: Record<string, string> = {
    menu: 'Menu',
    file: 'File',
    edit: 'Edit',
    run: 'Run',
    debug: 'Debug',
    stop: 'Stop',
    breakpoint: 'Break',
    undo: 'Undo',
    redo: 'Redo',
    save: 'Save',
    openFile: 'Open File',
    openFolder: 'Open Folder',
    findReplace: 'Find/Replace',
    gotoLine: 'Go to Line',
    foldAll: 'Fold/Unfold All',
    runCommand: 'Run Command',
    formatDocument: 'Format Document',
    formatError: 'Format failed!',
    openFileFirst: 'Open a file before running!',
    noApi: 'No native bridge!',
    openFileFirstDebug: 'Open a file before debugging!',
    moveCursor: 'Put the cursor on the line you want to break at',
    breakpointToggled: 'Breakpoint toggled at line {line}',
    paused: 'Paused',
    line: 'line',
    continue: 'Continue',
    stepOver: 'Step Over',
    stepInto: 'Step Into',
    stepOut: 'Step Out',
    evalPlaceholder: 'Expression, e.g. auto.device.width',
    evaluate: 'Eval',
    selectWord: 'Select Word',
    selectLine: 'Select Line',
    selectAll: 'Select All',
}

const dict = appLanguage === 'zh' ? zh : en

export function t(key: string, vars?: Record<string, string | number>): string {
    let text = dict[key] ?? zh[key] ?? key
    if (vars) {
        for (const [k, v] of Object.entries(vars)) {
            text = text.replace(`{${k}}`, String(v))
        }
    }
    return text
}
