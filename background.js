// ============================================================
// BookmarkAI · Background Service Worker
// ============================================================

// ---------- UUID ----------
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// ============================================================
// 本地日志系统
// 存储在 chrome.storage.local["bai_logs"]，最多 MAX_LOGS 条
// ============================================================
const MAX_LOGS = 200;
const LOG_KEY = 'bai_logs';
const LOG_LEVEL = { DEBUG: 'debug', INFO: 'info', WARN: 'warn', ERROR: 'error' };

async function writeLog(level, message, data) {
  const consoleFn =
    level === 'error' ? console.error :
    level === 'warn'  ? console.warn  : console.log;
  data !== undefined ? consoleFn('[BookmarkAI]', message, data) : consoleFn('[BookmarkAI]', message);

  try {
    const stored = await chrome.storage.local.get(LOG_KEY);
    const logs = stored[LOG_KEY] || [];
    logs.push({
      id: generateUUID(),
      ts: new Date().toISOString(),
      level,
      message,
      data: data !== undefined
        ? (typeof data === 'string' ? data : (() => { try { return JSON.stringify(data, null, 2); } catch(_){ return String(data); } })())
        : null,
    });
    if (logs.length > MAX_LOGS) logs.splice(0, logs.length - MAX_LOGS);
    await chrome.storage.local.set({ [LOG_KEY]: logs });
  } catch (e) {
    console.error('[BookmarkAI] 日志写入失败:', e);
  }
}

const Log = {
  debug: (msg, data) => writeLog('debug', msg, data),
  info:  (msg, data) => writeLog('info',  msg, data),
  warn:  (msg, data) => writeLog('warn',  msg, data),
  error: (msg, data) => writeLog('error', msg, data),
};

// ---------- 获取书签文件夹路径 ----------
async function getFolderPath(parentId) {
  const parts = [];
  let currentId = parentId;
  try {
    while (currentId) {
      const nodes = await chrome.bookmarks.get(currentId);
      if (!nodes || !nodes[0]) break;
      const node = nodes[0];
      if (node.title) parts.unshift(node.title);
      currentId = node.parentId || null;
    }
  } catch (_) {}
  return parts.join('/');
}

// ---------- 抓取页面内容 ----------
// ⚠️ 修复：移除 User-Agent 自定义 header
// Service Worker 中 User-Agent 是 forbidden header，设置它会抛 TypeError
// 导致 fetch 直接失败，整个流程中断，这就是没有任何日志输出的根本原因
async function fetchPageContent(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    });
    clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }

    const ct = response.headers.get('Content-Type') || '';
    if (!ct.includes('html') && !ct.includes('text')) {
      return { pageTitle: '', pageDescription: '', pageText: `[非 HTML 内容: ${ct}]`, crawlError: '' };
    }

    const html = await response.text();

    const titleMatch = html.match(/<title[^>]*>([^<]{0,300})<\/title>/i);
    const pageTitle = titleMatch ? decodeHTMLEntities(titleMatch[1].trim()) : '';

    const descPatterns = [
      /<meta\s+name=["']description["']\s+content=["']([^"']{0,500})["']/i,
      /<meta\s+content=["']([^"']{0,500})["']\s+name=["']description["']/i,
      /<meta\s+property=["']og:description["']\s+content=["']([^"']{0,500})["']/i,
      /<meta\s+content=["']([^"']{0,500})["']\s+property=["']og:description["']/i,
    ];
    let pageDescription = '';
    for (const pat of descPatterns) {
      const m = html.match(pat);
      if (m) { pageDescription = decodeHTMLEntities(m[1].trim()); break; }
    }

    const pageText = html
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<svg[\s\S]*?<\/svg>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .substring(0, 3000);

    return { pageTitle, pageDescription, pageText, crawlError: '' };

  } catch (err) {
    const msg = err.name === 'AbortError' ? '抓取超时（12s）' : (err.message || '未知错误');
    return { pageTitle: '', pageDescription: '', pageText: '', crawlError: msg };
  }
}

function decodeHTMLEntities(str) {
  return str
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
}

// ---------- 调用 AI API ----------
async function callAI(config, { pageTitle, pageDescription, pageText }, bookmarkTitle, url) {
  const { apiUrl, modelParams, apiKey } = config;
  if (!apiUrl || !apiKey) throw new Error('AI 配置不完整，请在设置中填写请求地址和密钥');

  let params = {};
  try { params = JSON.parse(modelParams || '{}'); }
  catch (_) { params = { model: 'moonshot-v1-8k', max_tokens: 1000 }; }

  const prompt = `你是一个专业的网页内容分析助手。请根据以下网页信息生成结构化摘要。

【书签标题】${bookmarkTitle}
【页面URL】${url}
【页面 <title>】${pageTitle}
【Meta 描述】${pageDescription}
【页面正文（节选）】
${pageText.substring(0, 1500)}

请严格按照如下 JSON 格式返回，不要输出任何额外内容：
{
  "generated_title": "用10字以内概括网页核心主题",
  "generated_description": "用50~100字描述网页的主要内容和价值",
  "tags": "标签1,标签2,标签3,标签4,标签5"
}`;

  const requestBody = {
    ...params,
    messages: [
      { role: 'system', content: '你是一个专业的网页内容分析助手，只输出合法的 JSON，不输出任何 Markdown 格式或额外说明。' },
      { role: 'user', content: prompt },
    ],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(requestBody),
    signal: controller.signal,
  });
  clearTimeout(timer);

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    throw new Error(`AI API 错误 ${response.status}: ${errText.substring(0, 300)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content || data?.output?.text || '';
  const jsonMatch = content.match(/\{[\s\S]*?\}/);
  if (!jsonMatch) throw new Error(`AI 返回内容无法解析为 JSON，原始: ${content.substring(0, 200)}`);

  const parsed = JSON.parse(jsonMatch[0]);
  return {
    generated_title: parsed.generated_title || '',
    generated_description: parsed.generated_description || '',
    tags: parsed.tags || '',
  };
}

// ---------- 回传后端 ----------
async function postToBackend(config, data) {
  const { backendUrl, backendToken } = config;
  if (!backendUrl) return;
  const headers = { 'Content-Type': 'application/json' };
  if (backendToken) headers['Authorization'] = `Bearer ${backendToken}`;
  const response = await fetch(backendUrl, { method: 'POST', headers, body: JSON.stringify(data) });
  if (!response.ok) throw new Error(`后端回传失败 HTTP ${response.status}`);
}

async function incrementCount() {
  const { processedCount = 0 } = await chrome.storage.local.get('processedCount');
  await chrome.storage.local.set({ processedCount: processedCount + 1 });
}

// ============================================================
// 主监听
// ============================================================
chrome.bookmarks.onCreated.addListener(async (id, bookmark) => {
  const { isEnabled } = await chrome.storage.local.get('isEnabled');
  if (!isEnabled) return;
  if (!bookmark.url) {
    await Log.debug('新增项是文件夹，跳过', { title: bookmark.title });
    return;
  }

  await Log.info(`📌 捕获新书签: ${bookmark.title}`, { url: bookmark.url });

  const config = await chrome.storage.sync.get(['apiUrl', 'modelParams', 'apiKey', 'backendUrl', 'backendToken']);

  try {
    const folderPath = await getFolderPath(bookmark.parentId);
    await Log.debug('文件夹路径', folderPath);

    await Log.info('开始抓取页面内容...');
    const pageInfo = await fetchPageContent(bookmark.url);
    if (pageInfo.crawlError) {
      await Log.warn('页面抓取失败', pageInfo.crawlError);
    } else {
      await Log.info('页面抓取成功', { title: pageInfo.pageTitle, textLen: pageInfo.pageText.length });
    }

    let aiResult = { generated_title: '', generated_description: '', tags: '' };
    if (config.apiUrl && config.apiKey) {
      await Log.info('开始调用 AI 分析...');
      try {
        aiResult = await callAI(config, pageInfo, bookmark.title || '', bookmark.url);
        await Log.info('AI 分析完成', aiResult);
      } catch (aiErr) {
        await Log.error('AI 调用失败', aiErr.message);
        aiResult.generated_description = `[AI分析失败: ${aiErr.message}]`;
      }
    } else {
      await Log.warn('未配置 AI 接口，跳过分析');
    }

    const bookmarkData = {
      url: bookmark.url,
      bookmark_title: bookmark.title || '',
      folder_path: folderPath,
      date_added: bookmark.dateAdded ? String(bookmark.dateAdded) : String(Date.now()),
      page_title: pageInfo.pageTitle,
      page_description: pageInfo.pageDescription,
      page_text: pageInfo.pageText.substring(0, 500),
      generated_title: aiResult.generated_title,
      generated_description: aiResult.generated_description,
      crawl_error: pageInfo.crawlError,
      tags: aiResult.tags,
    };

    const uploadPayload = { bookmarks: [bookmarkData] };

    await Log.info('✅ 最终书签数据', bookmarkData);

    if (config.backendUrl) {
      try {
        await postToBackend(config, uploadPayload);
        await Log.info('✅ 数据已回传后端', config.backendUrl);
      } catch (backendErr) {
        await Log.error('后端回传失败', backendErr.message);
      }
    }

    await incrementCount();

  } catch (err) {
    await Log.error('❌ 未捕获的错误', err.message);
  }
});

// ============================================================
// 消息总线
// ============================================================
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_STATUS') {
    chrome.storage.local.get(['isEnabled', 'processedCount']).then((data) => {
      sendResponse({ isEnabled: data.isEnabled || false, processedCount: data.processedCount || 0 });
    });
    return true;
  }
  if (message.type === 'GET_LOGS') {
    chrome.storage.local.get(LOG_KEY).then((data) => {
      sendResponse({ logs: (data[LOG_KEY] || []).slice().reverse() });
    });
    return true;
  }
  if (message.type === 'CLEAR_LOGS') {
    chrome.storage.local.set({ [LOG_KEY]: [] }).then(() => sendResponse({ ok: true }));
    return true;
  }
});
