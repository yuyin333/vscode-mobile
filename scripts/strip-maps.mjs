/**
 * 删除构建产物里的 sourcemap。
 *
 * vite 的 build.sourcemap=false 只影响本项目代码；@codingame/monaco-vscode-* 等包
 * 会把预先构建好的 .js.map 一起拷进 dist，手机端解压这些文件纯属浪费
 * （上一版 dist.zip 解压后有 41.5MiB 是 .map）。
 */
import { readdirSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'

const root = 'dist'
let removed = 0

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (name.endsWith('.map')) {
      rmSync(p)
      removed++
    }
  }
}

walk(root)
console.log(`stripped ${removed} sourcemap files`)
