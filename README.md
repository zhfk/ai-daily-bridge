# AI 与科技每日简报

每天北京时间09:00，在当前聊天生成日报，保存到 `YYYY-MM-DD/`，提交并推送到 [zhfk/ai-daily-bridge](https://github.com/zhfk/ai-daily-bridge) 的main分支。电脑需开机、Codex运行且项目可访问。

## 唯一规范

[DAILY_BRIEF_PROMPT.md](DAILY_BRIEF_PROMPT.md) 是唯一编辑prompt。定时任务 `ai-github` 只引用该文件，不保存重复的长prompt。参考图为 [templates/reference.png](templates/reference.png)，排版由 [templates/daily-brief.css](templates/daily-brief.css) 固定；不要新增其他prompt副本。截图是风格参考，事实和图片必须重新核验。

## 文件与执行

每日目录保存：
- `brief.md`：完整可读稿，只含日期标题、开篇判断、五条新闻与编辑结尾。
- `wordpress.json`：title、slug、excerpt、tags，以及由同稿生成的HTML content。
- `images.json`：真实图片URL、新闻序号、出处、署名、说明及裁切方式。
- `facts.json`：五条新闻的事实状态、实际事件日期、来源和核查说明。
- `preview.html`：包含固定版式的独立预览。
- `cover.png`、`cover.json`：以当天头条为主题的16:9首页封面与编辑插画说明；`wordpress.json.featured_image` 指向封面。

先同步：

```powershell
$env:GIT_SSH_COMMAND = 'ssh -o HostName=ssh.github.com -p 443 -o HostKeyAlias=github.com -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15 -o ConnectionAttempts=1'
powershell.exe -NoProfile -File D:/WebstormProject/ai-daily-bridge/scripts/Publish-DailyBrief.ps1 -SyncOnly
```

定稿后渲染（Node.js可使用Codex提供的运行时）：

```powershell
node scripts/render-brief.cjs YYYY-MM-DD
```

使用浏览器打开 `preview.html`，对照参考图检查图片加载、1–3图横排、字号、留白、短段落、分隔线和末尾判断。参考画布宽1776px，另查窄屏；不同客户端有自身字体和图片组件，不能用prompt保证聊天界面逐像素一致。WordPress content自带必要排版，预览用于检查交付文件。

修复差异并复查后发布：

```powershell
powershell.exe -NoProfile -File D:/WebstormProject/ai-daily-bridge/scripts/Publish-DailyBrief.ps1 -Date YYYY-MM-DD
```

用户已授权同步、当日归档、限定文件提交和普通推送，无需逐日重复确认。脚本只快进同步main，仅提交指定文件，拒绝带入其他文件的未推送提交，推送后核对远程SHA。禁止强制推送、破坏性reset或擅自修改认证/安全配置。失败保留稿件与提交，诊断不写入正文。

完整且已推送的同日日报默认不重复；用户明确要求重新生成时可更新该日日报。历史日期默认保留。`-Setup`只发布本项目规范、参考模板和渲染/发布脚本。

GitHub 推送后的 WordPress 发布由[独立 n8n 工作流](https://qnn8n.sparklight.ccwu.cc/workflow/J8pcNkSO50zLT3Hb)处理，每5分钟检查当天稿件，固定加入“AI 每日简报”分类（ID 2），上传特色图片并防止重复创建正常文章。回收站或已删除文章允许重发。配置与维护见 [n8n/README.md](n8n/README.md)。
