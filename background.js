// 全局变量
let rotationTimer = null;
const DEFAULT_ROTATION_INTERVAL = 30000; // 默认30秒轮换一次

// 初始化
chrome.runtime.onInstalled.addListener(function(details) {
  // 只在首次安装时初始化存储
  if (details.reason === 'install') {
    chrome.storage.local.set({
      chartList: [],
      currentIndex: 0,
      isRotating: false,
      rotationInterval: 30 // 默认30秒
    });
  }
});

// 监听消息
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  // 确保 sendResponse 被调用
  const handleMessage = async () => {
    try {
      switch (message.action) {
        case 'startRotation':
          await startRotation();
          sendResponse({ status: 'started' });
          break;
        case 'stopRotation':
          await stopRotation(message.shouldReset);
          sendResponse({ status: 'stopped' });
          break;
        case 'nextChart':
          await rotateToNextChart();
          sendResponse({ status: 'rotated' });
          break;
        case 'statusUpdate':
          sendResponse({ status: 'updated' });
          break;
        default:
          sendResponse({ status: 'unknown_action' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      sendResponse({ status: 'error', message: error.message });
    }
  };

  handleMessage();
  return true; // 保持消息通道开放
});

// 开始轮播
async function startRotation() {
  await stopRotation(); // 确保之前的定时器被清除
  
  const data = await chrome.storage.local.get(['chartList', 'currentIndex', 'rotationInterval']);
  const chartList = data.chartList || [];
  let currentIndex = data.currentIndex || 0;
  const rotationInterval = (data.rotationInterval || 30) * 1000; // 转换为毫秒
  
  if (chartList.length === 0) {
    return;
  }
  
  // 立即加载当前图表
  await loadChart(chartList[currentIndex].url);
  
  // 重置状态
  await chrome.storage.local.set({ 
    isRotating: true,
    lastRotationTime: Date.now() // 添加最后轮播时间记录
  });
  
  // 设置定时器
  rotationTimer = setInterval(async () => {
    await rotateToNextChart();
  }, rotationInterval);
  
  // 更新图标状态
  await updateBadgeForRotation(true);
  
  // 通知content script重置状态
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs.length > 0) {
    await chrome.tabs.sendMessage(tabs[0].id, { action: 'resetStatus' });
  }
}

// 停止轮播
async function stopRotation(shouldReset = false) {
  if (rotationTimer) {
    clearInterval(rotationTimer);
    rotationTimer = null;
  }
  
  // 更新storage状态
  await chrome.storage.local.set({ 
    isRotating: false,
    lastRotationTime: shouldReset ? null : Date.now() // 如果是停止操作，清除最后轮播时间
  });
  
  // 更新图标状态
  if (shouldReset) {
    // 如果是停止操作，清除图标文字和背景色
    await chrome.action.setBadgeText({ text: '' });
    await chrome.action.setBadgeBackgroundColor({ color: '#4a6cf7' });
  } else {
    // 如果是暂停操作，显示暂停图标
    await chrome.action.setBadgeText({ text: '❚❚' });
    await chrome.action.setBadgeBackgroundColor({ color: '#ff9f43' });
  }
  
  // 如果需要重置，发送消息到content script
  if (shouldReset) {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      await chrome.tabs.sendMessage(tabs[0].id, { action: 'hideStatus' });
    }
  }
}

// 切换到下一个图表
async function rotateToNextChart() {
  const data = await chrome.storage.local.get(['chartList', 'currentIndex', 'isRotating']);
  const chartList = data.chartList || [];
  let currentIndex = data.currentIndex || 0;
  const isRotating = data.isRotating;
  
  if (chartList.length === 0) {
    return;
  }
  
  // 计算下一个索引
  currentIndex = (currentIndex + 1) % chartList.length;
  
  // 更新当前索引
  await chrome.storage.local.set({ currentIndex });
  
  // 加载下一个图表
  await loadChart(chartList[currentIndex].url);
  
  // 向popup发送状态更新消息
  await chrome.runtime.sendMessage({ action: 'statusUpdate' });
}

// 加载指定URL的图表
async function loadChart(url) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tabs.length > 0) {
    // 先更新URL
    await chrome.tabs.update(tabs[0].id, { url: url });
    
    // 等待页面加载完成后再更新最后轮播时间
    chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo, tab) {
      if (tabId === tabs[0].id && changeInfo.status === 'complete') {
        chrome.storage.local.set({ lastRotationTime: Date.now() });
        chrome.tabs.onUpdated.removeListener(listener);
      }
    });
  } else {
    await chrome.tabs.create({ url: url });
  }
}

// 更新图标状态
async function updateBadgeForRotation(isRotating) {
  if (isRotating) {
    await chrome.action.setBadgeText({ text: '▶' });
    await chrome.action.setBadgeBackgroundColor({ color: '#4a6cf7' });
  } else {
    await chrome.action.setBadgeText({ text: '❚❚' });
    await chrome.action.setBadgeBackgroundColor({ color: '#ff9f43' });
  }
}