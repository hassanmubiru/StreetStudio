/**
 * Mobile Navigation Component
 * 
 * Provides mobile navigation overlay with slide-out functionality
 */

import type { OrganizationDto, MemberDto } from '@streetstudio/shared';
import type { NavigationItem } from '../navigation-controller';

export interface MobileNavigationOptions {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (href: string) => void;
}

export class MobileNavigation {
  private container: HTMLElement;
  private options: MobileNavigationOptions;
  private currentUser?: MemberDto;
  private currentOrganization?: OrganizationDto;
  private navigationItems: NavigationItem[] = [];
  private currentRoute = '';
  private overlayElement?: HTMLElement;
  private menuElement?: HTMLElement;

  constructor(container: HTMLElement, options: MobileNavigationOptions) {
    this.container = container;
    this.options = options;
    this.currentRoute = window.location.pathname;
  }

  /**
   * Initialize mobile navigation
   */
  public initialize(): void {
    this.setupDefaultNavigationItems();
    this.createMobileMenu();
    this.setupEventListeners();
  }

  /**
   * Update authentication context
   */
  public updateAuthContext(user: MemberDto, organization?: OrganizationDto): void {
    this.currentUser = user;
    this.currentOrganization = organization;
    this.setupContextualNavigationItems();
    this.updateMenuContent();
  }

  /**
   * Update navigation items
   */
  public updateItems(items: NavigationItem[]): void {
    this.navigationItems = items;
    this.updateMenuContent();
  }

  /**
   * Set open state
   */
  public setOpen(isOpen: boolean): void {
    this.options.isOpen = isOpen;
    this.updateVisibility();
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    if (this.overlayElement?.parentNode) {
      this.overlayElement.parentNode.removeChild(this.overlayElement);
    }
  }

  /**
   * Setup default navigation items
   */
  private setupDefaultNavigationItems(): void {
    this.navigationItems = [
      {
        id: 'dashboard',
        label: 'Dashboard',
        href: '/dashboard',
        icon: 'home',
        active: this.currentRoute === '/dashboard'
      },
      {
        id: 'projects',
        label: 'Projects',
        href: '/projects',
        icon: 'folder',
        active: this.currentRoute.startsWith('/projects')
      },
      {
        id: 'recordings',
        label: 'Recordings',
        href: '/recordings',
        icon: 'video',
        active: this.currentRoute.startsWith('/recordings')
      },
      {
        id: 'library',
        label: 'Library',
        href: '/library',
        icon: 'collection',
        active: this.currentRoute.startsWith('/library')
      }
    ];
  }

  /**
   * Setup contextual navigation items
   */
  private setupContextualNavigationItems(): void {
    // Add settings and profile items for authenticated users
    if (this.currentUser) {
      this.navigationItems.push({
        id: 'settings',
        label: 'Settings',
        href: '/settings',
        icon: 'cog',
        active: this.currentRoute.startsWith('/settings')
      });
    }
  }

  /**
   * Create mobile menu overlay
   */
  private createMobileMenu(): void {
    this.overlayElement = document.createElement('div');
    this.overlayElement.id = 'mobile-menu-overlay';
    this.overlayElement.className = 'lg:hidden fixed inset-0 flex z-40 transform transition-transform duration-300 ease-in-out translate-x-full';
    
    this.overlayElement.innerHTML = `
      <!-- Background overlay -->
      <div class="fixed inset-0 bg-gray-600 bg-opacity-75 transition-opacity duration-300 ease-linear opacity-0" id="mobile-menu-backdrop"></div>
      
      <!-- Slide-out panel -->
      <div class="relative flex-1 flex flex-col max-w-xs w-full bg-white dark:bg-gray-800 transform transition-transform duration-300 ease-in-out translate-x-full" id="mobile-menu-panel">
        <!-- Close button -->
        <div class="absolute top-0 right-0 -mr-12 pt-2">
          <button
            type="button"
            class="ml-1 flex items-center justify-center h-10 w-10 rounded-full focus:outline-none focus:ring-2 focus:ring-inset focus:ring-white"
            id="mobile-menu-close"
          >
            <span class="sr-only">Close sidebar</span>
            <svg class="h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <!-- Menu content -->
        <div class="flex-1 h-0 pt-5 pb-4 overflow-y-auto">
          <div class="flex-shrink-0 flex items-center px-4">
            <img class="h-8 w-auto" src="/logo.svg" alt="StreetStudio" />
            <span class="ml-2 text-lg font-semibold text-gray-900 dark:text-white">StreetStudio</span>
          </div>
          
          <!-- Navigation -->
          <nav class="mt-5 px-2 space-y-1" id="mobile-menu-nav">
            <!-- Navigation items will be rendered here -->
          </nav>
        </div>
        
        <!-- Footer -->
        <div class="flex-shrink-0 flex border-t border-gray-200 dark:border-gray-700 p-4" id="mobile-menu-footer">
          <!-- Footer content will be rendered here -->
        </div>
      </div>
    `;

    this.container.appendChild(this.overlayElement);
    this.menuElement = this.overlayElement.querySelector('#mobile-menu-panel') as HTMLElement;
    
    this.updateMenuContent();
  }
  /**
   * Update menu content
   */
  private updateMenuContent(): void {
    if (!this.overlayElement) return;

    // Update navigation items
    const navContainer = this.overlayElement.querySelector('#mobile-menu-nav');
    if (navContainer) {
      navContainer.innerHTML = this.renderNavigationItems();
    }

    // Update footer
    const footerContainer = this.overlayElement.querySelector('#mobile-menu-footer');
    if (footerContainer) {
      footerContainer.innerHTML = this.renderFooter();
    }
  }

  /**
   * Render navigation items for mobile
   */
  private renderNavigationItems(): string {
    return this.navigationItems.map(item => {
      const isActive = item.active || this.currentRoute === item.href;
      
      return `
        <a
          href="${item.href}"
          class="group flex items-center px-2 py-2 text-base font-medium rounded-md transition-colors duration-200 ${
            isActive 
              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200'
              : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'
          }"
          data-mobile-nav-item="${item.id}"
        >
          ${this.renderIcon(item.icon, isActive)}
          <span class="ml-3">${item.label}</span>
          ${item.badge ? `
            <span class="ml-auto inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
              ${item.badge}
            </span>
          ` : ''}
        </a>
      `;
    }).join('');
  }

  /**
   * Render footer content
   */
  private renderFooter(): string {
    if (!this.currentUser) {
      return `
        <div class="w-full space-y-2">
          <a
            href="/auth/login"
            class="w-full bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 flex justify-center py-2 px-4 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
          >
            Sign in
          </a>
          <a
            href="/auth/register"
            class="w-full bg-blue-600 hover:bg-blue-700 text-white flex justify-center py-2 px-4 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
          >
            Sign up
          </a>
        </div>
      `;
    }

    return `
      <div class="w-full">
        <!-- User info -->
        <div class="flex items-center mb-4">
          <img class="h-10 w-10 rounded-full" src="${this.currentUser.avatarUrl || '/default-avatar.png'}" alt="${this.currentUser.displayName || this.currentUser.email}" />
          <div class="ml-3">
            <p class="text-sm font-medium text-gray-700 dark:text-gray-200">
              ${this.currentUser.displayName || this.currentUser.email}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              ${this.currentOrganization?.name || 'Personal'}
            </p>
          </div>
        </div>
        
        <!-- Quick actions -->
        <div class="space-y-2">
          <button
            type="button"
            class="w-full bg-blue-600 hover:bg-blue-700 text-white flex justify-center py-2 px-4 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
            data-action="start-recording"
          >
            <svg class="h-4 w-4 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            Start Recording
          </button>
          
          <button
            type="button"
            class="w-full bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-600 flex justify-center py-2 px-4 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
            data-action="logout"
          >
            Sign out
          </button>
        </div>
      </div>
    `;
  }
  /**
   * Render icon for navigation item
   */
  private renderIcon(icon?: string, isActive = false): string {
    if (!icon) return '';

    const iconColor = isActive 
      ? 'text-blue-500 dark:text-blue-400' 
      : 'text-gray-400 group-hover:text-gray-500 dark:text-gray-400 dark:group-hover:text-gray-300';
    
    const iconMap: Record<string, string> = {
      home: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />`,
      folder: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />`,
      video: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />`,
      collection: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />`,
      cog: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />`
    };

    const path = iconMap[icon] || iconMap.folder;

    return `
      <svg class="flex-shrink-0 h-6 w-6 ${iconColor}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        ${path}
      </svg>
    `;
  }

  /**
   * Update visibility of mobile menu
   */
  private updateVisibility(): void {
    if (!this.overlayElement) return;

    const backdrop = this.overlayElement.querySelector('#mobile-menu-backdrop') as HTMLElement;
    const panel = this.overlayElement.querySelector('#mobile-menu-panel') as HTMLElement;

    if (this.options.isOpen) {
      this.overlayElement.classList.remove('translate-x-full');
      this.overlayElement.classList.add('translate-x-0');
      
      // Show backdrop
      setTimeout(() => {
        backdrop?.classList.remove('opacity-0');
        backdrop?.classList.add('opacity-100');
      }, 10);

      // Show panel
      setTimeout(() => {
        panel?.classList.remove('translate-x-full');
        panel?.classList.add('translate-x-0');
      }, 10);

      // Prevent body scroll
      document.body.style.overflow = 'hidden';

      // Focus first navigation item for accessibility
      setTimeout(() => {
        const firstNavItem = this.overlayElement?.querySelector('[data-mobile-nav-item]') as HTMLElement;
        firstNavItem?.focus();
      }, 150);
    } else {
      // Hide panel
      panel?.classList.remove('translate-x-0');
      panel?.classList.add('translate-x-full');
      
      // Hide backdrop
      backdrop?.classList.remove('opacity-100');
      backdrop?.classList.add('opacity-0');

      // Hide overlay after animation
      setTimeout(() => {
        this.overlayElement?.classList.remove('translate-x-0');
        this.overlayElement?.classList.add('translate-x-full');
      }, 300);

      // Restore body scroll
      document.body.style.overflow = '';
    }
  }
  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    if (!this.overlayElement) return;

    // Close button
    const closeButton = this.overlayElement.querySelector('#mobile-menu-close');
    closeButton?.addEventListener('click', () => {
      this.options.onClose();
    });

    // Backdrop click to close
    const backdrop = this.overlayElement.querySelector('#mobile-menu-backdrop');
    backdrop?.addEventListener('click', () => {
      this.options.onClose();
    });

    // Navigation item clicks
    this.overlayElement.addEventListener('click', (e) => {
      const navItem = (e.target as HTMLElement).closest('[data-mobile-nav-item]') as HTMLAnchorElement;
      if (navItem) {
        e.preventDefault();
        const url = new URL(navItem.href);
        this.options.onNavigate(url.pathname);
      }

      // Quick action buttons
      const actionButton = (e.target as HTMLElement).closest('[data-action]') as HTMLElement;
      if (actionButton) {
        e.preventDefault();
        const action = actionButton.dataset.action;
        this.handleAction(action!);
      }
    });

    // Keyboard navigation
    this.overlayElement.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.options.onClose();
      }

      // Tab navigation within menu
      if (e.key === 'Tab') {
        this.handleTabNavigation(e);
      }
    });

    // Route change listener
    window.addEventListener('route:changed' as any, (event: CustomEvent) => {
      this.currentRoute = event.detail.path;
      this.updateActiveStates();
    });
  }

  /**
   * Handle action button clicks
   */
  private handleAction(action: string): void {
    switch (action) {
      case 'start-recording':
        this.options.onNavigate('/recordings/new');
        break;
      case 'logout':
        const event = new CustomEvent('auth:logout');
        window.dispatchEvent(event);
        break;
      default:
        console.warn('Unknown mobile menu action:', action);
    }
  }

  /**
   * Handle tab navigation to keep focus within menu
   */
  private handleTabNavigation(e: KeyboardEvent): void {
    if (!this.overlayElement || !this.options.isOpen) return;

    const focusableElements = this.overlayElement.querySelectorAll(
      'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    const firstElement = focusableElements[0] as HTMLElement;
    const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

    if (e.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        e.preventDefault();
        lastElement?.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        e.preventDefault();
        firstElement?.focus();
      }
    }
  }

  /**
   * Update active states of navigation items
   */
  private updateActiveStates(): void {
    this.navigationItems.forEach(item => {
      item.active = this.currentRoute === item.href || this.currentRoute.startsWith(item.href + '/');
    });
    this.updateMenuContent();
  }
}