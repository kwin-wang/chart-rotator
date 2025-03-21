// 内容脚本 - 当前版本只需显示倒计时状态
let countdownElement = null;
const ROTATION_INTERVAL = 30000;

// 创建倒计时元素
function createCountdownElement() {
  if (!countdownElement) {
    countdownElement = document.createElement('div');
    countdownElement.style.position = 'fixed';
    countdownElement.style.top = '20px';
    countdownElement.style.right = '20px';
    countdownElement.style.padding = '5px 10px';
    countdownElement.style.backgroundColor = 'rgba(74, 108, 247, 0.1)';
    countdownElement.style.color = '#4a6cf7';
    countdownElement.style.fontWeight = 'bold';
    countdownElement.style.borderRadius = '4px';
    countdownElement.style.zIndex = '9999';
    document.body.appendChild(countdownElement);
  }
  return countdownElement;
}

// 显示状态
function showStatus(isRotating, secondsLeft) {
  const element = createCountdownElement();
  
  if (isRotating) {
    element.textContent = `还剩 ${secondsLeft} 秒`;
    element.style.backgroundColor = 'rgba(74, 108, 247, 0.1)';
    element.style.color = '#4a6cf7';
    element.style.display = 'block';
  } else {
    element.textContent = '已暂停';
    element.style.backgroundColor = 'rgba(255, 159, 67, 0.1)';
    element.style.color = '#ff9f43';
    element.style.display = 'block';
  }
}

// 隐藏状态
function hideStatus() {
  if (countdownElement) {
    countdownElement.style.display = 'none';
  }
}

// 轮询检查轮播状态
let lastTime = Date.now();
let statusInterval = setInterval(function() {
  chrome.storage.local.get(['isRotating', 'currentIndex'], function(data) {
    const isRotating = data.isRotating || false;
    
    if (isRotating) {
      const now = Date.now();
      const elapsed = now - lastTime;
      const secondsLeft = Math.max(0, Math.floor((ROTATION_INTERVAL - elapsed) / 1000));
      
      showStatus(true, secondsLeft);
      
      // 重置时间
      if (secondsLeft <= 0) {
        lastTime = now;
      }
    } else {
      showStatus(false, 0);
    }
  });
}, 1000);

// 页面卸载时清理
window.addEventListener('beforeunload', function() {
  clearInterval(statusInterval);
  lastTime = Date.now(); // 重置时间
});