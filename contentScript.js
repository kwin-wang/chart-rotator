// 创建和更新倒计时元素
let countdownElement = null;
let countdownTimer = null;

// 添加调试模式
const DEBUG_MODE = true; // 设置为true启用调试信息

// 添加扩展状态检查
let extensionActive = true;

// 添加全局错误捕获
window.addEventListener('error', function(event) {
  console.error('全局错误:', event.error);
  if (event.error && event.error.message && event.error.message.includes('Extension context invalidated')) {
    showContextInvalidatedMessage();
    
    // 清理所有定时器和事件监听器
    if (countdownTimer) {
      clearInterval(countdownTimer);
    }
  }
});

// 监听未捕获的Promise错误
window.addEventListener('unhandledrejection', function(event) {
  console.error('未处理的Promise错误:', event.reason);
  if (event.reason && event.reason.message && event.reason.message.includes('Extension context invalidated')) {
    showContextInvalidatedMessage();
  }
});

// 检查扩展状态的函数
function checkExtensionStatus() {
  try {
    chrome.runtime.getURL('');
    return true;
  } catch (error) {
    if (error && error.message && error.message.includes('Extension context invalidated')) {
      extensionActive = false;
      showContextInvalidatedMessage();
      
      // 清理资源
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
    }
    return false;
  }
}

// 通用处理 chrome API 调用的函数
function safeApiCall(apiCall, fallback) {
  if (!extensionActive) return fallback;
  
  try {
    return apiCall();
  } catch (error) {
    console.error('Chrome API 调用失败:', error);
    if (error && error.message && error.message.includes('Extension context invalidated')) {
      extensionActive = false;
      showContextInvalidatedMessage();
    }
    return fallback;
  }
}

// 显示友好的错误消息
function showContextInvalidatedMessage() {
  if (document.getElementById('extension-error-message')) return;
  
  const errorDiv = document.createElement('div');
  errorDiv.id = 'extension-error-message';
  errorDiv.innerHTML = `
    <div style="position:fixed; top:0; left:0; right:0; background:#ff5252; color:white; padding:10px; text-align:center; z-index:10000;">
      扩展已更新或重新加载，请刷新页面继续使用
      <button onclick="location.reload()" style="margin-left:10px; padding:3px 8px; background:white; color:#ff5252; border:none; border-radius:3px; cursor:pointer;">
        刷新页面
      </button>
    </div>
  `;
  document.body.appendChild(errorDiv);
}

function createCountdown() {
  try {
    // 检查扩展状态
    if (!checkExtensionStatus()) return;
    
    // 如果已经存在，不再创建
    if (document.getElementById('chartRotatorCountdown')) {
      return;
    }
    
    // 创建倒计时元素
    countdownElement = document.createElement('div');
    countdownElement.id = 'chartRotatorCountdown';
    countdownElement.className = 'chart-rotator-countdown';
    countdownElement.style.display = 'none';
    countdownElement.style.position = 'fixed';
    countdownElement.style.zIndex = '9999';
    countdownElement.style.padding = '8px 12px';
    countdownElement.style.backgroundColor = 'rgba(74, 108, 247, 0.1)';
    countdownElement.style.color = '#4a6cf7';
    countdownElement.style.borderRadius = '4px';
    countdownElement.style.fontWeight = 'bold';
    countdownElement.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    countdownElement.style.top = '20px';
    countdownElement.style.left = '50%';
    countdownElement.style.transform = 'translateX(-50%)';
    document.body.appendChild(countdownElement);
    
    // 更新当前状态
    updateCountdown();
    
    // 设置定时器，每秒更新一次
    if (countdownTimer) {
      clearInterval(countdownTimer);
    }
    countdownTimer = setInterval(function() {
      if (!checkExtensionStatus()) {
        if (countdownTimer) {
          clearInterval(countdownTimer);
          countdownTimer = null;
        }
        return;
      }
      updateCountdown();
    }, 1000);
  } catch (error) {
    console.error('创建倒计时时出错:', error);
    if (error && error.message && error.message.includes('Extension context invalidated')) {
      showContextInvalidatedMessage();
    }
  }
}

// 更新倒计时显示
function updateCountdown() {
  if (!extensionActive) return;
  
  try {
    if (!countdownElement) {
      countdownElement = document.getElementById('chartRotatorCountdown');
      if (!countdownElement) return;
    }
    
    safeApiCall(() => {
      chrome.storage.local.get(['chartRotatorState'], function(result) {
        if (chrome.runtime.lastError) {
          console.error('获取状态时出错:', chrome.runtime.lastError);
          if (chrome.runtime.lastError && chrome.runtime.lastError.message && chrome.runtime.lastError.message.includes('Extension context invalidated')) {
            showContextInvalidatedMessage();
            if (countdownTimer) {
              clearInterval(countdownTimer);
              countdownTimer = null;
            }
          }
          return;
        }
        
        // 处理状态
        const state = result.chartRotatorState;
        if (!state || !state.isRunning) {
          // 非运行状态，隐藏倒计时
          countdownElement.style.display = 'none';
          return;
        }
        
        // 显示倒计时
        countdownElement.style.display = 'block';
        
        if (state.isPaused) {
          // 暂停状态
          countdownElement.textContent = '已暂停';
          countdownElement.style.backgroundColor = 'rgba(255, 159, 67, 0.1)';
          countdownElement.style.color = '#ff9f43';
          return;
        }
        
        // 运行状态 - 计算剩余时间
        const now = Date.now();
        
        // 关键修复：如果lastRotationTime不存在或状态刚更新，更新它
        if (!state.lastRotationTime) {
          console.log('lastRotationTime不存在，正在更新...');
          state.lastRotationTime = now;
          chrome.storage.local.set({chartRotatorState: state});
        }
        
        const elapsedMs = now - state.lastRotationTime;
        const intervalMs = (state.interval || 30) * 1000;
        const remainingMs = Math.max(0, intervalMs - elapsedMs);
        const remainingSeconds = Math.ceil(remainingMs / 1000);
        
        // 调试日志
        console.log('时间计算:', {
          当前时间: new Date(now).toISOString(),
          上次更新时间: new Date(state.lastRotationTime).toISOString(),
          经过毫秒: elapsedMs,
          间隔毫秒: intervalMs,
          剩余毫秒: remainingMs,
          剩余秒数: remainingSeconds
        });
        
        if (remainingSeconds > 0) {
          // 查找当前URL信息
          let currentUrlName = '';
          let currentGroupName = '';
          
          if (state.currentUrlId) {
            const currentUrl = state.urls.find(u => u.id === state.currentUrlId);
            if (currentUrl) {
              currentUrlName = currentUrl.name;
              
              // 查找分组
              for (const group of state.groups || []) {
                if (group.urlIds?.includes(state.currentUrlId)) {
                  currentGroupName = group.name;
                  break;
                }
              }
            }
          }
          
          // 构建显示文本
          let displayText = `还剩 ${remainingSeconds} 秒`;
          if (currentUrlName) {
            displayText += ` - ${currentUrlName}`;
            if (currentGroupName) {
              displayText += ` [${currentGroupName}]`;
            }
          }
          
          countdownElement.textContent = displayText;
          countdownElement.className = 'chart-rotator-running';
        } else {
          countdownElement.textContent = '加载中...';
          countdownElement.className = 'chart-rotator-loading';
        }
        
        // 在updateCountdown函数内部添加
        if (DEBUG_MODE) {
          // 添加调试信息到悬浮窗
          const debugInfo = document.createElement('div');
          debugInfo.className = 'chart-rotator-debug';
          debugInfo.style.fontSize = '10px';
          debugInfo.style.color = '#666';
          debugInfo.textContent = `now: ${now}, last: ${state.lastRotationTime}, elapsed: ${elapsedMs}ms`;
          
          countdownElement.appendChild(document.createElement('br'));
          countdownElement.appendChild(debugInfo);
          
          // 在控制台输出更详细的信息
          console.log('Chart Rotator Debug:', {
            运行状态: state.isRunning,
            暂停状态: state.isPaused,
            当前时间: new Date(now).toISOString(),
            上次更新: state.lastRotationTime ? new Date(state.lastRotationTime).toISOString() : 'null',
            间隔设置: state.interval,
            经过时间: elapsedMs,
            剩余时间: remainingMs,
            当前URL: state.currentUrlId
          });
        }
      });
    }, null);
  } catch (error) {
    console.error('更新倒计时时出错:', error);
    if (error && error.message && error.message.includes('Extension context invalidated')) {
      extensionActive = false;
      showContextInvalidatedMessage();
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
    }
  }
}

// 在页面加载时创建倒计时
document.addEventListener('DOMContentLoaded', function() {
  // 首先检查扩展状态
  if (checkExtensionStatus()) {
    createCountdown();
  }
});

// 监听来自background的消息
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  // 检查扩展状态
  if (!checkExtensionStatus()) {
    return false;
  }
  
  try {
    if (message.action === 'statusUpdate') {
      console.log('收到状态更新消息:', message);
      
      // 如果消息中包含lastRotationTime，立即更新
      if (message.lastRotationTime) {
        safeApiCall(() => {
          chrome.storage.local.get(['chartRotatorState'], function(result) {
            if (chrome.runtime.lastError) {
              console.error('获取状态时出错:', chrome.runtime.lastError);
              if (chrome.runtime.lastError && chrome.runtime.lastError.message && chrome.runtime.lastError.message.includes('Extension context invalidated')) {
                showContextInvalidatedMessage();
                if (countdownTimer) {
                  clearInterval(countdownTimer);
                  countdownTimer = null;
                }
              }
              return;
            }
            
            const state = result.chartRotatorState;
            if (state) {
              state.lastRotationTime = message.lastRotationTime;
              chrome.storage.local.set({chartRotatorState: state}, function() {
                if (chrome.runtime.lastError) {
                  console.error('获取状态时出错:', chrome.runtime.lastError);
                  if (chrome.runtime.lastError && chrome.runtime.lastError.message && chrome.runtime.lastError.message.includes('Extension context invalidated')) {
                    showContextInvalidatedMessage();
                    if (countdownTimer) {
                      clearInterval(countdownTimer);
                      countdownTimer = null;
                    }
                  }
                  return;
                }
              });
            }
          });
        }, null);
      }
      
      // 确保倒计时已创建
      if (!document.getElementById('chartRotatorCountdown')) {
        createCountdown();
      } else {
        // 立即更新倒计时
        updateCountdown();
      }
      
      sendResponse({success: true});
    }
  } catch (error) {
    console.error('处理消息时出错:', error);
    if (error && error.message && error.message.includes('Extension context invalidated')) {
      extensionActive = false;
      showContextInvalidatedMessage();
    }
    sendResponse({success: false, error: error && error.message ? error.message : '未知错误'});
  }
  return true;
}); 