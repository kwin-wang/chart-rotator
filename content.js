// 内容脚本 - 当前版本只需显示倒计时状态
let countdownElement = null;
let rotationInterval = 30000; // 默认30秒
let isStopped = false; // 添加停止状态标记
let isPageLoaded = false; // 添加页面加载状态标记
let isDragging = false;
let currentX;
let currentY;
let initialX;
let initialY;
let xOffset = 0;
let yOffset = 0;

// 创建倒计时元素
function createCountdownElement() {
  if (!countdownElement) {
    countdownElement = document.createElement('div');
    countdownElement.style.position = 'fixed';
    countdownElement.style.padding = '5px 10px';
    countdownElement.style.backgroundColor = 'rgba(74, 108, 247, 0.1)';
    countdownElement.style.color = '#4a6cf7';
    countdownElement.style.fontWeight = 'bold';
    countdownElement.style.borderRadius = '4px';
    countdownElement.style.zIndex = '9999';
    countdownElement.style.cursor = 'move';
    countdownElement.style.userSelect = 'none';
    countdownElement.style.transition = 'background-color 0.3s, color 0.3s';
    
    // 添加拖拽事件监听
    countdownElement.addEventListener('mousedown', dragStart);
    document.addEventListener('mousemove', drag);
    document.addEventListener('mouseup', dragEnd);
    
    document.body.appendChild(countdownElement);
    
    // 恢复保存的位置
    chrome.storage.local.get(['countdownPosition'], function(data) {
      if (data.countdownPosition) {
        // 确保位置在可视区域内
        const maxX = window.innerWidth - countdownElement.offsetWidth;
        const maxY = window.innerHeight - countdownElement.offsetHeight;
        
        xOffset = Math.min(Math.max(data.countdownPosition.x, 0), maxX);
        yOffset = Math.min(Math.max(data.countdownPosition.y, 0), maxY);
        
        countdownElement.style.left = `${xOffset}px`;
        countdownElement.style.top = `${yOffset}px`;
        countdownElement.style.transform = 'none';
      } else {
        // 如果没有保存的位置，设置为默认位置（顶部中间）
        countdownElement.style.top = '20px';
        countdownElement.style.left = '50%';
        countdownElement.style.transform = 'translateX(-50%)';
      }
    });
  }
  return countdownElement;
}

// 拖拽开始
function dragStart(e) {
  initialX = e.clientX - xOffset;
  initialY = e.clientY - yOffset;
  
  if (e.target === countdownElement) {
    isDragging = true;
  }
}

// 拖拽中
function drag(e) {
  if (isDragging) {
    e.preventDefault();
    
    currentX = e.clientX - initialX;
    currentY = e.clientY - initialY;
    
    xOffset = currentX;
    yOffset = currentY;
    
    setTranslate(currentX, currentY, countdownElement);
    
    // 保存新位置
    chrome.storage.local.set({
      countdownPosition: {
        x: currentX,
        y: currentY
      }
    });
  }
}

// 拖拽结束
function dragEnd() {
  initialX = currentX;
  initialY = currentY;
  isDragging = false;
  
  // 保存最终位置
  chrome.storage.local.set({
    countdownPosition: {
      x: xOffset,
      y: yOffset
    }
  });
}

// 设置元素位置
function setTranslate(xPos, yPos, el) {
  // 确保位置在可视区域内
  const maxX = window.innerWidth - el.offsetWidth;
  const maxY = window.innerHeight - el.offsetHeight;
  
  xPos = Math.min(Math.max(xPos, 0), maxX);
  yPos = Math.min(Math.max(yPos, 0), maxY);
  
  el.style.left = `${xPos}px`;
  el.style.top = `${yPos}px`;
  el.style.transform = 'none';
}

// 重置元素位置
function resetPosition() {
  if (countdownElement) {
    countdownElement.style.top = '20px';
    countdownElement.style.left = '50%';
    countdownElement.style.transform = 'translateX(-50%)';
    xOffset = 0;
    yOffset = 0;
    chrome.storage.local.remove('countdownPosition');
  }
}

// 显示状态
function showStatus(isRotating, secondsLeft) {
  const element = createCountdownElement();
  
  if (isRotating) { // 如果正在轮播
    if (isPageLoaded) { // 如果页面已加载完成
      element.textContent = `还剩 ${secondsLeft} 秒`;
      element.style.backgroundColor = 'rgba(74, 108, 247, 0.1)';
      element.style.color = '#4a6cf7';
      element.style.display = 'block';
    } else { // 如果页面未加载完成
      element.textContent = '加载中...';
      element.style.backgroundColor = 'rgba(74, 108, 247, 0.1)';
      element.style.color = '#4a6cf7';
      element.style.display = 'block';
    }
  } else if (!isStopped) { // 如果暂停
    element.textContent = '已暂停';
    element.style.backgroundColor = 'rgba(255, 159, 67, 0.1)';
    element.style.color = '#ff9f43';
    element.style.display = 'block';
  } else { // 如果停止
    hideStatus();
  }
}

// 隐藏状态
function hideStatus() {
  if (countdownElement) {
    countdownElement.style.display = 'none';
    resetPosition(); // 隐藏时重置位置
  }
}

// 监听页面加载完成事件
window.addEventListener('load', function() {
  isPageLoaded = true;
  // 页面加载完成后，检查是否需要显示倒计时
  chrome.storage.local.get(['isRotating', 'rotationInterval', 'lastRotationTime', 'countdownPosition'], function(data) {
    // 如果lastRotationTime为null，表示已停止，不显示倒计时
    if (data.lastRotationTime === null) {
      isStopped = true;
      hideStatus();
      return;
    }
    
    // 如果不是停止状态，但也不是轮播状态，则是暂停状态
    if (!data.isRotating) {
      showStatus(false, 0);
      return;
    }
    
    // 轮播状态
    const interval = (data.rotationInterval || 30) * 1000;
    const lastRotationTime = data.lastRotationTime || Date.now();
    const now = Date.now();
    const elapsed = now - lastRotationTime;
    const secondsLeft = Math.max(0, Math.floor((interval - elapsed) / 1000));
    
    showStatus(true, secondsLeft);
    
    // 恢复保存的位置
    if (data.countdownPosition && countdownElement) {
      xOffset = data.countdownPosition.x;
      yOffset = data.countdownPosition.y;
      setTranslate(xOffset, yOffset, countdownElement);
    }
  });
});

// 轮询检查轮播状态
let statusInterval = setInterval(function() {
  chrome.storage.local.get(['isRotating', 'currentIndex', 'rotationInterval', 'lastRotationTime'], function(data) {
    const isRotating = data.isRotating || false;
    rotationInterval = (data.rotationInterval || 30) * 1000; // 更新轮播间隔时间
    const lastRotationTime = data.lastRotationTime || Date.now();
    
    // 重写逻辑，明确处理停止状态
    if (isStopped || lastRotationTime === null) {
      // 如果是停止状态，确保悬浮窗隐藏
      isStopped = true; // 确保状态一致
      hideStatus();
    } else if (isRotating) {
      // 轮播中状态
      const now = Date.now();
      const elapsed = now - lastRotationTime;
      const secondsLeft = Math.max(0, Math.floor((rotationInterval - elapsed) / 1000));
      showStatus(true, secondsLeft);
    } else {
      // 暂停状态
      showStatus(false, 0);
    }
  });
}, 1000);

// 监听来自background的消息
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.action === 'hideStatus') {
    isStopped = true; // 设置停止状态
    hideStatus();
    // 这里不需要再次检查 lastRotationTime，因为我们已经显式设置了 isStopped
  } else if (message.action === 'resetStatus') {
    isStopped = false; // 重置停止状态
    isPageLoaded = false; // 重置页面加载状态
    chrome.storage.local.get(['rotationInterval'], function(data) {
      const interval = (data.rotationInterval || 30) * 1000;
      showStatus(true, Math.floor(interval / 1000));
    });
  }
});

// 页面卸载时清理
window.addEventListener('beforeunload', function() {
  clearInterval(statusInterval);
  if (countdownElement) {
    document.removeEventListener('mousemove', drag);
    document.removeEventListener('mouseup', dragEnd);
  }
});

// 监听窗口大小变化事件
window.addEventListener('resize', function() {
  if (countdownElement && countdownElement.style.display !== 'none') {
    // 当窗口大小改变时，确保元素在可视区域内
    const maxX = window.innerWidth - countdownElement.offsetWidth;
    const maxY = window.innerHeight - countdownElement.offsetHeight;
    
    xOffset = Math.min(Math.max(xOffset, 0), maxX);
    yOffset = Math.min(Math.max(yOffset, 0), maxY);
    
    setTranslate(xOffset, yOffset, countdownElement);
  }
});