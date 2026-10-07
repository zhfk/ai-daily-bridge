# AI 与科技每日简报

每天北京时间（Asia/Shanghai）09:00，生成中文《AI 与科技每日简报》，归档到根目录的 `YYYY-MM-DD/`，再自动提交并推送到 [zhfk/ai-daily-bridge](https://github.com/zhfk/ai-daily-bridge) 的 `main` 分支。

定时任务 ID 为 `ai-github`，沿用当前聊天中的每日任务。完整编辑要求和内部执行流程见 [DAILY_BRIEF_PROMPT.md](DAILY_BRIEF_PROMPT.md)，这是当前有效的生成规范。运行需要电脑开机、Codex 应用运行且项目可访问。

## 固定版式

1. 首行纯文本 `AI 与科技每日简报｜YYYY年M月D日`，日期按 Asia/Shanghai 计算。
2. 今日概览：1–2段，约150–250中文字符，说明共同主线和核心判断。
3. 今日重点5条：按重要性排序，使用 `## 1. 新闻标题` 至 `## 5. 新闻标题`，每条涵盖摘要、背景与深度分析、重要性、趋势/机会和1–3条行动建议，单独列事实状态，结尾列2–4个实际使用的关键来源。
4. WordPress发布信息：标题、Slug、Excerpt、Tags。

正文不含H1，只有5条新闻使用H2。正文建议1800–2800中文字符，不计来源链接和WordPress发布信息。明确区分 CONFIRMED、COMPANY_CLAIM、MEDIA_REPORT、UNCONFIRMED、ANALYSIS，使用近期可靠来源；优先近24小时，必要时扩展到48小时，不把旧闻写成新事件。

最终呈现只有完整可读日报和规定的WordPress发布信息，不附GitHub操作、测试、复制、工具状态、原始JSON或其他执行日志。图片采用真实、直接相关素材；获取失败不影响日报生成。

## 每日文件

- `YYYY-MM-DD/brief.md`：完整可读日报，包括固定日期标题、概览、5条编号新闻和末尾WordPress发布信息。
- `YYYY-MM-DD/wordpress.json`：同一稿件的 `title`、`slug`、`excerpt`、`tags`、`content`。前四项对应可读发布信息；HTML正文只包含日期标题、概览和5条新闻，排除末尾发布信息区，保留真实来源和实际使用的图片。标签保存名称，后续发布程序可解析为WordPress标签ID。
- `YYYY-MM-DD/images.json`：可选；真实图片及出处、署名，与稿件实际使用素材对应。

WordPress标题建议20–32个中文字符，最多40；slug严格为 `ai-daily-YYYY-MM-DD`；excerpt约80–140个中文字符；tags为5–10个相关去重标签。

## 自动提交流程

用户已授权每日归档、限定文件提交和普通推送，无需逐日重复确认。

写作前执行：

```powershell
powershell.exe -NoProfile -File D:/WebstormProject/ai-daily-bridge/scripts/Publish-DailyBrief.ps1 -SyncOnly
```

定稿并完成核查后执行（替换为实际当日日期）：

```powershell
powershell.exe -NoProfile -File D:/WebstormProject/ai-daily-bridge/scripts/Publish-DailyBrief.ps1 -Date YYYY-MM-DD
```

脚本只通过快进同步main，仅提交当日指定文件，拒绝携带其他文件的未推送提交，普通推送并核对远程SHA。禁止强制推送、破坏性reset、删除历史或擅自修改认证/安全配置。权限、认证、并发更新或网络失败时保留本地稿件和已有提交，将诊断留在工具或任务记录中，不写入日报。

同一天已经完整且成功推送的日报不重复生成；未推送稿件优先续传。新版prompt适用于后续生成，不自动改写历史日报。

`-Setup` 仅用于提交本项目的规范文件和发布脚本，不提交日报或用户其他文件。日报提交信息为 `docs: add AI daily brief for YYYY-MM-DD`。
