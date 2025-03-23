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
  // 标签页切换
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabPanes = document.querySelectorAll('.tab-pane');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', function() {
      // 移除所有active类
      tabButtons.forEach(btn => btn.classList.remove('active'));
      tabPanes.forEach(pane => pane.classList.remove('active'));
      
      // 添加active类到当前标签和内容
      this.classList.add('active');
      const tabId = this.dataset.tab;
      document.getElementById(tabId).classList.add('active');
    });
  });
  
  // 从URL参数中获取默认标签
  const urlParams = new URLSearchParams(window.location.search);
  const defaultTab = urlParams.get('tab');
  
  // 如果有指定的默认标签，则切换到该标签
  if (defaultTab) {
    const targetTabButton = document.querySelector(`.tab-button[data-tab="${defaultTab}"]`);
    if (targetTabButton) {
      // 模拟点击该标签
      targetTabButton.click();
    }
  }
  
  // 初始化各部分
  loadRotationInterval();
  updateRotationStatus();
  loadGroups();
  loadUrls();
  loadGroupDropdown();
  
  // === 基本设置部分 ===
  
  // 加载轮播间隔时间
  function loadRotationInterval() {
    chrome.storage.local.get(['chartRotatorState'], function(result) {
      const state = result.chartRotatorState || defaultState;
      
      if (state.interval) {
        document.getElementById('rotationInterval').value = state.interval;
      } else {
        // 从旧设置中加载
        chrome.storage.local.get('rotationInterval', function(data) {
          if (data.rotationInterval) {
            document.getElementById('rotationInterval').value = data.rotationInterval;
            
            // 更新到新的数据结构
            const state = result.chartRotatorState || defaultState;
            state.interval = data.rotationInterval;
            chrome.storage.local.set({chartRotatorState: state});
          }
        });
      }
    });
  }
  
  // 保存轮播间隔时间
  function saveRotationInterval() {
    const interval = parseInt(document.getElementById('rotationInterval').value);
    if (interval >= 5 && interval <= 3600) {
      // 同时更新rotationInterval和chartRotatorState中的interval
      chrome.storage.local.set({ rotationInterval: interval });
      
      chrome.storage.local.get(['chartRotatorState'], function(result) {
        const state = result.chartRotatorState || defaultState;
        state.interval = interval;
        chrome.storage.local.set({chartRotatorState: state});
      });
    }
  }
  
  // 监听轮播间隔时间变化
  document.getElementById('rotationInterval').addEventListener('change', saveRotationInterval);
  
  // 开始/暂停轮播
  document.getElementById('toggleButton').addEventListener('click', function() {
    chrome.storage.local.get(['chartRotatorState'], function(result) {
      const state = result.chartRotatorState || defaultState;
      
      if (state.urls.length === 0) {
        alert('请先添加至少一个URL');
        return;
      }
      
      saveRotationInterval();
      
      // 切换状态
      if (state.isRunning) {
        if (state.isPaused) {
          // 当前是暂停状态，恢复轮播
          state.isPaused = false;
        } else {
          // 当前是运行状态，暂停轮播
          state.isPaused = true;
        }
      } else {
        // 当前是停止状态，开始轮播
        state.isRunning = true;
        state.isPaused = false;
      }
      
      chrome.storage.local.set({chartRotatorState: state}, function() {
        const action = state.isRunning 
          ? (state.isPaused ? 'pauseRotation' : 'startRotation') 
          : 'stopRotation';
        
        chrome.runtime.sendMessage({ action: action });
        updateRotationStatus();
      });
    });
  });
  
  // 手动切换到下一个
  document.getElementById('nextButton').addEventListener('click', function() {
    chrome.runtime.sendMessage({ action: 'nextChart' });
    setTimeout(updateRotationStatus, 300);
  });
  
  // 停止轮播
  document.getElementById('stopButton').addEventListener('click', function() {
    try {
      chrome.storage.local.get(['chartRotatorState'], function(result) {
        const state = result.chartRotatorState || defaultState;
        
        if (state.urls.length === 0) {
          alert('请先添加至少一个URL');
          return;
        }
        
        // 重置所有状态
        state.isRunning = false; // 明确设置为未运行
        state.isPaused = false;  // 确保不是暂停状态
        state.currentUrlIndex = 0;
        state.currentUrlId = null;
        
        chrome.storage.local.set({chartRotatorState: state}, function() {
          chrome.runtime.sendMessage({ 
            action: 'stopRotation',
            shouldReset: true
          });
          
          updateRotationStatus();
        });
      });
    } catch (error) {
      console.error('点击停止按钮时出错:', error);
    }
  });
  
  // 更新轮播状态显示
  function updateRotationStatus() {
    chrome.storage.local.get(['chartRotatorState'], function(result) {
      const state = result.chartRotatorState || defaultState;
      
      const toggleButton = document.getElementById('toggleButton');
      if (state.isRunning) {
        if (state.isPaused) {
          toggleButton.textContent = '恢复';
        } else {
          toggleButton.textContent = '暂停';
          toggleButton.style.backgroundColor = '#f39c12';
        }
      } else {
        toggleButton.textContent = '开始';
        toggleButton.style.backgroundColor = '#3498db';
      }
      
      const statusDisplay = document.getElementById('statusDisplay');
      if (state.urls.length > 0) {
        const currentUrlId = state.currentUrlId;
        const currentUrl = state.urls.find(u => u.id === currentUrlId);
        
        if (currentUrl) {
          // 找到URL所属分组
          let groupName = '未分组';
          state.groups.forEach(g => {
            if (g.urlIds.includes(currentUrlId)) {
              groupName = g.name;
            }
          });
          
          const urlIndex = state.urls.findIndex(u => u.id === currentUrlId);
          statusDisplay.textContent = `当前显示: ${currentUrl.name} [${groupName}] - ${urlIndex + 1}/${state.urls.length}`;
        } else {
          statusDisplay.textContent = '当前显示: -';
        }
      } else {
        statusDisplay.textContent = '当前显示: -';
      }
    });
  }
  
  // === 分组管理部分 ===
  
  // 添加新分组
  document.getElementById('addGroup').addEventListener('click', function() {
    const groupName = document.getElementById('groupName').value.trim();
    const groupFrequencyValue = parseFloat(document.getElementById('groupFrequency').value) || 0;
    const groupFrequencyUnit = document.getElementById('groupFrequencyUnit').value;
    
    // 根据单位转换为分钟
    let frequencyMinutes = 0;
    if (groupFrequencyValue > 0) {
      switch (groupFrequencyUnit) {
        case 'second':
          frequencyMinutes = groupFrequencyValue / 60;
          break;
        case 'minute':
          frequencyMinutes = groupFrequencyValue;
          break;
        case 'hour':
          frequencyMinutes = groupFrequencyValue * 60;
          break;
      }
    }
    
    if (groupName) {
      chrome.storage.local.get(['chartRotatorState'], function(result) {
        const state = result.chartRotatorState || defaultState;
        
        state.groups.push({
          id: 'group_' + Date.now(),
          name: groupName,
          frequencyMinutes: frequencyMinutes,
          urlIds: []
        });
        
        chrome.storage.local.set({chartRotatorState: state}, function() {
          loadGroups();
          loadGroupDropdown();
          document.getElementById('groupName').value = '';
          document.getElementById('groupFrequency').value = '';
        });
      });
    } else {
      alert('请输入分组名称');
    }
  });
  
  // 加载分组列表
  function loadGroups() {
    chrome.storage.local.get(['chartRotatorState'], function(result) {
      const state = result.chartRotatorState || defaultState;
      const groupsList = document.getElementById('groupsList');
      
      groupsList.innerHTML = '';
      
      if (state.groups.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'list-item';
        emptyMessage.textContent = '尚未创建分组';
        groupsList.appendChild(emptyMessage);
        return;
      }
      
      state.groups.forEach(group => {
        // 统计该组中的URL数量
        const urlCount = group.urlIds.length;
        
        // 创建分组项目
        const groupItem = document.createElement('div');
        groupItem.className = 'list-item';
        
        const groupInfo = document.createElement('div');
        groupInfo.className = 'item-info';
        
        const groupName = document.createElement('div');
        groupName.className = 'item-name';
        groupName.textContent = group.name;
        
        const groupFrequency = document.createElement('div');
        groupFrequency.className = 'item-detail';
        
        // 根据分钟数选择合适的显示单位
        let frequencyText = '';
        if (group.frequencyMinutes === 0) {
          frequencyText = '连续轮播';
        } else if (group.frequencyMinutes < 1) {
          // 小于1分钟，显示为秒
          const seconds = Math.round(group.frequencyMinutes * 60);
          frequencyText = `每 ${seconds} 秒显示一次`;
        } else if (group.frequencyMinutes >= 60) {
          // 大于等于60分钟，显示为小时
          const hours = Math.round(group.frequencyMinutes / 60 * 10) / 10; // 保留一位小数
          frequencyText = `每 ${hours} 小时显示一次`;
        } else {
          // 显示为分钟
          frequencyText = `每 ${group.frequencyMinutes} 分钟显示一次`;
        }
        
        groupFrequency.textContent = `${frequencyText} · 包含 ${urlCount} 个URL`;
        
        groupInfo.appendChild(groupName);
        groupInfo.appendChild(groupFrequency);
        
        const groupActions = document.createElement('div');
        groupActions.className = 'item-actions';
        
        const editButton = document.createElement('button');
        editButton.textContent = '编辑';
        editButton.dataset.id = group.id;
        editButton.addEventListener('click', function() {
          editGroup(group.id);
        });
        
        const deleteButton = document.createElement('button');
        deleteButton.textContent = '删除';
        deleteButton.style.backgroundColor = '#e74c3c';
        deleteButton.dataset.id = group.id;
        deleteButton.addEventListener('click', function() {
          deleteGroup(group.id);
        });
        
        groupActions.appendChild(editButton);
        groupActions.appendChild(deleteButton);
        
        groupItem.appendChild(groupInfo);
        groupItem.appendChild(groupActions);
        
        groupsList.appendChild(groupItem);
      });
    });
  }
  
  // 编辑分组
  function editGroup(groupId) {
    chrome.storage.local.get(['chartRotatorState'], function(result) {
      const state = result.chartRotatorState || defaultState;
      const group = state.groups.find(g => g.id === groupId);
      
      if (!group) return;
      
      // 创建模态对话框
      const modal = document.createElement('div');
      modal.className = 'modal';
      
      // 计算当前频率值和单位
      let frequencyValue = 0;
      let frequencyUnit = 'minute';
      
      if (group.frequencyMinutes === 0) {
        frequencyValue = 0;
        frequencyUnit = 'minute';
      } else if (group.frequencyMinutes < 1) {
        // 小于1分钟，转换为秒
        frequencyValue = Math.round(group.frequencyMinutes * 60);
        frequencyUnit = 'second';
      } else if (group.frequencyMinutes >= 60) {
        // 大于等于60分钟，转换为小时
        frequencyValue = Math.round(group.frequencyMinutes / 60 * 10) / 10; // 保留一位小数
        frequencyUnit = 'hour';
      } else {
        // 分钟
        frequencyValue = group.frequencyMinutes;
        frequencyUnit = 'minute';
      }
      
      modal.innerHTML = `
        <div class="modal-content">
          <h3>编辑分组</h3>
          <div class="form-group">
            <label for="editGroupName">分组名称:</label>
            <input type="text" id="editGroupName" class="full-width" value="${group.name}">
          </div>
          <div class="form-group">
            <label>轮播频率:</label>
            <div class="frequency-input">
              <input type="number" id="frequencyValue" min="0" value="${frequencyValue}" style="flex: 1;">
              <select id="frequencyUnit" style="flex: 1;">
                <option value="second" ${frequencyUnit === 'second' ? 'selected' : ''}>秒</option>
                <option value="minute" ${frequencyUnit === 'minute' ? 'selected' : ''}>分钟</option>
                <option value="hour" ${frequencyUnit === 'hour' ? 'selected' : ''}>小时</option>
              </select>
            </div>
            <p class="help-text">0表示连续轮播（不间隔）</p>
          </div>
          <div class="button-row">
            <button id="cancelEdit" class="cancel-button">取消</button>
            <button id="confirmEdit" class="confirm-button">保存</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      // 添加样式
      const styleId = 'chart-rotator-edit-group-style';
      let style = document.getElementById(styleId);
      if (!style) {
        style = document.createElement('style');
        style.id = styleId;
        style.textContent = `
          .modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }
          .modal-content {
            background: white;
            padding: 20px;
            border-radius: 5px;
            min-width: 350px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
          }
          .full-width {
            width: 100%;
            padding: 8px;
            margin: 10px 0;
          }
          .frequency-input {
            display: flex;
            gap: 8px;
            margin: 10px 0;
          }
          .button-row {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 15px;
          }
          .cancel-button {
            background-color: #95a5a6;
          }
          .confirm-button {
            background-color: #3498db;
          }
          .help-text {
            font-size: 12px;
            color: #7f8c8d;
            margin-top: 4px;
          }
        `;
        document.head.appendChild(style);
      }
      
      // 事件处理
      document.getElementById('cancelEdit').addEventListener('click', function() {
        document.body.removeChild(modal);
      });
      
      document.getElementById('confirmEdit').addEventListener('click', function() {
        const newName = document.getElementById('editGroupName').value.trim();
        if (!newName) {
          alert('分组名称不能为空');
          return;
        }
        
        const frequencyValue = parseFloat(document.getElementById('frequencyValue').value) || 0;
        const frequencyUnit = document.getElementById('frequencyUnit').value;
        
        // 根据单位转换为分钟
        let frequencyMinutes = 0;
        if (frequencyValue > 0) {
          switch (frequencyUnit) {
            case 'second':
              frequencyMinutes = frequencyValue / 60;
              break;
            case 'minute':
              frequencyMinutes = frequencyValue;
              break;
            case 'hour':
              frequencyMinutes = frequencyValue * 60;
              break;
          }
        }
        
        // 更新分组信息
        group.name = newName;
        group.frequencyMinutes = frequencyMinutes;
        
        chrome.storage.local.set({chartRotatorState: state}, function() {
          loadGroups();
          loadGroupDropdown();
          loadUrls(); // 更新URL列表中的分组名称
          document.body.removeChild(modal);
        });
      });
    });
  }
  
  // 删除分组
  function deleteGroup(groupId) {
    chrome.storage.local.get(['chartRotatorState'], function(result) {
      const state = result.chartRotatorState || defaultState;
      
      // 防止删除最后一个分组
      if (state.groups.length <= 1) {
        alert('至少保留一个分组');
        return;
      }
      
      const groupIndex = state.groups.findIndex(g => g.id === groupId);
      if (groupIndex === -1) return;
      
      if (!confirm(`确定要删除分组"${state.groups[groupIndex].name}"吗？\n该组中的URL将移至默认组。`)) {
        return;
      }
      
      // 将该组的URL移至默认组
      const defaultGroup = state.groups.find(g => g.id === 'default') || state.groups[0];
      state.groups[groupIndex].urlIds.forEach(urlId => {
        if (!defaultGroup.urlIds.includes(urlId)) {
          defaultGroup.urlIds.push(urlId);
        }
      });
      
      // 删除分组
      state.groups.splice(groupIndex, 1);
      
      chrome.storage.local.set({chartRotatorState: state}, function() {
        loadGroups();
        loadGroupDropdown();
        loadUrls();
      });
    });
  }
  
  // === URL管理部分 ===
  
  // 加载分组下拉菜单
  function loadGroupDropdown() {
    chrome.storage.local.get(['chartRotatorState'], function(result) {
      const state = result.chartRotatorState || defaultState;
      const targetGroup = document.getElementById('targetGroup');
      
      targetGroup.innerHTML = '';
      
      state.groups.forEach(group => {
        const option = document.createElement('option');
        option.value = group.id;
        option.textContent = group.name;
        targetGroup.appendChild(option);
      });
    });
  }
  
  // 添加URL
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
          document.getElementById('targetName').value = '';
          document.getElementById('targetUrl').value = '';
        });
      });
    } else {
      alert('请输入有效的标的名称和URL');
    }
  });
  
  // 加载URL列表
  function loadUrls() {
    chrome.storage.local.get(['chartRotatorState'], function(result) {
      const state = result.chartRotatorState || defaultState;
      const urlList = document.getElementById('urlList');
      
      urlList.innerHTML = '';
      
      if (state.urls.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'list-item';
        emptyMessage.textContent = '尚未添加URL，请添加至少一个URL';
        urlList.appendChild(emptyMessage);
        return;
      }
      
      state.urls.forEach(function(url) {
        const urlItem = document.createElement('div');
        urlItem.className = 'list-item';
        
        // 找到URL所属的分组
        const group = state.groups.find(g => g.urlIds.includes(url.id));
        
        const urlInfo = document.createElement('div');
        urlInfo.className = 'item-info';
        
        const nameSpan = document.createElement('div');
        nameSpan.className = 'item-name';
        nameSpan.textContent = url.name;
        if (group) {
          const groupTag = document.createElement('span');
          groupTag.className = 'group-tag';
          groupTag.textContent = group.name;
          nameSpan.appendChild(groupTag);
        }
        
        const urlSpan = document.createElement('div');
        urlSpan.className = 'item-detail';
        urlSpan.textContent = url.url;
        
        urlInfo.appendChild(nameSpan);
        urlInfo.appendChild(urlSpan);
        
        const urlActions = document.createElement('div');
        urlActions.className = 'item-actions';
        
        // 添加编辑按钮
        const editButton = document.createElement('button');
        editButton.textContent = '编辑';
        editButton.style.backgroundColor = '#3498db';
        editButton.dataset.id = url.id;
        editButton.addEventListener('click', function() {
          editUrl(url.id);
        });
        
        const moveGroupButton = document.createElement('button');
        moveGroupButton.textContent = '移动到分组';
        moveGroupButton.dataset.id = url.id;
        moveGroupButton.addEventListener('click', function() {
          moveUrlToGroup(url.id);
        });
        
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '删除';
        deleteBtn.style.backgroundColor = '#e74c3c';
        deleteBtn.dataset.id = url.id;
        deleteBtn.addEventListener('click', function() {
          removeUrl(url.id);
        });
        
        urlActions.appendChild(editButton);
        urlActions.appendChild(moveGroupButton);
        urlActions.appendChild(deleteBtn);
        
        urlItem.appendChild(urlInfo);
        urlItem.appendChild(urlActions);
        
        urlList.appendChild(urlItem);
      });
    });
  }
  
  // 编辑URL
  function editUrl(urlId) {
    chrome.storage.local.get(['chartRotatorState'], function(result) {
      const state = result.chartRotatorState || defaultState;
      
      // 找到要编辑的URL
      const url = state.urls.find(u => u.id === urlId);
      if (!url) return;
      
      // 创建模态对话框
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content">
          <h3>编辑URL</h3>
          <div class="form-group">
            <label for="editUrlName">标的名称:</label>
            <input type="text" id="editUrlName" class="full-width" value="${url.name}">
          </div>
          <div class="form-group">
            <label for="editUrlAddress">URL地址:</label>
            <input type="text" id="editUrlAddress" class="full-width" value="${url.url}">
          </div>
          <div class="button-row">
            <button id="cancelEdit" class="cancel-button">取消</button>
            <button id="confirmEdit" class="confirm-button">保存</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      // 添加事件监听
      document.getElementById('cancelEdit').addEventListener('click', function() {
        document.body.removeChild(modal);
      });
      
      document.getElementById('confirmEdit').addEventListener('click', function() {
        const newName = document.getElementById('editUrlName').value.trim();
        const newUrl = document.getElementById('editUrlAddress').value.trim();
        
        if (newName && isValidUrl(newUrl)) {
          // 更新URL信息
          url.name = newName;
          url.url = newUrl;
          
          // 保存更新后的状态
          chrome.storage.local.set({chartRotatorState: state}, function() {
            // 关闭模态框并刷新URL列表
            document.body.removeChild(modal);
            loadUrls();
            
            // 如果当前正在显示的是这个URL，则更新状态显示
            if (state.currentUrlId === urlId) {
              updateRotationStatus();
            }
          });
        } else {
          alert('请输入有效的标的名称和URL');
        }
      });
    });
  }
  
  // 移动URL到其他分组
  function moveUrlToGroup(urlId) {
    chrome.storage.local.get(['chartRotatorState'], function(result) {
      const state = result.chartRotatorState || defaultState;
      
      // 找到URL所属的当前分组
      let currentGroupId = null;
      state.groups.forEach(group => {
        if (group.urlIds.includes(urlId)) {
          currentGroupId = group.id;
        }
      });
      
      const url = state.urls.find(u => u.id === urlId);
      if (!url) return;
      
      // 创建模态对话框
      const modal = document.createElement('div');
      modal.className = 'modal';
      modal.innerHTML = `
        <div class="modal-content">
          <h3>移动 "${url.name}" 到分组</h3>
          <div class="form-group">
            <label for="moveToGroup">选择目标分组:</label>
            <select id="moveToGroup" class="full-width">
              ${state.groups.map(group => 
                `<option value="${group.id}" ${group.id === currentGroupId ? 'selected' : ''}>${group.name}</option>`
              ).join('')}
            </select>
          </div>
          <div class="button-row">
            <button id="cancelMove" class="cancel-button">取消</button>
            <button id="confirmMove" class="confirm-button">确定</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      
      // 添加样式
      const styleId2 = 'chart-rotator-move-url-style';
      let style = document.getElementById(styleId2);
      if (!style) {
        style = document.createElement('style');
        style.id = styleId2;
        style.textContent = `
          .modal {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
          }
          .modal-content {
            background: white;
            padding: 20px;
            border-radius: 5px;
            min-width: 300px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
          }
          .full-width {
            width: 100%;
            padding: 8px;
            margin: 10px 0;
          }
          .button-row {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 15px;
          }
          .cancel-button {
            background-color: #95a5a6;
          }
          .confirm-button {
            background-color: #3498db;
          }
        `;
        document.head.appendChild(style);
      }
      
      // 事件处理
      document.getElementById('cancelMove').addEventListener('click', function() {
        document.body.removeChild(modal);
      });
      
      document.getElementById('confirmMove').addEventListener('click', function() {
        const newGroupId = document.getElementById('moveToGroup').value;
        
        // 从当前分组中移除
        if (currentGroupId) {
          const currentGroup = state.groups.find(g => g.id === currentGroupId);
          if (currentGroup) {
            const index = currentGroup.urlIds.indexOf(urlId);
            if (index !== -1) {
              currentGroup.urlIds.splice(index, 1);
            }
          }
        }
        
        // 添加到新分组
        const newGroup = state.groups.find(g => g.id === newGroupId);
        if (newGroup && !newGroup.urlIds.includes(urlId)) {
          newGroup.urlIds.push(urlId);
        }
        
        chrome.storage.local.set({chartRotatorState: state}, function() {
          loadUrls();
          document.body.removeChild(modal);
        });
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
  
  // URL有效性验证函数
  function isValidUrl(url) {
    try {
      new URL(url);
      return true;
    } catch (e) {
      return false;
    }
  }
  
  // 确保在加载页面时初始化状态
  function initializeState() {
    chrome.storage.local.get(['chartRotatorState'], function(result) {
      if (!result.chartRotatorState) {
        chrome.storage.local.set({chartRotatorState: defaultState}, function() {
          loadGroups();
          loadGroupDropdown();
        });
      }
    });
  }
  
  // 初始化状态
  initializeState();
  
  // 监听来自后台的消息更新
  chrome.runtime.onMessage.addListener(function(message) {
    if (message.action === 'statusUpdate') {
      updateRotationStatus();
    }
  });

  // === URL备份和导入功能 ===

  // 备份URL数据为CSV格式
  document.getElementById('backupUrls').addEventListener('click', function() {
    chrome.storage.local.get(['chartRotatorState'], function(result) {
      const state = result.chartRotatorState || defaultState;
      
      // 准备CSV内容
      let csvContent = "标的名称,URL,分组名称\n"; // CSV标题行
      
      // 为每个URL构建一行CSV数据
      state.urls.forEach(url => {
        // 找到URL所属的分组
        let groupName = '未分组';
        for (const group of state.groups) {
          if (group.urlIds.includes(url.id)) {
            groupName = group.name;
            break;
          }
        }
        
        // 处理CSV中的特殊字符
        const escapedName = url.name.includes(',') ? `"${url.name}"` : url.name;
        const escapedUrl = url.url.includes(',') ? `"${url.url}"` : url.url;
        const escapedGroup = groupName.includes(',') ? `"${groupName}"` : groupName;
        
        // 添加到CSV内容
        csvContent += `${escapedName},${escapedUrl},${escapedGroup}\n`;
      });
      
      // 创建下载链接
      const dataUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csvContent);
      const exportFileName = 'chart_rotator_backup_' + new Date().toISOString().slice(0, 10) + '.csv';
      
      const linkElement = document.createElement('a');
      linkElement.setAttribute('href', dataUri);
      linkElement.setAttribute('download', exportFileName);
      linkElement.style.display = 'none';
      document.body.appendChild(linkElement);
      linkElement.click();
      document.body.removeChild(linkElement);
    });
  });

  // 打开文件选择器
  document.getElementById('importUrls').addEventListener('click', function() {
    document.getElementById('importUrlsFile').click();
  });

  // 修改文件选择器接受CSV文件
  document.getElementById('importUrlsFile').setAttribute('accept', '.csv,.json');

  // 处理文件选择
  document.getElementById('importUrlsFile').addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
      const fileContent = e.target.result;
      
      // 根据文件扩展名决定解析方式
      if (file.name.toLowerCase().endsWith('.csv')) {
        try {
          const importData = parseCSV(fileContent);
          showImportPreview(importData);
        } catch (error) {
          alert('导入失败: 无效的CSV文件格式');
          console.error('导入失败', error);
        }
      } else {
        // JSON文件处理（保持原有代码）
        try {
          const importData = JSON.parse(fileContent);
          showImportPreview(importData);
        } catch (error) {
          alert('导入失败: 无效的JSON文件格式');
          console.error('导入失败', error);
        }
      }
    };
    reader.readAsText(file);
  });

  // 解析CSV文件内容
  function parseCSV(csvContent) {
    // 按行分割
    const lines = csvContent.split(/\r\n|\n/);
    if (lines.length < 2) {
      throw new Error('CSV文件格式错误：至少需要标题行和一行数据');
    }
    
    // 检查标题行
    const header = parseCSVLine(lines[0]);
    if (header.length < 2) {
      throw new Error('CSV文件格式错误：至少需要名称和URL列');
    }
    
    // 找到各列索引
    const nameIndex = header.findIndex(col => col.includes('名称') && !col.includes('分组'));
    const urlIndex = header.findIndex(col => col.toLowerCase().includes('url'));
    const groupIndex = header.findIndex(col => col.includes('分组'));
    
    if (nameIndex === -1 || urlIndex === -1) {
      throw new Error('CSV文件格式错误：找不到必要的列（标的名称、URL）');
    }
    
    // 处理数据行
    const urls = [];
    const groups = {};
    
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue; // 跳过空行
      
      const columns = parseCSVLine(lines[i]);
      if (columns.length <= Math.max(nameIndex, urlIndex)) continue; // 跳过不完整的行
      
      const name = columns[nameIndex].trim();
      const url = columns[urlIndex].trim();
      
      if (!name || !url) continue; // 跳过没有名称或URL的行
      
      // 创建URL对象
      const urlId = 'url_' + Date.now() + '_' + i;
      urls.push({
        id: urlId,
        name: name,
        url: url
      });
      
      // 处理分组
      if (groupIndex !== -1 && columns[groupIndex]) {
        const groupName = columns[groupIndex].trim();
        if (groupName) {
          if (!groups[groupName]) {
            groups[groupName] = {
              id: 'group_' + Date.now() + '_' + Object.keys(groups).length,
              name: groupName,
              frequencyMinutes: 0, // 默认连续轮播
              urlIds: []
            };
          }
          groups[groupName].urlIds.push(urlId);
        }
      }
    }
    
    // 构建导入数据对象
    return {
      urls: urls,
      groups: Object.values(groups),
      format: 'csv'
    };
  }

  // 解析CSV行，处理引号内的逗号
  function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
    
    // 添加最后一列
    result.push(current);
    
    // 清理引号
    return result.map(col => col.replace(/^"(.*)"$/, '$1'));
  }

  // 显示导入预览 - 优化样式和布局
  function showImportPreview(importData) {
    if (!importData.urls || !Array.isArray(importData.urls) || importData.urls.length === 0) {
      alert('导入失败: 未找到有效的URL数据');
      return;
    }
    
    // 创建模态对话框
    const modal = document.createElement('div');
    modal.className = 'modal import-preview-modal';
    
    // URL预览信息
    let urlsPreview = '';
    if (importData.urls.length > 0) {
      importData.urls.slice(0, 5).forEach(url => {
        urlsPreview += `- ${url.name}: ${url.url}\n`;
      });
      
      if (importData.urls.length > 5) {
        urlsPreview += `... 等共 ${importData.urls.length} 个URL\n`;
      }
    } else {
      urlsPreview = '(无URL数据)';
    }
    
    // 分组预览信息
    let groupsPreview = '';
    if (importData.groups && importData.groups.length > 0) {
      importData.groups.forEach(group => {
        groupsPreview += `- ${group.name}: 包含 ${group.urlIds ? group.urlIds.length : 0} 个URL\n`;
      });
    } else {
      groupsPreview = '(无分组数据，所有URL将添加到默认组)';
    }
    
    // 添加文件格式标识
    const formatLabel = importData.format === 'csv' ? 'CSV' : 'JSON';
    
    modal.innerHTML = `
      <div class="modal-content import-preview-content">
        <h3 class="import-title">导入预览 (${formatLabel}格式)</h3>
        <div class="import-summary">
          <p>发现 <strong>${importData.urls.length}</strong> 个URL和 <strong>${importData.groups ? importData.groups.length : 0}</strong> 个分组</p>
        </div>
        
        <div class="import-mode-selector">
          <p>请选择导入方式:</p>
          <div class="radio-options">
            <label class="radio-label">
              <input type="radio" name="importMode" value="merge" checked> 
              <span>合并 - 保留现有数据并添加新数据</span>
            </label>
            <label class="radio-label">
              <input type="radio" name="importMode" value="replace"> 
              <span>替换 - 清除所有现有数据并导入新数据</span>
            </label>
          </div>
        </div>
        
        <div class="preview-container">
          <div class="preview-section">
            <h4>URL预览:</h4>
            <div class="preview-area">${urlsPreview}</div>
          </div>
          
          <div class="preview-section">
            <h4>分组预览:</h4>
            <div class="preview-area">${groupsPreview}</div>
          </div>
        </div>
        
        <div class="button-row">
          <button id="cancelImport" class="cancel-button">取消</button>
          <button id="confirmImport" class="confirm-button">确认导入</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // 添加专用样式
    const styleId3 = 'chart-rotator-import-preview-style';
    let style = document.getElementById(styleId3);
    if (!style) {
      style = document.createElement('style');
      style.id = styleId3;
      style.textContent = `
        .import-preview-modal {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0,0,0,0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        
        .import-preview-content {
          background: white;
          padding: 25px;
          border-radius: 8px;
          width: 580px;
          max-width: 90%;
          max-height: 85vh;
          overflow-y: auto;
          box-shadow: 0 3px 15px rgba(0,0,0,0.2);
        }
        
        .import-title {
          text-align: center;
          margin-top: 0;
          margin-bottom: 20px;
          color: #2c3e50;
          border-bottom: 1px solid #eee;
          padding-bottom: 10px;
        }
        
        .import-summary {
          text-align: center;
          margin-bottom: 20px;
        }
        
        .import-mode-selector {
          background-color: #f8f9fa;
          border-radius: 6px;
          padding: 15px;
          margin-bottom: 20px;
        }
        
        .import-mode-selector p {
          margin-top: 0;
          margin-bottom: 10px;
          font-weight: 500;
        }
        
        .radio-options {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        
        .radio-label {
          display: flex;
          align-items: center;
          cursor: pointer;
        }
        
        .radio-label span {
          margin-left: 8px;
        }
        
        .preview-container {
          display: flex;
          flex-direction: column;
          gap: 15px;
          margin-bottom: 20px;
        }
        
        .preview-section h4 {
          margin-top: 0;
          margin-bottom: 8px;
          color: #3498db;
        }
        
        .preview-area {
          background-color: #f1f1f1;
          border: 1px solid #ddd;
          border-radius: 4px;
          padding: 12px;
          font-family: monospace;
          font-size: 13px;
          white-space: pre-wrap;
          word-break: break-all;
          max-height: 120px;
          overflow-y: auto;
        }
        
        .button-row {
          display: flex;
          justify-content: center;
          gap: 15px;
          margin-top: 20px;
        }
        
        .cancel-button, .confirm-button {
          padding: 10px 20px;
          border: none;
          border-radius: 4px;
          font-size: 14px;
          cursor: pointer;
          transition: background-color 0.2s;
        }
        
        .cancel-button {
          background-color: #95a5a6;
          color: white;
        }
        
        .confirm-button {
          background-color: #3498db;
          color: white;
        }
        
        .cancel-button:hover {
          background-color: #7f8c8d;
        }
        
        .confirm-button:hover {
          background-color: #2980b9;
        }
      `;
      document.head.appendChild(style);
    }
    
    // 事件处理
    document.getElementById('cancelImport').addEventListener('click', function() {
      document.body.removeChild(modal);
      document.getElementById('importUrlsFile').value = ""; // 清空文件输入框
    });
    
    document.getElementById('confirmImport').addEventListener('click', function() {
      const importMode = document.querySelector('input[name="importMode"]:checked').value;
      processImport(importData, importMode);
      document.body.removeChild(modal);
      document.getElementById('importUrlsFile').value = ""; // 清空文件输入框
    });
  }

  // 处理导入
  function processImport(importData, mode) {
    chrome.storage.local.get(['chartRotatorState'], function(result) {
      let state = result.chartRotatorState || defaultState;
      
      if (mode === 'replace') {
        // 替换模式：使用导入的数据替换现有数据
        if (importData.urls && Array.isArray(importData.urls)) {
          state.urls = importData.urls;
        }
        
        if (importData.groups && Array.isArray(importData.groups)) {
          state.groups = importData.groups;
        } else {
          // 至少保留一个默认组
          state.groups = [defaultState.groups[0]];
        }
        
        // 重置其他状态
        state.currentUrlIndex = 0;
        state.groupLastShownTime = {};
      } else {
        // 合并模式：将导入的数据合并到现有数据中
        
        // 创建URL ID映射，用于处理导入的urlIds引用
        const oldToNewUrlMap = {};
        
        // 导入URLs
        if (importData.urls && Array.isArray(importData.urls)) {
          importData.urls.forEach(importUrl => {
            // 检查是否已存在相同URL
            const existingUrl = state.urls.find(u => u.url === importUrl.url);
            
            if (!existingUrl) {
              // 生成新ID并添加
              const oldId = importUrl.id;
              const newId = 'url_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
              oldToNewUrlMap[oldId] = newId;
              
              state.urls.push({
                id: newId,
                name: importUrl.name,
                url: importUrl.url
              });
            } else {
              // 记录ID映射
              oldToNewUrlMap[importUrl.id] = existingUrl.id;
            }
          });
        }
        
        // 导入分组
        if (importData.groups && Array.isArray(importData.groups)) {
          importData.groups.forEach(importGroup => {
            // 检查是否已存在同名分组
            let group = state.groups.find(g => g.name === importGroup.name);
            
            if (!group) {
              // 创建新分组
              const newGroup = {
                id: 'group_' + Date.now() + '_' + Math.floor(Math.random() * 10000),
                name: importGroup.name,
                frequencyMinutes: importGroup.frequencyMinutes || 0,
                urlIds: []
              };
              
              // 添加组
              state.groups.push(newGroup);
              group = newGroup;
            }
            
            // 添加URL到分组
            if (importGroup.urlIds && Array.isArray(importGroup.urlIds)) {
              importGroup.urlIds.forEach(oldUrlId => {
                const newUrlId = oldToNewUrlMap[oldUrlId];
                if (newUrlId && !group.urlIds.includes(newUrlId)) {
                  group.urlIds.push(newUrlId);
                }
              });
            }
          });
        }
      }
      
      // 保存更新后的状态
      chrome.storage.local.set({chartRotatorState: state}, function() {
        loadGroups();
        loadGroupDropdown();
        loadUrls();
        alert(`导入成功！共导入 ${importData.urls.length} 个URL和 ${importData.groups ? importData.groups.length : 0} 个分组。`);
      });
    });
  }

  // 添加CSV模板下载功能
  document.getElementById('downloadTemplate').addEventListener('click', function() {
    // 创建CSV模板内容
    const templateContent = "标的名称,URL,分组名称\n" +
                            "示例标的1,https://example.com/chart1,高频组\n" +
                            "示例标的2,https://example.com/chart2,高频组\n" +
                            "示例标的3,https://example.com/chart3,低频组\n";
    
    // 创建下载链接
    const dataUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(templateContent);
    const exportFileName = 'chart_rotator_template.csv';
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileName);
    linkElement.style.display = 'none';
    document.body.appendChild(linkElement);
    linkElement.click();
    document.body.removeChild(linkElement);
  });

  // 在设置页面添加调试开关
  document.getElementById('enableDebug').addEventListener('change', function() {
    const debugEnabled = this.checked;
    chrome.storage.local.set({debugEnabled: debugEnabled});
    
    if (debugEnabled) {
      // 显示调试信息
      const debugInfo = document.createElement('div');
      debugInfo.className = 'debug-info';
      debugInfo.style = 'background:#f8f9fa; padding:15px; margin-top:20px; border-radius:4px;';
      
      chrome.storage.local.get(['chartRotatorState'], function(result) {
        const state = result.chartRotatorState || {};
        
        debugInfo.innerHTML = `
          <h4>调试信息</h4>
          <pre style="white-space:pre-wrap; overflow:auto; max-height:300px;">
isRunning: ${state.isRunning}
isPaused: ${state.isPaused}
currentUrlIndex: ${state.currentUrlIndex}
currentUrlId: ${state.currentUrlId}
interval: ${state.interval}
lastRotationTime: ${state.lastRotationTime ? new Date(state.lastRotationTime).toISOString() : 'null'}
          </pre>
          <button id="resetLastRotationTime" class="tool-button">重置轮播时间</button>
        `;
        
        document.getElementById('general').appendChild(debugInfo);
        
        // 添加重置按钮事件
        document.getElementById('resetLastRotationTime').addEventListener('click', function() {
          if (state.isRunning) {
            state.lastRotationTime = Date.now();
            chrome.storage.local.set({chartRotatorState: state}, function() {
              alert('轮播时间已重置!');
              chrome.runtime.sendMessage({ 
                action: 'statusUpdate',
                lastRotationTime: state.lastRotationTime
              });
            });
          } else {
            alert('轮播未运行，无法重置时间');
          }
        });
      });
    } else {
      // 移除调试信息
      const debugInfo = document.querySelector('.debug-info');
      if (debugInfo) {
        debugInfo.remove();
      }
    }
  });
}); 