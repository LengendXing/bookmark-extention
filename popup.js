// popup.js
document.addEventListener('DOMContentLoaded', async () => {
  const toggleSwitch = document.getElementById('toggleSwitch');
  const statusLabel = document.getElementById('statusLabel');
  const statusDesc = document.getElementById('statusDesc');
  const statDot = document.getElementById('statDot');
  const countNum = document.getElementById('countNum');
  const settingsBtn = document.getElementById('settingsBtn');
  const configWarning = document.getElementById('configWarning');

  // 加载当前状态
  const { isEnabled = false, processedCount = 0 } =
    await chrome.storage.local.get(['isEnabled', 'processedCount']);

  // 检查 AI 是否已配置
  const { apiUrl, apiKey } = await chrome.storage.sync.get(['apiUrl', 'apiKey']);
  if (!apiUrl || !apiKey) {
    configWarning.classList.add('visible');
  }

  // 初始化 UI
  applyState(isEnabled, processedCount);
  toggleSwitch.checked = isEnabled;

  // 切换开关
  toggleSwitch.addEventListener('change', async () => {
    const enabled = toggleSwitch.checked;
    await chrome.storage.local.set({ isEnabled: enabled });
    const { processedCount: cnt = 0 } = await chrome.storage.local.get('processedCount');
    applyState(enabled, cnt);
  });

  // 跳转设置页
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });

  function applyState(enabled, count) {
    countNum.textContent = count;

    if (enabled) {
      statusLabel.textContent = '监听已开启';
      statusLabel.classList.add('active');
      statusDesc.textContent = '正在监听新增书签，AI 将自动分析';
      statusDesc.classList.add('active');
      statDot.classList.add('active');
    } else {
      statusLabel.textContent = '监听已关闭';
      statusLabel.classList.remove('active');
      statusDesc.textContent = '点击开关，开始监听新增书签';
      statusDesc.classList.remove('active');
      statDot.classList.remove('active');
    }
  }
});
