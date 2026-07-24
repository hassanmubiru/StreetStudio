/**
 * Screen Selector Component
 * Provides interface for selecting screen/window/tab sources with preview thumbnails
 */
export class ScreenSelector {
  private container: HTMLElement;
  private onSourceSelected?: (source: { id: string; name: string; thumbnail?: string }) => void;
  private selectedSource: { id: string; name: string; thumbnail?: string } | null = null;
  private availableSources: Array<{ id: string; name: string; thumbnail?: string }> = [];

  constructor(options: {
    onSourceSelected?: (source: { id: string; name: string; thumbnail?: string }) => void;
  } = {}) {
    this.onSourceSelected = options.onSourceSelected;
    this.container = document.createElement('div');
    this.setupContainer();
    this.buildSelector();
  }

  private setupContainer(): void {
    this.container.className = 'screen-selector h-full flex flex-col';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Screen Source Selection');
  }

  private buildSelector(): void {
    const header = this.createHeader();
    const sourcesList = this.createSourcesList();
    const footer = this.createFooter();

    this.container.appendChild(header);
    this.container.appendChild(sourcesList);
    this.container.appendChild(footer);
  }

  private createHeader(): HTMLElement {
    const header = document.createElement('div');
    header.className = 'selector-header mb-6';
    
    header.innerHTML = `
      <h2 class="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        Choose What to Record
      </h2>
      <p class="text-gray-600 dark:text-gray-400">
        Select your screen, a specific window, or a browser tab to begin recording
      </p>
    `;

    return header;
  }

  private createSourcesList(): HTMLElement {
    const sourcesList = document.createElement('div');
    sourcesList.className = 'sources-list flex-1 overflow-y-auto';
    sourcesList.id = 'sources-list';

    // Source type tabs
    const tabs = this.createSourceTypeTabs();
    sourcesList.appendChild(tabs);

    // Sources grid
    const sourcesGrid = document.createElement('div');
    sourcesGrid.className = 'sources-grid mt-4';
    sourcesGrid.id = 'sources-grid';
    
    // Initial empty state
    this.showEmptyState(sourcesGrid);
    
    sourcesList.appendChild(sourcesGrid);

    return sourcesList;
  }

  private createSourceTypeTabs(): HTMLElement {
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'source-tabs';
    
    const tabs = [
      { id: 'screen', label: 'Entire Screen', icon: 'monitor' },
      { id: 'window', label: 'Application Window', icon: 'window' },
      { id: 'tab', label: 'Browser Tab', icon: 'browser' }
    ];

    const tabsList = document.createElement('div');
    tabsList.className = 'flex border-b border-gray-200 dark:border-gray-700';
    tabsList.setAttribute('role', 'tablist');
    tabsList.setAttribute('aria-label', 'Source type selection');

    tabs.forEach((tab, index) => {
      const tabButton = document.createElement('button');
      tabButton.className = `tab-button flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
        index === 0 
          ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20' 
          : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300'
      }`;
      tabButton.setAttribute('role', 'tab');
      tabButton.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
      tabButton.setAttribute('id', `tab-${tab.id}`);
      tabButton.setAttribute('aria-controls', `panel-${tab.id}`);
      tabButton.dataset.sourceType = tab.id;
      
      tabButton.innerHTML = `
        <div class="flex items-center justify-center space-x-2">
          ${this.getIconSVG(tab.icon)}
          <span>${tab.label}</span>
        </div>
      `;

      tabButton.addEventListener('click', () => this.handleTabClick(tab.id, tabButton));
      tabsList.appendChild(tabButton);
    });

    tabsContainer.appendChild(tabsList);
    return tabsContainer;
  }

  private getIconSVG(iconType: string): string {
    const icons = {
      monitor: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"></path>
      </svg>`,
      window: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"></path>
      </svg>`,
      browser: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"></path>
      </svg>`
    };
    return icons[iconType] || icons.monitor;
  }

  private handleTabClick(sourceType: string, tabButton: HTMLElement): void {
    // Update tab selection
    const allTabs = this.container.querySelectorAll('.tab-button');
    allTabs.forEach(tab => {
      tab.classList.remove('border-blue-500', 'text-blue-600', 'dark:text-blue-400', 'bg-blue-50', 'dark:bg-blue-900/20');
      tab.classList.add('border-transparent', 'text-gray-500', 'dark:text-gray-400');
      tab.setAttribute('aria-selected', 'false');
    });

    tabButton.classList.remove('border-transparent', 'text-gray-500', 'dark:text-gray-400');
    tabButton.classList.add('border-blue-500', 'text-blue-600', 'dark:text-blue-400', 'bg-blue-50', 'dark:bg-blue-900/20');
    tabButton.setAttribute('aria-selected', 'true');

    // Load sources for the selected type
    this.loadSourcesForType(sourceType);
  }

  private async loadSourcesForType(sourceType: string): Promise<void> {
    const sourcesGrid = document.getElementById('sources-grid');
    if (!sourcesGrid) return;

    // Show loading state
    this.showLoadingState(sourcesGrid);

    try {
      // Request display media to get available sources
      // Note: Actual implementation would need to use getDisplayMedia() with different constraints
      const sources = await this.getAvailableSources(sourceType);
      this.availableSources = sources;
      this.renderSources(sourcesGrid, sources);
    } catch (error) {
      console.error('Failed to load sources:', error);
      this.showErrorState(sourcesGrid, 'Failed to load available sources. Please check your permissions.');
    }
  }

  private async getAvailableSources(sourceType: string): Promise<Array<{ id: string; name: string; thumbnail?: string }>> {
    // Simulate getting available sources
    // In a real implementation, this would interact with the browser's screen capture API
    
    const mockSources = {
      screen: [
        { id: 'screen-1', name: 'Primary Display', thumbnail: this.generateThumbnail('screen') },
        { id: 'screen-2', name: 'Secondary Display', thumbnail: this.generateThumbnail('screen') }
      ],
      window: [
        { id: 'window-1', name: 'Visual Studio Code', thumbnail: this.generateThumbnail('vscode') },
        { id: 'window-2', name: 'Google Chrome', thumbnail: this.generateThumbnail('chrome') },
        { id: 'window-3', name: 'Terminal', thumbnail: this.generateThumbnail('terminal') }
      ],
      tab: [
        { id: 'tab-1', name: 'StreetStudio - Recording', thumbnail: this.generateThumbnail('tab') },
        { id: 'tab-2', name: 'Documentation', thumbnail: this.generateThumbnail('tab') }
      ]
    };

    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    return mockSources[sourceType] || [];
  }

  private generateThumbnail(type: string): string {
    // Generate placeholder thumbnails
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // Background
      ctx.fillStyle = type === 'screen' ? '#1f2937' : type === 'vscode' ? '#1e1e1e' : '#ffffff';
      ctx.fillRect(0, 0, 160, 120);
      
      // Simple representation
      ctx.fillStyle = type === 'screen' ? '#3b82f6' : type === 'vscode' ? '#007acc' : '#4b5563';
      ctx.fillRect(10, 10, 140, 100);
      
      // Text
      ctx.fillStyle = '#ffffff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(type.toUpperCase(), 80, 65);
    }
    
    return canvas.toDataURL();
  }

  private renderSources(container: HTMLElement, sources: Array<{ id: string; name: string; thumbnail?: string }>): void {
    container.innerHTML = '';

    if (sources.length === 0) {
      this.showEmptyState(container);
      return;
    }

    const grid = document.createElement('div');
    grid.className = 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4';

    sources.forEach(source => {
      const sourceCard = this.createSourceCard(source);
      grid.appendChild(sourceCard);
    });

    container.appendChild(grid);
  }

  private createSourceCard(source: { id: string; name: string; thumbnail?: string }): HTMLElement {
    const card = document.createElement('button');
    card.className = `source-card group relative bg-white dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 rounded-lg p-4 transition-all hover:border-blue-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
      this.selectedSource?.id === source.id ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : ''
    }`;
    card.setAttribute('data-source-id', source.id);
    card.setAttribute('role', 'option');
    card.setAttribute('aria-selected', this.selectedSource?.id === source.id ? 'true' : 'false');

    card.innerHTML = `
      <div class="aspect-video bg-gray-100 dark:bg-gray-700 rounded-md overflow-hidden mb-3">
        ${source.thumbnail 
          ? `<img src="${source.thumbnail}" alt="${source.name} preview" class="w-full h-full object-cover">` 
          : `<div class="w-full h-full flex items-center justify-center">
               <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                 <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
               </svg>
             </div>`
        }
      </div>
      <div class="text-left">
        <h3 class="font-medium text-gray-900 dark:text-white truncate">${source.name}</h3>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">Click to select</p>
      </div>
      ${this.selectedSource?.id === source.id 
        ? `<div class="absolute top-2 right-2 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center">
             <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
               <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
             </svg>
           </div>` 
        : ''
      }
    `;

    card.addEventListener('click', () => this.handleSourceSelection(source, card));

    return card;
  }

  private handleSourceSelection(source: { id: string; name: string; thumbnail?: string }, cardElement: HTMLElement): void {
    // Update selection
    this.selectedSource = source;

    // Update UI
    const allCards = this.container.querySelectorAll('.source-card');
    allCards.forEach(card => {
      card.classList.remove('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20');
      card.classList.add('border-gray-200', 'dark:border-gray-600');
      card.setAttribute('aria-selected', 'false');
      
      // Remove checkmark
      const checkmark = card.querySelector('.absolute');
      if (checkmark) {
        checkmark.remove();
      }
    });

    cardElement.classList.remove('border-gray-200', 'dark:border-gray-600');
    cardElement.classList.add('border-blue-500', 'bg-blue-50', 'dark:bg-blue-900/20');
    cardElement.setAttribute('aria-selected', 'true');

    // Add checkmark
    const checkmark = document.createElement('div');
    checkmark.className = 'absolute top-2 right-2 w-6 h-6 bg-blue-500 text-white rounded-full flex items-center justify-center';
    checkmark.innerHTML = `
      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
        <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"></path>
      </svg>
    `;
    cardElement.appendChild(checkmark);

    // Notify selection
    if (this.onSourceSelected) {
      this.onSourceSelected(source);
    }
  }

  private createFooter(): HTMLElement {
    const footer = document.createElement('div');
    footer.className = 'selector-footer mt-6 pt-4 border-t border-gray-200 dark:border-gray-700';
    
    footer.innerHTML = `
      <div class="flex items-center justify-between">
        <div class="text-sm text-gray-500 dark:text-gray-400">
          <span class="selected-count">No source selected</span>
        </div>
        <button 
          id="start-capture-btn"
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          disabled
        >
          Start Capture
        </button>
      </div>
    `;

    const startButton = footer.querySelector('#start-capture-btn');
    startButton?.addEventListener('click', this.handleStartCapture.bind(this));

    return footer;
  }

  private handleStartCapture(): void {
    if (this.selectedSource && this.onSourceSelected) {
      this.onSourceSelected(this.selectedSource);
    }
  }

  private showEmptyState(container: HTMLElement): void {
    container.innerHTML = `
      <div class="text-center py-12">
        <div class="w-16 h-16 mx-auto bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
          </svg>
        </div>
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">No sources available</h3>
        <p class="text-gray-500 dark:text-gray-400">
          Click on a tab above to load available sources for recording
        </p>
      </div>
    `;
  }

  private showLoadingState(container: HTMLElement): void {
    container.innerHTML = `
      <div class="text-center py-12">
        <div class="animate-spin w-8 h-8 mx-auto border-4 border-blue-500 border-t-transparent rounded-full mb-4"></div>
        <p class="text-gray-500 dark:text-gray-400">Loading available sources...</p>
      </div>
    `;
  }

  private showErrorState(container: HTMLElement, message: string): void {
    container.innerHTML = `
      <div class="text-center py-12">
        <div class="w-16 h-16 mx-auto bg-red-100 dark:bg-red-900 rounded-lg flex items-center justify-center mb-4">
          <svg class="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16c-.77.833.192 2.5 1.732 2.5z"></path>
          </svg>
        </div>
        <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-2">Error Loading Sources</h3>
        <p class="text-gray-500 dark:text-gray-400 mb-4">${message}</p>
        <button 
          class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          onclick="location.reload()"
        >
          Try Again
        </button>
      </div>
    `;
  }

  public updateSelectedCount(): void {
    const countElement = this.container.querySelector('.selected-count');
    const startButton = this.container.querySelector('#start-capture-btn') as HTMLButtonElement;
    
    if (countElement && startButton) {
      if (this.selectedSource) {
        countElement.textContent = `Selected: ${this.selectedSource.name}`;
        startButton.disabled = false;
      } else {
        countElement.textContent = 'No source selected';
        startButton.disabled = true;
      }
    }
  }

  public reset(): void {
    this.selectedSource = null;
    this.availableSources = [];
    
    // Reset to first tab
    const firstTab = this.container.querySelector('.tab-button');
    if (firstTab) {
      this.handleTabClick('screen', firstTab as HTMLElement);
    }
    
    this.updateSelectedCount();
  }

  /**
   * Get the currently selected source
   */
  public getSelectedSource(): { id: string; name: string; thumbnail?: string } | null {
    return this.selectedSource;
  }

  /**
   * Set the selected source
   */
  public setSelectedSource(source: { id: string; name: string; thumbnail?: string } | null): void {
    this.selectedSource = source;
    
    // Update UI to reflect selection
    const sourceItems = this.container.querySelectorAll('.source-item');
    sourceItems.forEach(item => {
      const itemId = item.getAttribute('data-source-id');
      if (itemId === source?.id) {
        item.classList.add('selected', 'border-blue-500', 'bg-blue-50');
        item.setAttribute('aria-selected', 'true');
      } else {
        item.classList.remove('selected', 'border-blue-500', 'bg-blue-50');
        item.setAttribute('aria-selected', 'false');
      }
    });

    // Call callback if provided
    if (source && this.onSourceSelected) {
      this.onSourceSelected(source);
    }
  }

  public getElement(): HTMLElement {
    // Initialize with screen sources
    setTimeout(() => {
      this.loadSourcesForType('screen');
    }, 100);
    
    return this.container;
  }
}