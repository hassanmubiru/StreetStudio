/**
 * Sidebar Navigation Component
 * 
 * Provides sidebar navigation with contextual menu items and collapse functionality
 */

import type { OrganizationDto, MemberDto } from '@streetstudio/shared';
import type { NavigationItem } from '../navigation-controller';

export interface SidebarNavigationOptions {
  collapsed: boolean;
  onCollapseToggle: () => void;
  onNavigate: (href: string) => void;
}

export class SidebarNavigation {
  private container: HTMLElement;
  private options: SidebarNavigationOptions;
  private currentUser?: MemberDto;
  private currentOrganization?: OrganizationDto;
  private navigationItems: NavigationItem[] = [];
  private currentRoute = '';

  constructor(container: HTMLElement, options: SidebarNavigationOptions) {
    this.container = container;
    this.options = options;
    this.currentRoute = window.location.pathname;
  }

  /**
   * Initialize sidebar navigation
   */
  public initialize(): void {
    this.setupDefaultNavigationItems();
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
    this.setupContextualNavigationItems();
    this.render();
  }

  /**
   * Update navigation items
   */
  public updateItems(items: NavigationItem[]): void {
    this.navigationItems = items;
    this.render();
  }

  /**
   * Set collapsed state
   */
  public setCollapsed(collapsed: boolean): void {
    this.options.collapsed = collapsed;
    this.updateCollapsedState();
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.container.innerHTML = '';
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
   * Setup contextual navigation items based on user permissions
   */
  private setupContextualNavigationItems(): void {
    // Add admin items if user has permissions
    const hasAdminAccess = this.currentUser && this.hasPermission('admin');
    
    if (hasAdminAccess) {
      this.navigationItems.push({
        id: 'admin',
        label: 'Administration',
        href: '/admin',
        icon: 'cog',
        children: [
          {
            id: 'members',
            label: 'Members',
            href: '/admin/members',
            icon: 'users'
          },
          {
            id: 'settings',
            label: 'Settings',
            href: '/admin/settings',
            icon: 'adjustments'
          }
        ]
      });
    }
  }

  /**
   * Render the sidebar navigation
   */
  private render(): void {
    this.container.innerHTML = `
      <div class="flex flex-col flex-1 min-h-0 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
        <!-- Sidebar header -->
        <div class="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
          <div class="flex items-center flex-shrink-0 px-4">
            ${this.options.collapsed ? '' : this.renderSidebarHeader()}
            <button
              type="button"
              class="ml-auto p-1 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              id="sidebar-collapse-toggle"
              aria-label="${this.options.collapsed ? 'Expand sidebar' : 'Collapse sidebar'}"
            >
              <svg class="h-5 w-5 transform transition-transform duration-200 ${this.options.collapsed ? 'rotate-180' : ''}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                <path fill-rule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clip-rule="evenodd" />
              </svg>
            </button>
          </div>
          
          <!-- Navigation -->
          <nav class="mt-5 flex-1 px-2 space-y-1" aria-label="Sidebar">
            ${this.renderNavigationItems()}
          </nav>
        </div>

        <!-- Sidebar footer -->
        ${this.renderSidebarFooter()}
      </div>
    `;
  }

  /**
   * Render sidebar header
   */
  private renderSidebarHeader(): string {
    return `
      <div class="flex items-center">
        <span class="text-lg font-semibold text-gray-900 dark:text-white">
          ${this.currentOrganization?.name || 'StreetStudio'}
        </span>
      </div>
    `;
  }

  /**
   * Render navigation items
   */
  private renderNavigationItems(): string {
    return this.navigationItems.map(item => this.renderNavigationItem(item)).join('');
  }
  /**
   * Render individual navigation item
   */
  private renderNavigationItem(item: NavigationItem, depth = 0): string {
    const isActive = item.active || this.currentRoute === item.href;
    const hasChildren = item.children && item.children.length > 0;
    const indent = depth > 0 ? `ml-${depth * 4}` : '';
    
    const itemClasses = `
      ${indent} group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors duration-200
      ${isActive 
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200' 
        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'
      }
    `.trim();

    const content = `
      <a href="${item.href}" class="${itemClasses}" data-nav-item="${item.id}">
        ${this.renderIcon(item.icon, isActive)}
        ${!this.options.collapsed ? `<span class="ml-3">${item.label}</span>` : ''}
        ${item.badge && !this.options.collapsed ? `
          <span class="ml-auto inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
            ${item.badge}
          </span>
        ` : ''}
        ${hasChildren && !this.options.collapsed ? `
          <svg class="ml-auto h-4 w-4 transition-transform duration-200" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" />
          </svg>
        ` : ''}
      </a>
    `;

    // Add children if expanded and not collapsed
    if (hasChildren && !this.options.collapsed) {
      const childrenHtml = item.children!.map(child => 
        this.renderNavigationItem(child, depth + 1)
      ).join('');
      
      return `
        <div>
          ${content}
          <div class="mt-1">
            ${childrenHtml}
          </div>
        </div>
      `;
    }

    return content;
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
      users: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a4 4 0 11-8 0 4 4 0 018 0z" />`,
      cog: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />`,
      adjustments: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 100 4m0-4v2m0-6V4" />`
    };

    const path = iconMap[icon] || iconMap.folder;

    return `
      <svg class="flex-shrink-0 h-5 w-5 ${iconColor}" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        ${path}
      </svg>
    `;
  }
  /**
   * Render sidebar footer
   */
  private renderSidebarFooter(): string {
    if (this.options.collapsed) {
      return `
        <div class="flex-shrink-0 flex border-t border-gray-200 dark:border-gray-700 p-4">
          <div class="flex justify-center w-full">
            <button
              type="button"
              class="p-1 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              id="quick-record-button"
              title="Start Recording"
            >
              <svg class="h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            </button>
          </div>
        </div>
      `;
    }

    return `
      <div class="flex-shrink-0 flex border-t border-gray-200 dark:border-gray-700 p-4">
        <button
          type="button"
          class="group relative w-full bg-blue-600 hover:bg-blue-700 flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors duration-200"
          id="quick-record-button"
        >
          <svg class="h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
          Start Recording
        </button>
      </div>
    `;
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Collapse toggle
    const collapseToggle = this.container.querySelector('#sidebar-collapse-toggle');
    collapseToggle?.addEventListener('click', () => {
      this.options.onCollapseToggle();
    });

    // Navigation item clicks
    const navItems = this.container.querySelectorAll('[data-nav-item]');
    navItems.forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const href = (e.currentTarget as HTMLAnchorElement).href;
        const url = new URL(href);
        this.options.onNavigate(url.pathname);
      });
    });

    // Quick record button
    const quickRecordButton = this.container.querySelector('#quick-record-button');
    quickRecordButton?.addEventListener('click', () => {
      this.options.onNavigate('/recordings/new');
    });

    // Update active state on route changes
    window.addEventListener('route:changed' as any, (event: CustomEvent) => {
      this.currentRoute = event.detail.path;
      this.updateActiveStates();
    });
  }

  /**
   * Update active states of navigation items
   */
  private updateActiveStates(): void {
    this.navigationItems.forEach(item => {
      item.active = this.currentRoute === item.href || this.currentRoute.startsWith(item.href + '/');
      if (item.children) {
        item.children.forEach(child => {
          child.active = this.currentRoute === child.href || this.currentRoute.startsWith(child.href + '/');
        });
      }
    });
    this.render();
  }
  /**
   * Update collapsed state
   */
  private updateCollapsedState(): void {
    const sidebarElement = this.container.querySelector('.flex.flex-col') as HTMLElement;
    if (sidebarElement) {
      if (this.options.collapsed) {
        sidebarElement.style.width = '4rem';
        this.container.style.width = '4rem';
      } else {
        sidebarElement.style.width = '16rem';
        this.container.style.width = '16rem';
      }
    }
    this.render();
  }

  /**
   * Setup accessibility features
   */
  private setupAccessibility(): void {
    // Add proper ARIA labels
    const nav = this.container.querySelector('nav[aria-label="Sidebar"]');
    if (nav) {
      nav.setAttribute('role', 'navigation');
    }

    // Setup keyboard navigation
    this.setupKeyboardNavigation();
  }

  /**
   * Setup keyboard navigation
   */
  private setupKeyboardNavigation(): void {
    this.container.addEventListener('keydown', (e) => {
      const focusedElement = document.activeElement as HTMLElement;
      const navItems = Array.from(this.container.querySelectorAll('[data-nav-item]')) as HTMLElement[];
      const currentIndex = navItems.indexOf(focusedElement);

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          if (currentIndex < navItems.length - 1) {
            navItems[currentIndex + 1].focus();
          } else {
            navItems[0].focus(); // Wrap to first item
          }
          break;

        case 'ArrowUp':
          e.preventDefault();
          if (currentIndex > 0) {
            navItems[currentIndex - 1].focus();
          } else {
            navItems[navItems.length - 1].focus(); // Wrap to last item
          }
          break;

        case 'Enter':
        case ' ':
          if (focusedElement.dataset.navItem) {
            e.preventDefault();
            focusedElement.click();
          }
          break;

        case 'Home':
          e.preventDefault();
          navItems[0]?.focus();
          break;

        case 'End':
          e.preventDefault();
          navItems[navItems.length - 1]?.focus();
          break;
      }
    });
  }

  /**
   * Check if user has specific permission
   */
  private hasPermission(permission: string): boolean {
    // This would typically check against user permissions
    // For now, return false as a placeholder
    return false;
  }
}