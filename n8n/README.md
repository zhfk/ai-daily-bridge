# GitHub 日报 → WordPress

部署服务：<https://qnn8n.sparklight.ccwu.cc/>。

工作流：<https://qnn8n.sparklight.ccwu.cc/workflow/J8pcNkSO50zLT3Hb>。

每 5 分钟按 `Asia/Shanghai` 日期读取公开仓库 main 分支的 `YYYY-MM-DD/wordpress.json`，校验当天日期、五个编号 H2、标题、摘要和标签，使用 n8n 已有的 `Wordpress account` 凭据发布到 <https://aiaware.crst.win/>，固定分类为 **AI 每日简报（ID 2）**。发布回执也会验证分类。GitHub Raw 请求不需要访问令牌。

## 发布规则

- 同一 slug 存在已发布、草稿、待审、定时或私密文章时跳过。
- 上传当天的 `featured_image.file=cover.png`，核验媒体 ID 后设置文章特色图片。AI 插画说明写入媒体 caption；未提供生成封面时采用头条正文中的真实图片。
- 按用户要求，只有回收站文章，或原文章已经删除时，允许重新创建当天文章。
- 所有发布都先以 `id + ledger 旧值` 条件更新持久记录，核验执行 ID 后才发送创建文章请求。并发执行只有一个发布者能取得占位。
- 创建文章请求禁止自动重试。`reserved` 和 `needs_review` 状态阻止后续自动发布，即使工作流重启。超时、断线或异常回执需要先在 WordPress 核对结果。
- 成功记录文章 ID、链接、源文件 ETag、发布次数和上一文章 ID。只处理当天，不自动补发历史日期。

发布记录表为 `ai_daily_github_publish_ledger`，ID `PVlhp1R6msS5HrIs`。唯一初始行的 ID 必须是 `1`，`ledger` 为字符串列。**不要清空该表，不要重新导入种子覆盖已有记录，不要单独执行发布节点。** 复制工作流时仍应共用此表。

## 文件与维护

- `ai-daily-github-wordpress.json`：可导入配置，包含凭据引用，不包含密码或令牌。默认未启用；部署后需发布工作流。
- `build-workflow.cjs`：生成配置。迁移服务时更新表 ID 和现有 WordPress 凭据 ID，再重新生成。
- `ledger-seed.csv`：只用于首次建立一个全新的记录表。
- `verify-workflow.cjs`：验证稿件日期与格式、正常文章防重、回收站例外、标签响应、并发抢占、模糊超时保护及发布历史。

生成和校验：

```sh
node n8n/build-workflow.cjs
node n8n/verify-workflow.cjs
```

异常处理：在 n8n 执行详情与 WordPress 中核实对应日期和文章 ID。发现文章已成功发布时保留记录并修正回执；确认没有创建文章后，才可由维护者修复占位并重跑整个流程。不得因超时直接重发。

接口参考：[n8n Data Table](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.datatable/)、[WordPress Posts REST API](https://developer.wordpress.org/rest-api/reference/posts/)。
