# 会议纪要 · Meeting Minutes Studio

实时记录会议语音 → 自动生成 **中文 + English 双语会议纪要** → 一键导出 PDF。

纯静态单页应用，零依赖、零后端，可直接部署到 GitHub Pages / 任意静态托管。

## 功能

| 功能 | 说明 |
| --- | --- |
| 实时语音记录 | Web Speech API，中文 / English / 中英混合，连续识别自动重连 |
| 文字导入 | 直接粘贴，或导入 `.txt` `.md` `.srt` `.vtt` `.json`（自动去字幕时间码） |
| 本地提取 | 无需联网。按规则 + 词频抽出摘要、议题、决议、行动项（负责人 / 截止）、风险、下一步 |
| AI 双语 | 配置任意 OpenAI 兼容接口（默认 DeepSeek），生成真正的中英对照纪要 |
| 双语 / 单语视图 | 右上角切换「双语 / 中文 / English」 |
| 直接编辑 | 纪要区域 contenteditable，导出前可随手改 |
| 导出 | 打印 / 存 PDF、Markdown、JSON、纯文本 |
| 本地保存 | 转写、设置、纪要用 localStorage 自动留存 |

## 运行

任意静态服务器即可（需 HTTP，不能用 `file://`，否则 ES module 无法加载）：

```bash
python -B -m http.server 8000
# 打开 http://127.0.0.1:8000
```

> 语音识别要求 HTTPS 或 localhost，且仅 Chromium 内核（Chrome / Edge）支持。
> 不支持的浏览器仍可粘贴文字使用全部其它功能。

## AI 双语配置

右上角「设置」→ 生成引擎选 **AI 双语**：

- 接口地址：`https://api.deepseek.com/chat/completions`
- 模型：`deepseek-chat`
- API Key：`sk-…`（只存本机 localStorage，请求由浏览器直连）

若接口不允许跨域（CORS），生成会自动回退到本地提取，并在提示里说明原因。

## 目录结构

```
meeting-minutes/
├── index.html          页面结构
├── assets/styles.css   设计系统 + 打印样式
└── src/
    ├── app.js          装配与状态
    ├── recorder.js     语音识别封装（自动重连 / 权限处理）
    ├── summarizer.js   本地提取引擎 + AI 结果归一化
    ├── llm.js          OpenAI 兼容接口调用
    ├── render.js       纪要渲染（双语 / 单语）
    └── exporter.js     Markdown / TXT / JSON / 打印 PDF
```

## 快捷键

- `Ctrl / Cmd + Enter` 生成纪要

## 部署

GitHub Pages（`main` 分支根目录）：

```bash
git init && git add -A && git commit -m "feat: bilingual meeting minutes studio"
gh repo create meeting-minutes --public --source=. --push
gh api -X POST repos/liuaoyunlove/meeting-minutes/pages \
  -f 'source[branch]=main' -f 'source[path]=/'
```

线上地址：<https://liuaoyunlove.github.io/meeting-minutes/>
