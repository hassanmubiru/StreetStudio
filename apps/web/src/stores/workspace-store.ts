/**
 * Workspace Store
 * 
 * Manages workspace context, current project state, and navigation state persistence
 */

import type { WorkspaceDto, ProjectDto, FolderDto, Uuid } from '@streetstudio/shared';
import type { BreadcrumbItem } from '../app/navigation/navigation-controller';
import { logger } from '../app/client-logger';

export interface WorkspaceState {
  currentWorkspace?: WorkspaceDto;
  currentProject?: ProjectDto;
  currentFolder?: FolderDto;
  breadcrumbs: BreadcrumbItem[];
  sidebarCollapsed: boolean;
  navigationHistory: string[];
  deepLinkState?: Record<string, any>;
}

export class WorkspaceStore {
  private state: WorkspaceState;
  private listeners: Set<(state: WorkspaceState) => void> = new Set();
  private storageKey = 'streetstudio_workspace_state';

  constructor() {
    this.state = this.getInitialState();
    this.loadPersistedState();
    this.setupDeepLinkSupport();
  }

  /**
   * Get initial state
   */
  private getInitialState(): WorkspaceState {
    return {
      breadcrumbs: [],
      sidebarCollapsed: false,
      navigationHistory: [window.location.pathname],
      deepLinkState: {}
    };
  }

  /**
   * Load persisted state from localStorage
   */
  private loadPersistedState(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.state = {
          ...this.state,
          sidebarCollapsed: parsed.sidebarCollapsed ?? this.state.sidebarCollapsed,
          deepLinkState: parsed.deepLinkState ?? this.state.deepLinkState
        };
      }
    } catch (error) {
      logger.warn('Failed to load workspace state from storage', { error });
    }
  }

  /**
   * Persist important state to localStorage
   */
  private persistState(): void {
    try {
      const stateToPersist = {
        sidebarCollapsed: this.state.sidebarCollapsed,
        deepLinkState: this.state.deepLinkState,
        timestamp: Date.now()
      };
      localStorage.setItem(this.storageKey, JSON.stringify(stateToPersist));
    } catch (error) {
      logger.warn('Failed to persist workspace state', { error });
    }
  }

  /**
   * Setup deep link support
   */
  private setupDeepLinkSupport(): void {
    // Listen for URL changes to restore state
    window.addEventListener('popstate', (event) => {
      if (event.state?.workspaceState) {
        this.updateState(event.state.workspaceState);
      }
    });

    // Save state to history when navigating
    window.addEventListener('beforeunload', () => {
      this.saveToHistory();
    });
  }

  /**
   * Save current state to browser history
   */
  private saveToHistory(): void {
    try {
      const currentState = window.history.state || {};
      window.history.replaceState({
        ...currentState,
        workspaceState: {
          currentProject: this.state.currentProject,
          currentFolder: this.state.currentFolder,
          breadcrumbs: this.state.breadcrumbs
        }
      }, '');
    } catch (error) {
      logger.warn('Failed to save state to history', { error });
    }
  }

  /**
   * Get current workspace state
   */
  public getState(): WorkspaceState {
    return { ...this.state };
  }

  /**
   * Subscribe to workspace state changes
   */
  public subscribe(listener: (state: WorkspaceState) => void): () => void {
    this.listeners.add(listener);
    
    // Send current state immediately
    listener(this.getState());
    
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Update workspace state
   */
  public updateState(updates: Partial<WorkspaceState>): void {
    const previousState = { ...this.state };
    this.state = { ...this.state, ...updates };

    // Log significant state changes
    if (previousState.currentProject?.id !== this.state.currentProject?.id) {
      logger.info('Project context changed', {
        previousProject: previousState.currentProject?.id,
        newProject: this.state.currentProject?.id
      });
    }

    if (previousState.currentWorkspace?.id !== this.state.currentWorkspace?.id) {
      logger.info('Workspace context changed', {
        previousWorkspace: previousState.currentWorkspace?.id,
        newWorkspace: this.state.currentWorkspace?.id
      });
    }

    this.persistState();
    this.notifyListeners();
  }

  /**
   * Notify all listeners of state changes
   */
  private notifyListeners(): void {
    this.listeners.forEach(listener => {
      try {
        listener(this.getState());
      } catch (error) {
        logger.error('Workspace store listener error', { error });
      }
    });
  }

  /**
   * Set current workspace
   */
  public setCurrentWorkspace(workspace: WorkspaceDto): void {
    this.updateState({ currentWorkspace: workspace });
    this.generateWorkspaceBreadcrumbs();
  }

  /**
   * Set current project
   */
  public setCurrentProject(project: ProjectDto): void {
    this.updateState({ currentProject: project });
    this.generateProjectBreadcrumbs();
  }

  /**
   * Set current folder
   */
  public setCurrentFolder(folder: FolderDto): void {
    this.updateState({ currentFolder: folder });
    this.generateFolderBreadcrumbs();
  }

  /**
   * Navigate to route and update history
   */
  public navigateToRoute(path: string, state?: Record<string, any>): void {
    const history = [...this.state.navigationHistory];
    
    // Add new path if different from current
    if (history[history.length - 1] !== path) {
      history.push(path);
      
      // Keep history to reasonable size
      if (history.length > 50) {
        history.shift();
      }
    }

    this.updateState({ 
      navigationHistory: history,
      deepLinkState: state ? { ...this.state.deepLinkState, [path]: state } : this.state.deepLinkState
    });

    this.generateRouteBreadcrumbs(path);
  }

  /**
   * Generate breadcrumbs for workspace
   */
  private generateWorkspaceBreadcrumbs(): void {
    const breadcrumbs: BreadcrumbItem[] = [
      { label: 'Dashboard', href: '/dashboard' }
    ];

    if (this.state.currentWorkspace) {
      breadcrumbs.push({
        label: this.state.currentWorkspace.name,
        href: `/workspaces/${this.state.currentWorkspace.id}`
      });
    }

    this.updateState({ breadcrumbs });
  }

  /**
   * Generate breadcrumbs for project
   */
  private generateProjectBreadcrumbs(): void {
    const breadcrumbs: BreadcrumbItem[] = [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Projects', href: '/projects' }
    ];

    if (this.state.currentProject) {
      breadcrumbs.push({
        label: this.state.currentProject.name,
        href: `/projects/${this.state.currentProject.id}`,
        current: true
      });
    }

    this.updateState({ breadcrumbs });
  }

  /**
   * Generate breadcrumbs for folder
   */
  private generateFolderBreadcrumbs(): void {
    const breadcrumbs: BreadcrumbItem[] = [
      { label: 'Dashboard', href: '/dashboard' },
      { label: 'Projects', href: '/projects' }
    ];

    if (this.state.currentProject) {
      breadcrumbs.push({
        label: this.state.currentProject.name,
        href: `/projects/${this.state.currentProject.id}`
      });

      if (this.state.currentFolder) {
        // Build folder hierarchy breadcrumbs
        const folderPath = this.buildFolderPath(this.state.currentFolder);
        folderPath.forEach((folder, index) => {
          breadcrumbs.push({
            label: folder.name,
            href: `/projects/${this.state.currentProject!.id}/folders/${folder.id}`,
            current: index === folderPath.length - 1
          });
        });
      }
    }

    this.updateState({ breadcrumbs });
  }

  /**
   * Generate breadcrumbs based on current route
   */
  private generateRouteBreadcrumbs(path: string): void {
    const segments = path.split('/').filter(Boolean);
    const breadcrumbs: BreadcrumbItem[] = [
      { label: 'Dashboard', href: '/dashboard' }
    ];

    let currentPath = '';
    segments.forEach((segment, index) => {
      currentPath += `/${segment}`;
      
      // Skip if this is the dashboard segment
      if (segment === 'dashboard') return;

      const isLast = index === segments.length - 1;
      const label = this.getSegmentLabel(segment, segments, index);
      
      breadcrumbs.push({
        label,
        href: isLast ? undefined : currentPath,
        current: isLast
      });
    });

    this.updateState({ breadcrumbs });
  }

  /**
   * Get human-readable label for route segment
   */
  private getSegmentLabel(segment: string, allSegments: string[], index: number): string {
    // Check if this is a UUID (project ID, folder ID, etc.)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    
    if (uuidRegex.test(segment)) {
      // Try to get name from current context
      const previousSegment = allSegments[index - 1];
      
      if (previousSegment === 'projects' && this.state.currentProject?.id === segment) {
        return this.state.currentProject.name;
      }
      
      if (previousSegment === 'folders' && this.state.currentFolder?.id === segment) {
        return this.state.currentFolder.name;
      }
      
      // Fallback to generic labels
      return this.getGenericLabel(previousSegment);
    }

    // Convert to title case
    return segment.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  }

  /**
   * Get generic label for UUID segments
   */
  private getGenericLabel(parentSegment: string): string {
    const labelMap: Record<string, string> = {
      'projects': 'Project',
      'folders': 'Folder',
      'recordings': 'Recording',
      'videos': 'Video',
      'settings': 'Settings'
    };

    return labelMap[parentSegment] || 'Item';
  }

  /**
   * Build folder hierarchy path
   */
  private buildFolderPath(folder: FolderDto): FolderDto[] {
    const path: FolderDto[] = [folder];
    
    // This would typically traverse up the folder hierarchy
    // For now, just return the single folder
    return path;
  }

  /**
   * Toggle sidebar collapsed state
   */
  public toggleSidebar(): void {
    this.updateState({ sidebarCollapsed: !this.state.sidebarCollapsed });
  }

  /**
   * Set sidebar collapsed state
   */
  public setSidebarCollapsed(collapsed: boolean): void {
    this.updateState({ sidebarCollapsed: collapsed });
  }

  /**
   * Get navigation history
   */
  public getNavigationHistory(): string[] {
    return [...this.state.navigationHistory];
  }

  /**
   * Go back in navigation history
   */
  public goBack(): string | null {
    const history = [...this.state.navigationHistory];
    
    if (history.length > 1) {
      history.pop(); // Remove current
      const previousPath = history[history.length - 1];
      
      this.updateState({ navigationHistory: history });
      return previousPath;
    }
    
    return null;
  }

  /**
   * Clear navigation history
   */
  public clearHistory(): void {
    this.updateState({ navigationHistory: [window.location.pathname] });
  }

  /**
   * Get deep link state for current route
   */
  public getDeepLinkState(path?: string): Record<string, any> | undefined {
    const targetPath = path || window.location.pathname;
    return this.state.deepLinkState?.[targetPath];
  }

  /**
   * Set deep link state for route
   */
  public setDeepLinkState(path: string, state: Record<string, any>): void {
    this.updateState({
      deepLinkState: {
        ...this.state.deepLinkState,
        [path]: state
      }
    });
  }

  /**
   * Clear all state
   */
  public clear(): void {
    this.state = this.getInitialState();
    localStorage.removeItem(this.storageKey);
    this.notifyListeners();
  }

  /**
   * Destroy store and clean up
   */
  public destroy(): void {
    this.listeners.clear();
    this.persistState();
    logger.info('Workspace store destroyed');
  }
}

// Export singleton instance
let workspaceStoreInstance: WorkspaceStore | null = null;

export function createWorkspaceStore(): WorkspaceStore {
  if (workspaceStoreInstance) {
    workspaceStoreInstance.destroy();
  }
  
  workspaceStoreInstance = new WorkspaceStore();
  return workspaceStoreInstance;
}

export function getWorkspaceStore(): WorkspaceStore {
  if (!workspaceStoreInstance) {
    throw new Error('Workspace store not initialized. Call createWorkspaceStore first.');
  }
  
  return workspaceStoreInstance;
}

// Convenience functions
export function useWorkspaceState(): WorkspaceState {
  return getWorkspaceStore().getState();
}

export function subscribeToWorkspace(callback: (state: WorkspaceState) => void): () => void {
  return getWorkspaceStore().subscribe(callback);
}

export function getCurrentProject(): ProjectDto | undefined {
  return getWorkspaceStore().getState().currentProject;
}

export function getCurrentWorkspace(): WorkspaceDto | undefined {
  return getWorkspaceStore().getState().currentWorkspace;
}

export function getCurrentBreadcrumbs(): BreadcrumbItem[] {
  return getWorkspaceStore().getState().breadcrumbs;
}