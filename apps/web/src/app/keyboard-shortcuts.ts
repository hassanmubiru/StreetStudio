/**
 * Keyboard Shortcuts Manager
 * 
 * Manages global keyboard shortcuts with accessibility support.
 */

export interface KeyboardShortcut {
  key: string;
  modifiers?: string[];
  description: string;
  handler: () => void;
  contexts?: string[];
}

export class KeyboardShortcuts {
  private shortcuts: Map<string, KeyboardShortcut> = new Map();
  private isEnabled = true;
  private helpVisible = false;

  constructor() {
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  /**
   * Register keyboard shortcuts
   */
  public register(shortcuts: KeyboardShortcut[]): void {
    for (const shortcut of shortcuts) {
      const key = this.getShortcutKey(shortcut);
      this.shortcuts.set(key, shortcut);
    }

    // Add event listener if not already added
    document.addEventListener('keydown', this.handleKeyDown);

    // Register help shortcut
    this.registerHelpShortcut();
  }

  /**
   * Unregister a shortcut
   */
  public unregister(shortcut: KeyboardShortcut): void {
    const key = this.getShortcutKey(shortcut);
    this.shortcuts.delete(key);
  }

  /**
   * Enable/disable shortcuts
   */
  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
  }

  /**
   * Show keyboard shortcuts help
   */
  public showHelp(): void {
    if (this.helpVisible) return;

    this.helpVisible = true;
    this.renderHelpDialog();
  }

  /**
   * Hide keyboard shortcuts help
   */
  public hideHelp(): void {
    this.helpVisible = false;
    const helpDialog = document.getElementById('keyboard-shortcuts-help');
    if (helpDialog) {
      helpDialog.remove();
    }
  }

  /**
   * Handle keydown events
   */
  private handleKeyDown(event: KeyboardEvent): void {
    if (!this.isEnabled) return;

    // Skip if user is typing in an input
    const target = event.target as HTMLElement;
    if (this.isInputElement(target)) {
      return;
    }

    const shortcutKey = this.getEventKey(event);
    const shortcut = this.shortcuts.get(shortcutKey);

    if (shortcut) {
      event.preventDefault();
      event.stopPropagation();
      
      try {
        shortcut.handler();
      } catch (error) {
        console.error('Keyboard shortcut handler error:', error);
      }
    }
  }

  /**
   * Register help shortcut (? key)
   */
  private registerHelpShortcut(): void {
    this.shortcuts.set('?', {
      key: '?',
      description: 'Show keyboard shortcuts help',
      handler: () => this.showHelp(),
    });
  }

  /**
   * Generate shortcut key from shortcut definition
   */
  private getShortcutKey(shortcut: KeyboardShortcut): string {
    const modifiers = shortcut.modifiers || [];
    return [...modifiers, shortcut.key].join('+').toLowerCase();
  }

  /**
   * Generate shortcut key from keyboard event
   */
  private getEventKey(event: KeyboardEvent): string {
    const modifiers: string[] = [];
    
    if (event.ctrlKey || event.metaKey) {
      modifiers.push(event.ctrlKey ? 'ctrl' : 'cmd');
    }
    if (event.altKey) {
      modifiers.push('alt');
    }
    if (event.shiftKey && event.key.length > 1) {
      // Only include shift for special keys, not for regular characters
      modifiers.push('shift');
    }

    return [...modifiers, event.key.toLowerCase()].join('+');
  }

  /**
   * Check if target is an input element
   */
  private isInputElement(target: HTMLElement): boolean {
    const tagName = target.tagName.toLowerCase();
    const inputTypes = ['input', 'textarea', 'select'];
    
    if (inputTypes.includes(tagName)) {
      return true;
    }

    // Check for contenteditable
    if (target.isContentEditable) {
      return true;
    }

    // Check for role="textbox"
    if (target.getAttribute('role') === 'textbox') {
      return true;
    }

    return false;
  }

  /**
   * Render help dialog
   */
  private renderHelpDialog(): void {
    const dialog = document.createElement('div');
    dialog.id = 'keyboard-shortcuts-help';
    dialog.className = 'fixed inset-0 z-50 overflow-y-auto';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-labelledby', 'shortcuts-title');
    dialog.setAttribute('aria-modal', 'true');

    const shortcuts = Array.from(this.shortcuts.values()).sort((a, b) => 
      a.description.localeCompare(b.description)
    );

    dialog.innerHTML = `
      <div class="flex min-h-screen items-end justify-center px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div class="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onclick="this.closest('#keyboard-shortcuts-help').remove()"></div>
        
        <span class="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>
        
        <div class="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          <div class="flex items-center justify-between mb-4">
            <h3 id="shortcuts-title" class="text-lg font-medium text-gray-900 dark:text-white">
              Keyboard Shortcuts
            </h3>
            <button 
              onclick="this.closest('#keyboard-shortcuts-help').remove()"
              class="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
            >
              <span class="sr-only">Close</span>
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          
          <div class="space-y-3 max-h-96 overflow-y-auto">
            ${shortcuts.map(shortcut => `
              <div class="flex justify-between items-center">
                <span class="text-sm text-gray-900 dark:text-white">${shortcut.description}</span>
                <kbd class="inline-flex items-center px-2 py-1 text-xs font-mono text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded">
                  ${this.formatShortcutDisplay(shortcut)}
                </kbd>
              </div>
            `).join('')}
          </div>
          
          <div class="mt-6 flex justify-end">
            <button 
              onclick="this.closest('#keyboard-shortcuts-help').remove()"
              class="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(dialog);

    // Focus the dialog for accessibility
    const closeButton = dialog.querySelector('button');
    if (closeButton) {
      closeButton.focus();
    }

    // Handle escape key to close
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.hideHelp();
        document.removeEventListener('keydown', handleEscape);
      }
    };
    
    document.addEventListener('keydown', handleEscape);
  }

  /**
   * Format shortcut for display
   */
  private formatShortcutDisplay(shortcut: KeyboardShortcut): string {
    const modifiers = shortcut.modifiers || [];
    const parts = [...modifiers];
    
    // Replace with platform-specific symbols
    const symbols: Record<string, string> = {
      'cmd': '⌘',
      'ctrl': 'Ctrl',
      'alt': '⌥',
      'shift': '⇧',
    };

    const displayParts = parts.map(mod => symbols[mod] || mod);
    displayParts.push(shortcut.key.toUpperCase());

    return displayParts.join(' + ');
  }

  /**
   * Destroy keyboard shortcuts
   */
  public destroy(): void {
    document.removeEventListener('keydown', this.handleKeyDown);
    this.shortcuts.clear();
    this.hideHelp();
  }
}