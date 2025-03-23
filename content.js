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
let statusInterval = null;
let isActiveRotationTab = false; // 标记当前标签页是否为活动轮播标签页

// 添加扩展状态检查
let extensionActive = true;

// 创建一个本地缓存来减少对chrome存储API的依赖
let storageCache = {
  chartRotatorState: null,
  isRotating: false,
  rotationInterval: 30,
  lastRotationTime: null,
  countdownPosition: null,
  lastUpdated: 0
};

// 安全获取存储数据的函数
function safeGetStorage(keys, callback) {
  try {
    // 如果扩展已经失效，使用缓存数据
    if (!extensionActive) {
      callback(storageCache);
      return;
    }
    
    // 添加防抖动逻辑，避免频繁请求
    const now = Date.now();
    if (now - storageCache.lastUpdated < 500) {
      callback(storageCache);
      return;
    }
    
    chrome.storage.local.get(keys, function(data) {
      if (chrome.runtime.lastError) {
        console.warn('获取存储数据出错:', chrome.runtime.lastError);
        callback(storageCache); // 使用缓存数据
        return;
      }
      
      // 更新缓存
      Object.assign(storageCache, data);
      storageCache.lastUpdated = now;
      
      callback(data);
    });
  } catch (error) {
    console.error('获取存储时出错:', error);
    if (error && error.message && error.message.includes('Extension context invalidated')) {
      extensionActive = false;
    }
    callback(storageCache); // 出错时使用缓存数据
  }
}

// 立即检查扩展是否有效
try {
  // 轻量级调用来检查扩展上下文是否有效
  chrome.runtime.getURL('');
} catch (initialError) {
  // 如果扩展已经无效，则提前退出
  console.error('扩展已失效:', initialError);
  // 设置标志，阻止后续操作
  extensionActive = false;
  
  // 尝试显示错误消息
  try {
    const errorDiv = document.createElement('div');
    errorDiv.style.position = 'fixed';
    errorDiv.style.top = '10px';
    errorDiv.style.left = '50%';
    errorDiv.style.transform = 'translateX(-50%)';
    errorDiv.style.padding = '10px 15px';
    errorDiv.style.backgroundColor = 'rgba(255, 0, 0, 0.9)';
    errorDiv.style.color = 'white';
    errorDiv.style.borderRadius = '4px';
    errorDiv.style.zIndex = '10000';
    errorDiv.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    errorDiv.textContent = '扩展已更新或重新加载，请刷新页面继续使用';
    
    const refreshButton = document.createElement('button');
    refreshButton.textContent = '刷新页面';
    refreshButton.style.marginLeft = '10px';
    refreshButton.style.padding = '3px 8px';
    refreshButton.style.background = 'white';
    refreshButton.style.color = '#ff0000';
    refreshButton.style.border = 'none';
    refreshButton.style.borderRadius = '3px';
    refreshButton.style.cursor = 'pointer';
    refreshButton.onclick = function() {
      window.location.reload();
    };
    
    errorDiv.appendChild(refreshButton);
    
    // 等待DOM加载完成后添加错误消息
    if (document.body) {
      document.body.appendChild(errorDiv);
    } else {
      window.addEventListener('DOMContentLoaded', function() {
        document.body.appendChild(errorDiv);
      });
    }
  } catch (displayError) {
    console.error('无法显示错误消息:', displayError);
  }
}

// 添加全局错误处理函数
function handleExtensionError(error) {
  try {
    console.error('扩展错误:', error);
    if (error && error.message && error.message.includes('Extension context invalidated')) {
      // 清理所有计时器和事件监听器
      if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
      }
      document.removeEventListener('mousemove', drag);
      document.removeEventListener('mouseup', dragEnd);
      
      // 显示友好的错误消息
      if (countdownElement) {
        countdownElement.textContent = '扩展已更新，请刷新页面';
        countdownElement.style.backgroundColor = 'rgba(255, 0, 0, 0.1)';
        countdownElement.style.color = '#ff0000';
        
        // 添加刷新按钮
        const refreshButton = document.createElement('button');
        refreshButton.textContent = '刷新页面';
        refreshButton.style.marginLeft = '10px';
        refreshButton.style.padding = '3px 8px';
        refreshButton.style.background = '#ff0000';
        refreshButton.style.color = 'white';
        refreshButton.style.border = 'none';
        refreshButton.style.borderRadius = '3px';
        refreshButton.style.cursor = 'pointer';
        refreshButton.onclick = function() {
          window.location.reload();
        };
        
        countdownElement.appendChild(document.createElement('br'));
        countdownElement.appendChild(refreshButton);
      } else {
        // 如果倒计时元素不存在，创建一个通知元素
        const notificationDiv = document.createElement('div');
        notificationDiv.style.position = 'fixed';
        notificationDiv.style.top = '10px';
        notificationDiv.style.left = '50%';
        notificationDiv.style.transform = 'translateX(-50%)';
        notificationDiv.style.padding = '10px 15px';
        notificationDiv.style.backgroundColor = 'rgba(255, 0, 0, 0.9)';
        notificationDiv.style.color = 'white';
        notificationDiv.style.borderRadius = '4px';
        notificationDiv.style.zIndex = '9999';
        notificationDiv.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
        notificationDiv.textContent = '扩展已更新，请刷新页面继续使用';
        
        const refreshButton = document.createElement('button');
        refreshButton.textContent = '刷新页面';
        refreshButton.style.marginLeft = '10px';
        refreshButton.style.padding = '3px 8px';
        refreshButton.style.background = 'white';
        refreshButton.style.color = '#ff0000';
        refreshButton.style.border = 'none';
        refreshButton.style.borderRadius = '3px';
        refreshButton.style.cursor = 'pointer';
        refreshButton.onclick = function() {
          window.location.reload();
        };
        
        notificationDiv.appendChild(refreshButton);
        document.body.appendChild(notificationDiv);
      }
    }
  } catch (innerError) {
    // 防止处理错误时的嵌套错误
    console.error('处理错误时发生异常:', innerError);
  }
}

// 检查扩展是否处于活动状态
function checkExtensionStatus() {
  try {
    // 轻量级调用来检查扩展上下文是否有效
    chrome.runtime.getURL('');
    return true;
  } catch (error) {
    if (error && error.message && error.message.includes('Extension context invalidated')) {
      extensionActive = false;
      handleExtensionError(error);
    }
    return false;
  }
}

// 创建倒计时元素
function createCountdownElement() {
  try {
    // 检查扩展状态
    if (!checkExtensionStatus()) return null;
    
    if (!countdownElement) {
      countdownElement = document.createElement('div');
      countdownElement.style.position = 'fixed';
      countdownElement.style.padding = '8px 12px';
      countdownElement.style.backgroundColor = 'rgba(74, 108, 247, 0.1)';
      countdownElement.style.color = '#4a6cf7';
      countdownElement.style.fontWeight = 'bold';
      countdownElement.style.borderRadius = '4px';
      countdownElement.style.zIndex = '9999';
      countdownElement.style.cursor = 'move';
      countdownElement.style.userSelect = 'none';
      countdownElement.style.transition = 'background-color 0.3s, color 0.3s';
      countdownElement.style.minWidth = '150px';
      countdownElement.style.textAlign = 'center';
      countdownElement.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
      
      // 添加拖拽事件监听
      countdownElement.addEventListener('mousedown', dragStart);
      document.addEventListener('mousemove', drag);
      document.addEventListener('mouseup', dragEnd);
      
      document.body.appendChild(countdownElement);
      
      // 设置默认位置（顶部中间）
      countdownElement.style.top = '20px';
      countdownElement.style.left = '50%';
      countdownElement.style.transform = 'translateX(-50%)';
      
      // 恢复保存的位置
      try {
        chrome.storage.local.get(['countdownPosition'], function(data) {
          if (chrome.runtime.lastError) {
            console.error('获取位置数据时出错:', chrome.runtime.lastError);
            return;
          }
          
          if (data.countdownPosition) {
            // 确保位置在可视区域内
            const maxX = window.innerWidth - countdownElement.offsetWidth;
            const maxY = window.innerHeight - countdownElement.offsetHeight;
            
            xOffset = Math.min(Math.max(data.countdownPosition.x, 0), maxX);
            yOffset = Math.min(Math.max(data.countdownPosition.y, 0), maxY);
            
            countdownElement.style.left = `${xOffset}px`;
            countdownElement.style.top = `${yOffset}px`;
            countdownElement.style.transform = 'none';
          }
        });
      } catch (storageError) {
        console.error('访问位置存储时出错:', storageError);
        if (storageError && storageError.message && storageError.message.includes('Extension context invalidated')) {
          handleExtensionError(storageError);
        }
      }
    }
    return countdownElement;
  } catch (error) {
    console.error('创建倒计时元素时出错:', error);
    if (error && error.message && error.message.includes('Extension context invalidated')) {
      handleExtensionError(error);
    }
    return null;
  }
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
  try {
    // 检查元素是否存在
    if (!el || typeof el.offsetWidth === 'undefined') return;
    
    // 确保位置在可视区域内
    const maxX = window.innerWidth - el.offsetWidth;
    const maxY = window.innerHeight - el.offsetHeight;
    
    xPos = Math.min(Math.max(xPos, 0), maxX);
    yPos = Math.min(Math.max(yPos, 0), maxY);
    
    el.style.left = `${xPos}px`;
    el.style.top = `${yPos}px`;
    el.style.transform = 'none';
    
    // 更新位置数据
    if (el === countdownElement) {
      xOffset = xPos;
      yOffset = yPos;
    }
  } catch (error) {
    console.error('设置元素位置时出错:', error);
    // 如果是扩展上下文无效错误，处理它
    if (error && error.message && error.message.includes('Extension context invalidated')) {
      handleExtensionError(error);
    }
  }
}

// 重置元素位置
function resetPosition() {
  try {
    // 检查扩展状态和元素是否存在
    if (!extensionActive || !countdownElement) return;
    
    countdownElement.style.top = '20px';
    countdownElement.style.left = '50%';
    countdownElement.style.transform = 'translateX(-50%)';
    xOffset = 0;
    yOffset = 0;
    
    // 安全地移除存储中的位置信息
    try {
      chrome.storage.local.remove('countdownPosition', function() {
        if (chrome.runtime.lastError) {
          console.error('移除位置信息时出错:', chrome.runtime.lastError);
        }
      });
    } catch (storageError) {
      console.error('访问存储时出错:', storageError);
      if (storageError && storageError.message && storageError.message.includes('Extension context invalidated')) {
        handleExtensionError(storageError);
      }
    }
  } catch (error) {
    console.error('重置位置时出错:', error);
    if (error && error.message && error.message.includes('Extension context invalidated')) {
      handleExtensionError(error);
    }
  }
}

// 初始化时检查当前标签页是否为轮播标签页
function checkIfActiveRotationTab() {
  try {
    // 轻量级调用来检查扩展上下文是否有效
    if (!checkExtensionStatus()) return;
    
    // 获取当前标签页ID
    chrome.runtime.sendMessage({ action: "checkIfActiveRotationTab" }, function(response) {
      if (chrome.runtime.lastError) {
        console.warn('检查轮播标签页状态时出错:', chrome.runtime.lastError);
        return;
      }
      
      if (response && response.isActiveRotationTab) {
        isActiveRotationTab = true;
        console.log('当前是轮播标签页');
        
        // 如果是轮播标签页，创建倒计时元素并启动轮询
        if (!statusInterval) {
          createCountdownElement();
          startStatusInterval();
        }
      } else {
        isActiveRotationTab = false;
        console.log('当前不是轮播标签页');
        
        // 如果不是轮播标签页，隐藏倒计时并停止轮询
        hideStatus();
        if (statusInterval) {
          clearInterval(statusInterval);
          statusInterval = null;
        }
      }
    });
  } catch (error) {
    console.error('检查轮播标签页状态时出错:', error);
  }
}

// 修改显示状态函数，添加标签页检查
function showStatus(isRotating, secondsLeft) {
  try {
    // 安全检查
    if (!extensionActive || !isActiveRotationTab) return;
    
    const element = createCountdownElement();
    if (!element) return;
    
    // 清除旧内容
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
    
    if (isRotating) { // 如果正在轮播
      if (isPageLoaded) { // 如果页面已加载完成
        // 确保secondsLeft是有效数字
        const displaySeconds = (typeof secondsLeft === 'number' && !isNaN(secondsLeft)) 
          ? Math.max(0, Math.ceil(secondsLeft)) 
          : 30;
        
        // 先设置基本样式
        element.style.backgroundColor = 'rgba(74, 108, 247, 0.1)';
        element.style.color = '#4a6cf7';
        element.style.display = 'block';
        
        // 基本信息：剩余时间
        element.textContent = `还剩 ${displaySeconds} 秒`;
        
        // 安全地获取并显示额外信息
        try {
          safeGetStorage(['chartRotatorState'], function(data) {
            if (!data.chartRotatorState || !element) return;
            
            const state = data.chartRotatorState;
            let currentUrlName = '';
            let currentGroupName = '';
            
            // 查找当前URL信息
            if (state.currentUrlId && state.urls) {
              const currentUrl = state.urls.find(u => u.id === state.currentUrlId);
              if (currentUrl) {
                currentUrlName = currentUrl.name || '';
                
                // 查找分组
                if (state.groups && Array.isArray(state.groups)) {
                  for (const group of state.groups) {
                    if (group && group.urlIds && Array.isArray(group.urlIds) && 
                        group.urlIds.includes(state.currentUrlId)) {
                      currentGroupName = group.name || '';
                      break;
                    }
                  }
                }
              }
            }
            
            // 只有当有额外信息时才添加
            if (currentUrlName || currentGroupName) {
              // 清除旧内容，保留时间信息
              const timeInfo = element.textContent;
              element.textContent = timeInfo;
              
              // 添加一个分隔符
              const separator = document.createElement('br');
              element.appendChild(separator);
              
              // 添加URL和组信息
              const infoText = document.createElement('span');
              infoText.style.fontSize = '12px';
              infoText.style.fontWeight = 'normal';
              
              let infoContent = '';
              if (currentUrlName) {
                infoContent += currentUrlName;
              }
              
              if (currentGroupName) {
                infoContent += infoContent ? ` [${currentGroupName}]` : `[${currentGroupName}]`;
              }
              
              infoText.textContent = infoContent;
              element.appendChild(infoText);
            }
          });
        } catch (infoError) {
          console.error('获取URL信息时出错:', infoError);
          // 如果是扩展上下文无效错误，标记扩展为非活动
          if (infoError && infoError.message && infoError.message.includes('Extension context invalidated')) {
            extensionActive = false;
          }
          // 出错时不影响主要功能继续显示
        }
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
      element.style.display = 'none';
    }
  } catch (error) {
    console.error('显示状态时出错:', error);
  }
}

// 修改轮询检查轮播状态函数
function startStatusInterval() {
  if (statusInterval) {
    clearInterval(statusInterval);
    statusInterval = null;
  }
  
  // 先检查是否为轮播标签页
  if (!isActiveRotationTab) {
    return; // 如果不是轮播标签页，不启动轮询
  }
  
  statusInterval = setInterval(function() {
    // 如果扩展失效，停止轮询
    if (!extensionActive || !isActiveRotationTab) {
      if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
      }
      hideStatus();
      return;
    }
    
    try {
      // 使用安全的存储获取函数
      safeGetStorage(['chartRotatorState', 'isRotating', 'rotationInterval', 'lastRotationTime'], function(data) {
        try {
          // 如果扩展失效或不是轮播标签页，不继续处理
          if (!extensionActive || !isActiveRotationTab) return;
          
          // 处理新格式
          if (data && data.chartRotatorState) {
            const state = data.chartRotatorState;
            rotationInterval = ((state && state.interval) || 30) * 1000;
            
            if (!state || !state.isRunning) {
              isStopped = true;
              hideStatus();
            } else if (state.isPaused) {
              isStopped = false;
              showStatus(false, 0);
            } else {
              const now = Date.now();
              const lastTime = (state && state.lastRotationTime) || now;
              const elapsed = now - lastTime;
              const secondsLeft = Math.max(0, Math.ceil((rotationInterval - elapsed) / 1000));
              
              isStopped = false;
              isPageLoaded = true;
              showStatus(true, secondsLeft);
            }
          } 
          // 处理旧格式
          else if (data) {
            const isRotating = data.isRotating || false;
            rotationInterval = (data.rotationInterval || 30) * 1000;
            const lastTime = data.lastRotationTime || Date.now();
            
            if (lastTime === null) {
              isStopped = true;
              hideStatus();
            } else if (!isRotating) {
              isStopped = false;
              showStatus(false, 0);
            } else {
              const now = Date.now();
              const elapsed = now - lastTime;
              const secondsLeft = Math.max(0, Math.ceil((rotationInterval - elapsed) / 1000));
              
              isStopped = false;
              isPageLoaded = true;
              showStatus(true, secondsLeft);
            }
          }
        } catch (error) {
          console.error('处理轮询数据时出错:', error);
          // 安全处理错误
          if (error && typeof error === 'object') {
            // 添加更多的错误处理逻辑如果需要
          }
        }
      });
    } catch (error) {
      console.error('轮询状态时出错:', error);
      // 如果是扩展上下文无效，清理轮询
      if (error && error.message && error.message.includes('Extension context invalidated')) {
        extensionActive = false;
        if (statusInterval) {
          clearInterval(statusInterval);
          statusInterval = null;
        }
      }
    }
  }, 1000);
}

// 在页面加载时启动轮询
window.addEventListener('load', function() {
  try {
    // 先检查扩展状态是否有效
    if (!extensionActive) return;
    
    isPageLoaded = true;
    
    // 检查当前标签页是否为轮播标签页
    checkIfActiveRotationTab();
    
    // 只有在是轮播标签页的情况下才进行后续操作
    if (isActiveRotationTab) {
      // 页面加载完成后，检查是否需要显示倒计时
      safeGetStorage(['chartRotatorState', 'isRotating', 'rotationInterval', 'lastRotationTime', 'countdownPosition'], function(data) {
        try {
          // 再次检查扩展状态和是否为轮播标签页
          if (!extensionActive || !isActiveRotationTab) return;
          
          // 优先使用新的存储结构
          if (data && data.chartRotatorState) {
            const state = data.chartRotatorState;
            
            // 更新轮播间隔
            rotationInterval = ((state && state.interval) || 30) * 1000;
            
            if (!state || !state.isRunning) {
              // 如果未运行，不显示
              isStopped = true;
              hideStatus();
            } else if (state.isPaused) {
              // 如果暂停，显示暂停状态
              isStopped = false;
              showStatus(false, 0);
            } else {
              // 正在运行，计算剩余时间
              const now = Date.now();
              const lastRotationTime = (state && state.lastRotationTime) || now;
              const elapsed = now - lastRotationTime;
              const secondsLeft = Math.max(0, Math.ceil((rotationInterval - elapsed) / 1000));
              
              isStopped = false;
              showStatus(true, secondsLeft);
            }
          } else if (data) {
            // 使用旧的存储格式
            // 如果lastRotationTime为null，表示已停止，不显示倒计时
            if (data.lastRotationTime === null) {
              isStopped = true;
              hideStatus();
            } else if (!data.isRotating) {
              // 如果不是轮播状态，则是暂停状态
              isStopped = false;
              showStatus(false, 0);
            } else {
              // 轮播状态
              const interval = (data.rotationInterval || 30) * 1000;
              const lastRotationTime = data.lastRotationTime || Date.now();
              const now = Date.now();
              const elapsed = now - lastRotationTime;
              const secondsLeft = Math.max(0, Math.ceil((interval - elapsed) / 1000));
              
              isStopped = false;
              showStatus(true, secondsLeft);
            }
          }
          
          // 恢复保存的位置
          if (data && data.countdownPosition && countdownElement) {
            xOffset = data.countdownPosition.x;
            yOffset = data.countdownPosition.y;
            setTranslate(xOffset, yOffset, countdownElement);
          }
        } catch (error) {
          console.error('处理页面加载数据时出错:', error);
        }
      });
    }
  } catch (error) {
    console.error('页面加载事件处理出错:', error);
    // 如果是扩展上下文无效错误，处理它
    if (error && error.message && error.message.includes('Extension context invalidated')) {
      extensionActive = false;
    }
  }
});

// 监听来自background的消息
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  // 每次收到消息时检查扩展状态
  if (!extensionActive) {
    return false;
  }
  
  try {
    if (message.action === 'hideStatus') {
      isStopped = true; // 设置停止状态
      hideStatus();
      sendResponse({success: true});
    } else if (message.action === 'resetStatus') {
      isStopped = false; // 重置停止状态
      isPageLoaded = false; // 重置页面加载状态
      
      // 使用安全的存储获取函数
      safeGetStorage(['chartRotatorState', 'rotationInterval'], function(data) {
        let interval = 30 * 1000; // 默认30秒
        
        if (data.chartRotatorState) {
          interval = (data.chartRotatorState.interval || 30) * 1000;
        } else if (data.rotationInterval) {
          interval = data.rotationInterval * 1000;
        }
        
        rotationInterval = interval;
        showStatus(true, Math.ceil(interval / 1000));
        sendResponse({success: true});
      });
      return true; // 保持消息通道开放
    } else if (message.action === 'statusUpdate') {
      // 如果消息中包含lastRotationTime，更新状态
      if (message.lastRotationTime) {
        const now = Date.now();
        const elapsed = now - message.lastRotationTime;
        const secondsLeft = Math.max(0, Math.ceil((rotationInterval - elapsed) / 1000));
        
        isStopped = false;
        isPageLoaded = true;
        showStatus(true, secondsLeft);
      }
      
      sendResponse({success: true});
    } else if (message.action === 'setActiveRotationTab') {
      // 设置当前标签页为轮播标签页
      isActiveRotationTab = true;
      
      // 创建倒计时元素并启动轮询
      if (!statusInterval) {
        createCountdownElement();
        startStatusInterval();
      }
      
      sendResponse({success: true});
    } else if (message.action === 'unsetActiveRotationTab') {
      // 取消当前标签页的轮播标签页状态
      isActiveRotationTab = false;
      
      // 隐藏倒计时并停止轮询
      hideStatus();
      if (statusInterval) {
        clearInterval(statusInterval);
        statusInterval = null;
      }
      
      sendResponse({success: true});
    }
  } catch (error) {
    console.error('处理消息时出错:', error);
    sendResponse({success: false, error: error && error.message ? error.message : '未知错误'});
  }
  return true;
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

// 添加全局错误事件监听
window.addEventListener('error', function(event) {
  handleExtensionError(event.error);
});

window.addEventListener('unhandledrejection', function(event) {
  handleExtensionError(event.reason);
});

// 隐藏状态
function hideStatus() {
  try {
    // 检查扩展状态和元素是否存在
    if (!extensionActive || !countdownElement) return;
    
    countdownElement.style.display = 'none';
  } catch (error) {
    console.error('隐藏状态时出错:', error);
  }
}