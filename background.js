// 全局变量
let rotationTimer = null;
const ROTATION_INTERVAL = 30000; // 30秒轮换一次

// 初始化
chrome.runtime.onInstalled.addListener(function() {
  // 初始化存储
  chrome.storage.local.set({
    chartList: [],
    currentIndex: 0,
    isRotating: false
  });
});

// 监听消息
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  switch (message.action) {
    case 'startRotation':
      startRotation();
      sendResponse({ status: 'started' });
      break;
    case 'stopRotation':
      stopRotation();
      sendResponse({ status: 'stopped' });
      break;
    case 'nextChart':
      rotateToNextChart();
      sendResponse({ status: 'rotated' });
      break;
  }
  
  return true;
});

// 开始轮播
function startRotation() {
  stopRotation(); // 确保之前的定时器被清除
  
  chrome.storage.local.get(['chartList', 'currentIndex'], function(data) {
    const chartList = data.chartList || [];
    let currentIndex = data.currentIndex || 0;
    
    if (chartList.length === 0) {
      return;
    }
    
    // 立即加载当前图表
    loadChart(chartList[currentIndex].url);
    
    // 设置定时器
    rotationTimer = setInterval(function() {
      rotateToNextChart();
    }, ROTATION_INTERVAL);
    
    // 更新图标状态
    updateBadgeForRotation(true);
  });
}

// 停止轮播
function stopRotation() {
  if (rotationTimer) {
    clearInterval(rotationTimer);
    rotationTimer = null;
  }
  
  // 更新图标状态
  updateBadgeForRotation(false);
}

// 切换到下一个图表
function rotateToNextChart() {
  chrome.storage.local.get(['chartList', 'currentIndex', 'isRotating'], function(data) {
    const chartList = data.chartList || [];
    let currentIndex = data.currentIndex || 0;
    const isRotating = data.isRotating;
    
    if (chartList.length === 0) {
      return;
    }
    
    // 计算下一个索引
    currentIndex = (currentIndex + 1) % chartList.length;
    
    // 更新当前索引
    chrome.storage.local.set({ currentIndex });
    
    // 加载下一个图表
    loadChart(chartList[currentIndex].url);
    
    // 向popup发送状态更新消息
    chrome.runtime.sendMessage({ action: 'statusUpdate' });
  });
}

// 加载指定URL的图表
function loadChart(url) {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { url: url });
    } else {
      chrome.tabs.create({ url: url });
    }
  });
}

// 更新图标状态
function updateBadgeForRotation(isRotating) {
  if (isRotating) {
    chrome.action.setBadgeText({ text: '▶' });
    chrome.action.setBadgeBackgroundColor({ color: '#4a6cf7' });
  } else {
    chrome.action.setBadgeText({ text: '❚❚' });
    chrome.action.setBadgeBackgroundColor({ color: '#ff9f43' });
  }
}