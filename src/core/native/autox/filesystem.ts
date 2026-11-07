import {
    Uri, FileSystemProvider, Disposable, EventEmitter,
    Event, FileChangeEvent, FileStat, FileType
} from "vscode";
import { Base64 } from 'js-base64';

/** 与原生 ChunkedFileIo.CHUNK_SIZE 保持一致，两边不一致会导致读不到整文件 */
const CHUNK_SIZE = 1024 * 1024


export interface IAutoxFileSystem {
    stat(data: string): Promise<string | undefined>
    readDirectory(data: string): Promise<string | undefined>
    createDirectory(data: string): Promise<string | undefined>
    readFile(data: string): Promise<string | undefined>
    writeFile(data: string): Promise<string | undefined>
    delete(data: string): Promise<string | undefined>
    rename(data: string): Promise<string | undefined>
    copy(data: string): Promise<string | undefined>
    // 大文件分块写：beginWrite 建 tmp，writeChunk 按 offset 填，finishWrite 原子替换目标
    beginWrite?(data: string): Promise<string | undefined>
    writeChunk?(data: string): Promise<string | undefined>
    finishWrite?(data: string): Promise<string | undefined>
}
interface FileRequest {
    path: string
    data?: string
    encoding?: string
    offset?: number
    length?: number
}
interface RenameFileRequest {
    form: string
    to: string
}
interface CopyFileRequest {
    form: string
    to: string
}
interface FileResult {

}
interface StatResult {
    name: string
    type: 'file' | 'directory'
    size: number
    ctime: number
    mtine: number
}
class AutoxFileSystemProvider implements FileSystemProvider {
    native: IAutoxFileSystem
    onDidChangeFile: Event<FileChangeEvent[]>;
    constructor(x: IAutoxFileSystem) {
        this.native = x
        const fileChangeEvent = new EventEmitter<FileChangeEvent[]>()
        this.onDidChangeFile = fileChangeEvent.event
    }

    watch(uri: Uri, options: { readonly recursive: boolean; readonly excludes: readonly string[]; }): Disposable {
        throw new Error("Method not implemented.");
    }
    async stat(uri: Uri): Promise<FileStat> {
        const fileRequest: FileRequest = {
            path: uri.path
        }
        const data = await this.native.stat(JSON.stringify(fileRequest))
        console.error(data);

        const nstat = JSON.parse(data!) as StatResult
        const stat: FileStat = {
            type: nstat.type === 'file' ? FileType.File : FileType.Directory,
            size: nstat.size,
            ctime: nstat.ctime,
            mtime: nstat.mtine,
        }
        return stat
    }
    async readDirectory(uri: Uri): Promise<[string, FileType][]> {
        const fileRequest: FileRequest = {
            path: uri.path
        }
        const data = await this.native.readDirectory(JSON.stringify(fileRequest))
        const statarr: StatResult[] = JSON.parse(data!) as StatResult[]
        return statarr.map((stat) => {
            return [stat.name, stat.type === 'file' ? FileType.File : FileType.Directory]
        })
    }
    async createDirectory(uri: Uri): Promise<void> {
        const fileRequest: FileRequest = {
            path: uri.path
        }
        await this.native.createDirectory(JSON.stringify(fileRequest))
    }
    async readFile(uri: Uri): Promise<Uint8Array> {
        // 超过一块的文件必须分次取：原生侧单次下发上限 1MB，
        // 一次性传大文件会把 base64 字符串撑到十几 MB，WebView 直接卡死。
        const stat = await this.stat(uri)
        if (stat.size <= CHUNK_SIZE) {
            const data = await this.native.readFile(JSON.stringify({ path: uri.path } as FileRequest))
            return Base64.toUint8Array(data!)
        }
        const out = new Uint8Array(stat.size)
        let offset = 0
        while (offset < stat.size) {
            const request: FileRequest = { path: uri.path, offset, length: CHUNK_SIZE }
            const data = await this.native.readFile(JSON.stringify(request))
            const chunk = Base64.toUint8Array(data!)
            if (chunk.length === 0) break
            out.set(chunk, offset)
            offset += chunk.length
        }
        return out
    }
    async writeFile(uri: Uri, content: Uint8Array, options: { readonly create: boolean; readonly overwrite: boolean; }): Promise<void> {
        if (content.length <= CHUNK_SIZE) {
            const fileRequest: FileRequest = {
                path: uri.path,
                data: Base64.fromUint8Array(content)
            }
            await this.native.writeFile(JSON.stringify(fileRequest))
            return
        }
        // 分块写走 tmp：中途抛错时目标文件保持原样，不会留下半个脚本
        const { beginWrite, writeChunk, finishWrite } = this.native
        if (!beginWrite || !writeChunk || !finishWrite) {
            // 原生侧未提供分块写（旧 APK）：退回整块写，宁可慢也别写坏
            await this.native.writeFile(JSON.stringify({
                path: uri.path,
                data: Base64.fromUint8Array(content)
            } as FileRequest))
            return
        }
        await beginWrite(JSON.stringify({ path: uri.path } as FileRequest))
        for (let offset = 0; offset < content.length; offset += CHUNK_SIZE) {
            const slice = content.subarray(offset, Math.min(offset + CHUNK_SIZE, content.length))
            const request: FileRequest = {
                path: uri.path,
                offset,
                data: Base64.fromUint8Array(slice)
            }
            await writeChunk(JSON.stringify(request))
        }
        await finishWrite(JSON.stringify({ path: uri.path } as FileRequest))
    }
    async delete(uri: Uri, options: { readonly recursive: boolean; }): Promise<void> {
        const fileRequest: FileRequest = {
            path: uri.path
        }
        await this.native.delete(JSON.stringify(fileRequest))
    }
    async rename(oldUri: Uri, newUri: Uri, options: { readonly overwrite: boolean; }): Promise<void> {
        const fileRequest: RenameFileRequest = {
            form: oldUri.path,
            to: newUri.path,
        }
        await this.native.rename(JSON.stringify(fileRequest))
    }
    async copy?(source: Uri, destination: Uri, options: { readonly overwrite: boolean; }): Promise<void> {
        const fileRequest: CopyFileRequest = {
            form: source.path,
            to: destination.path,
        }
        await this.native.copy(JSON.stringify(fileRequest))
    }

}

export default AutoxFileSystemProvider