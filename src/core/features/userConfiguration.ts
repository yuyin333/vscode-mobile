import {
    updateUserConfiguration, onUserConfigurationChange, getUserConfiguration, initUserConfiguration
} from '@codingame/monaco-vscode-configuration-service-override'
import { useStorage } from '@vueuse/core'

const defaultConfiguration: string = JSON.stringify({
    "editor.minimap.enabled": false,
    "editor.scrollbar.horizontalScrollbarSize": 6,
    "editor.scrollbar.verticalScrollbarSize": 6,
    "files.autoSave": "off",
    "editor.tabSize": 2,
    // 手机屏窄：14px 起步、1.5 倍行高更好点；不折行的话长行必须左右拖
    "editor.fontSize": 14,
    "editor.lineHeight": 21,
    "editor.wordWrap": "on",
    // 面包屑占一行高度且触屏几乎用不到
    "breadcrumbs.enabled": false,
}, undefined, 2)
const userConfiguration = useStorage('userConfiguration', defaultConfiguration)

await updateUserConfiguration(userConfiguration.value)
onUserConfigurationChange(async () => {
    const configuration = await getUserConfiguration()
    userConfiguration.value = configuration
})


export default userConfiguration