/**
 * Recording Controls Component
 * Provides floating recording control panel with accessible positioning
 */
export class RecordingControls {
  private container: HTMLElement;
  private floatingPanel: HTMLElement | null = null;
  private isFloating = false;
  private isEnabled = false;
  private recordingState: 'stopped' | 'recording' | 'paused' = 'stopped';
  private elapsedTime = '00:00';
  
  private onRecord?: () => void;
  private onPause?: () => void;
  private onStop?: () => void;
  private onToggleDrawing?: () => void;

  constructor(options: {
    onRecord?: () => void;
    onPause?: () => void;
    onStop?: () => void;
    onToggleDrawing?: () => void;
  } = {}) {
    this.onRecord = options.onRecord;
    this.onPause = options.onPause;
    this.onStop = options.onStop;
    this.onToggleDrawing = options.onToggleDrawing;
    
    this.container = document.createElement('div');
    this.setupContainer();
    this.buildControls();
  }

  private setupContainer(): void {
    this.container.className = 'recording-controls';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Recording Controls');
  }

  private buildControls(): void {
    // Embedded controls (shown in main interface)
    this.container.appendChild(this.createEmbeddedControls());
  }

  private createEmbeddedControls(): HTMLElement {
    const controls = document.createElement('div');
    controls.className = 'embedded-controls bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 shadow-sm';
    controls.id = 'embedded-controls';

    controls.innerHTML = `
      <div class="controls-header mb-4">
        <h3 class="text-lg font-semibold text-gray-900 dark:text-white">Recording Controls</h3>
        <p class="text-sm text-gray-600 dark:text-gray-400 mt-1">
          Start recording when you're ready
        </p>
      </div>
      
      <div class="controls-content">
        <div class="main-controls flex items-center justify-center space-x-4 mb-6">
          ${this.createControlButton('record', 'Record', 'start-recording', true)}
          ${this.createControlButton('pause', 'Pause', 'pause-recording', false)}
          ${this.createControlButton('stop', 'Stop', 'stop-recording', false)}
        </div>
        
        <div class="secondary-controls flex items-center justify-center space-x-3 mb-4">
          ${this.createSecondaryButton('drawing', 'Toggle Drawing Tools', 'toggle-drawing')}
          ${this.createSecondaryButton('settings', 'Settings', 'open-settings')}
        </div>
        
        <div class="recording-status text-center">
          <div class="status-indicator hidden mb-2" id="status-indicator">
            <div class="flex items-center justify-center space-x-2">
              <div class="recording-dot w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
              <span class="status-text font-medium text-gray-900 dark:text-white">Recording</span>
              <span class="elapsed-time font-mono text-sm text-gray-600 dark:text-gray-400" id="elapsed-time">00:00</span>
            </div>
          </div>
          
          <div class="keyboard-hints text-xs text-gray-500 dark:text-gray-400">
            <p>Keyboard shortcuts: <kbd class="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">Ctrl+Space</kbd> to start/pause, <kbd class="px-1 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">Esc</kbd> to stop</p>
          </div>
        </div>
      </div>
    `;

    this.setupControlEventListeners(controls);
    return controls;
  }

  private createControlButton(type: string, label: string, id: string, enabled: boolean): string {
    const icons = {
      record: `<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path>
      </svg>`,
      pause: `<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 002 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path>
      </svg>`,
      stop: `<svg class="w-6 h-6" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clip-rule="evenodd"></path>
      </svg>`
    };

    const colors = {
      record: enabled ? 'bg-red-600 hover:bg-red-700 text-white' : 'bg-gray-300 dark:bg-gray-600 text-gray-500 cursor-not-allowed',
      pause: enabled ? 'bg-yellow-600 hover:bg-yellow-700 text-white' : 'bg-gray-300 dark:bg-gray-600 text-gray-500 cursor-not-allowed',
      stop: enabled ? 'bg-gray-600 hover:bg-gray-700 text-white' : 'bg-gray-300 dark:bg-gray-600 text-gray-500 cursor-not-allowed'
    };

    return `
      <button 
        id="${id}" 
        class="control-btn flex flex-col items-center p-4 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${colors[type]}"
        ${!enabled ? 'disabled' : ''}
        aria-label="${label}"
        title="${label}"
      >
        ${icons[type]}
        <span class="text-sm font-medium mt-2">${label}</span>
      </button>
    `;
  }

  private createSecondaryButton(type: string, label: string, id: string): string {
    const icons = {
      drawing: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
      </svg>`,
      settings: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path>
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
      </svg>`
    };

    return `
      <button 
        id="${id}"
        class="secondary-btn flex items-center space-x-2 px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
        aria-label="${label}"
        title="${label}"
      >
        ${icons[type]}
        <span class="text-sm">${label}</span>
      </button>
    `;
  }

  private createFloatingControls(): HTMLElement {
    const floatingControls = document.createElement('div');
    floatingControls.className = 'floating-controls fixed top-4 left-1/2 transform -translate-x-1/2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 z-50 min-w-96';
    floatingControls.id = 'floating-controls';
    floatingControls.setAttribute('role', 'toolbar');
    floatingControls.setAttribute('aria-label', 'Floating Recording Controls');

    floatingControls.innerHTML = `
      <div class="floating-header flex items-center justify-between mb-3">
        <div class="recording-status flex items-center space-x-2">
          <div class="recording-dot w-3 h-3 bg-red-500 rounded-full animate-pulse"></div>
          <span class="font-medium text-gray-900 dark:text-white">Recording</span>
          <span class="elapsed-time font-mono text-sm text-gray-600 dark:text-gray-400" id="floating-elapsed-time">00:00</span>
        </div>
        
        <button 
          id="minimize-controls"
          class="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
          aria-label="Minimize controls"
          title="Minimize"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 12H4"></path>
          </svg>
        </button>
      </div>
      
      <div class="floating-controls-content flex items-center justify-center space-x-3">
        ${this.createFloatingButton('pause', 'Pause', 'floating-pause')}
        ${this.createFloatingButton('stop', 'Stop', 'floating-stop')}
        ${this.createFloatingButton('drawing', 'Drawing', 'floating-drawing', true)}
      </div>
      
      <div class="drag-handle absolute top-0 left-0 w-full h-2 cursor-move" title="Drag to move"></div>
    `;

    this.setupFloatingEventListeners(floatingControls);
    this.setupDragAndDrop(floatingControls);
    
    return floatingControls;
  }

  private createFloatingButton(type: string, label: string, id: string, toggle = false): string {
    const icons = {
      pause: `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 002 0V8a1 1 0 00-1-1z" clip-rule="evenodd"></path>
      </svg>`,
      stop: `<svg class="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clip-rule="evenodd"></path>
      </svg>`,
      drawing: `<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path>
      </svg>`
    };

    const baseClass = 'floating-btn flex items-center justify-center p-3 rounded-md transition-all focus:outline-none focus:ring-2 focus:ring-blue-500';
    const colorClass = type === 'stop' ? 'bg-red-100 hover:bg-red-200 text-red-600' : 'bg-gray-100 hover:bg-gray-200 text-gray-600 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-300';

    return `
      <button 
        id="${id}"
        class="${baseClass} ${colorClass}"
        aria-label="${label}"
        title="${label}"
        ${toggle ? 'data-toggle="true"' : ''}
      >
        ${icons[type]}
      </button>
    `;
  }

  private setupControlEventListeners(container: HTMLElement): void {
    const recordBtn = container.querySelector('#start-recording');
    const pauseBtn = container.querySelector('#pause-recording');
    const stopBtn = container.querySelector('#stop-recording');
    const drawingBtn = container.querySelector('#toggle-drawing');

    recordBtn?.addEventListener('click', () => {
      if (this.isEnabled && this.onRecord) {
        this.onRecord();
      }
    });

    pauseBtn?.addEventListener('click', () => {
      if (this.isEnabled && this.onPause) {
        this.onPause();
      }
    });

    stopBtn?.addEventListener('click', () => {
      if (this.isEnabled && this.onStop) {
        this.onStop();
      }
    });

    drawingBtn?.addEventListener('click', () => {
      if (this.isEnabled && this.onToggleDrawing) {
        this.onToggleDrawing();
      }
    });
  }

  private setupFloatingEventListeners(container: HTMLElement): void {
    const pauseBtn = container.querySelector('#floating-pause');
    const stopBtn = container.querySelector('#floating-stop');
    const drawingBtn = container.querySelector('#floating-drawing');
    const minimizeBtn = container.querySelector('#minimize-controls');

    pauseBtn?.addEventListener('click', () => {
      if (this.onPause) this.onPause();
    });

    stopBtn?.addEventListener('click', () => {
      if (this.onStop) this.onStop();
    });

    drawingBtn?.addEventListener('click', () => {
      if (this.onToggleDrawing) {
        this.onToggleDrawing();
        drawingBtn.classList.toggle('bg-blue-100');
        drawingBtn.classList.toggle('text-blue-600');
      }
    });

    minimizeBtn?.addEventListener('click', () => {
      this.minimizeFloatingControls();
    });
  }

  private setupDragAndDrop(container: HTMLElement): void {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialX = 0;
    let initialY = 0;

    const dragHandle = container.querySelector('.drag-handle');
    
    const handleMouseDown = (e: MouseEvent) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      
      const rect = container.getBoundingClientRect();
      initialX = rect.left;
      initialY = rect.top;
      
      container.style.cursor = 'grabbing';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      const newX = initialX + deltaX;
      const newY = initialY + deltaY;
      
      // Keep within viewport bounds
      const maxX = window.innerWidth - container.offsetWidth;
      const maxY = window.innerHeight - container.offsetHeight;
      
      const clampedX = Math.max(0, Math.min(newX, maxX));
      const clampedY = Math.max(0, Math.min(newY, maxY));
      
      container.style.left = `${clampedX}px`;
      container.style.top = `${clampedY}px`;
      container.style.transform = 'none'; // Remove centering transform
    };

    const handleMouseUp = () => {
      isDragging = false;
      container.style.cursor = '';
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    dragHandle?.addEventListener('mousedown', handleMouseDown);
  }

  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    
    const recordBtn = this.container.querySelector('#start-recording') as HTMLButtonElement;
    if (recordBtn) {
      recordBtn.disabled = !enabled;
      
      if (enabled) {
        recordBtn.classList.remove('bg-gray-300', 'dark:bg-gray-600', 'text-gray-500', 'cursor-not-allowed');
        recordBtn.classList.add('bg-red-600', 'hover:bg-red-700', 'text-white');
      } else {
        recordBtn.classList.add('bg-gray-300', 'dark:bg-gray-600', 'text-gray-500', 'cursor-not-allowed');
        recordBtn.classList.remove('bg-red-600', 'hover:bg-red-700', 'text-white');
      }
    }
  }

  public setRecordingState(state: 'stopped' | 'recording' | 'paused'): void {
    this.recordingState = state;
    
    const statusIndicator = this.container.querySelector('#status-indicator');
    const recordBtn = this.container.querySelector('#start-recording') as HTMLButtonElement;
    const pauseBtn = this.container.querySelector('#pause-recording') as HTMLButtonElement;
    const stopBtn = this.container.querySelector('#stop-recording') as HTMLButtonElement;
    
    // Reset all buttons
    [recordBtn, pauseBtn, stopBtn].forEach(btn => {
      if (btn) {
        btn.disabled = true;
        btn.classList.add('bg-gray-300', 'dark:bg-gray-600', 'text-gray-500');
        btn.classList.remove('bg-red-600', 'bg-yellow-600', 'bg-gray-600', 'hover:bg-red-700', 'hover:bg-yellow-700', 'hover:bg-gray-700', 'text-white');
      }
    });

    switch (state) {
      case 'stopped':
        if (statusIndicator) statusIndicator.classList.add('hidden');
        if (recordBtn) {
          recordBtn.disabled = false;
          recordBtn.classList.remove('bg-gray-300', 'dark:bg-gray-600', 'text-gray-500');
          recordBtn.classList.add('bg-red-600', 'hover:bg-red-700', 'text-white');
        }
        break;
        
      case 'recording':
        if (statusIndicator) statusIndicator.classList.remove('hidden');
        if (pauseBtn) {
          pauseBtn.disabled = false;
          pauseBtn.classList.remove('bg-gray-300', 'dark:bg-gray-600', 'text-gray-500');
          pauseBtn.classList.add('bg-yellow-600', 'hover:bg-yellow-700', 'text-white');
        }
        if (stopBtn) {
          stopBtn.disabled = false;
          stopBtn.classList.remove('bg-gray-300', 'dark:bg-gray-600', 'text-gray-500');
          stopBtn.classList.add('bg-gray-600', 'hover:bg-gray-700', 'text-white');
        }
        break;
        
      case 'paused':
        if (statusIndicator) statusIndicator.classList.remove('hidden');
        if (recordBtn) {
          recordBtn.disabled = false;
          recordBtn.classList.remove('bg-gray-300', 'dark:bg-gray-600', 'text-gray-500');
          recordBtn.classList.add('bg-red-600', 'hover:bg-red-700', 'text-white');
        }
        if (stopBtn) {
          stopBtn.disabled = false;
          stopBtn.classList.remove('bg-gray-300', 'dark:bg-gray-600', 'text-gray-500');
          stopBtn.classList.add('bg-gray-600', 'hover:bg-gray-700', 'text-white');
        }
        break;
    }
  }

  public setFloatingMode(floating: boolean): void {
    if (floating && !this.isFloating) {
      // Create and show floating controls
      this.floatingPanel = this.createFloatingControls();
      document.body.appendChild(this.floatingPanel);
      
      // Hide embedded controls
      const embeddedControls = this.container.querySelector('#embedded-controls');
      if (embeddedControls) {
        embeddedControls.classList.add('hidden');
      }
      
      this.isFloating = true;
      
    } else if (!floating && this.isFloating) {
      // Remove floating controls
      if (this.floatingPanel) {
        this.floatingPanel.remove();
        this.floatingPanel = null;
      }
      
      // Show embedded controls
      const embeddedControls = this.container.querySelector('#embedded-controls');
      if (embeddedControls) {
        embeddedControls.classList.remove('hidden');
      }
      
      this.isFloating = false;
    }
  }

  public updateElapsedTime(time: string): void {
    this.elapsedTime = time;
    
    const elapsedElements = [
      this.container.querySelector('#elapsed-time'),
      this.floatingPanel?.querySelector('#floating-elapsed-time')
    ];
    
    elapsedElements.forEach(element => {
      if (element) {
        element.textContent = time;
      }
    });
  }

  private minimizeFloatingControls(): void {
    if (!this.floatingPanel) return;
    
    // Create minimized version
    const minimized = document.createElement('div');
    minimized.className = 'minimized-controls fixed top-4 right-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full shadow-lg p-3 z-50 cursor-pointer';
    minimized.id = 'minimized-controls';
    minimized.setAttribute('title', 'Click to restore controls');
    
    minimized.innerHTML = `
      <div class="flex items-center space-x-2">
        <div class="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
        <span class="text-sm font-mono text-gray-600 dark:text-gray-400">${this.elapsedTime}</span>
      </div>
    `;
    
    minimized.addEventListener('click', () => {
      minimized.remove();
      if (this.floatingPanel) {
        this.floatingPanel.classList.remove('hidden');
      }
    });
    
    // Hide floating panel and show minimized
    this.floatingPanel.classList.add('hidden');
    document.body.appendChild(minimized);
  }

  public getElement(): HTMLElement {
    return this.container;
  }
}