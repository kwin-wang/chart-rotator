// 定义一个全局defaultState用于初始化
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
  interval: 30,
  isRunning: false,
  isPaused: false,
  lastRotationTime: null,
  groupLastShownTime: {}
};

document.addEventListener('DOMContentLoaded', function() {
    // 使用新版本的元素引用
    const targetNameInput = document.getElementById('targetName');
    const targetUrlInput = document.getElementById('targetUrl');
    const addUrlButton = document.getElementById('addUrl');
    const urlList = document.getElementById('urlList');
    const toggleButton = document.getElementById('toggleButton');
    const nextButton = document.getElementById('nextButton');
    const stopButton = document.getElementById('stopButton');
    const statusDisplay = document.getElementById('statusDisplay');
    const rotationIntervalInput = document.getElementById('rotationInterval');
    const targetGroupSelect = document.getElementById('targetGroup');
    
    // 初始化
    loadUrls(); // 使用新的loadUrls函数而不是loadChartList
    updateRotationStatus();
    loadRotationInterval();
    loadGroups();
    
    // 加载轮播间隔时间
    function loadRotationInterval() {
      chrome.storage.local.get('rotationInterval', function(data) {
        if (data.rotationInterval) {
          rotationIntervalInput.value = data.rotationInterval;
        }
      });
    }
    
    // 保存轮播间隔时间
    function saveRotationInterval() {
      const interval = parseInt(rotationIntervalInput.value);
      if (interval >= 5 && interval <= 3600) {
        chrome.storage.local.set({ rotationInterval: interval });
      }
    }
    
    // 监听轮播间隔时间变化
    rotationIntervalInput.addEventListener('change', saveRotationInterval);
    
    // 切换轮播状态
    toggleButton.addEventListener('click', function() {
      chrome.storage.local.get(['isRotating', 'chartList', 'rotationInterval'], function(data) {
        const isRotating = data.isRotating || false;
        const chartList = data.chartList || [];
        
        if (chartList.length === 0) {
          alert('请先添加至少一个URL');
          return;
        }
        
        // 保存当前的轮播间隔时间
        saveRotationInterval();
        
        // 切换轮播状态
        chrome.storage.local.set({ isRotating: !isRotating }, function() {
          // 发送消息到后台脚本
          chrome.runtime.sendMessage({ 
            action: !isRotating ? 'startRotation' : 'stopRotation' 
          }, function(response) {
            console.log('后台脚本响应:', response);
            if (chrome.runtime.lastError) {
              console.error('消息发送错误:', chrome.runtime.lastError);
            }
          });
          
          // 更新UI
          updateRotationStatus();
        });
      });
    });
    
    // 手动切换到下一个
    nextButton.addEventListener('click', function() {
      chrome.runtime.sendMessage({ action: 'nextChart' });
      // 短暂延迟后更新状态，以便获得最新信息
      setTimeout(updateRotationStatus, 300);
    });
    
    // 停止按钮点击事件
    stopButton.addEventListener('click', function() {
      chrome.storage.local.get(['chartList'], function(data) {
        const chartList = data.chartList || [];
        
        if (chartList.length === 0) {
          alert('请先添加至少一个URL');
          return;
        }
        
        // 停止轮播并重置状态
        chrome.storage.local.set({ 
          isRotating: false,
          currentIndex: 0
        }, function() {
          // 发送消息到后台脚本
          chrome.runtime.sendMessage({ 
            action: 'stopRotation',
            shouldReset: true
          }, function(response) {
            console.log('后台脚本响应:', response);
            if (chrome.runtime.lastError) {
              console.error('消息发送错误:', chrome.runtime.lastError);
            }
          });
          
          // 更新UI
          updateRotationStatus();
        });
      });
    });
    
    // 加载URL列表
    function loadUrls() {
      chrome.storage.local.get(['chartRotatorState'], function(result) {
        const state = result.chartRotatorState || defaultState;
        const urlList = document.getElementById('urlList');
        
        urlList.innerHTML = '';
        
        if (state.urls.length === 0) {
          const emptyMessage = document.createElement('div');
          emptyMessage.className = 'url-item';
          emptyMessage.textContent = '尚未添加URL，请添加至少一个URL';
          urlList.appendChild(emptyMessage);
          return;
        }
        
        state.urls.forEach(function(url) {
          const urlItem = document.createElement('div');
          urlItem.className = 'url-item';
          
          // 找到URL所属的分组
          const group = state.groups.find(g => g.urlIds.includes(url.id));
          
          const nameSpan = document.createElement('span');
          nameSpan.className = 'url-name';
          nameSpan.textContent = url.name;
          
          const urlSpan = document.createElement('span');
          urlSpan.className = 'url-address';
          urlSpan.textContent = url.url;
          
          const groupTag = document.createElement('span');
          groupTag.className = 'group-tag';
          groupTag.textContent = group ? group.name : '未分组';
          
          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'delete-btn';
          deleteBtn.textContent = '×';
          deleteBtn.dataset.id = url.id;
          deleteBtn.addEventListener('click', function() {
            removeUrl(url.id);
          });
          
          urlItem.appendChild(nameSpan);
          urlItem.appendChild(urlSpan);
          urlItem.appendChild(groupTag);
          urlItem.appendChild(deleteBtn);
          
          urlList.appendChild(urlItem);
        });
      });
    }
    
    // 删除URL
    function removeUrl(urlId) {
      chrome.storage.local.get(['chartRotatorState'], function(result) {
        const state = result.chartRotatorState || defaultState;
        
        // 找到URL索引
        const urlIndex = state.urls.findIndex(u => u.id === urlId);
        if (urlIndex === -1) return;
        
        // 从所有组中移除这个URL
        state.groups.forEach(group => {
          const idIndex = group.urlIds.indexOf(urlId);
          if (idIndex !== -1) {
            group.urlIds.splice(idIndex, 1);
          }
        });
        
        // 从URLs列表中删除
        state.urls.splice(urlIndex, 1);
        
        // 保存更新后的状态
        chrome.storage.local.set({chartRotatorState: state}, function() {
          loadUrls();
        });
      });
    }
    
    // 更新轮播状态显示
    function updateRotationStatus() {
      chrome.storage.local.get(['isRotating', 'currentIndex', 'chartList'], function(data) {
        const isRotating = data.isRotating || false;
        const currentIndex = data.currentIndex || 0;
        const chartList = data.chartList || [];
        
        if (isRotating) {
          toggleButton.textContent = '暂停';
          toggleButton.classList.add('paused-button');
        } else {
          toggleButton.textContent = '开始';
          toggleButton.classList.remove('paused-button');
        }
        
        if (chartList.length > 0 && currentIndex < chartList.length) {
          const currentChart = chartList[currentIndex];
          statusDisplay.textContent = `当前显示: ${currentChart.name} - ${currentIndex + 1}/${chartList.length}`;
        } else {
          statusDisplay.textContent = '当前显示: -';
        }
      });
    }
    
    // 监听来自后台的消息更新
    chrome.runtime.onMessage.addListener(function(message) {
      if (message.action === 'statusUpdate') {
        updateRotationStatus();
      }
    });

    // 加载分组下拉菜单
    function loadGroups() {
      chrome.storage.local.get(['chartRotatorState'], function(result) {
        const state = result.chartRotatorState || defaultState;
        const targetGroup = document.getElementById('targetGroup');
        
        targetGroup.innerHTML = '';
        
        state.groups.forEach(group => {
          // 添加到URL分组下拉菜单
          const option = document.createElement('option');
          option.value = group.id;
          option.textContent = group.name;
          targetGroup.appendChild(option);
        });
      });
    }

    // 添加URL时指定分组
    document.getElementById('addUrl').addEventListener('click', function() {
      const targetName = document.getElementById('targetName').value.trim();
      const targetUrl = document.getElementById('targetUrl').value.trim();
      const groupId = document.getElementById('targetGroup').value;
      
      if (targetName && isValidUrl(targetUrl)) {
        chrome.storage.local.get(['chartRotatorState'], function(result) {
          const state = result.chartRotatorState || defaultState;
          
          const urlId = 'url_' + Date.now();
          state.urls.push({
            id: urlId,
            name: targetName,
            url: targetUrl
          });
          
          // 将URL添加到选定的分组
          const groupIndex = state.groups.findIndex(g => g.id === groupId);
          if (groupIndex !== -1) {
            state.groups[groupIndex].urlIds.push(urlId);
          }
          
          chrome.storage.local.set({chartRotatorState: state}, function() {
            loadUrls();
            loadGroups();
            document.getElementById('targetName').value = '';
            document.getElementById('targetUrl').value = '';
          });
        });
      } else {
        alert('请输入有效的标的名称和URL');
      }
    });

    // URL有效性验证函数
    function isValidUrl(url) {
      try {
        new URL(url);
        return true;
      } catch (e) {
        return false;
      }
    }

    // 添加设置链接功能
    const openSettingsLink = document.getElementById('openSettings');
    if (openSettingsLink) {
      openSettingsLink.addEventListener('click', function(e) {
        e.preventDefault();
        const extensionUrl = chrome.runtime.getURL('settings.html');
        chrome.tabs.create({url: extensionUrl});
      });
    }
    
    // 移除不需要的分组管理视图相关代码
    const backToMainViewLink = document.getElementById('backToMainView');
    if (backToMainViewLink) {
      backToMainViewLink.addEventListener('click', function() {
        document.getElementById('groupManagerView').style.display = 'none';
        document.getElementById('mainView').style.display = 'block';
      });
    }
});