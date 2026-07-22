/**
 * Top Navigation Component
 * 
 * Provides top navigation bar with organization switcher, search, notifications, and user menu
 */

import type { OrganizationDto, MemberDto, Uuid } from '@streetstudio/shared';

export interface TopNavigationOptions {
  onOrganizationChange: (organizationId: Uuid) => void;
  onMobileMenuToggle: () => void;
  onUserMenuAction: (action: string) => void;
}

export class TopNavigation {
  private container: HTMLElement;
  private options: TopNavigationOptions;
  private currentUser?: MemberDto;
  private currentOrganization?: OrganizationDto;
  private userMenuOpen = false;
  private orgSwitcherOpen = false;

  constructor(container: HTMLElement, options: TopNavigationOptions) {
    this.container = container;
    this.options = options;
  }

  /**
   * Initialize top navigation component
   */
  public initialize(): void {
    this.render();
    this.setupEventListeners();
    this.setupAccessibility();
  }

  /**
   * Update authentication context
   */
  public updateAuthContext(user: MemberDto, organization?: OrganizationDto): void {
    this.currentUser = user;
    this.currentOrganization = organization;
    this.render();
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.container.innerHTML = '';
  }

  /**
   * Render the top navigation
   */
  private render(): void {
    this.container.innerHTML = `
      <div class="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div class="flex justify-between h-16">
            <!-- Left side -->
            <div class="flex items-center">
              <!-- Mobile menu button -->
              <button
                type="button"
                class="lg:hidden inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
                id="mobile-menu-button"
                aria-controls="mobile-menu"
                aria-expanded="false"
              >
                <span class="sr-only">Open main menu</span>
                <!-- Hamburger icon -->
                <svg class="block h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              <!-- Logo -->
              <div class="flex-shrink-0 flex items-center ml-4 lg:ml-0">
                <img class="h-8 w-auto" src="/logo.svg" alt="StreetStudio" />
                <span class="ml-2 text-xl font-semibold text-gray-900 dark:text-white">StreetStudio</span>
              </div>

              <!-- Organization switcher -->
              ${this.renderOrganizationSwitcher()}
            </div>

            <!-- Center - Global search -->
            <div class="flex-1 flex items-center justify-center px-2 lg:ml-6 lg:justify-end">
              <div class="max-w-lg w-full lg:max-w-xs">
                <label for="search" class="sr-only">Search</label>
                <div class="relative">
                  <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg class="h-5 w-5 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd" />
                    </svg>
                  </div>
                  <input
                    id="search"
                    name="search"
                    class="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white dark:bg-gray-700 dark:border-gray-600 placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                    placeholder="Search... (⌘K)"
                    type="search"
                    readonly
                  />
                </div>
              </div>
            </div>

            <!-- Right side -->
            <div class="flex items-center">
              <!-- Notifications -->
              ${this.renderNotificationsBell()}

              <!-- User menu -->
              ${this.renderUserMenu()}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render organization switcher
   */
  private renderOrganizationSwitcher(): string {
    if (!this.currentOrganization) {
      return '';
    }

    return `
      <div class="ml-6 relative">
        <button
          type="button"
          class="max-w-xs bg-white dark:bg-gray-800 flex items-center text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          id="org-switcher-button"
          aria-expanded="${this.orgSwitcherOpen}"
          aria-haspopup="true"
        >
          <span class="sr-only">Switch organization</span>
          <div class="flex items-center">
            <div class="h-8 w-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
              <span class="text-sm font-medium text-gray-700 dark:text-gray-300">
                ${this.currentOrganization.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <span class="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:block">
              ${this.currentOrganization.name}
            </span>
            <svg class="ml-1 h-4 w-4 text-gray-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fill-rule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clip-rule="evenodd" />
            </svg>
          </div>
        </button>

        <!-- Organization dropdown -->
        <div
          class="${this.orgSwitcherOpen ? '' : 'hidden'} origin-top-right absolute left-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-50"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="org-switcher-button"
          id="org-switcher-menu"
        >
          <!-- Current organization -->
          <div class="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-700">
            Current Organization
          </div>
          <a href="#" class="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-700" role="menuitem">
            <div class="flex items-center">
              <div class="h-6 w-6 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center mr-3">
                <span class="text-xs font-medium text-gray-700 dark:text-gray-300">
                  ${this.currentOrganization.name.charAt(0).toUpperCase()}
                </span>
              </div>
              ${this.currentOrganization.name}
            </div>
          </a>
          
          <!-- Other organizations would be loaded dynamically -->
          <div class="border-t border-gray-100 dark:border-gray-700">
            <a href="#" class="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700" role="menuitem">
              <div class="flex items-center">
                <svg class="h-5 w-5 text-gray-400 mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Create organization
              </div>
            </a>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Render notifications bell
   */
  private renderNotificationsBell(): string {
    return `
      <button
        type="button"
        class="bg-white dark:bg-gray-800 p-1 rounded-full text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        id="notifications-button"
        aria-label="View notifications"
      >
        <span class="sr-only">View notifications</span>
        <div class="relative">
          <svg class="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-3.5-3.5M9 17H4l3.5-3.5M12 3v0a5.009 5.009 0 015 5v6l3 3H6l3-3V8a5.009 5.009 0 015-5z" />
          </svg>
          <!-- Notification indicator -->
          <span class="absolute top-0 right-0 block h-2 w-2 rounded-full bg-red-400 ring-2 ring-white dark:ring-gray-800"></span>
        </div>
      </button>
    `;
  }

  /**
   * Render user menu
   */
  private renderUserMenu(): string {
    if (!this.currentUser) {
      return `
        <div class="ml-4 flex items-center space-x-4">
          <a href="/auth/login" class="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            Sign in
          </a>
          <a href="/auth/register" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm font-medium">
            Sign up
          </a>
        </div>
      `;
    }

    return `
      <div class="ml-4 relative">
        <button
          type="button"
          class="max-w-xs bg-white dark:bg-gray-800 flex items-center text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          id="user-menu-button"
          aria-expanded="${this.userMenuOpen}"
          aria-haspopup="true"
        >
          <span class="sr-only">Open user menu</span>
          <img class="h-8 w-8 rounded-full" src="${this.currentUser.avatarUrl || '/default-avatar.png'}" alt="${this.currentUser.displayName || this.currentUser.email}" />
        </button>

        <!-- User dropdown -->
        <div
          class="${this.userMenuOpen ? '' : 'hidden'} origin-top-right absolute right-0 mt-2 w-48 rounded-md shadow-lg py-1 bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 focus:outline-none z-50"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="user-menu-button"
          id="user-menu"
        >
          <!-- User info -->
          <div class="px-4 py-2 border-b border-gray-100 dark:border-gray-700">
            <p class="text-sm font-medium text-gray-700 dark:text-gray-200">
              ${this.currentUser.displayName || this.currentUser.email}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              ${this.currentUser.email}
            </p>
          </div>

          <!-- Menu items -->
          <a href="#" class="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700" role="menuitem" data-action="profile">
            <div class="flex items-center">
              <svg class="h-4 w-4 text-gray-400 mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Your Profile
            </div>
          </a>
          
          <a href="#" class="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700" role="menuitem" data-action="settings">
            <div class="flex items-center">
              <svg class="h-4 w-4 text-gray-400 mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Settings
            </div>
          </a>

          <div class="border-t border-gray-100 dark:border-gray-700">
            <a href="#" class="block px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700" role="menuitem" data-action="logout">
              <div class="flex items-center">
                <svg class="h-4 w-4 text-gray-400 mr-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign out
              </div>
            </a>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Mobile menu toggle
    const mobileMenuButton = this.container.querySelector('#mobile-menu-button');
    mobileMenuButton?.addEventListener('click', () => {
      this.options.onMobileMenuToggle();
    });

    // User menu toggle
    const userMenuButton = this.container.querySelector('#user-menu-button');
    userMenuButton?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.userMenuOpen = !this.userMenuOpen;
      this.render();
    });

    // Organization switcher toggle
    const orgSwitcherButton = this.container.querySelector('#org-switcher-button');
    orgSwitcherButton?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.orgSwitcherOpen = !this.orgSwitcherOpen;
      this.render();
    });

    // User menu actions
    const userMenuItems = this.container.querySelectorAll('#user-menu [data-action]');
    userMenuItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const action = (e.currentTarget as HTMLElement).dataset.action!;
        this.options.onUserMenuAction(action);
        this.userMenuOpen = false;
        this.render();
      });
    });

    // Global search focus handler
    const searchInput = this.container.querySelector('#search');
    searchInput?.addEventListener('click', () => {
      // Dispatch global search open event
      const event = new CustomEvent('search:open');
      window.dispatchEvent(event);
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (!target.closest('#user-menu-button') && !target.closest('#user-menu')) {
        if (this.userMenuOpen) {
          this.userMenuOpen = false;
          this.render();
        }
      }
      if (!target.closest('#org-switcher-button') && !target.closest('#org-switcher-menu')) {
        if (this.orgSwitcherOpen) {
          this.orgSwitcherOpen = false;
          this.render();
        }
      }
    });

    // Notifications button
    const notificationsButton = this.container.querySelector('#notifications-button');
    notificationsButton?.addEventListener('click', () => {
      // Dispatch notifications open event
      const event = new CustomEvent('notifications:open');
      window.dispatchEvent(event);
    });
  }

  /**
   * Setup accessibility features
   */
  private setupAccessibility(): void {
    // Ensure proper ARIA attributes are maintained
    this.updateAriaAttributes();
    
    // Setup keyboard navigation
    this.setupKeyboardNavigation();
  }

  /**
   * Update ARIA attributes
   */
  private updateAriaAttributes(): void {
    const userMenuButton = this.container.querySelector('#user-menu-button');
    if (userMenuButton) {
      userMenuButton.setAttribute('aria-expanded', this.userMenuOpen.toString());
    }

    const orgSwitcherButton = this.container.querySelector('#org-switcher-button');
    if (orgSwitcherButton) {
      orgSwitcherButton.setAttribute('aria-expanded', this.orgSwitcherOpen.toString());
    }

    const mobileMenuButton = this.container.querySelector('#mobile-menu-button');
    if (mobileMenuButton) {
      mobileMenuButton.setAttribute('aria-expanded', 'false'); // Mobile menu state handled elsewhere
    }
  }

  /**
   * Setup keyboard navigation for dropdowns
   */
  private setupKeyboardNavigation(): void {
    this.container.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (this.userMenuOpen) {
          this.userMenuOpen = false;
          this.render();
          // Focus back to button
          const button = this.container.querySelector('#user-menu-button') as HTMLElement;
          button?.focus();
        }
        if (this.orgSwitcherOpen) {
          this.orgSwitcherOpen = false;
          this.render();
          // Focus back to button
          const button = this.container.querySelector('#org-switcher-button') as HTMLElement;
          button?.focus();
        }
      }
    });
  }
}