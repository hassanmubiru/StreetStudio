/**
 * Drawing Toolbar Component
 * 
 * Provides UI controls for drawing tools, styles, and actions.
 * Integrates with DrawingOverlay to provide complete drawing functionality.
 * 
 * Requirements: 3.5 - Drawing and annotation tools
 */

import { DrawingTool, DrawingStyle } from './drawing-overlay.js';

export interface ToolbarOptions {
  tools?: DrawingTool[];
  defaultTool?: DrawingTool;
  colors?: string[];
  strokeWidths?: number[];
  position?: 'top' | 'bottom' | 'left' | 'right' | 'floating';
  compact?: boolean;
}

export interface ToolbarCallbacks {
  onToolChange?: (tool: DrawingTool) => void;
  onStyleChange?: (style: Partial<DrawingStyle>) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onClear?: () => void;
}

export class DrawingToolbar {
  private container: HTMLElement;
  private options: Required<ToolbarOptions>;
  private callbacks: ToolbarCallbacks;
  private currentTool: DrawingTool = 'none';
  private currentStyle: DrawingStyle = {
    color: '#000000',
    strokeWidth: 2,
    opacity: 1.0
  };
  
  private readonly defaultOptions: Required<ToolbarOptions> = {
    tools: ['pen', 'highlighter', 'arrow', 'text', 'none'],
    defaultTool: 'none',
    colors: ['#000000', '#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff', '#ffffff'],
    strokeWidths: [1, 2, 4, 8, 12],
    position: 'floating',
    compact: false
  };

  constructor(container: HTMLElement, options: ToolbarOptions = {}, callbacks: ToolbarCallbacks = {}) {
    this.container = container;
    this.options = { ...this.defaultOptions, ...options };
    this.callbacks = callbacks;
    this.currentTool = this.options.defaultTool;
    
    this.render();
    this.setupEventListeners();
  }

  private render(): void {
    const toolbar = document.createElement('div');
    toolbar.className = this.getToolbarClasses();
    toolbar.setAttribute('data-testid', 'drawing-toolbar');
    toolbar.innerHTML = this.getToolbarHTML();
    
    this.container.appendChild(toolbar);
    this.updateToolSelection();
  }

  private getToolbarClasses(): string {
    const baseClasses = 'drawing-toolbar bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg';
    
    const positionClasses = {
      top: 'absolute top-4 left-1/2 transform -translate-x-1/2',
      bottom: 'absolute bottom-4 left-1/2 transform -translate-x-1/2',
      left: 'absolute left-4 top-1/2 transform -translate-y-1/2 flex-col',
      right: 'absolute right-4 top-1/2 transform -translate-y-1/2 flex-col',
      floating: 'absolute top-4 right-4'
    };
    
    const layoutClasses = this.options.compact ? 'p-2 space-x-1' : 'p-3 space-x-2';
    const flexClasses = ['left', 'right'].includes(this.options.position) ? 'flex flex-col space-y-2 space-x-0' : 'flex items-center';
    
    return `${baseClasses} ${positionClasses[this.options.position]} ${layoutClasses} ${flexClasses} z-30`;
  }

  private getToolbarHTML(): string {
    return `
      ${this.getToolsSection()}
      ${this.getStyleSection()}
      ${this.getActionsSection()}
    `;
  }

  private getToolsSection(): string {
    const toolIcons = {
      pen: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />`,
      highlighter: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21h10M12 3v18m-4-9h8" />`,
      arrow: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 8l4 4m0 0l-4 4m4-4H3" />`,
      text: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" />`,
      none: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />`
    };

    const toolButtons = this.options.tools.map(tool => `
      <button
        type="button"
        class="tool-btn p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
        data-tool="${tool}"
        title="${this.getToolTitle(tool)}"
        aria-label="${this.getToolTitle(tool)}"
      >
        <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          ${toolIcons[tool]}
        </svg>
      </button>
    `).join('');

    return `
      <div class="tools-section flex ${['left', 'right'].includes(this.options.position) ? 'flex-col space-y-1' : 'space-x-1'}">
        ${toolButtons}
      </div>
    `;
  }

  private getStyleSection(): string {
    if (this.options.compact) {
      return `
        <div class="style-section relative">
          <button
            type="button"
            class="style-toggle p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors"
            title="Drawing Style"
            aria-label="Drawing Style"
          >
            <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zM7 21h10a2 2 0 002-2v-4a2 2 0 00-2-2H7" />
            </svg>
          </button>
          <div class="style-dropdown hidden absolute top-full mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-3 z-40">
            ${this.getColorPalette()}
            ${this.getStrokeWidthControls()}
          </div>
        </div>
      `;
    }

    return `
      <div class="style-section border-l border-gray-200 dark:border-gray-700 pl-3 ml-3">
        ${this.getColorPalette()}
        ${this.getStrokeWidthControls()}
      </div>
    `;
  }

  private getColorPalette(): string {
    const colorButtons = this.options.colors.map(color => `
      <button
        type="button"
        class="color-btn w-6 h-6 rounded border-2 border-gray-300 hover:border-gray-500 transition-colors"
        style="background-color: ${color}"
        data-color="${color}"
        title="Color: ${color}"
        aria-label="Select color ${color}"
      ></button>
    `).join('');

    return `
      <div class="color-palette">
        <label class="text-xs text-gray-500 dark:text-gray-400 mb-2 block">Color</label>
        <div class="flex flex-wrap gap-1 max-w-32">
          ${colorButtons}
        </div>
      </div>
    `;
  }

  private getStrokeWidthControls(): string {
    const widthButtons = this.options.strokeWidths.map(width => `
      <button
        type="button"
        class="width-btn p-1 rounded border border-gray-300 hover:border-gray-500 hover:bg-gray-50 dark:border-gray-600 dark:hover:border-gray-400 dark:hover:bg-gray-700 transition-colors flex items-center justify-center"
        data-width="${width}"
        title="Stroke width: ${width}px"
        aria-label="Select stroke width ${width} pixels"
      >
        <div class="bg-current rounded-full" style="width: ${Math.min(width * 2, 12)}px; height: ${Math.min(width * 2, 12)}px;"></div>
      </button>
    `).join('');

    return `
      <div class="stroke-width mt-3">
        <label class="text-xs text-gray-500 dark:text-gray-400 mb-2 block">Width</label>
        <div class="flex gap-1">
          ${widthButtons}
        </div>
      </div>
    `;
  }

  private getActionsSection(): string {
    return `
      <div class="actions-section border-l border-gray-200 dark:border-gray-700 pl-3 ml-3 flex ${['left', 'right'].includes(this.options.position) ? 'flex-col space-y-1' : 'space-x-1'}">
        <button
          type="button"
          class="undo-btn p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Undo (Ctrl+Z)"
          aria-label="Undo last drawing action"
        >
          <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </button>
        <button
          type="button"
          class="redo-btn p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Redo (Ctrl+Y)"
          aria-label="Redo last undone action"
        >
          <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 10h-10a8 8 0 00-8 8v2M21 10l-6 6m6-6l-6-6" />
          </svg>
        </button>
        <button
          type="button"
          class="clear-btn p-2 rounded-md text-gray-600 hover:text-red-600 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-900/20 transition-colors"
          title="Clear All"
          aria-label="Clear all drawings"
        >
          <svg class="w-5 h-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
    `;
  }

  private setupEventListeners(): void {
    // Tool selection
    this.container.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const button = target.closest('button');
      
      if (!button) return;

      if (button.classList.contains('tool-btn')) {
        const tool = button.getAttribute('data-tool') as DrawingTool;
        this.setTool(tool);
      } else if (button.classList.contains('color-btn')) {
        const color = button.getAttribute('data-color')!;
        this.setColor(color);
      } else if (button.classList.contains('width-btn')) {
        const width = parseInt(button.getAttribute('data-width')!);
        this.setStrokeWidth(width);
      } else if (button.classList.contains('undo-btn')) {
        this.callbacks.onUndo?.();
      } else if (button.classList.contains('redo-btn')) {
        this.callbacks.onRedo?.();
      } else if (button.classList.contains('clear-btn')) {
        if (confirm('Clear all drawings? This action cannot be undone.')) {
          this.callbacks.onClear?.();
        }
      } else if (button.classList.contains('style-toggle')) {
        this.toggleStyleDropdown();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey) {
        switch (event.key.toLowerCase()) {
          case 'z':
            event.preventDefault();
            if (event.shiftKey) {
              this.callbacks.onRedo?.();
            } else {
              this.callbacks.onUndo?.();
            }
            break;
          case 'y':
            event.preventDefault();
            this.callbacks.onRedo?.();
            break;
        }
      }

      // Tool shortcuts
      const toolShortcuts: Record<string, DrawingTool> = {
        'p': 'pen',
        'h': 'highlighter',
        'a': 'arrow',
        't': 'text',
        'Escape': 'none'
      };

      const tool = toolShortcuts[event.key];
      if (tool) {
        event.preventDefault();
        this.setTool(tool);
      }
    });
  }

  private getToolTitle(tool: DrawingTool): string {
    const titles = {
      pen: 'Pen Tool (P)',
      highlighter: 'Highlighter (H)',
      arrow: 'Arrow Tool (A)',
      text: 'Text Tool (T)',
      none: 'No Tool (Esc)'
    };
    return titles[tool];
  }

  public setTool(tool: DrawingTool): void {
    this.currentTool = tool;
    this.updateToolSelection();
    this.callbacks.onToolChange?.(tool);
  }

  public setColor(color: string): void {
    this.currentStyle.color = color;
    this.updateColorSelection();
    this.callbacks.onStyleChange?.(this.currentStyle);
  }

  public setStrokeWidth(width: number): void {
    this.currentStyle.strokeWidth = width;
    this.updateStrokeWidthSelection();
    this.callbacks.onStyleChange?.(this.currentStyle);
  }

  public getCurrentTool(): DrawingTool {
    return this.currentTool;
  }

  public getCurrentStyle(): DrawingStyle {
    return { ...this.currentStyle };
  }

  public updateUndoRedoState(canUndo: boolean, canRedo: boolean): void {
    const undoBtn = this.container.querySelector('.undo-btn') as HTMLButtonElement;
    const redoBtn = this.container.querySelector('.redo-btn') as HTMLButtonElement;
    
    if (undoBtn) undoBtn.disabled = !canUndo;
    if (redoBtn) redoBtn.disabled = !canRedo;
  }

  private updateToolSelection(): void {
    const toolButtons = this.container.querySelectorAll('.tool-btn');
    toolButtons.forEach(button => {
      const tool = button.getAttribute('data-tool');
      if (tool === this.currentTool) {
        button.classList.add('bg-blue-100', 'text-blue-600', 'dark:bg-blue-900', 'dark:text-blue-400');
      } else {
        button.classList.remove('bg-blue-100', 'text-blue-600', 'dark:bg-blue-900', 'dark:text-blue-400');
      }
    });
  }

  private updateColorSelection(): void {
    const colorButtons = this.container.querySelectorAll('.color-btn');
    colorButtons.forEach(button => {
      const color = button.getAttribute('data-color');
      if (color === this.currentStyle.color) {
        button.classList.add('border-blue-500', 'scale-110');
        button.classList.remove('border-gray-300');
      } else {
        button.classList.remove('border-blue-500', 'scale-110');
        button.classList.add('border-gray-300');
      }
    });
  }

  private updateStrokeWidthSelection(): void {
    const widthButtons = this.container.querySelectorAll('.width-btn');
    widthButtons.forEach(button => {
      const width = parseInt(button.getAttribute('data-width')!);
      if (width === this.currentStyle.strokeWidth) {
        button.classList.add('bg-blue-100', 'border-blue-500', 'dark:bg-blue-900');
      } else {
        button.classList.remove('bg-blue-100', 'border-blue-500', 'dark:bg-blue-900');
      }
    });
  }

  private toggleStyleDropdown(): void {
    const dropdown = this.container.querySelector('.style-dropdown');
    if (dropdown) {
      dropdown.classList.toggle('hidden');
    }
  }

  public destroy(): void {
    this.container.querySelector('.drawing-toolbar')?.remove();
  }
}