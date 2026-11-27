<template>
    <div v-if="touchMenu" class="touch-menu-mask" @click.self="close">
        <div class="touch-menu" :style="menuStyle">
            <a class="touch-item" @click="run(selectWordAtCursor)">选择单词</a>
            <a class="touch-item" @click="run(selectCurrentLine)">选择整行</a>
            <a class="touch-item" @click="run(selectAllText)">全选</a>
            <div class="touch-sep"></div>
            <a class="touch-item" @click="run(() => runClipboardAction('cut'))">剪切</a>
            <a class="touch-item" @click="run(() => runClipboardAction('copy'))">复制</a>
            <a class="touch-item" @click="run(() => runClipboardAction('paste'))">粘贴</a>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
    touchMenu, closeTouchMenu, selectWordAtCursor, selectCurrentLine, selectAllText, runClipboardAction,
} from '../core/features/debug'

const close = closeTouchMenu

// 菜单宽高固定（约 140x260），靠近边缘时向内收，避免点不到
const menuStyle = computed(() => {
    const state = touchMenu.value
    if (!state) return {}
    const width = 140
    const height = 260
    const vw = window.innerWidth
    const vh = window.innerHeight
    const left = Math.min(state.x, vw - width - 8)
    const top = state.y + height > vh ? Math.max(8, state.y - height) : state.y
    return { left: `${Math.max(8, left)}px`, top: `${top}px` }
})

function run(action: () => void) {
    action()
    close()
}
</script>

<style scoped>
.touch-menu-mask {
    position: fixed;
    inset: 0;
    z-index: 40;
}

.touch-menu {
    position: fixed;
    min-width: 120px;
    padding: 4px 0;
    border-radius: 8px;
    background: var(--ion-background-color, #fff);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
    font-size: 14px;
}

.touch-item {
    display: block;
    padding: 10px 16px;
    color: var(--ion-text-color, #222);
}

.touch-sep {
    height: 1px;
    margin: 4px 0;
    background: rgba(127, 127, 127, 0.25);
}
</style>
