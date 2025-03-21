document.addEventListener('DOMContentLoaded', function() {
    // DOM元素
    const chartNameInput = document.getElementById('chartName');
    const chartUrlInput = document.getElementById('chartUrl');
    const addButton = document.getElementById('addButton');
    const urlList = document.getElementById('urlList');
    const toggleButton = document.getElementById('toggleButton');
    const nextButton = document.getElementById('nextButton');
    const statusDisplay = document.getElementById('statusDisplay');
    
    // 初始化
    loadChartList();
    updateRotationStatus();
    
    // 添加新URL
    addButton.addEventListener('click', function() {
      const name = chartNameInput.value.trim();
      const url = chartUrlInput.value.trim();
      
      if (name && url) {
        // 检查URL格式是否有效
        try {
          new URL(url);
          
          // 获取现有列表
          chrome.storage.local.get('chartList', function(data) {
            const chartList = data.chartList || [];
            
            // 添加新项目
            chartList.push({ name, url });
            
            // 保存更新后的列表
            chrome.storage.local.set({ chartList }, function() {
              // 清空输入框
              chartNameInput.value = '';
              chartUrlInput.value = '';
              
              // 刷新列表显示
              loadChartList();
            });
          });
        } catch (e) {
          alert('请输入有效的URL');
        }
      } else {
        alert('请输入标的名称和有效的URL');
      }
    });
    
    // 切换轮播状态
    toggleButton.addEventListener('click', function() {
      chrome.storage.local.get(['isRotating', 'chartList'], function(data) {
        const isRotating = data.isRotating || false;
        const chartList = data.chartList || [];
        
        if (chartList.length === 0) {
          alert('请先添加至少一个URL');
          return;
        }
        
        // 切换轮播状态
        chrome.storage.local.set({ isRotating: !isRotating }, function() {
          // 发送消息到后台脚本
          chrome.runtime.sendMessage({ 
            action: !isRotating ? 'startRotation' : 'stopRotation' 
          }, function(response) {
            // 添加回调以检查消息是否被接收
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
    
    // 加载URL列表
    function loadChartList() {
      chrome.storage.local.get('chartList', function(data) {
        const chartList = data.chartList || [];
        
        // 清空列表
        urlList.innerHTML = '';
        
        if (chartList.length === 0) {
          const emptyMessage = document.createElement('div');
          emptyMessage.className = 'url-item';
          emptyMessage.textContent = '尚未添加URL，请添加至少一个URL';
          urlList.appendChild(emptyMessage);
          return;
        }
        
        // 添加每个URL到列表
        chartList.forEach(function(item, index) {
          const urlItem = document.createElement('div');
          urlItem.className = 'url-item';
          
          const nameSpan = document.createElement('span');
          nameSpan.className = 'url-name';
          nameSpan.textContent = item.name;
          
          const urlSpan = document.createElement('span');
          urlSpan.className = 'url-address';
          urlSpan.textContent = item.url;
          
          const deleteBtn = document.createElement('button');
          deleteBtn.className = 'delete-btn';
          deleteBtn.textContent = '×';
          deleteBtn.addEventListener('click', function() {
            removeUrl(index);
          });
          
          urlItem.appendChild(nameSpan);
          urlItem.appendChild(urlSpan);
          urlItem.appendChild(deleteBtn);
          
          urlList.appendChild(urlItem);
        });
      });
    }
    
    // 删除URL
    function removeUrl(index) {
      chrome.storage.local.get('chartList', function(data) {
        const chartList = data.chartList || [];
        
        // 移除指定项目
        chartList.splice(index, 1);
        
        // 保存更新后的列表
        chrome.storage.local.set({ chartList }, function() {
          // 刷新列表显示
          loadChartList();
          
          // 如果列表为空，停止轮播
          if (chartList.length === 0) {
            chrome.storage.local.set({ isRotating: false });
            chrome.runtime.sendMessage({ action: 'stopRotation' });
            updateRotationStatus();
          }
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
  });