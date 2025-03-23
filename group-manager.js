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
  // DOM元素
  const backToMainLink = document.getElementById('backToMain');
  const groupNameInput = document.getElementById('groupName');
  const groupFrequencyInput = document.getElementById('groupFrequency');
  const addGroupButton = document.getElementById('addGroup');
  const groupsList = document.getElementById('groupsList');
  
  // 加载分组列表
  loadGroups();
  
  // 返回主页面
  backToMainLink.addEventListener('click', function() {
    chrome.tabs.getCurrent(function(tab) {
      chrome.tabs.remove(tab.id);
    });
  });
  
  // 添加新分组
  addGroupButton.addEventListener('click', function() {
    const groupName = groupNameInput.value.trim();
    const groupFrequency = parseInt(groupFrequencyInput.value) || 0;
    
    if (groupName) {
      chrome.storage.local.get(['chartRotatorState'], function(result) {
        const state = result.chartRotatorState || defaultState;
        
        state.groups.push({
          id: 'group_' + Date.now(),
          name: groupName,
          frequencyMinutes: groupFrequency,
          urlIds: []
        });
        
        chrome.storage.local.set({chartRotatorState: state}, function() {
          loadGroups();
          groupNameInput.value = '';
          groupFrequencyInput.value = '';
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
      
      groupsList.innerHTML = '';
      
      if (state.groups.length === 0) {
        const emptyMessage = document.createElement('div');
        emptyMessage.className = 'group-item';
        emptyMessage.textContent = '尚未创建分组';
        groupsList.appendChild(emptyMessage);
        return;
      }
      
      state.groups.forEach(group => {
        // 统计该组中的URL数量
        const urlCount = group.urlIds.length;
        
        // 创建分组项目
        const groupItem = document.createElement('div');
        groupItem.className = 'group-item';
        
        const groupInfo = document.createElement('div');
        groupInfo.className = 'group-info';
        
        const groupName = document.createElement('div');
        groupName.className = 'group-name';
        groupName.textContent = group.name;
        
        const groupFrequency = document.createElement('div');
        groupFrequency.className = 'group-frequency';
        groupFrequency.textContent = `${group.frequencyMinutes === 0 ? '连续轮播' : `每${group.frequencyMinutes}分钟显示一次`} · 包含 ${urlCount} 个URL`;
        
        groupInfo.appendChild(groupName);
        groupInfo.appendChild(groupFrequency);
        
        const groupActions = document.createElement('div');
        groupActions.className = 'group-actions';
        
        const editButton = document.createElement('button');
        editButton.textContent = '编辑';
        editButton.dataset.id = group.id;
        editButton.addEventListener('click', function() {
          editGroup(group.id);
        });
        
        const deleteButton = document.createElement('button');
        deleteButton.textContent = '删除';
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
  
  // 编辑分组函数
  function editGroup(groupId) {
    chrome.storage.local.get(['chartRotatorState'], function(result) {
      const state = result.chartRotatorState || defaultState;
      const group = state.groups.find(g => g.id === groupId);
      
      if (!group) return;
      
      const newName = prompt('请输入新的分组名称:', group.name);
      if (newName === null) return; // 用户取消
      
      const newFrequency = parseInt(prompt('请输入新的显示频率(分钟，0表示连续):', group.frequencyMinutes));
      if (isNaN(newFrequency) || newFrequency < 0) return;
      
      group.name = newName;
      group.frequencyMinutes = newFrequency;
      
      chrome.storage.local.set({chartRotatorState: state}, function() {
        loadGroups();
      });
    });
  }
  
  // 删除分组函数
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
      
      // 确认是否删除
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
      });
    });
  }
  
  // 确保在加载页面时初始化状态
  function initializeState() {
    chrome.storage.local.get(['chartRotatorState'], function(result) {
      if (!result.chartRotatorState) {
        chrome.storage.local.set({chartRotatorState: defaultState}, function() {
          loadGroups();
        });
      }
    });
  }
  
  // 初始化状态
  initializeState();
}); 