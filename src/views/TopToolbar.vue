<template>
    <FilePicker :file-type="fileType" v-model:is-open="filePickerOpen"></FilePicker>
    <div v-show="enableTopToolbar" :style="style">
        <Space.Compact class="warp" size="middle" wrap>
            <IonMenuToggle>
                <Button :size="size" class="dbutton" :icon="h(IonIcon, { icon: menu })">
                    <span>{{ t('menu') }}</span></Button>
            </IonMenuToggle>
            <Dropdown :trigger="['click']">
                <Button :size="size" class="dbutton" :icon="h(IonIcon, { icon: document })">
                    <span>{{ t('file') }}</span></Button>
                <template #overlay>
                    <Menu @click="">
                        <menu-item @click="openFile">{{ t('openFile') }}</menu-item>
                        <menu-divider />
                        <menu-item @click="openFolder">{{ t('openFolder') }}</menu-item>
                    </Menu>
                </template>
            </Dropdown>
            <Dropdown :trigger="['click']">
                <Button :size="size" class="dbutton" :icon="h(IonIcon, { icon: pencil })">
                    <span>{{ t('edit') }}</span></Button>
                <template #overlay>
                    <Menu @click="onEditMenuClick">
                        <menu-item v-for="(menu, index) in editMenu" :key="index">
                            {{ menu }}
                        </menu-item>
                        <menu-divider />
                        <menu-item :key="editMenu.length">{{ t('formatDocument') }}</menu-item>
                    </Menu>
                </template>
            </Dropdown>
            <Button @click="start" :size="size" class="dbutton" :loading="codeRunning" :icon="h(IonIcon, { icon: play })">
                <span>{{ t('run') }}</span></Button>
            <Button v-if="debugUiEnabled && debugSupported" @click="toggleDebug" :size="size" class="dbutton"
                :type="debugRunning ? 'primary' : 'default'" :danger="debugRunning"
                :icon="h(IonIcon, { icon: debugRunning ? stopIcon : bug })">
                <span>{{ debugRunning ? t('stop') : t('debug') }}</span></Button>
            <Button v-if="debugUiEnabled && debugSupported" @click="toggleCurrentBreakpoint" :size="size" class="dbutton"
                :icon="h(IonIcon, { icon: ellipseOutline })">
                <span>{{ t('breakpoint') }}</span></Button>
            <Button :size="size" class="dbutton" :icon="h(IonIcon, { icon: arrowUndo })"
                @click="undo"><span>{{ t('undo') }}</span></Button>
            <Button :size="size" class="dbutton" :icon="h(IonIcon, { icon: arrowRedo })"
                @click="redo"><span>{{ t('redo') }}</span></Button>
            <Button :size="size" class="dbutton" @click="saveFile"
                :icon="h(IonIcon, { icon: save })"><span>{{ t('save') }}</span></Button>
        </Space.Compact>
        <DebugPanel />
        <TouchMenu />
    </div>
</template>
<script setup lang="ts">
import { IonIcon, IonMenuToggle } from "@ionic/vue";
import { ref, h, computed } from "vue";
import { t } from "../core/i18n";
import {
    save, arrowUndo, arrowRedo,
    play, pencil, document, menu, bug, stopCircle as stopIcon, ellipseOutline,
} from "ionicons/icons";
import { enableTopToolbar, rootPath } from "../core/appConfigs";
import type { SizeType } from "ant-design-vue/es/config-provider";
import {
    save as saveFile,
    undo, redo, gotoline, execCommand, find, commentLine, formatDocument,
} from "../core/shortcutFunctions";
import type { MenuProps } from "ant-design-vue";
import {
    message,
    notification,
    Space,
    Button,
    Dropdown,
    Menu,
    MenuItem,
    MenuDivider,
} from "ant-design-vue";
import * as vscode from "vscode";
import FilePicker from "./FilePicker.vue";
import DebugPanel from "./DebugPanel.vue";
import TouchMenu from "./TouchMenu.vue";
import { FileType } from "vscode";
import * as monaco from "monaco-editor";
import { prettierFormat, enable } from "@/core/tools/prettier";
import { getNativeApp } from "../core/native"
import { debugSupported, debugRunning, debugUiEnabled, startDebug, stopDebug, toggleBreakpoint } from "../core/features/debug"

const style = computed(() => {
    return {
        "justify-content": "center",
        display: " flex",
    };
});

const codeRunning = ref(false)
const fileType = ref<FileType>(FileType.Directory);
const filePickerOpen = ref<boolean>(false);
const foldAll = ref<boolean>(false);
const size = ref<SizeType>("middle");
const editMenu = computed(() => [t('findReplace'), t('gotoLine'), t('foldAll'), t('runCommand')]);
const onEditMenuClick: MenuProps["onClick"] = async ({ key }) => {
    switch (key as number) {
        case 0:
            await find();
            break;
        case 1:
            await gotoline();
            break;
        case 2:
            foldAll.value = !foldAll.value;
            foldAll.value
                ? execCommand("editor.foldAll")
                : execCommand("editor.unfoldAll");
            break;
        case 3:
            await commentLine();
            break;
        case 4:
            let form = enable.value ? prettierFormat : formatDocument
            form().catch((err: Error) => {
                notification.error({
                    message: t('formatError'),
                    description: err.message,
                });
            });
            break;
    }
    console.log(`Click on item ${key}`);
};
async function start() {
    if (codeRunning.value) return
    const nativeApp = await getNativeApp()
    if (nativeApp?.runCode) {
        const document = vscode.window.activeTextEditor?.document
        if (document) {
            codeRunning.value = true
            nativeApp.runCode(document).catch((e: Error) => {
                message.error(e.message);
            }).finally(() => { codeRunning.value = false })
        } else message.error(t('openFileFirst'));
        return
    }
    message.error(t('noApi'));
}
async function toggleDebug() {
    if (debugRunning.value) {
        await stopDebug()
        return
    }
    const document = vscode.window.activeTextEditor?.document
    if (!document) {
        message.error(t('openFileFirstDebug'))
        return
    }
    try {
        await startDebug(document.uri.path)
    } catch (e) {
        message.error((e as Error).message)
    }
}
async function toggleCurrentBreakpoint() {
    // vscode.window.activeTextEditor 在这个 fork 里不一定有值，
    // 回退到 monaco 自己的编辑器光标位置（monaco 的行号本来就是 1-based）
    let line: number | null = null
    const position = vscode.window.activeTextEditor?.selection.active
    if (position) {
        line = position.line + 1
    } else {
        const editors = monaco.editor.getEditors()
        const codeEditor = editors.find((e) => e.hasTextFocus()) ?? editors[0]
        line = codeEditor?.getPosition()?.lineNumber ?? null
    }
    if (!line) {
        message.error(t('moveCursor'))
        return
    }
    await toggleBreakpoint(line)
    message.success(t('breakpointToggled', { line }))
}
function openFolder() {
    fileType.value = FileType.Directory;
    filePickerOpen.value = true;
}
function openFile() {
    fileType.value = FileType.File;
    filePickerOpen.value = true;
}
</script>
<style scoped>
.dbutton {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    height: 45px;
    font-size: 1.2em;
}

.dbutton span {
    font-size: 0.5em;
}
</style>
