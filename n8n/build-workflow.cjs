const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const tableId = 'PVlhp1R6msS5HrIs';
const wpCredential = { wordpressApi: { id: 'Nudhkvpw8yEdJlOo', name: 'Wordpress account' } };
const nodes = [];
const connections = {};
function add(name, type, parameters, position, extra = {}) {
  nodes.push({ id: randomUUID(), name, type: `n8n-nodes-base.${type}`, typeVersion: type === 'httpRequest' ? 4.2 : type === 'code' ? 2 : type === 'scheduleTrigger' ? 1.2 : 1, position, parameters, ...extra });
}
function code(name, jsCode, position) { add(name, 'code', { jsCode }, position); }
function chain(...names) { for (let i = 1; i < names.length; i++) connections[names[i - 1]] = { main: [[{ node: names[i], type: 'main', index: 0 }]] }; }
function table(name, operation, conditions, position, ledger) {
  const parameters = { resource: 'row', operation, dataTableId: { __rl: true, mode: 'id', value: tableId }, matchType: 'allConditions', filters: { conditions }, options: {} };
  if (operation === 'get') Object.assign(parameters, { returnAll: false, limit: 1 });
  if (ledger) parameters.columns = { mappingMode: 'defineBelow', value: { ledger }, matchingColumns: [], schema: [{ id: 'ledger', displayName: 'ledger', required: false, defaultMatch: false, display: true, type: 'string', readOnly: false, removed: false }], attemptToConvertTypes: false, convertFieldsToString: false };
  add(name, 'dataTable', parameters, position, { alwaysOutputData: true, retryOnFail: false });
}
function http(name, parameters, position, wp = false, uncertain = false) {
  const options = { timeout: 30000, response: { response: { fullResponse: true, neverError: true, responseFormat: 'json' } } };
  if (wp) Object.assign(parameters, { authentication: 'predefinedCredentialType', nodeCredentialType: 'wordpressApi' });
  add(name, 'httpRequest', { ...parameters, options }, position, { retryOnFail: false, ...(wp ? { credentials: wpCredential } : {}), ...(uncertain ? { onError: 'continueRegularOutput' } : {}) });
}

add('每5分钟检查', 'scheduleTrigger', { rule: { interval: [{ field: 'minutes', minutesInterval: 5 }] } }, [0, 0]);
add('手动核验', 'manualTrigger', {}, [0, 180]);
code('北京时间日期', `const date = $now.setZone('Asia/Shanghai').toFormat('yyyy-MM-dd');
return [{ json: { date, key: 'zhfk/ai-daily-bridge:' + date, slug: 'ai-daily-' + date, owner: String($execution.id) } }];`, [220, 0]);
table('读取持久记录', 'get', [{ keyName: 'id', condition: 'eq', keyValue: '1' }], [440, 0]);
code('当日未处理才继续', `const row = $input.first().json;
if (Number(row.id) !== 1 || typeof row.ledger !== 'string') throw new Error('发布记录缺失；停止发布，禁止自动重建或清空记录');
const ledger = JSON.parse(row.ledger);
if (ledger.version !== 1 || !ledger.dates || Array.isArray(ledger.dates)) throw new Error('发布记录格式错误');
const context = $('北京时间日期').first().json;
const previous = ledger.dates[context.key];
if (previous && ['reserved', 'needs_review'].includes(previous.status)) return [];
if (previous && !['published', 'existing'].includes(previous.status)) throw new Error('未知发布状态；停止发布');
return [{ json: { ...context, ledgerBefore: row.ledger } }];`, [660, 0]);
http('读取GitHub当日稿', {
  url: '=https://raw.githubusercontent.com/zhfk/ai-daily-bridge/main/{{ $json.date }}/wordpress.json'
}, [880, 0]);
nodes.find(n => n.name === '读取GitHub当日稿').parameters.options.response.response.responseFormat = 'text';
nodes.find(n => n.name === '读取GitHub当日稿').parameters.options.response.response.outputPropertyName = 'body';
code('校验最终稿', `const response = $input.first().json;
if (response.statusCode === 404) return [];
if (response.statusCode !== 200) throw new Error('GitHub读取失败：HTTP ' + response.statusCode);
const context = $('当日未处理才继续').first().json;
if (typeof response.body !== 'string') throw new Error('GitHub文件响应不完整');
const brief = JSON.parse(response.body.replace(/^\\uFEFF/, ''));
if (brief.slug !== context.slug || typeof brief.title !== 'string' || !brief.title.trim() || brief.title.length > 40 || typeof brief.excerpt !== 'string' || !brief.excerpt.trim() || typeof brief.content !== 'string') throw new Error('稿件字段或日期不正确');
const headings = [...brief.content.matchAll(/<h2\\b[^>]*>([\\s\\S]*?)<\\/h2>/gi)].map(m => m[1].replace(/<[^>]*>/g, '').trim());
if (/<h1\\b/i.test(brief.content) || headings.length !== 5 || headings.some((h, i) => !h.startsWith((i + 1) + '. ')) || /<(script|iframe|form)\\b|javascript\\s*:/i.test(brief.content)) throw new Error('正文结构不符合日报要求');
const [y, m, d] = context.date.split('-').map(Number);
if (!brief.content.includes('AI 与科技每日简报｜' + y + '年' + m + '月' + d + '日')) throw new Error('正文标题日期错误');
if (!Array.isArray(brief.tags) || brief.tags.length < 5 || brief.tags.length > 10 || brief.tags.some(t => typeof t !== 'string' || !t.trim() || t.length > 60)) throw new Error('标签不合法');
brief.tags = [...new Set(brief.tags.map(t => t.trim()))];
return [{ json: { ...context, sourceEtag: response.headers?.etag || null, brief } }];`, [1100, 0]);
http('检查WordPress已有文章', {
  url: 'https://aiaware.crst.win/wp-json/wp/v2/posts',
  sendQuery: true,
  queryParameters: { parameters: [
    { name: 'slug', value: '={{ $json.slug + "," + $json.slug + "__trashed" }}' },
    { name: 'status', value: 'publish,future,draft,pending,private,trash' },
    { name: 'context', value: 'edit' }, { name: '_fields', value: 'id,slug,status,link' }, { name: 'per_page', value: '100' }
  ] }
}, [1320, 0], true);
code('已存在则跳过', `const response = $input.first().json;
if (response.statusCode !== 200 || !Array.isArray(response.body)) throw new Error('无法完整检查WordPress文章；停止发布');
const context = $('校验最终稿').first().json;
if (response.body.some(post => !Number.isSafeInteger(post.id) || post.id < 1 || ![context.slug, context.slug + '__trashed'].includes(post.slug) || !['publish', 'future', 'draft', 'pending', 'private', 'trash'].includes(post.status))) throw new Error('已有文章响应无法核验；停止发布');
if (response.body.some(post => post.status !== 'trash')) return [];
return [{ json: context }];`, [1540, 0]);
code('准备头条封面', `const context = $input.first().json;
const cover = context.brief.featured_image;
let coverUrl, coverAlt, coverCaption;
if (cover) {
  if (cover.file !== 'cover.png' || cover.news_index !== 1 || typeof cover.alt !== 'string' || !cover.alt.trim() || typeof cover.caption !== 'string' || !cover.caption.trim()) throw new Error('封面字段不合法');
  coverUrl = 'https://raw.githubusercontent.com/zhfk/ai-daily-bridge/main/' + context.date + '/cover.png';
  coverAlt = cover.alt;
  coverCaption = cover.caption;
} else {
  const lead = context.brief.content.split(/<h2\\b[^>]*>/i)[1]?.split(/<h2\\b/i)[0] || '';
  const match = lead.match(/<img\\b[^>]*src="([^"]+)"[^>]*>/i);
  if (!match) throw new Error('头条没有封面或可用真实图片；请补充当日封面');
  coverUrl = match[1].replace(/&amp;/g, '&');
  coverAlt = 'AI 每日简报 ' + context.date + ' 头条图片';
  coverCaption = '头条原始图片，出处与署名见正文。';
}
if (!/^https:\\/\\/[^\\s<>\"]+$/.test(coverUrl)) throw new Error('封面地址不合法');
return [{ json: { ...context, coverUrl, coverAlt, coverCaption } }];`, [0, 320]);
http('下载当日封面', { url: '={{ $json.coverUrl }}' }, [220, 320]);
Object.assign(nodes.find(n => n.name === '下载当日封面').parameters.options.response.response, { responseFormat: 'file', outputPropertyName: 'cover' });
code('核验封面文件', `const item = $input.first();
const cover = item.binary?.cover;
if (!cover || !['image/png', 'image/jpeg', 'image/webp'].includes(cover.mimeType)) throw new Error('封面下载失败或不是可用图片；停止发文');
return [{ json: $('准备头条封面').first().json, binary: item.binary }];`, [440, 320]);
http('上传特色图片', {
  method: 'POST', url: 'https://aiaware.crst.win/wp-json/wp/v2/media',
  sendQuery: true, queryParameters: { parameters: [
    { name: 'title', value: '={{ $json.slug + "-cover" }}' },
    { name: 'alt_text', value: '={{ $json.coverAlt }}' },
    { name: 'caption', value: '={{ $json.coverCaption }}' }
  ] },
  sendHeaders: true, headerParameters: { parameters: [
    { name: 'Content-Type', value: '={{ $binary.cover.mimeType }}' },
    { name: 'Content-Disposition', value: '=attachment; filename="ai-daily-{{ $json.date }}-cover.png"' }
  ] },
  sendBody: true, contentType: 'binaryData', inputDataFieldName: 'cover'
}, [660, 320], true);
code('核验特色图片', `const response = $input.first().json;
const media = response.body;
if (response.statusCode !== 201 || !Number.isSafeInteger(media?.id) || media.id < 1 || media.media_type !== 'image' || typeof media.source_url !== 'string' || !media.source_url.startsWith('https://aiaware.crst.win/')) throw new Error('特色图片上传失败；尚未占位，可修复后重试');
const context = $('准备头条封面').first().json;
if (media.alt_text !== context.coverAlt) throw new Error('封面替代文本未保存');
return [{ json: { ...context, featuredMediaId: media.id, featuredMediaUrl: media.source_url } }];`, [880, 320]);
code('准备标签', `return $('校验最终稿').first().json.brief.tags.map(name => ({ json: { name } }));`, [1760, 0]);
http('创建或取得标签', { method: 'POST', url: 'https://aiaware.crst.win/wp-json/wp/v2/tags', sendBody: true, specifyBody: 'json', jsonBody: '={{ { name: $json.name } }}' }, [1980, 0], true);
code('汇总标签并准备占位', `const tagIds = $input.all().map(item => {
  const r = item.json;
  const id = r.statusCode === 201 ? r.body?.id : r.statusCode === 400 && r.body?.code === 'term_exists' ? r.body?.data?.term_id : null;
  if (!Number.isSafeInteger(Number(id)) || Number(id) < 1) throw new Error('WordPress标签处理失败；尚未占位，可修复后重试');
  return Number(id);
});
const context = $('核验特色图片').first().json;
if (tagIds.length !== context.brief.tags.length) throw new Error('标签响应不完整');
if ($now.setZone('Asia/Shanghai').toFormat('yyyy-MM-dd') !== context.date) return [];
const ledger = JSON.parse(context.ledgerBefore);
const previous = ledger.dates[context.key];
if (previous && ['reserved', 'needs_review'].includes(previous.status)) return [];
ledger.dates[context.key] = { status: 'reserved', owner: context.owner, date: context.date, slug: context.slug, sourceEtag: context.sourceEtag, featuredMediaId: context.featuredMediaId, reservedAt: $now.toISO(), attempt: (previous?.attempt || 0) + 1, ...(previous?.postId ? { previousPostId: previous.postId } : {}) };
return [{ json: { ...context, tagIds: [...new Set(tagIds)], ledgerClaim: JSON.stringify(ledger) } }];`, [2200, 0]);
table('原子抢占发布权', 'update', [
  { keyName: 'id', condition: 'eq', keyValue: '1' },
  { keyName: 'ledger', condition: 'eq', keyValue: '={{ $json.ledgerBefore }}' }
], [2420, 0], '={{ $json.ledgerClaim }}');
code('核验占位归属', `const row = $input.first().json;
const context = $('汇总标签并准备占位').first().json;
if (typeof row.ledger !== 'string') return [];
const record = JSON.parse(row.ledger).dates?.[context.key];
if (!record || record.owner !== context.owner || record.status !== 'reserved') return [];
if ($now.setZone('Asia/Shanghai').toFormat('yyyy-MM-dd') !== context.date) throw new Error('已跨日，保留占位并停止发布');
return [{ json: context }];`, [2640, 0]);
http('发布一次（禁止重试）', {
  method: 'POST', url: 'https://aiaware.crst.win/wp-json/wp/v2/posts', sendBody: true, specifyBody: 'json',
  jsonBody: '={{ { title: $json.brief.title, slug: $json.slug, excerpt: $json.brief.excerpt, content: $json.brief.content, tags: $json.tagIds, categories: [2], featured_media: $json.featuredMediaId, status: "publish" } }}'
}, [2860, 0], true, true);
code('整理发布回执', `const context = $('核验占位归属').first().json;
const response = $input.first().json;
const post = response.body;
const confirmed = response.statusCode === 201 && Number.isSafeInteger(post?.id) && post.id > 0 && post.slug === context.slug && post.status === 'publish' && Array.isArray(post.categories) && post.categories.includes(2) && post.featured_media === context.featuredMediaId && typeof post.link === 'string' && post.link.startsWith('https://aiaware.crst.win/');
const ledger = JSON.parse(context.ledgerClaim);
ledger.dates[context.key] = { ...ledger.dates[context.key], status: confirmed ? 'published' : 'needs_review', finishedAt: $now.toISO(), ...(post?.id ? { postId: post.id } : {}), ...(confirmed ? { link: post.link } : {}), httpStatus: response.statusCode || null };
return [{ json: { date: context.date, key: context.key, owner: context.owner, confirmed, postId: post?.id || null, link: confirmed ? post.link : null, ledgerClaim: context.ledgerClaim, ledgerReceipt: JSON.stringify(ledger) } }];`, [3080, 0]);
table('持久保存回执', 'update', [
  { keyName: 'id', condition: 'eq', keyValue: '1' },
  { keyName: 'ledger', condition: 'eq', keyValue: '={{ $json.ledgerClaim }}' }
], [3300, 0], '={{ $json.ledgerReceipt }}');
code('完成或要求核查', `const receipt = $('整理发布回执').first().json;
const row = $input.first().json;
if (typeof row.ledger !== 'string' || JSON.parse(row.ledger).dates?.[receipt.key]?.owner !== receipt.owner) throw new Error('回执保存遇到冲突；占位仍保留，禁止直接重发，请核查WordPress');
if (!receipt.confirmed) throw new Error('发布结果需人工核查；当日已永久占位，自动重试不会再次发帖');
return [{ json: { status: 'published', date: receipt.date, postId: receipt.postId, link: receipt.link } }];`, [3520, 0]);
add('使用说明与不重发保障', 'stickyNote', { content: '## GitHub → WordPress 每日报\n北京时间每5分钟检查 main 分支 YYYY-MM-DD/wordpress.json。只发布当日。\n\n**防重**：已发布、草稿、待审、私密、定时文章存在则跳过。按用户要求，回收站文章或已清空的文章允许重新发布。每次重新发布仍须原子抢占。\n\n持久单行 ledger 用旧值条件更新（CAS）抢占；核验执行 ID 后才能调用发帖。发布 POST 禁止自动重试。reserved / needs_review 永不自动释放；结果不明时先人工核对。\n\n成功记录 postId / link / 源文件 ETag / 发布次数。流程重启、重复推送、手动重跑和当日改稿不会复制仍存在的正常文章。\n\n不要清空记录、复制独立记录表或仅重跑发布节点。保留和备份 Data Table。', width: 920, height: 360 }, [400, 260]);
chain('每5分钟检查', '北京时间日期');
chain('手动核验', '北京时间日期');
chain('北京时间日期', '读取持久记录', '当日未处理才继续', '读取GitHub当日稿', '校验最终稿', '检查WordPress已有文章', '已存在则跳过', '准备标签', '创建或取得标签', '汇总标签并准备占位', '原子抢占发布权', '核验占位归属', '发布一次（禁止重试）', '整理发布回执', '持久保存回执', '完成或要求核查');
chain('已存在则跳过', '准备头条封面', '下载当日封面', '核验封面文件', '上传特色图片', '核验特色图片', '准备标签');
const stages = ['北京时间日期', '读取持久记录', '当日未处理才继续', '读取GitHub当日稿', '校验最终稿', '检查WordPress已有文章', '已存在则跳过', '准备头条封面', '下载当日封面', '核验封面文件', '上传特色图片', '核验特色图片', '准备标签', '创建或取得标签', '汇总标签并准备占位', '原子抢占发布权', '核验占位归属', '发布一次（禁止重试）', '整理发布回执', '持久保存回执', '完成或要求核查'];
stages.forEach((name, index) => { nodes.find(node => node.name === name).position = [(index % 6) * 220, Math.floor(index / 6) * 320]; });
nodes.find(node => node.name === '每5分钟检查').position = [-220, 0];
nodes.find(node => node.name === '手动核验').position = [-220, 180];
const note = nodes.find(node => node.name === '使用说明与不重发保障');
note.position = [1320, 0];
note.parameters.width = 560;
note.parameters.height = 1100;
const workflow = { name: 'GitHub 当日 AI 简报 → WordPress · 严格防重', nodes, connections, settings: { executionOrder: 'v1', timezone: 'Asia/Shanghai', executionTimeout: 240, saveDataErrorExecution: 'all', saveDataSuccessExecution: 'all', saveManualExecutions: true, callerPolicy: 'workflowsFromSameOwner' }, active: false, pinData: {} };
fs.writeFileSync(path.join(__dirname, 'ai-daily-github-wordpress.json'), JSON.stringify(workflow, null, 2) + '\n');
console.log(`Built ${nodes.length} nodes with persistent CAS ledger; no credentials embedded.`);
