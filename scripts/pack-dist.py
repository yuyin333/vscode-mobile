#!/usr/bin/env python3
"""生成发布用的 dist.zip（条目名必须是正斜杠）。

为什么不用 PowerShell 的 Compress-Archive：它写的是 Windows 风格 zip
（条目名用反斜杠、create_system=0）。Python 的 zipfile 读取时会自动把 `\\`
转成 `/`，所以本地看着正常；而 Android 的 ZipInputStream 不做转换，
"dist\\index.html" 会被当成**一个文件名**解压成扁平文件，
客户端随后找不到 dist/index.html 直接失败（Veku 7.3.10/7.3.11 实测：首次
打开编辑器卡在「正在更新」）。

用法（在 fork 仓库根目录）:
    python3 scripts/pack-dist.py           # 产出 ./dist.zip
"""
import os
import sys
import zipfile

ROOT = "dist"
OUT = "dist.zip"


def main() -> int:
    if not os.path.isdir(ROOT):
        print(f"{ROOT}/ 不存在，请先 npm run build", file=sys.stderr)
        return 1
    if os.path.exists(OUT):
        os.remove(OUT)
    count = 0
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        for dirpath, _dirnames, filenames in os.walk(ROOT):
            for name in filenames:
                full = os.path.join(dirpath, name)
                # 统一用 / 作分隔符，不随平台变化
                arcname = os.path.relpath(full, ".").replace(os.sep, "/")
                z.write(full, arcname)
                count += 1
    size_mb = os.path.getsize(OUT) / (1024 * 1024)
    print(f"{OUT}: {count} 个条目, {size_mb:.2f} MB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
