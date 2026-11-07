// 这里原本 import 了 esbenp.prettier-vscode 的 vsix。
//
// 该扩展的资源通过 extension-file:// 协议提供，而 Android WebView 无法处理这个 scheme
// （logcat: "URL scheme "extension-file" is not supported"），激活必然失败；
// 同时它还会把约 2.8MB 的扩展资产打进 dist。
//
// 现在格式化改由 src/core/tools/prettier.ts 里的内置 prettier 承担，
// 并注册成标准的 DocumentFormattingEditProvider，因此不再需要这个扩展。
export {}
