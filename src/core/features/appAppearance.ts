import { getUserConfiguration, updateUserConfiguration } from '@codingame/monaco-vscode-configuration-service-override'

/**
 * 编辑器的主题与界面语言跟随 App 设置。
 *
 * 原生在 loadUrl 时把 `?theme=dark|light&locale=zh-CN|en-US` 带上（见
 * EditorAppManager.launchPage）。主题可以运行时切换（workbench.colorTheme），
 * 语言只能在页面加载时确定 —— monaco-vscode-api 没有暴露 NLS 的运行时接口，
 * 所以 App 语言变化后要重开编辑器才生效（这点在 README/对接文档里说明）。
 */
const params = new URLSearchParams(location.search)

const THEME_NAME: Record<'dark' | 'light', string> = {
    dark: 'Default Dark Modern',
    light: 'Default Light Modern',
}

/** 取主语言子标签：zh-CN -> zh，en-US -> en；拿不到就按英文 */
export const appLanguage = (params.get('locale') || 'en').split('-')[0].toLowerCase()

export async function applyAppTheme(theme: string) {
    const name = THEME_NAME[theme === 'dark' ? 'dark' : 'light']
    try {
        // updateUserConfiguration 是整体替换：必须先读出当前配置再合并，
        // 否则会把字号/缩进等设置冲掉
        const current = JSON.parse(await getUserConfiguration())
        if (current['workbench.colorTheme'] === name) return
        current['workbench.colorTheme'] = name
        await updateUserConfiguration(JSON.stringify(current, undefined, 2))
    } catch (e) {
        console.warn('applyAppTheme failed:', e)
    }
}

const initialTheme = params.get('theme')
if (initialTheme) void applyAppTheme(initialTheme)
