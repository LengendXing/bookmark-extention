// options.js

// ---- AI 预设配置 ----
const AI_PRESETS = {
  kimi: {
    apiUrl: 'https://api.moonshot.cn/v1/chat/completions',
    modelParams: JSON.stringify({
      model: 'moonshot-v1-8k',
      max_tokens: 1000,
      temperature: 0.3,
    }, null, 2),
  },
  qwen: {
    apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    modelParams: JSON.stringify({
      model: 'qwen-turbo',
      max_tokens: 1000,
      temperature: 0.3,
    }, null, 2),
  },
  deepseek: {
    apiUrl: 'https://api.deepseek.com/chat/completions',
    modelParams: JSON.stringify({
      model: 'deepseek-chat',
      max_tokens: 1000,
      temperature: 0.3,
    }, null, 2),
  },
  zhipu: {
    apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    modelParams: JSON.stringify({
      model: 'glm-4-flash',
      max_tokens: 1000,
      temperature: 0.3,
    }, null, 2),
  },
};

// ---- DOM 引用 ----
const $ = (id) => document.getElementById(id);
const apiUrlEl     = $('apiUrl');
const apiKeyEl     = $('apiKey');
const modelParamsEl= $('modelParams');
const backendUrlEl = $('backendUrl');
const backendTokenEl=$('backendToken');
const testResultEl = $('testResult');
const toastEl      = $('toast');

// ---- 初始化：读取已保存配置 ----
(async () => {
  const cfg = await chrome.storage.sync.get([
    'apiUrl', 'apiKey', 'modelParams', 'backendUrl', 'backendToken',
  ]);
  if (cfg.apiUrl)       apiUrlEl.value       = cfg.apiUrl;
  if (cfg.apiKey)       apiKeyEl.value       = cfg.apiKey;
  if (cfg.modelParams)  modelParamsEl.value  = cfg.modelParams;
  if (cfg.backendUrl)   backendUrlEl.value   = cfg.backendUrl;
  if (cfg.backendToken) backendTokenEl.value = cfg.backendToken;

  // 高亮匹配的预设
  if (cfg.apiUrl) {
    document.querySelectorAll('.preset-btn').forEach((btn) => {
      const preset = AI_PRESETS[btn.dataset.preset];
      if (preset && preset.apiUrl === cfg.apiUrl) btn.classList.add('active');
    });
  }
})();

// ---- 预设按钮 ----
document.querySelectorAll('.preset-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const preset = AI_PRESETS[btn.dataset.preset];
    if (!preset) return;

    apiUrlEl.value       = preset.apiUrl;
    modelParamsEl.value  = preset.modelParams;

    document.querySelectorAll('.preset-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');

    testResultEl.className = 'test-result';
    showToast('已填入预设，请再填写你的 API 密钥', 'success');
  });
});

// ---- 保存 AI 配置 ----
$('saveAiBtn').addEventListener('click', async () => {
  const apiUrl = apiUrlEl.value.trim();
  const apiKey = apiKeyEl.value.trim();
  const modelParams = modelParamsEl.value.trim();

  if (!apiUrl) return showToast('请填写请求地址', 'error');
  if (!apiKey) return showToast('请填写 API 密钥', 'error');

  // 验证 JSON
  if (modelParams) {
    try { JSON.parse(modelParams); }
    catch (_) { return showToast('模型参数 JSON 格式有误，请检查', 'error'); }
  }

  await chrome.storage.sync.set({ apiUrl, apiKey, modelParams });
  showToast('✅ AI 配置已保存', 'success');
  testResultEl.className = 'test-result';
});

// ---- 保存后台配置 ----
$('saveBackendBtn').addEventListener('click', async () => {
  const backendUrl   = backendUrlEl.value.trim();
  const backendToken = backendTokenEl.value.trim();

  await chrome.storage.sync.set({ backendUrl, backendToken });
  showToast('✅ 后台配置已保存', 'success');
});

// ---- 测试 AI 连通性 ----
$('testAiBtn').addEventListener('click', async () => {
  const apiUrl     = apiUrlEl.value.trim();
  const apiKey     = apiKeyEl.value.trim();
  const modelParams= modelParamsEl.value.trim();

  if (!apiUrl || !apiKey) {
    showToast('请先填写请求地址和密钥', 'error');
    return;
  }

  let params = { model: 'moonshot-v1-8k', max_tokens: 50 };
  if (modelParams) {
    try { params = { ...JSON.parse(modelParams), max_tokens: 50 }; }
    catch (_) {}
  }

  testResultEl.className = 'test-result';
  testResultEl.textContent = '🔄 正在测试连通性...';
  testResultEl.style.display = 'block';
  testResultEl.style.color = '#9ca3af';
  testResultEl.style.background = 'rgba(255,255,255,0.04)';
  testResultEl.style.border = '1px solid rgba(255,255,255,0.08)';

  const $btn = $('testAiBtn');
  $btn.disabled = true;
  $btn.textContent = '测试中...';

  try {
    const body = {
      ...params,
      messages: [
        { role: 'user', content: '请返回：{"ok":true}，不要有其他内容' },
      ],
    };

    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${JSON.stringify(data).substring(0, 200)}`);
    }

    const reply = data?.choices?.[0]?.message?.content || JSON.stringify(data);
    testResultEl.className = 'test-result success';
    testResultEl.textContent = `✅ 连接成功！\n模型回复: ${reply.substring(0, 150)}`;
  } catch (err) {
    testResultEl.className = 'test-result error';
    testResultEl.textContent = `❌ 测试失败：${err.message}`;
  } finally {
    $btn.disabled = false;
    $btn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="5 3 19 12 5 21 5 3"/></svg>
      测试连通性`;
  }
});

// ---- Toast ----
let toastTimer = null;
function showToast(msg, type = 'success') {
  toastEl.textContent = msg;
  toastEl.className = `toast ${type} show`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 2800);
}

// ============================================================
// Tab 切换
// ============================================================
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${target}`).classList.add('active');
    if (target === 'logs') loadLogs();
  });
});

// ============================================================
// 日志系统
// ============================================================
let activeFilters = new Set(['debug', 'info', 'warn', 'error']);
let allLogs = [];

// 级别过滤 chip
document.querySelectorAll('.level-chip').forEach((chip) => {
  chip.addEventListener('click', () => {
    const level = chip.dataset.level;
    if (activeFilters.has(level)) {
      activeFilters.delete(level);
      chip.classList.remove('on');
    } else {
      activeFilters.add(level);
      chip.classList.add('on');
    }
    renderLogs(allLogs);
  });
});

// 刷新 & 清空
document.getElementById('refreshLogsBtn').addEventListener('click', loadLogs);
document.getElementById('clearLogsBtn').addEventListener('click', async () => {
  if (!confirm('确认清空所有运行日志？')) return;
  await chrome.runtime.sendMessage({ type: 'CLEAR_LOGS' });
  allLogs = [];
  renderLogs([]);
  updateLogBadge(0);
  showToast('日志已清空', 'success');
});

async function loadLogs() {
  const refreshBtn = document.getElementById('refreshLogsBtn');
  refreshBtn.disabled = true;
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_LOGS' });
    allLogs = resp.logs || [];
    renderLogs(allLogs);
    const errorCount = allLogs.filter(l => l.level === 'error').length;
    updateLogBadge(errorCount);
  } catch(e) {
    console.error('获取日志失败', e);
  } finally {
    refreshBtn.disabled = false;
  }
}

function updateLogBadge(errorCount) {
  const badge = document.getElementById('logBadge');
  if (errorCount > 0) {
    badge.style.display = 'inline';
    badge.textContent = errorCount;
  } else {
    badge.style.display = 'none';
  }
}

function renderLogs(logs) {
  const listEl = document.getElementById('logList');
  const countEl = document.getElementById('logCount');

  const filtered = logs.filter(l => activeFilters.has(l.level));
  countEl.textContent = `${filtered.length} 条`;

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="log-empty">
        <div class="empty-icon">📋</div>
        ${logs.length === 0
          ? '暂无日志，开启监听并添加书签后这里会显示处理记录'
          : '当前过滤条件下没有匹配的日志'}
      </div>`;
    return;
  }

  listEl.innerHTML = filtered.map(log => {
    const ts = formatTs(log.ts);
    const dataHtml = log.data
      ? `<div class="log-data" title="点击复制" onclick="copyLogData(this)">${escapeHtml(log.data)}</div>`
      : '';
    return `
      <div class="log-item ${log.level}">
        <div class="log-header">
          <span class="log-badge">${log.level}</span>
          <span class="log-ts">${ts}</span>
        </div>
        <div class="log-msg">${escapeHtml(log.message)}</div>
        ${dataHtml}
      </div>`;
  }).join('');
}

function formatTs(iso) {
  try {
    const d = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} `
         + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch(_) { return iso; }
}

function escapeHtml(str) {
  if (typeof str !== 'string') str = String(str);
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// 全局函数：点击 data 块复制内容
window.copyLogData = function(el) {
  navigator.clipboard.writeText(el.textContent).then(() => showToast('已复制到剪贴板', 'success'));
};

// 进入页面时检查是否有 error 日志，更新徽标
(async () => {
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_LOGS' });
    allLogs = resp.logs || [];
    const errorCount = allLogs.filter(l => l.level === 'error').length;
    updateLogBadge(errorCount);
  } catch(_) {}
})();
