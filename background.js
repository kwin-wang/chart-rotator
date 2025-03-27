// 全局变量
let rotationTimer = null;
const DEFAULT_ROTATION_INTERVAL = 30000; // 默认30秒轮换一次
let activeRotationTabId = null; // 跟踪当前轮播标签页ID
let activeRotationWindowId = null; // 跟踪当前轮播窗口ID
let STORAGE_KEY = 'chartRotatorState';

// 默认状态
const defaultState = {
  urls: [],
  groups: [
    {
      id: 'default',
      name: '默认组',
      frequencyMinutes: 0, // 0表示连续轮播
      urlIds: []
    }
  ],
  currentUrlIndex: 0,
  currentUrlId: null,
  interval: 30,
  isRunning: false,
  isPaused: false,
  lastRotationTime: null,
  groupLastShownTime: {}
};

// 添加错误处理函数
function handleExtensionError(error) {
  console.error('扩展错误:', error);
  // 如果需要其他处理逻辑，可以在这里添加
}

// 安全地处理Promise操作
async function safeStorageOperation(operation) {
  try {
    return await operation();
  } catch (error) {
    handleExtensionError(error);
    return null;
  }
}

// 初始化或迁移存储数据
chrome.storage.local.get(['chartRotatorState'], function(result) {
  let state = result.chartRotatorState || {};
  
  // 数据迁移 - 将现有URL迁移到默认组
  if (state.urls && !state.groups) {
    state.groups = [defaultState.groups[0]];
    state.groups[0].urlIds = state.urls.map(url => url.id);
    state.groupLastShownTime = {};
    
    chrome.storage.local.set({chartRotatorState: state});
  }
});

// 初始化
chrome.runtime.onInstalled.addListener(function(details) {
  if (details.reason === 'update' || details.reason === 'install') {
    migrateData();
  }

  // 只在首次安装时初始化存储
  if (details.reason === 'install') {
    chrome.storage.local.set({
      chartList: [],
      currentIndex: 0,
      isRotating: false,
      rotationInterval: 30 // 默认30秒
    });
  }

  // 只创建设置菜单项
  chrome.contextMenus.create({
    id: "openSettings",
    title: "设置",
    contexts: ["action"] // "action"表示扩展图标的上下文菜单
  });
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
        case 'openGroupManager':
          const groupManagerUrl = chrome.runtime.getURL('group-manager.html');
          chrome.tabs.create({ url: groupManagerUrl });
          sendResponse({ status: 'opening_group_manager' });
          break;
        case 'checkIfActiveRotationTab':
          const isActiveRotationTab = sender.tab && sender.tab.id === activeRotationTabId;
          sendResponse({ isActiveRotationTab: isActiveRotationTab });
          break;
        default:
          sendResponse({ status: 'unknown_action' });
      }
    } catch (error) {
      handleExtensionError(error);
      sendResponse({ status: 'error', message: error.message });
    }
  };

  handleMessage();
  return true; // 保持消息通道开放
});

// 监听右键菜单点击事件
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "openSettings") {
    // 打开设置页面
    const settingsUrl = chrome.runtime.getURL('settings.html');
    chrome.tabs.create({ url: settingsUrl });
  }
});

// 监听页面加载完成事件，更新lastRotationTime
chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (changeInfo.status === 'complete') {
    chrome.storage.local.get(['chartRotatorState'], function(result) {
      const state = result.chartRotatorState;
      if (!state || !state.isRunning || state.isPaused) return;
      
      // 检查此URL是否匹配当前轮播的URL
      const currentUrl = state.urls.find(u => u.id === state.currentUrlId);
      if (currentUrl && tab.url.includes(new URL(currentUrl.url).hostname)) {
        console.log('页面加载完成，更新lastRotationTime');
        
        // 更新最后轮播时间
        state.lastRotationTime = Date.now();
        chrome.storage.local.set({chartRotatorState: state});
        
        // 通知当前标签页更新倒计时
        chrome.tabs.sendMessage(tabId, { 
          action: 'statusUpdate',
          status: 'running',
          lastRotationTime: state.lastRotationTime
        }).catch(() => {/* 忽略错误 */});
      }
    });
  }
});

// 开始轮播
async function startRotation() {
  try {
    // 获取当前活动标签页
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (chrome.runtime.lastError) {
        console.error('获取当前标签页时出错:', chrome.runtime.lastError);
        return;
      }
      
      if (!tabs || tabs.length === 0) {
        console.error('未找到活动标签页');
        return;
      }
      
      const activeTab = tabs[0];
      
      // 保存当前活动标签页和窗口ID
      activeRotationTabId = activeTab.id;
      activeRotationWindowId = activeTab.windowId;
      
      console.log(`开始在标签页 ${activeRotationTabId} 中轮播`);
      
      // 获取当前状态
      getStorage(function(state) {
        // 更新状态
        state.isRunning = true;
        state.isPaused = false;
        state.lastRotationTime = Date.now();
        
        // 如果是重新开始轮播，清除可能的旧计时器
        if (state.timerId) {
          clearTimeout(state.timerId);
          delete state.timerId;
        }
        
        if (state.priorityMonitorId) {
          clearTimeout(state.priorityMonitorId);
          delete state.priorityMonitorId;
        }
        
        // 保存更新后的状态
        saveStorage(state);
        
        // 仅通知活动标签页
        chrome.tabs.sendMessage(activeRotationTabId, {
          action: "setActiveRotationTab"
        }, function(response) {
          if (chrome.runtime.lastError) {
            console.warn('通知活动标签页时出错:', chrome.runtime.lastError);
          }
        });
        
        // 设置下一个轮播的计时器
        scheduleNextRotation(state);
      });
    });
  } catch (error) {
    console.error('开始轮播时出错:', error);
  }
}

// 暂停轮播
async function pauseRotation() {
  try {
    // 获取当前状态
    getStorage(function(state) {
      // 更新状态
      state.isPaused = true;
      
      // 保存更新后的状态
      saveStorage(state);
      
      // 通知活动标签页暂停状态
      if (activeRotationTabId) {
        chrome.tabs.sendMessage(activeRotationTabId, {
          action: "statusUpdate",
          isPaused: true
        }, function(response) {
          if (chrome.runtime.lastError) {
            console.warn('通知暂停状态时出错:', chrome.runtime.lastError);
          }
        });
      }
      
      // 清除当前所有计时器
      if (state.timerId) {
        clearTimeout(state.timerId);
        delete state.timerId;
      }
      
      if (state.priorityMonitorId) {
        clearTimeout(state.priorityMonitorId);
        delete state.priorityMonitorId;
      }
      
      saveStorage(state);
    });
  } catch (error) {
    console.error('暂停轮播时出错:', error);
  }
}

// 恢复轮播
async function resumeRotation() {
  try {
    // 获取当前状态
    getStorage(function(state) {
      // 更新状态
      state.isPaused = false;
      state.lastRotationTime = Date.now();
      
      // 清除可能存在的旧计时器
      if (state.timerId) {
        clearTimeout(state.timerId);
        delete state.timerId;
      }
      
      if (state.priorityMonitorId) {
        clearTimeout(state.priorityMonitorId);
        delete state.priorityMonitorId;
      }
      
      // 保存更新后的状态
      saveStorage(state);
      
      // 通知活动标签页恢复状态
      if (activeRotationTabId) {
        chrome.tabs.sendMessage(activeRotationTabId, {
          action: "statusUpdate",
          lastRotationTime: state.lastRotationTime
        }, function(response) {
          if (chrome.runtime.lastError) {
            console.warn('通知恢复状态时出错:', chrome.runtime.lastError);
          }
        });
      }
      
      // 设置下一个轮播的计时器
      scheduleNextRotation(state);
    });
  } catch (error) {
    console.error('恢复轮播时出错:', error);
  }
}

// 停止轮播
async function stopRotation(shouldReset = false) {
  try {
    // 获取当前状态
    getStorage(function(state) {
      // 更新状态
      state.isRunning = false;
      state.isPaused = false;
      
      // 清除当前URL和上次轮播时间
      state.currentUrlId = null;
      state.lastRotationTime = null;
      
      // 清除所有计时器
      if (state.timerId) {
        clearTimeout(state.timerId);
        delete state.timerId;
      }
      
      if (state.priorityMonitorId) {
        clearTimeout(state.priorityMonitorId);
        delete state.priorityMonitorId;
      }
      
      // 保存更新后的状态
      saveStorage(state);
      
      // 通知活动标签页停止状态
      if (activeRotationTabId) {
        chrome.tabs.sendMessage(activeRotationTabId, {
          action: "hideStatus"
        }, function(response) {
          if (chrome.runtime.lastError) {
            console.warn('通知停止状态时出错:', chrome.runtime.lastError);
          }
        });
      }
      
      // 清除活动轮播标签页ID
      activeRotationTabId = null;
      activeRotationWindowId = null;
    });
  } catch (error) {
    console.error('停止轮播时出错:', error);
  }
}

// 手动切换到下一个图表
async function rotateToNextChart() {
  try {
    if (!activeRotationTabId) {
      console.log('没有活动的轮播标签页');
      return;
    }
    
    const data = await chrome.storage.local.get(['chartRotatorState']);
    const state = data.chartRotatorState || defaultState;
    
    if (!state.urls || state.urls.length === 0) {
      console.log('没有可轮播的URL');
      return;
    }
    
    const now = Date.now();
    
    // 使用和自动轮播相同的逻辑选择下一个URL
    const { nextGroupId, nextUrl } = await selectNextUrlBasedOnPriority(state, now);
    
    if (nextUrl) {
      // 更新组的最后显示时间
      if (nextGroupId) {
        state.groupLastShownTime[nextGroupId] = now;
      }
      
      // 如果是在组内选择的URL，同时更新currentUrlIndex
      const urlIndex = state.urls.findIndex(u => u.id === nextUrl.id);
      if (urlIndex !== -1) {
        state.currentUrlIndex = urlIndex;
      }
      
      // 更新当前URL ID
      state.currentUrlId = nextUrl.id;
      
      // 更新最后轮播时间
      state.lastRotationTime = now;
      
      await chrome.storage.local.set({chartRotatorState: state});
      
      console.log('手动切换到下一个URL:', nextUrl.name);
      console.log('更新 lastRotationTime =', new Date(state.lastRotationTime).toISOString());
      
      // 只更新当前轮播标签页
      await chrome.tabs.update(activeRotationTabId, {url: nextUrl.url});
      
      // 只通知当前轮播标签页状态变化
      chrome.tabs.sendMessage(activeRotationTabId, { 
        action: 'statusUpdate',
        status: 'running',
        lastRotationTime: state.lastRotationTime
      }).catch(() => {/* 忽略错误 */});
    } else {
      console.log('找不到可切换的下一个URL');
    }
  } catch (error) {
    console.error('切换到下一个图表时出错:', error);
  }
}

// 加载指定URL的图表
async function loadChart(url) {
  if (!activeRotationTabId) {
    // 如果没有轮播标签页，获取当前活动标签页
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length > 0) {
      activeRotationTabId = tabs[0].id;
      activeRotationWindowId = tabs[0].windowId;
    } else {
      // 如果没有活动标签页，创建新标签页
      const newTab = await chrome.tabs.create({ url: url });
      activeRotationTabId = newTab.id;
      activeRotationWindowId = newTab.windowId;
      return;
    }
  }
  
  // 更新轮播标签页URL
  await chrome.tabs.update(activeRotationTabId, { url: url });
  
  // 等待页面加载完成后再更新最后轮播时间
  chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo, tab) {
    if (tabId === activeRotationTabId && changeInfo.status === 'complete') {
      chrome.storage.local.get(['chartRotatorState'], function(result) {
        const state = result.chartRotatorState || defaultState;
        state.lastRotationTime = Date.now();
        chrome.storage.local.set({chartRotatorState: state});
      });
      chrome.tabs.onUpdated.removeListener(listener);
    }
  });
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

// 新的轮播决策逻辑
function determineNextUrl() {
  return new Promise((resolve) => {
    // 检查轮播标签页是否还存在
    if (activeRotationTabId) {
      chrome.tabs.get(activeRotationTabId, function(tab) {
        if (chrome.runtime.lastError) {
          console.log('轮播标签页已关闭，停止轮播');
          stopRotation();
          resolve();
          return;
        }
        
        chrome.storage.local.get(['chartRotatorState'], function(result) {
          const state = result.chartRotatorState;
          if (!state || !state.isRunning || state.isPaused) {
            resolve();
            return;
          }
          
          const now = Date.now();
          const elapsedTime = state.lastRotationTime ? now - state.lastRotationTime : 0;
          const intervalMs = state.interval * 1000;

          // 检查当前URL是否已经完成了完整的播放时间
          if (elapsedTime < intervalMs) {
            // 当前URL尚未完成播放时间，等待剩余时间再执行下一次轮播
            const remainingTime = intervalMs - elapsedTime;
            console.log(`当前URL尚未完成播放，还剩${Math.ceil(remainingTime/1000)}秒`);
            
            // 设置定时器等待，直到当前URL播放完成
            setTimeout(() => determineNextUrl().then(resolve), remainingTime);
            return;
          }
          
          // 只有当前URL完成播放后，才查找需要显示的高优先级组（如果有）
          selectNextUrlBasedOnPriority(state, now).then(result => {
            const { nextGroupId, nextUrl } = result;
            
            if (nextUrl) {
              // 更新组的最后显示时间
              if (nextGroupId) {
                state.groupLastShownTime[nextGroupId] = now;
              }
              
              // 保存当前URL ID用于下次决策
              state.currentUrlId = nextUrl.id;
              
              // 重要：更新最后轮播时间
              state.lastRotationTime = now;
              
              // 只更新当前轮播标签页
              chrome.tabs.update(activeRotationTabId, {url: nextUrl.url}, function() {
                // 检查是否出错
                if (chrome.runtime.lastError) {
                  console.log('更新标签页出错，尝试重新开始轮播:', chrome.runtime.lastError);
                  // 不直接停止轮播，而是尝试重新开始
                  startRotation();
                  resolve();
                  return;
                }
                
                // 保存状态
                chrome.storage.local.set({chartRotatorState: state}, function() {
                  console.log('已更新到新URL:', nextUrl.name);
                  console.log('已更新 lastRotationTime =', new Date(state.lastRotationTime).toISOString());
                  
                  // 设置下一次轮播的定时器
                  const nextIntervalMs = state.interval * 1000;
                  setTimeout(() => determineNextUrl().then(resolve), nextIntervalMs);
                });
              });
            } else {
              console.log('找不到下一个URL，尝试重新开始轮播');
              startRotation();
              resolve();
            }
          }).catch(error => {
            console.error('选择下一个URL时出错:', error);
            // 发生错误时尝试重新开始轮播
            startRotation();
            resolve();
          });
        });
      });
    } else {
      console.log('没有活动的轮播标签页，尝试重新开始轮播');
      startRotation();
      resolve();
    }
  });
}

// 根据优先级(频率)选择下一个URL
// 频率高的组有更高的优先级，可以"插队"
function selectNextUrlBasedOnPriority(state, now) {
  return new Promise((resolve) => {
    let nextGroupId = null;
    let nextUrl = null;
    
    // 过滤出包含有效URL的组
    const validGroups = state.groups.filter(group => {
      if (!group.urlIds || group.urlIds.length === 0) return false;
      
      // 确认组中有有效的URL
      return group.urlIds.some(urlId => {
        const url = state.urls.find(u => u.id === urlId);
        return url != null;
      });
    });
    
    // 按频率从高到低排序组
    // 对于非连续轮播的组：频率越小(比如30分钟比60分钟)，优先级越高
    const prioritizedGroups = [...validGroups].sort((a, b) => {
      // 如果a是连续轮播(0)，给它最低优先级
      if (a.frequencyMinutes === 0 && b.frequencyMinutes !== 0) return 1;
      // 如果b是连续轮播(0)，给它最低优先级
      if (b.frequencyMinutes === 0 && a.frequencyMinutes !== 0) return -1;
      // 如果两个都是连续轮播或都不是连续轮播，按频率排序（频率小的优先级高）
      return a.frequencyMinutes - b.frequencyMinutes;
    });
    
    // 检查哪些组达到或超过了它们的显示频率，可以显示了
    const groupsReadyToShow = prioritizedGroups.filter(group => {
      // 连续轮播的组总是可以显示，但它们是最低优先级
      if (group.frequencyMinutes === 0) return true;
      
      const lastShown = state.groupLastShownTime[group.id] || 0;
      const elapsedMinutes = (now - lastShown) / (60 * 1000);
      
      // 如果时间间隔超过了设定的频率，该组可以显示
      console.log(`组 "${group.name}" 已等待 ${elapsedMinutes.toFixed(2)} 分钟，需要 ${group.frequencyMinutes} 分钟`);
      return elapsedMinutes >= group.frequencyMinutes;
    });
    
    if (groupsReadyToShow.length > 0) {
      // 选择优先级最高的组（已按频率从高到低排序）
      nextGroupId = groupsReadyToShow[0].id;
      const selectedGroup = groupsReadyToShow[0];
      console.log(`选择优先级组: "${selectedGroup.name}", 频率: ${selectedGroup.frequencyMinutes} 分钟`);
      
      // 从该组中获取下一个URL
      const group = state.groups.find(g => g.id === nextGroupId);
      if (group && group.urlIds && group.urlIds.length > 0) {
        // 找到该组内当前URL的索引
        const urlIds = group.urlIds.filter(urlId => {
          // 过滤掉无效的URL ID
          return state.urls.some(u => u.id === urlId);
        });
        
        if (urlIds.length === 0) {
          console.log(`组 "${group.name}" 中没有有效的URL`);
          // 尝试下一个组
          nextGroupId = null;
        } else {
          let currentIndex = 0;
          
          // 如果当前正在显示这个组的某个URL，则移到该组的下一个URL
          if (state.currentUrlId && urlIds.includes(state.currentUrlId)) {
            const index = urlIds.indexOf(state.currentUrlId);
            currentIndex = (index + 1) % urlIds.length;
          }
          
          // 获取下一个要显示的URL
          const nextUrlId = urlIds[currentIndex];
          nextUrl = state.urls.find(u => u.id === nextUrlId);
          
          if (nextUrl) {
            console.log(`从组 "${group.name}" 中选择URL: "${nextUrl.name}"`);
          }
        }
      }
    }
    
    // 如果没有找到下一个URL（例如所有组都为空或无法显示），回退到默认顺序
    if (!nextUrl && state.urls && state.urls.length > 0) {
      console.log('没有找到基于优先级的下一个URL，回退到顺序轮播');
      const nextIndex = (state.currentUrlIndex !== undefined && state.currentUrlIndex >= 0) 
        ? (state.currentUrlIndex + 1) % state.urls.length 
        : 0;
      nextUrl = state.urls[nextIndex];
      state.currentUrlIndex = nextIndex;
      
      // 寻找此URL所属组，以便更新组的最后显示时间
      for (const group of state.groups) {
        if (group.urlIds && group.urlIds.includes(nextUrl.id)) {
          nextGroupId = group.id;
          break;
        }
      }
      
      if (nextUrl) {
        console.log(`按顺序选择下一个URL: "${nextUrl.name}"`);
      }
    }
    
    resolve({ nextGroupId, nextUrl });
  });
}

// 添加标签页关闭事件监听
chrome.tabs.onRemoved.addListener(function(tabId, removeInfo) {
  if (tabId === activeRotationTabId) {
    console.log('轮播标签页已关闭，停止轮播');
    stopRotation();
  }
});

// 添加窗口关闭事件监听
chrome.windows.onRemoved.addListener(function(windowId) {
  if (windowId === activeRotationWindowId) {
    console.log('轮播窗口已关闭，停止轮播');
    stopRotation();
  }
});

// 在初始化时添加这段迁移代码
function migrateData() {
  try {
    chrome.storage.local.get(['isRotating', 'currentIndex', 'rotationInterval', 'lastRotationTime', 'chartList', 'chartRotatorState'], function(data) {
      if (chrome.runtime.lastError) {
        console.error('获取存储数据失败:', chrome.runtime.lastError);
        return;
      }
      
      // 检查是否已经有新格式的数据
      if (data.chartRotatorState) {
        console.log('数据已经使用新格式，无需迁移');
        return;
      }
      
      // 创建新的状态对象
      const newState = {
        urls: [],
        groups: [
          {
            id: 'default',
            name: '默认组',
            frequencyMinutes: 0,
            urlIds: []
          }
        ],
        currentUrlIndex: data.currentIndex || 0,
        interval: data.rotationInterval || 30,
        isRunning: data.isRotating || false,
        isPaused: false,
        lastRotationTime: data.lastRotationTime || null,
        groupLastShownTime: {}
      };
      
      // 迁移URL列表
      if (data.chartList && Array.isArray(data.chartList)) {
        newState.urls = data.chartList.map(chart => ({
          id: 'url_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
          name: chart.name || '未命名',
          url: chart.url
        }));
        
        // 将所有URL添加到默认组
        newState.groups[0].urlIds = newState.urls.map(u => u.id);
      }
      
      // 保存新格式的数据
      chrome.storage.local.set({chartRotatorState: newState}, function() {
        console.log('数据迁移完成');
      });
    });
  } catch (error) {
    console.error('迁移数据时出错:', error);
  }
}

// 添加标签页关闭监听
chrome.tabs.onRemoved.addListener(function(tabId, removeInfo) {
  // 如果关闭的是活动轮播标签页，停止轮播
  if (tabId === activeRotationTabId) {
    console.log('活动轮播标签页被关闭，停止轮播');
    stopRotation();
  }
});

// 添加窗口关闭监听
chrome.windows.onRemoved.addListener(function(windowId) {
  // 如果关闭的是活动轮播窗口，停止轮播
  if (windowId === activeRotationWindowId) {
    console.log('活动轮播窗口被关闭，停止轮播');
    stopRotation();
  }
});

// 添加消息处理
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  try {
    // 检查是否为标签页状态查询消息
    if (message.action === "checkIfActiveRotationTab") {
      // 检查发送消息的标签页是否为活动轮播标签页
      const isActiveRotationTab = sender.tab && sender.tab.id === activeRotationTabId;
      sendResponse({
        isActiveRotationTab: isActiveRotationTab
      });
    }
  } catch (error) {
    console.error('处理消息时出错:', error);
    sendResponse({error: error.message});
  }
  return true;
});

// 辅助函数：获取存储的状态
function getStorage(callback) {
  try {
    chrome.storage.local.get([STORAGE_KEY], function(data) {
      if (chrome.runtime.lastError) {
        console.error('获取存储时出错:', chrome.runtime.lastError);
        callback(defaultState);
        return;
      }
      
      const state = data[STORAGE_KEY] || defaultState;
      callback(state);
    });
  } catch (error) {
    console.error('获取存储时出错:', error);
    callback(defaultState);
  }
}

// 辅助函数：保存状态到存储
function saveStorage(state) {
  try {
    const data = {};
    data[STORAGE_KEY] = state;
    chrome.storage.local.set(data, function() {
      if (chrome.runtime.lastError) {
        console.error('保存存储时出错:', chrome.runtime.lastError);
      }
    });
  } catch (error) {
    console.error('保存存储时出错:', error);
  }
}

// 设置下一次轮播的计时器
function scheduleNextRotation(state) {
  try {
    // 清除现有的计时器
    if (state.timerId) {
      clearTimeout(state.timerId);
      delete state.timerId;
    }
    
    // 如果不是运行状态或者是暂停状态，不需要设置计时器
    if (!state.isRunning || state.isPaused) {
      saveStorage(state);
      return;
    }
    
    // 计算当前URL剩余的显示时间
    const now = Date.now();
    const lastRotationTime = state.lastRotationTime || now;
    const elapsed = now - lastRotationTime;
    const interval = (state.interval || 30) * 1000;
    const remainingTime = Math.max(0, interval - elapsed);
    
    // 创建计时器，等待当前URL完成显示
    console.log(`安排下一次轮播，当前URL剩余时间: ${Math.ceil(remainingTime/1000)}秒`);
    const timerId = setTimeout(function() {
      // 在当前URL完成显示后，选择下一个URL并开始新的轮播
      determineNextUrl();
    }, remainingTime);
    
    // 保存计时器ID
    state.timerId = timerId;
    saveStorage(state);
    
    // 设置优先级监控计时器，每分钟检查一次是否有高优先级组需要显示
    // 此监控不会打断当前URL的播放，但会帮助更准确地计划下一次轮播
    setupPriorityMonitor(state);
    
  } catch (error) {
    console.error('设置下一次轮播计时器时出错:', error);
  }
}

// 设置优先级监控，检查是否有高优先级组需要显示
function setupPriorityMonitor(state) {
  // 清除现有监控计时器
  if (state.priorityMonitorId) {
    clearTimeout(state.priorityMonitorId);
    delete state.priorityMonitorId;
  }
  
  // 每分钟检查一次高优先级组
  const monitorId = setTimeout(function() {
    // 在监控函数中，不直接切换URL，只更新状态以便下次轮播决策
    const now = Date.now();
    
    // 检查是否完成了对当前URL的播放
    const elapsed = now - state.lastRotationTime;
    const interval = (state.interval || 30) * 1000;
    
    // 仅在当前URL播放完成时执行优先级评估
    if (elapsed >= interval) {
      console.log('优先级监控: 当前URL已完成播放，执行优先级评估');
      // 调用轮播函数，它会根据优先级选择下一个URL
      determineNextUrl();
    } else {
      console.log('优先级监控: 当前URL尚未完成播放，继续等待');
      // 重新设置监控计时器
      setupPriorityMonitor(state);
    }
  }, 60000); // 每分钟检查一次
  
  // 保存监控计时器ID
  state.priorityMonitorId = monitorId;
  saveStorage(state);
}

// 获取下一个要显示的URL ID
function getNextUrlId(state) {
  try {
    if (!state.urls || state.urls.length === 0) {
      return null;
    }
    
    // 如果当前没有显示的URL，从第一个开始
    if (!state.currentUrlId) {
      return state.urls[0].id;
    }
    
    // 获取当前URL的索引
    const currentIndex = state.urls.findIndex(url => url.id === state.currentUrlId);
    
    // 如果找不到当前URL，从第一个开始
    if (currentIndex === -1) {
      return state.urls[0].id;
    }
    
    // 计算下一个URL的索引
    const nextIndex = (currentIndex + 1) % state.urls.length;
    
    // 返回下一个URL的ID
    return state.urls[nextIndex].id;
  } catch (error) {
    console.error('获取下一个URL ID时出错:', error);
    return null;
  }
}

// 更新轮播到下一个URL函数
function rotateToNextUrl() {
  try {
    // 检查活动轮播标签页是否存在
    if (!activeRotationTabId) {
      console.warn('没有活动的轮播标签页，无法进行轮播');
      return;
    }
    
    // 检查活动轮播标签页是否仍然存在
    chrome.tabs.get(activeRotationTabId, function(tab) {
      if (chrome.runtime.lastError) {
        console.warn('活动轮播标签页不再存在，停止轮播:', chrome.runtime.lastError);
        stopRotation();
        return;
      }
      
      // 获取当前状态
      getStorage(function(state) {
        if (!state.isRunning || state.isPaused) {
          console.log('轮播已停止或暂停，不进行轮播');
          return;
        }
        
        if (!state.urls || state.urls.length === 0) {
          console.warn('没有URL，无法进行轮播');
          return;
        }
        
        const now = Date.now();
        const elapsedTime = state.lastRotationTime ? now - state.lastRotationTime : 0;
        const intervalMs = state.interval * 1000;
        
        // 检查当前URL是否已经完成了完整的播放时间
        if (elapsedTime < intervalMs) {
          // 当前URL尚未完成播放时间，等待剩余时间再执行下一次轮播
          const remainingTime = intervalMs - elapsedTime;
          console.log(`当前URL尚未完成播放，还剩${Math.ceil(remainingTime/1000)}秒`);
          
          // 在剩余时间后再次尝试轮播
          setTimeout(() => rotateToNextUrl(), remainingTime);
          return;
        }
        
        // 使用与determineNextUrl相同的逻辑：根据优先级选择下一个URL
        selectNextUrlBasedOnPriority(state, now).then(result => {
          const { nextGroupId, nextUrl } = result;
          
          if (!nextUrl) {
            console.warn('无法确定下一个URL，无法进行轮播');
            return;
          }
          
          // 更新组的最后显示时间
          if (nextGroupId) {
            state.groupLastShownTime[nextGroupId] = now;
          }
          
          // 如果是在组内选择的URL，同时更新currentUrlIndex
          const urlIndex = state.urls.findIndex(u => u.id === nextUrl.id);
          if (urlIndex !== -1) {
            state.currentUrlIndex = urlIndex;
          }
          
          // 更新当前URL ID
          state.currentUrlId = nextUrl.id;
          
          // 更新最后轮播时间
          state.lastRotationTime = now;
          
          // 保存更新后的状态
          saveStorage(state);
          
          // 更新活动轮播标签页
          chrome.tabs.update(activeRotationTabId, {
            url: nextUrl.url
          }, function(tab) {
            if (chrome.runtime.lastError) {
              console.error('更新标签页时出错:', chrome.runtime.lastError);
              return;
            }
            
            // 由于当前手动切换了URL，设置下一次轮播的计时器
            scheduleNextRotation(state);
          });
        });
      });
    });
  } catch (error) {
    console.error('轮播到下一个URL时出错:', error);
  }
}