/**
 * Keyboard Shortcuts Manager
 * 
 * Global keyboard shortcut manager with conflict resolution, accessibility support,
 * and context-sensitive shortcuts for different application states.
 * 
 * Requirements: 11.1, 11.2
 */

export interface KeyboardShortcut {
  key: string;
  modifiers?: ('ctrl' | 'cmd' | 'alt' | 'shift')[];
  context?: string;
  description: string;
  handler: (event: KeyboardEvent) => void | boolean;
  priority?: number; // Higher priority shortcuts override lower ones
  preventDefault?: boolean;
  disabled?: boolean;
}

export interface ShortcutConflict {
  existing: KeyboardShortcut;
  new: KeyboardShortcut;
  keySignature: string;
}

export interface KeyboardShortcutsOptions {
  enableVisualIndicators?: boolean;
  showHelpOverlay?: boolean;
  preventDefaultBehavior?: boolean;
}

export class KeyboardShortcuts {
  private shortcuts = new Map<string, KeyboardShortcut[]>();
  private contexts = new Set<string>();
  private activeContext = 'global';
  private isEnabled = true;
  private helpOverlayVisible = false;
  private options: KeyboardShortcutsOptions;
  
  // DOM elements
  private helpOverlay: HTMLElement | null = null;
  private shortcutIndicator: HTMLElement | null = null;

  constructor(options: KeyboardShortcutsOptions = {}) {
    this.options = {
      enableVisualIndicators: true,
      showHelpOverlay: true,
      preventDefaultBehavior: true,
      ...options,
    };

    // Initialize keyboard event listeners
    this.setupEventListeners();
    
    // Setup accessibility features
    this.setupAccessibilityFeatures();
    
    // Create help overlay if enabled
    if (this.options.showHelpOverlay) {
      this.createHelpOverlay();
    }

    // Create visual indicators if enabled
    if (this.options.enableVisualIndicators) {
      this.createShortcutIndicator();
    }
  }

  /**
   * Register a keyboard shortcut
   */
  public register(shortcut: KeyboardShortcut): void;
  public register(shortcuts: KeyboardShortcut[]): void;
  public register(input: KeyboardShortcut | KeyboardShortcut[]): void {
    const shortcuts = Array.isArray(input) ? input : [input];

    for (const shortcut of shortcuts) {
      this.registerSingleShortcut(shortcut);
    }
  }

  private registerSingleShortcut(shortcut: KeyboardShortcut): void {
    const keySignature = this.getKeySignature(shortcut);
    const context = shortcut.context || 'global';
    
    // Add context to active contexts
    this.contexts.add(context);

    // Check for conflicts
    const existingShortcuts = this.shortcuts.get(keySignature) || [];
    const conflicts = this.detectConflicts(shortcut, existingShortcuts);
    
    if (conflicts.length > 0) {
      this.resolveConflicts(shortcut, conflicts);
    }

    // Add shortcut to registry
    if (!this.shortcuts.has(keySignature)) {
      this.shortcuts.set(keySignature, []);
    }
    
    const shortcutList = this.shortcuts.get(keySignature)!;
    shortcutList.push(shortcut);
    
    // Sort by priority (higher priority first)
    shortcutList.sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // Update help overlay if visible
    if (this.helpOverlayVisible) {
      this.updateHelpOverlay();
    }
  }

  /**
   * Unregister a keyboard shortcut
   */
  public unregister(key: string, modifiers?: string[], context?: string): void {
    const keySignature = this.createKeySignature(key, modifiers);
    const shortcuts = this.shortcuts.get(keySignature);
    
    if (!shortcuts) return;

    const targetContext = context || 'global';
    const filteredShortcuts = shortcuts.filter(s => s.context !== targetContext);
    
    if (filteredShortcuts.length === 0) {
      this.shortcuts.delete(keySignature);
    } else {
      this.shortcuts.set(keySignature, filteredShortcuts);
    }

    // Update help overlay if visible
    if (this.helpOverlayVisible) {
      this.updateHelpOverlay();
    }
  }

  /**
   * Set the active context for context-sensitive shortcuts
   */
  public setContext(context: string): void {
    this.activeContext = context;
    this.contexts.add(context);
    
    // Update visual indicators
    if (this.options.enableVisualIndicators) {
      this.updateContextIndicator(context);
    }
  }

  /**
   * Get all shortcuts for the current context
   */
  public getShortcutsForContext(context?: string): KeyboardShortcut[] {
    const targetContext = context || this.activeContext;
    const contextShortcuts: KeyboardShortcut[] = [];
    
    for (const shortcuts of this.shortcuts.values()) {
      for (const shortcut of shortcuts) {
        const shortcutContext = shortcut.context || 'global';
        if (shortcutContext === targetContext || shortcutContext === 'global') {
          contextShortcuts.push(shortcut);
        }
      }
    }
    
    return contextShortcuts;
  }

  /**
   * Show/hide help overlay
   */
  public toggleHelpOverlay(): void {
    if (!this.helpOverlay) {
      this.createHelpOverlay();
    }

    this.helpOverlayVisible = !this.helpOverlayVisible;
    
    if (this.helpOverlayVisible) {
      this.updateHelpOverlay();
      this.showHelpOverlay();
    } else {
      this.hideHelpOverlay();
    }
  }

  /**
   * Enable/disable keyboard shortcuts
   */
  public setEnabled(enabled: boolean): void {
    this.isEnabled = enabled;
    
    // Update visual indicators
    if (this.shortcutIndicator) {
      this.shortcutIndicator.setAttribute('data-enabled', enabled.toString());
    }
  }

  /**
   * Destroy the keyboard shortcuts manager
   */
  public destroy(): void {
    // Remove event listeners
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener('keyup', this.handleKeyUp);
    
    // Remove DOM elements
    if (this.helpOverlay) {
      this.helpOverlay.remove();
    }
    
    if (this.shortcutIndicator) {
      this.shortcutIndicator.remove();
    }

    // Clear shortcuts
    this.shortcuts.clear();
    this.contexts.clear();
  }

  private setupEventListeners(): void {
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    document.addEventListener('keyup', this.handleKeyUp.bind(this));
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.isEnabled) return;

    // Handle help overlay toggle (F1 or ?)
    if (event.key === 'F1' || (event.key === '?' && !this.isInputFocused(event.target))) {
      if (this.options.showHelpOverlay) {
        event.preventDefault();
        this.toggleHelpOverlay();
        return;
      }
    }

    // Handle Escape to close overlays
    if (event.key === 'Escape') {
      if (this.helpOverlayVisible) {
        event.preventDefault();
        this.toggleHelpOverlay();
        return;
      }
    }

    const keySignature = this.getKeySignatureFromEvent(event);
    const shortcuts = this.shortcuts.get(keySignature) || [];
    
    // Find the best matching shortcut for current context
    const matchingShortcut = this.findBestMatch(shortcuts);
    
    if (matchingShortcut && !matchingShortcut.disabled) {
      // Show visual indicator if enabled
      if (this.options.enableVisualIndicators) {
        this.showShortcutIndicator(matchingShortcut);
      }

      // Execute shortcut handler
      const result = matchingShortcut.handler(event);
      
      // Prevent default behavior if configured
      if ((matchingShortcut.preventDefault ?? this.options.preventDefaultBehavior) && result !== false) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    // Hide visual indicator on key release
    if (this.options.enableVisualIndicators) {
      this.hideShortcutIndicator();
    }
  };

  private findBestMatch(shortcuts: KeyboardShortcut[]): KeyboardShortcut | null {
    // First, try to find shortcut matching current context
    for (const shortcut of shortcuts) {
      const shortcutContext = shortcut.context || 'global';
      if (shortcutContext === this.activeContext) {
        return shortcut;
      }
    }

    // Fallback to global context shortcuts
    for (const shortcut of shortcuts) {
      const shortcutContext = shortcut.context || 'global';
      if (shortcutContext === 'global') {
        return shortcut;
      }
    }

    return null;
  }

  private detectConflicts(newShortcut: KeyboardShortcut, existingShortcuts: KeyboardShortcut[]): ShortcutConflict[] {
    const conflicts: ShortcutConflict[] = [];
    const keySignature = this.getKeySignature(newShortcut);
    const newContext = newShortcut.context || 'global';

    for (const existing of existingShortcuts) {
      const existingContext = existing.context || 'global';
      
      // Check if contexts overlap (same context or one is global)
      if (existingContext === newContext || existingContext === 'global' || newContext === 'global') {
        conflicts.push({
          existing,
          new: newShortcut,
          keySignature,
        });
      }
    }

    return conflicts;
  }

  private resolveConflicts(newShortcut: KeyboardShortcut, conflicts: ShortcutConflict[]): void {
    // Priority-based conflict resolution
    const newPriority = newShortcut.priority || 0;
    
    for (const conflict of conflicts) {
      const existingPriority = conflict.existing.priority || 0;
      
      if (newPriority <= existingPriority) {
        console.warn(`Keyboard shortcut conflict detected:`, {
          existing: this.getShortcutDescription(conflict.existing),
          new: this.getShortcutDescription(newShortcut),
          resolution: 'Existing shortcut takes precedence due to higher priority'
        });
      } else {
        console.warn(`Keyboard shortcut conflict detected:`, {
          existing: this.getShortcutDescription(conflict.existing),
          new: this.getShortcutDescription(newShortcut),
          resolution: 'New shortcut will override existing due to higher priority'
        });
      }
    }
  }

  private getKeySignature(shortcut: KeyboardShortcut): string {
    return this.createKeySignature(shortcut.key, shortcut.modifiers);
  }

  private createKeySignature(key: string, modifiers?: string[]): string {
    const mods = (modifiers || []).sort().join('+');
    return mods ? `${mods}+${key.toLowerCase()}` : key.toLowerCase();
  }

  private getKeySignatureFromEvent(event: KeyboardEvent): string {
    const modifiers: string[] = [];
    
    if (event.ctrlKey) modifiers.push('ctrl');
    if (event.metaKey) modifiers.push('cmd');
    if (event.altKey) modifiers.push('alt');
    if (event.shiftKey) modifiers.push('shift');
    
    return this.createKeySignature(event.key, modifiers);
  }

  private getShortcutDescription(shortcut: KeyboardShortcut): string {
    const modifiers = shortcut.modifiers || [];
    const modString = modifiers.join(' + ');
    const keyString = modString ? `${modString} + ${shortcut.key}` : shortcut.key;
    const contextString = shortcut.context ? ` (${shortcut.context})` : '';
    return `${keyString}${contextString}: ${shortcut.description}`;
  }

  private isInputFocused(target: EventTarget | null): boolean {
    if (!target || !(target instanceof Element)) return false;
    
    const tagName = target.tagName.toLowerCase();
    const isInput = tagName === 'input' || tagName === 'textarea' || tagName === 'select';
    const isContentEditable = target.getAttribute('contenteditable') === 'true';
    
    return isInput || isContentEditable;
  }

  private setupAccessibilityFeatures(): void {
    // Add skip link for keyboard users
    const skipLink = document.createElement('a');
    skipLink.href = '#main-content';
    skipLink.textContent = 'Skip to main content (Alt+1)';
    skipLink.className = 'sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:bg-blue-600 focus:text-white focus:px-4 focus:py-2 focus:rounded';
    skipLink.setAttribute('accesskey', '1');
    
    // Ensure skip link is the first focusable element
    if (document.body.firstChild) {
      document.body.insertBefore(skipLink, document.body.firstChild);
    } else {
      document.body.appendChild(skipLink);
    }

    // Create ARIA live region for keyboard shortcut announcements
    const announceRegion = document.createElement('div');
    announceRegion.id = 'keyboard-announcements';
    announceRegion.setAttribute('aria-live', 'assertive');
    announceRegion.setAttribute('aria-atomic', 'true');
    announceRegion.className = 'sr-only';
    document.body.appendChild(announceRegion);

    // Register accessibility shortcuts
    this.register([
      {
        key: '1',
        modifiers: ['alt'],
        description: 'Skip to main content',
        handler: () => {
          this.skipToMainContent();
          this.announceShortcut('Skipped to main content');
        },
        priority: 100, // High priority for accessibility
      },
      {
        key: '2',
        modifiers: ['alt'],
        description: 'Skip to navigation',
        handler: () => {
          this.skipToNavigation();
          this.announceShortcut('Skipped to navigation');
        },
        priority: 100,
      },
      {
        key: '3',
        modifiers: ['alt'],
        description: 'Skip to search',
        handler: () => {
          this.skipToSearch();
          this.announceShortcut('Skipped to search');
        },
        priority: 100,
      },
      {
        key: 'F1',
        description: 'Show keyboard shortcuts help',
        handler: () => {
          this.toggleHelpOverlay();
          this.announceShortcut(
            this.helpOverlayVisible ? 'Keyboard shortcuts help opened' : 'Keyboard shortcuts help closed'
          );
        },
        priority: 100,
      },
      {
        key: '?',
        description: 'Show keyboard shortcuts help',
        handler: (event) => {
          if (!this.isInputFocused(event.target)) {
            this.toggleHelpOverlay();
            this.announceShortcut(
              this.helpOverlayVisible ? 'Keyboard shortcuts help opened' : 'Keyboard shortcuts help closed'
            );
          }
        },
        priority: 50,
      },
      {
        key: 'h',
        modifiers: ['alt'],
        description: 'Toggle high contrast mode',
        handler: () => {
          this.toggleHighContrast();
        },
        priority: 100,
      },
      {
        key: 'm',
        modifiers: ['alt'],
        description: 'Toggle reduced motion',
        handler: () => {
          this.toggleReducedMotion();
        },
        priority: 100,
      },
    ]);
  }

  /**
   * Announce shortcut action to screen readers
   */
  private announceShortcut(message: string): void {
    const announceRegion = document.getElementById('keyboard-announcements');
    if (announceRegion) {
      announceRegion.textContent = message;
      // Clear after announcement
      setTimeout(() => {
        announceRegion.textContent = '';
      }, 1000);
    }
  }

  /**
   * Skip to main content
   */
  private skipToMainContent(): void {
    const targets = [
      document.getElementById('main-content'),
      document.querySelector('main'),
      document.querySelector('[role="main"]'),
      document.querySelector('.main-content'),
    ];

    for (const target of targets) {
      if (target && target instanceof HTMLElement) {
        target.focus();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
    }
  }

  /**
   * Skip to navigation
   */
  private skipToNavigation(): void {
    const targets = [
      document.getElementById('navigation'),
      document.querySelector('nav'),
      document.querySelector('[role="navigation"]'),
      document.querySelector('.navigation'),
    ];

    for (const target of targets) {
      if (target && target instanceof HTMLElement) {
        target.focus();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
    }
  }

  /**
   * Skip to search
   */
  private skipToSearch(): void {
    const targets = [
      document.getElementById('search'),
      document.querySelector('input[type="search"]'),
      document.querySelector('[role="search"] input'),
      document.querySelector('.search-input'),
    ];

    for (const target of targets) {
      if (target && target instanceof HTMLElement) {
        target.focus();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        break;
      }
    }
  }

  /**
   * Toggle high contrast mode
   */
  private toggleHighContrast(): void {
    document.body.classList.toggle('high-contrast');
    const isEnabled = document.body.classList.contains('high-contrast');
    this.announceShortcut(`High contrast ${isEnabled ? 'enabled' : 'disabled'}`);
    
    // Store preference
    localStorage.setItem('streetstudio-high-contrast', isEnabled.toString());
  }

  /**
   * Toggle reduced motion preference
   */
  private toggleReducedMotion(): void {
    document.body.classList.toggle('reduce-motion');
    const isEnabled = document.body.classList.contains('reduce-motion');
    this.announceShortcut(`Reduced motion ${isEnabled ? 'enabled' : 'disabled'}`);
    
    // Store preference
    localStorage.setItem('streetstudio-reduce-motion', isEnabled.toString());
  }

  private createHelpOverlay(): void {
    if (this.helpOverlay) return;

    this.helpOverlay = document.createElement('div');
    this.helpOverlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 hidden';
    this.helpOverlay.setAttribute('role', 'dialog');
    this.helpOverlay.setAttribute('aria-labelledby', 'shortcut-help-title');
    this.helpOverlay.setAttribute('aria-describedby', 'shortcut-help-description');
    this.helpOverlay.setAttribute('aria-modal', 'true');

    this.helpOverlay.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-96 overflow-hidden flex flex-col">
        <div class="p-6 border-b border-gray-200 dark:border-gray-700">
          <div class="flex items-center justify-between">
            <div>
              <h2 id="shortcut-help-title" class="text-lg font-semibold text-gray-900 dark:text-white">
                Keyboard Shortcuts
              </h2>
              <p id="shortcut-help-description" class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Use these keyboard shortcuts to navigate and interact with the application more efficiently.
              </p>
            </div>
            <button 
              type="button" 
              class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded p-2"
              aria-label="Close keyboard shortcuts help"
              title="Close help (Esc)"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        
        <div class="flex-1 overflow-y-auto p-6">
          <div id="shortcuts-list" class="space-y-6">
            <!-- Shortcuts will be populated here -->
          </div>
        </div>
        
        <div class="p-6 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600">
          <div class="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
            <div class="flex items-center gap-2">
              <kbd class="px-2 py-1 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded text-xs font-mono shadow-sm">Esc</kbd>
              <span>Close help</span>
            </div>
            <div class="flex items-center gap-2">
              <kbd class="px-2 py-1 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded text-xs font-mono shadow-sm">Tab</kbd>
              <span>Navigate</span>
            </div>
            <div class="flex items-center gap-2">
              <kbd class="px-2 py-1 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded text-xs font-mono shadow-sm">Alt+H</kbd>
              <span>High contrast</span>
            </div>
            <div class="flex items-center gap-2">
              <kbd class="px-2 py-1 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded text-xs font-mono shadow-sm">Alt+M</kbd>
              <span>Reduced motion</span>
            </div>
          </div>
        </div>
      </div>
    `;

    // Close button event listener
    const closeButton = this.helpOverlay.querySelector('button');
    if (closeButton) {
      closeButton.addEventListener('click', () => this.toggleHelpOverlay());
    }

    // Click outside to close
    this.helpOverlay.addEventListener('click', (event) => {
      if (event.target === this.helpOverlay) {
        this.toggleHelpOverlay();
      }
    });

    document.body.appendChild(this.helpOverlay);
  }

  private createShortcutIndicator(): void {
    if (this.shortcutIndicator) return;

    this.shortcutIndicator = document.createElement('div');
    this.shortcutIndicator.className = 'fixed top-4 right-4 z-40 bg-gray-800 text-white px-3 py-2 rounded-lg shadow-lg opacity-0 transition-opacity duration-200 pointer-events-none';
    this.shortcutIndicator.setAttribute('aria-live', 'polite');
    this.shortcutIndicator.setAttribute('data-enabled', 'true');

    document.body.appendChild(this.shortcutIndicator);
  }

  private updateHelpOverlay(): void {
    if (!this.helpOverlay) return;

    const shortcutsList = this.helpOverlay.querySelector('#shortcuts-list');
    if (!shortcutsList) return;

    const contextShortcuts = this.getShortcutsForContext();
    const groupedShortcuts = this.groupShortcutsByContext(contextShortcuts);

    shortcutsList.innerHTML = '';

    for (const [context, shortcuts] of Object.entries(groupedShortcuts)) {
      if (shortcuts.length === 0) continue;

      const contextGroup = document.createElement('div');
      contextGroup.className = 'mb-4';

      const contextTitle = document.createElement('h3');
      contextTitle.className = 'text-sm font-medium text-gray-700 mb-2';
      contextTitle.textContent = context === 'global' ? 'Global Shortcuts' : `${context} Context`;
      contextGroup.appendChild(contextTitle);

      const shortcutList = document.createElement('div');
      shortcutList.className = 'space-y-1';

      for (const shortcut of shortcuts) {
        if (shortcut.disabled) continue;

        const shortcutItem = document.createElement('div');
        shortcutItem.className = 'flex items-center justify-between py-1 px-2 rounded hover:bg-gray-50';

        const keyCombo = this.formatKeyCombo(shortcut);
        const description = shortcut.description;

        shortcutItem.innerHTML = `
          <span class="text-sm text-gray-900">${description}</span>
          <span class="text-xs font-mono bg-gray-100 px-2 py-1 rounded">${keyCombo}</span>
        `;

        shortcutList.appendChild(shortcutItem);
      }

      contextGroup.appendChild(shortcutList);
      shortcutsList.appendChild(contextGroup);
    }
  }

  private groupShortcutsByContext(shortcuts: KeyboardShortcut[]): Record<string, KeyboardShortcut[]> {
    const grouped: Record<string, KeyboardShortcut[]> = {};

    for (const shortcut of shortcuts) {
      const context = shortcut.context || 'global';
      if (!grouped[context]) {
        grouped[context] = [];
      }
      grouped[context].push(shortcut);
    }

    return grouped;
  }

  private formatKeyCombo(shortcut: KeyboardShortcut): string {
    const modifiers = shortcut.modifiers || [];
    const isMac = navigator.platform.indexOf('Mac') > -1;
    
    const modifierMap: Record<string, string> = {
      cmd: isMac ? '⌘' : 'Ctrl',
      ctrl: isMac ? '⌃' : 'Ctrl',
      alt: isMac ? '⌥' : 'Alt',
      shift: isMac ? '⇧' : 'Shift',
    };

    const modString = modifiers.map(mod => modifierMap[mod] || mod).join(isMac ? '' : '+');
    return modString ? `${modString}${isMac ? '' : '+'}${shortcut.key}` : shortcut.key;
  }

  private showHelpOverlay(): void {
    if (!this.helpOverlay) return;

    this.helpOverlay.classList.remove('hidden');
    
    // Focus management for accessibility
    const firstFocusable = this.helpOverlay.querySelector('button');
    if (firstFocusable instanceof HTMLElement) {
      firstFocusable.focus();
    }

    // Trap focus within overlay
    this.trapFocus(this.helpOverlay);
  }

  private hideHelpOverlay(): void {
    if (!this.helpOverlay) return;

    this.helpOverlay.classList.add('hidden');
    
    // Return focus to previously focused element
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement) {
      activeElement.blur();
    }
  }

  private showShortcutIndicator(shortcut: KeyboardShortcut): void {
    if (!this.shortcutIndicator) return;

    const keyCombo = this.formatKeyCombo(shortcut);
    this.shortcutIndicator.textContent = `${keyCombo}: ${shortcut.description}`;
    this.shortcutIndicator.style.opacity = '1';
  }

  private hideShortcutIndicator(): void {
    if (!this.shortcutIndicator) return;

    setTimeout(() => {
      this.shortcutIndicator!.style.opacity = '0';
    }, 1000);
  }

  private updateContextIndicator(context: string): void {
    // Add context indicator to show current keyboard context
    const indicator = document.querySelector('[data-keyboard-context]');
    if (indicator) {
      indicator.setAttribute('data-keyboard-context', context);
    }
  }

  private trapFocus(container: HTMLElement): void {
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    const handleTabKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          event.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          event.preventDefault();
          firstElement.focus();
        }
      }
    };

    container.addEventListener('keydown', handleTabKey);
  }
}