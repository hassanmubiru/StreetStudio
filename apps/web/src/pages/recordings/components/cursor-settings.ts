/**
 * Cursor Settings Component
 * Provides cursor highlighting options with customizable colors and effects
 */
export class CursorSettings {
  private container: HTMLElement;
  private settings = {
    enabled: false,
    color: '#3B82F6',
    size: 'medium',
    opacity: 0.8,
    clickAnimation: true,
    trail: false,
    highlightMode: 'circle'
  };
  private onSettingsChanged?: (settings: any) => void;

  constructor(options: {
    onSettingsChanged?: (settings: any) => void;
  } = {}) {
    this.onSettingsChanged = options.onSettingsChanged;
    this.container = document.createElement('div');
    this.setupContainer();
    this.buildSettings();
  }

  private setupContainer(): void {
    this.container.className = 'cursor-settings space-y-6';
    this.container.setAttribute('role', 'group');
    this.container.setAttribute('aria-label', 'Cursor Highlighting Settings');
  }

  private buildSettings(): void {
    // Enable/disable toggle
    const enableSection = this.createEnableSection();
    this.container.appendChild(enableSection);

    // Settings panel (initially hidden)
    const settingsPanel = this.createSettingsPanel();
    this.container.appendChild(settingsPanel);

    // Preview section
    const previewSection = this.createPreviewSection();
    this.container.appendChild(previewSection);
  }

  private createEnableSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'enable-section';
    
    section.innerHTML = `
      <div class="flex items-center justify-between">
        <div>
          <label for="cursor-enable" class="text-sm font-medium text-gray-700 dark:text-gray-300">
            Enable Cursor Highlighting
          </label>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Show cursor effects during recording
          </p>
        </div>
        <label class="relative inline-flex items-center cursor-pointer">
          <input 
            type="checkbox" 
            id="cursor-enable"
            class="sr-only peer" 
            ${this.settings.enabled ? 'checked' : ''}
          >
          <div class="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
        </label>
      </div>
    `;

    const checkbox = section.querySelector('#cursor-enable') as HTMLInputElement;
    checkbox.addEventListener('change', () => {
      this.settings.enabled = checkbox.checked;
      this.toggleSettingsPanel(checkbox.checked);
      this.notifySettingsChanged();
    });

    return section;
  }

  private createSettingsPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = `settings-panel space-y-4 ${this.settings.enabled ? '' : 'hidden'}`;
    panel.id = 'cursor-settings-panel';

    panel.innerHTML = `
      <!-- Highlight Mode -->
      <div class="setting-group">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Highlight Mode
        </label>
        <div class="grid grid-cols-3 gap-2">
          ${this.createModeOption('circle', 'Circle', 'Simple circular highlight around cursor')}
          ${this.createModeOption('spotlight', 'Spotlight', 'Dimmed background with bright cursor area')}
          ${this.createModeOption('ripple', 'Ripple', 'Animated ripple effect on clicks')}
        </div>
      </div>

      <!-- Color Selection -->
      <div class="setting-group">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Highlight Color
        </label>
        <div class="flex items-center space-x-3">
          <input 
            type="color" 
            id="cursor-color"
            value="${this.settings.color}"
            class="w-12 h-8 border border-gray-300 dark:border-gray-600 rounded cursor-pointer"
          >
          <div class="color-presets flex space-x-2">
            ${this.createColorPreset('#3B82F6', 'Blue')}
            ${this.createColorPreset('#EF4444', 'Red')}
            ${this.createColorPreset('#10B981', 'Green')}
            ${this.createColorPreset('#F59E0B', 'Yellow')}
            ${this.createColorPreset('#8B5CF6', 'Purple')}
            ${this.createColorPreset('#EC4899', 'Pink')}
          </div>
        </div>
      </div>

      <!-- Size Selection -->
      <div class="setting-group">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Highlight Size
        </label>
        <div class="grid grid-cols-3 gap-2">
          ${this.createSizeOption('small', 'Small', '24px')}
          ${this.createSizeOption('medium', 'Medium', '32px')}
          ${this.createSizeOption('large', 'Large', '48px')}
        </div>
      </div>

      <!-- Opacity Slider -->
      <div class="setting-group">
        <label for="cursor-opacity" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Opacity
        </label>
        <div class="flex items-center space-x-3">
          <input 
            type="range" 
            id="cursor-opacity"
            min="0.1" 
            max="1" 
            step="0.1" 
            value="${this.settings.opacity}"
            class="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
          >
          <span class="text-sm text-gray-600 dark:text-gray-400 w-10" id="opacity-value">${Math.round(this.settings.opacity * 100)}%</span>
        </div>
      </div>

      <!-- Additional Effects -->
      <div class="setting-group">
        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Additional Effects
        </label>
        <div class="space-y-3">
          <label class="flex items-center">
            <input 
              type="checkbox" 
              id="click-animation"
              class="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
              ${this.settings.clickAnimation ? 'checked' : ''}
            >
            <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Click Animation</span>
            <span class="ml-auto text-xs text-gray-500 dark:text-gray-400">Show animation on mouse clicks</span>
          </label>
          
          <label class="flex items-center">
            <input 
              type="checkbox" 
              id="cursor-trail"
              class="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
              ${this.settings.trail ? 'checked' : ''}
            >
            <span class="ml-2 text-sm text-gray-700 dark:text-gray-300">Cursor Trail</span>
            <span class="ml-auto text-xs text-gray-500 dark:text-gray-400">Leave a fading trail behind cursor</span>
          </label>
        </div>
      </div>
    `;

    this.setupSettingsEventListeners(panel);
    return panel;
  }

  private createModeOption(mode: string, label: string, description: string): string {
    const isSelected = this.settings.highlightMode === mode;
    return `
      <button 
        class="mode-option p-3 border-2 rounded-lg text-left transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          isSelected 
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' 
            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
        }"
        data-mode="${mode}"
        aria-pressed="${isSelected}"
      >
        <div class="font-medium text-sm">${label}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">${description}</div>
      </button>
    `;
  }

  private createColorPreset(color: string, name: string): string {
    return `
      <button 
        class="color-preset w-6 h-6 rounded-full border-2 border-gray-300 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all hover:scale-110"
        data-color="${color}"
        style="background-color: ${color}"
        title="${name}"
        aria-label="Set color to ${name}"
      ></button>
    `;
  }

  private createSizeOption(size: string, label: string, pixels: string): string {
    const isSelected = this.settings.size === size;
    return `
      <button 
        class="size-option p-2 border-2 rounded-lg text-center transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 ${
          isSelected 
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300' 
            : 'border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500'
        }"
        data-size="${size}"
        aria-pressed="${isSelected}"
      >
        <div class="font-medium text-sm">${label}</div>
        <div class="text-xs text-gray-500 dark:text-gray-400">${pixels}</div>
      </button>
    `;
  }

  private createPreviewSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = `preview-section ${this.settings.enabled ? '' : 'hidden'}`;
    section.id = 'cursor-preview-section';
    
    section.innerHTML = `
      <div class="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
        <h4 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Preview</h4>
        <div class="preview-area relative bg-gray-100 dark:bg-gray-800 rounded h-24 flex items-center justify-center cursor-pointer" id="preview-area">
          <div class="text-sm text-gray-500 dark:text-gray-400">Move your cursor here to preview</div>
          <div class="cursor-highlight absolute hidden" id="cursor-highlight"></div>
        </div>
        <p class="text-xs text-gray-500 dark:text-gray-400 mt-2">
          Hover over the preview area to see how your cursor highlighting will look
        </p>
      </div>
    `;

    this.setupPreviewEventListeners(section);
    return section;
  }

  private setupSettingsEventListeners(panel: HTMLElement): void {
    // Color picker
    const colorPicker = panel.querySelector('#cursor-color') as HTMLInputElement;
    colorPicker?.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      this.settings.color = target.value;
      this.updatePreview();
      this.notifySettingsChanged();
    });

    // Color presets
    const colorPresets = panel.querySelectorAll('.color-preset');
    colorPresets.forEach(preset => {
      preset.addEventListener('click', () => {
        const color = preset.getAttribute('data-color') || '#3B82F6';
        this.settings.color = color;
        colorPicker.value = color;
        this.updatePreview();
        this.notifySettingsChanged();
      });
    });

    // Mode selection
    const modeOptions = panel.querySelectorAll('.mode-option');
    modeOptions.forEach(option => {
      option.addEventListener('click', () => {
        const mode = option.getAttribute('data-mode') || 'circle';
        this.settings.highlightMode = mode;
        
        // Update UI
        modeOptions.forEach(opt => {
          opt.classList.remove('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20', 'text-blue-700', 'dark:text-blue-300');
          opt.classList.add('border-gray-200', 'dark:border-gray-600');
          opt.setAttribute('aria-pressed', 'false');
        });
        
        option.classList.remove('border-gray-200', 'dark:border-gray-600');
        option.classList.add('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20', 'text-blue-700', 'dark:text-blue-300');
        option.setAttribute('aria-pressed', 'true');
        
        this.updatePreview();
        this.notifySettingsChanged();
      });
    });

    // Size selection
    const sizeOptions = panel.querySelectorAll('.size-option');
    sizeOptions.forEach(option => {
      option.addEventListener('click', () => {
        const size = option.getAttribute('data-size') || 'medium';
        this.settings.size = size;
        
        // Update UI
        sizeOptions.forEach(opt => {
          opt.classList.remove('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20', 'text-blue-700', 'dark:text-blue-300');
          opt.classList.add('border-gray-200', 'dark:border-gray-600');
          opt.setAttribute('aria-pressed', 'false');
        });
        
        option.classList.remove('border-gray-200', 'dark:border-gray-600');
        option.classList.add('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20', 'text-blue-700', 'dark:text-blue-300');
        option.setAttribute('aria-pressed', 'true');
        
        this.updatePreview();
        this.notifySettingsChanged();
      });
    });

    // Opacity slider
    const opacitySlider = panel.querySelector('#cursor-opacity') as HTMLInputElement;
    const opacityValue = panel.querySelector('#opacity-value');
    
    opacitySlider?.addEventListener('input', (e) => {
      const target = e.target as HTMLInputElement;
      this.settings.opacity = parseFloat(target.value);
      if (opacityValue) {
        opacityValue.textContent = `${Math.round(this.settings.opacity * 100)}%`;
      }
      this.updatePreview();
      this.notifySettingsChanged();
    });

    // Checkboxes
    const clickAnimationCheckbox = panel.querySelector('#click-animation') as HTMLInputElement;
    const trailCheckbox = panel.querySelector('#cursor-trail') as HTMLInputElement;
    
    clickAnimationCheckbox?.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      this.settings.clickAnimation = target.checked;
      this.notifySettingsChanged();
    });
    
    trailCheckbox?.addEventListener('change', (e) => {
      const target = e.target as HTMLInputElement;
      this.settings.trail = target.checked;
      this.notifySettingsChanged();
    });
  }

  private setupPreviewEventListeners(section: HTMLElement): void {
    const previewArea = section.querySelector('#preview-area');
    const cursorHighlight = section.querySelector('#cursor-highlight') as HTMLElement;
    
    if (!previewArea || !cursorHighlight) return;

    previewArea.addEventListener('mouseenter', () => {
      cursorHighlight.classList.remove('hidden');
    });

    previewArea.addEventListener('mouseleave', () => {
      cursorHighlight.classList.add('hidden');
    });

    previewArea.addEventListener('mousemove', (e) => {
      const rect = previewArea.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      cursorHighlight.style.left = `${x}px`;
      cursorHighlight.style.top = `${y}px`;
    });

    previewArea.addEventListener('click', (e) => {
      if (this.settings.clickAnimation) {
        this.showClickAnimation(e.clientX - previewArea.getBoundingClientRect().left, e.clientY - previewArea.getBoundingClientRect().top);
      }
    });
  }

  private showClickAnimation(x: number, y: number): void {
    const previewArea = this.container.querySelector('#preview-area');
    if (!previewArea) return;

    const ripple = document.createElement('div');
    ripple.className = 'absolute rounded-full border-2 animate-ping pointer-events-none';
    ripple.style.left = `${x}px`;
    ripple.style.top = `${y}px`;
    ripple.style.width = '20px';
    ripple.style.height = '20px';
    ripple.style.marginLeft = '-10px';
    ripple.style.marginTop = '-10px';
    ripple.style.borderColor = this.settings.color;
    
    previewArea.appendChild(ripple);
    
    setTimeout(() => {
      ripple.remove();
    }, 1000);
  }

  private toggleSettingsPanel(show: boolean): void {
    const settingsPanel = this.container.querySelector('#cursor-settings-panel');
    const previewSection = this.container.querySelector('#cursor-preview-section');
    
    if (show) {
      settingsPanel?.classList.remove('hidden');
      previewSection?.classList.remove('hidden');
    } else {
      settingsPanel?.classList.add('hidden');
      previewSection?.classList.add('hidden');
    }
  }

  private updatePreview(): void {
    const cursorHighlight = this.container.querySelector('#cursor-highlight') as HTMLElement;
    if (!cursorHighlight) return;

    const sizes = {
      small: '24px',
      medium: '32px',
      large: '48px'
    };

    const size = sizes[this.settings.size] || sizes.medium;
    
    // Update highlight styles based on mode
    switch (this.settings.highlightMode) {
      case 'circle':
        cursorHighlight.style.width = size;
        cursorHighlight.style.height = size;
        cursorHighlight.style.backgroundColor = this.settings.color;
        cursorHighlight.style.opacity = this.settings.opacity.toString();
        cursorHighlight.style.borderRadius = '50%';
        cursorHighlight.style.border = 'none';
        cursorHighlight.style.transform = 'translate(-50%, -50%)';
        break;
        
      case 'spotlight':
        cursorHighlight.style.width = size;
        cursorHighlight.style.height = size;
        cursorHighlight.style.backgroundColor = 'transparent';
        cursorHighlight.style.border = `3px solid ${this.settings.color}`;
        cursorHighlight.style.opacity = this.settings.opacity.toString();
        cursorHighlight.style.borderRadius = '50%';
        cursorHighlight.style.boxShadow = `inset 0 0 20px ${this.settings.color}`;
        cursorHighlight.style.transform = 'translate(-50%, -50%)';
        break;
        
      case 'ripple':
        cursorHighlight.style.width = size;
        cursorHighlight.style.height = size;
        cursorHighlight.style.backgroundColor = 'transparent';
        cursorHighlight.style.border = `2px solid ${this.settings.color}`;
        cursorHighlight.style.opacity = this.settings.opacity.toString();
        cursorHighlight.style.borderRadius = '50%';
        cursorHighlight.style.animation = 'pulse 2s infinite';
        cursorHighlight.style.transform = 'translate(-50%, -50%)';
        break;
    }
  }

  private notifySettingsChanged(): void {
    if (this.onSettingsChanged) {
      this.onSettingsChanged(this.getSettings());
    }
  }

  public getSettings(): any {
    return { ...this.settings };
  }

  public updateSettings(newSettings: Partial<typeof this.settings>): void {
    Object.assign(this.settings, newSettings);
    
    // Update UI to reflect new settings
    const enableCheckbox = this.container.querySelector('#cursor-enable') as HTMLInputElement;
    if (enableCheckbox) {
      enableCheckbox.checked = this.settings.enabled;
    }
    
    this.toggleSettingsPanel(this.settings.enabled);
    this.updatePreview();
  }

  public getElement(): HTMLElement {
    return this.container;
  }
}