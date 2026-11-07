<template >
    <div @touchstart="updateInputBox" @click="resetFocus" v-show="show" class="main">
        <div style="height: 100%;width: 140px;">
            <Space.Compact class="warp" size="middle" wrap>
                <Button class="button" type="text" @click="test('0')" :icon="h(IonIcon, { icon: logoNodejs })"></Button>
                <Button class="button" type="text" @click="selection" :icon="h(IonIcon, { icon: crop })"></Button>
                <Button class="button" type="text" @click="moveCursorByOffset(-1, 0)"
                    :icon="h(IonIcon, { icon: chevronUp })"></Button>
                <Button class="button" type="text" @click="copySelection" :icon="h(IonIcon, { icon: copy })"></Button>
                <Button class="button" type="text" @click="inputText('\t')"
                    :icon="h(IonIcon, { icon: swapHorizontal })"></Button>
                <Button class="button" type="text" @click="moveCursorByOffset(0, -1)"
                    :icon="h(IonIcon, { icon: chevronBack })"></Button>
                <Button class="button" type="text" @click="moveCursorByOffset(1, 0)"
                    :icon="h(IonIcon, { icon: chevronDown })"></Button>
                <Button class="button" type="text" @click="moveCursorByOffset(0, 1)"
                    :icon="h(IonIcon, { icon: chevronForward })"></Button>
            </Space.Compact>
        </div>
        <div style="height: 100%;overflow: auto;flex: 1;">
            <Space.Compact class="warp" size="middle" wrap>
                <!-- 触摸选区难定位时的兜底：整行/整词/全文，放在最前面保证不用横向滚动就能点到 -->
                <Button class="button" type="text" @click="selectLine">行</Button>
                <Button class="button" type="text" @click="selectWord">词</Button>
                <Button class="button" type="text" @click="selectAll">全</Button>
                <Button @click="inputText(symbol.insertText)" class="button" v-for="(symbol, i) in symbols" :key="i"
                    type="text">{{ symbol.hint }}</Button>
            </Space.Compact>
        </div>
    </div>
</template>
<script setup lang="ts">
import { ref, computed, h, onMounted, onUnmounted } from "vue"
import { Button, Space, } from 'ant-design-vue'
import { crop, chevronBack, chevronForward, chevronDown, newspaper, chevronUp, copy, logoNodejs, swapHorizontal } from 'ionicons/icons';
import { IonIcon } from '@ionic/vue';
import * as vscode from 'vscode'
import { enableBottomShortcuts, symbols } from '../core/appConfigs'
import { moveCursorByOffset, selection, copySelection, insertText2, execCommand } from '../core/shortcutFunctions'
import { isEditorActive } from '../core/app'

const currentInputBox = ref<HTMLElement>()

// isEditorActive() 读的是 document.activeElement，本身不是响应式的；
// 直接放进 computed 只在挂载时算一次，之后永远为 false（符号条不显示）。
// 这里同时用 vscode 的 activeTextEditor 事件作为权威信号。
const editorActive = ref(isEditorActive())
const hasActiveEditor = ref(!!vscode.window.activeTextEditor)
function refreshEditorActive() {
    editorActive.value = isEditorActive()
}
vscode.window.onDidChangeActiveTextEditor((e) => {
    hasActiveEditor.value = !!e
    refreshEditorActive()
})
onMounted(() => {
    document.addEventListener('focusin', refreshEditorActive, true)
    document.addEventListener('focusout', () => setTimeout(refreshEditorActive, 0), true)
    refreshEditorActive()
})
onUnmounted(() => {
    document.removeEventListener('focusin', refreshEditorActive, true)
})

const show = computed<boolean>(() => {
    if (import.meta.env.DEV) {
        return enableBottomShortcuts.value
    }
    // 原先只在软键盘弹出时显示：外接/蓝牙键盘或键盘未弹出时符号与光标按钮完全用不了。
    // 改为「有活动编辑器」即显示，仍受 enableBottomShortcuts 开关控制。
    return enableBottomShortcuts.value && hasActiveEditor.value
})
function updateInputBox() {
    currentInputBox.value = document.activeElement as HTMLElement
}
function resetFocus() {
    currentInputBox.value?.focus?.();
}
function inputText(str: string) {
    return insertText2(str)
    /*
    const inputEvent = new Event('input', {
        bubbles: true,
        cancelable: true,
    });
    (currentInputBox.value as HTMLIonTextareaElement).value += str
    currentInputBox.value?.dispatchEvent(inputEvent)
    */
}
function test(t: string) {
    console.log(t);
}
// 触摸选区在 Monaco 上很难精确点到，提供整行/整词/全文三种兜底选择
function selectLine() {
    return execCommand('expandLineSelection')
}
function selectWord() {
    return execCommand('editor.action.smartSelect.expand')
}
function selectAll() {
    return execCommand('editor.action.selectAll')
}
</script>
<style scoped>
.main {
    position: absolute;
    background-color: #ffffff;
    display: flex;
    bottom: 0;
    width: 100%;
    height: 80px;
}

.warp {
    flex-wrap: wrap;
}

.button {
    width: 35px;
    height: 40px;
    /* font-size: small; */
}
</style>../core/use_status/native_status../core/native/native_status