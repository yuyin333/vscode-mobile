

export default interface AppController {
    exit(): Promise<string | undefined>
    back(): Promise<string | undefined>
    runScript(data: string): Promise<string | undefined>
    getApiTypes(): Promise<string | undefined>
    /** 落一份未保存内容草稿；data = {path, content} */
    saveDraft(data: string): Promise<string | undefined>
    /** 保存成功后清草稿；data = {path} */
    clearDraft(data: string): Promise<string | undefined>
}