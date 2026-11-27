<template>
    <div v-if="debugStopped" class="debug-panel">
        <div class="debug-row">
            <span class="debug-pos">{{ t('paused') }} · {{ t('line') }} {{ debugStopped.line }} · {{ debugStopped.reason }}</span>
            <a class="debug-close" @click="onStop">{{ t('stop') }}</a>
        </div>
        <Space wrap :size="4">
            <Button size="small" type="primary" @click="onStep('resume')">{{ t('continue') }}</Button>
            <Button size="small" @click="onStep('stepOver')">{{ t('stepOver') }}</Button>
            <Button size="small" @click="onStep('stepInto')">{{ t('stepInto') }}</Button>
            <Button size="small" @click="onStep('stepOut')">{{ t('stepOut') }}</Button>
        </Space>
        <div class="debug-row">
            <Input v-model:value="expr" size="small" :placeholder="t('evalPlaceholder')" @pressEnter="onEval" />
            <Button size="small" @click="onEval">{{ t('evaluate') }}</Button>
        </div>
        <div v-if="value" class="debug-value">{{ value }}</div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Space, Button, Input } from 'ant-design-vue'
import { debugStopped, debugValue, step, stopDebug, evaluate } from '../core/features/debug'
import { t } from '../core/i18n'

const expr = ref('')
const value = ref('')

async function onStep(action: 'resume' | 'stepOver' | 'stepInto' | 'stepOut') {
    value.value = ''
    await step(action)
}

async function onEval() {
    value.value = await evaluate(expr.value)
}

async function onStop() {
    value.value = ''
    await stopDebug()
}
</script>

<style scoped>
.debug-panel {
    position: absolute;
    left: 8px;
    right: 8px;
    top: 52px;
    z-index: 30;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px;
    border-radius: 8px;
    background: var(--ion-background-color, #fff);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
    font-size: 12px;
}

.debug-row {
    display: flex;
    align-items: center;
    gap: 6px;
}

.debug-pos {
    flex: 1;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
}

.debug-close {
    color: #e51400;
}

.debug-value {
    max-height: 84px;
    overflow: auto;
    padding: 4px 6px;
    border-radius: 4px;
    background: rgba(127, 127, 127, 0.12);
    font-family: monospace;
    white-space: pre-wrap;
    word-break: break-all;
}
</style>
