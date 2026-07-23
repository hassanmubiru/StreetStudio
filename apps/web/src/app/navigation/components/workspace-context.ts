/**
 * Workspace Context Component
 * 
 * Manages workspace context with state synchronization, navigation updates,
 * and deep application state management.
 */

import type { Uuid, WorkspaceDto, ProjectDto, FolderDto, OrganizationDto, MemberDto } from '@streetstudio/shared';
import { logger } from '../../client-logger';
import { getWorkspaceStore, type WorkspaceState } from '../../../stores/workspace-store';
import { getAuthStore } from '../../../stores/auth-store';

export interface WorkspaceContextOptions {
  onWorkspaceChange: (workspace: WorkspaceDto) => void;
  onProjectChange: (project: ProjectDto | null) => void;
  onFolderChange: (folder: FolderDto | null) => void;
  onNavigationUpdate: (breadcrumbs: BreadcrumbItem[]) => void;
}

export interface BreadcrumbItem {
  label: string;
  href?: string;
  current?: boolean;
  icon?: string;
}

export interface WorkspaceContextData {
  workspaces: WorkspaceDto[];
  currentWorkspace?: WorkspaceDto;
  currentProject?: ProjectDto;
  currentFolder?: FolderDto;
  breadcrumbs: BreadcrumbItem[];
  permissions: string[];
}

export class WorkspaceContext {
  private container: HTMLElement;
  private options: WorkspaceContextOptions;
  private workspaceStore: any;
  private authStore: any;
  private contextData: WorkspaceContextData = {
    workspaces: [],
    breadcrumbs: [],
    permissions: []
  };
  private unsubscribeWorkspace?: () => void;
  private unsubscribeAuth?: () => void;
  private syncTimeout?: number;

  constructor(container: HTMLElement, options: WorkspaceContextOptions) {
    this.container = container;
    this.options = options;
  }

  /**
   * Initialize workspace context manager
   */
  public initialize(): void {
    this.initializeStores();
    this.setupEventListeners();
    this.loadWorkspaceContext();
    this.render();
  }

  /**
   * Initialize store connections
   */
  private initializeStores(): void {
    try {
      this.workspaceStore = getWorkspaceStore();
      this.authStore = getAuthStore();

      // Subscribe to workspace changes
      this.unsubscribeWorkspace = this.workspaceStore.subscribe((state: WorkspaceState) => {
        this.handleWorkspaceStateChange(state);
      });

      // Subscribe to auth changes for organization/permission updates
      this.unsubscribeAuth = this.authStore.subscribe((authState: any) => {
        this.handleAuthStateChange(authState);
      });

      logger.debug('Workspace context stores initialized');
    } catch (error) {
      logger.error('Failed to initialize workspace context stores', { error });
    }
  }

  /**
   * Handle workspace state changes
   */
  private handleWorkspaceStateChange(state: WorkspaceState): void {
    const previousWorkspace = this.contextData.currentWorkspace;
    const previousProject = this.contextData.currentProject;
    const previousFolder = this.contextData.currentFolder;

    // Update context data
    this.contextData.currentWorkspace = state.currentWorkspace;
    this.contextData.currentProject = state.currentProject;
    this.contextData.currentFolder = state.currentFolder;
    this.contextData.breadcrumbs = state.breadcrumbs;

    // Notify listeners of changes
    if (state.currentWorkspace && state.currentWorkspace !== previousWorkspace) {
      this.options.onWorkspaceChange(state.currentWorkspace);
    }

    if (state.currentProject !== previousProject) {
      this.options.onProjectChange(state.currentProject || null);
    }

    if (state.currentFolder !== previousFolder) {
      this.options.onFolderChange(state.currentFolder || null);
    }

    if (state.breadcrumbs) {
      this.options.onNavigationUpdate(state.breadcrumbs);
    }

    // Update UI
    this.render();

    // Debounced state synchronization
    this.scheduleSyncToServer();
  }

  /**
   * Handle authentication state changes
   */
  private handleAuthStateChange(authState: any): void {
    if (authState.currentOrganization) {
      this.loadWorkspacesForOrganization(authState.currentOrganization.id);
      this.contextData.permissions = authState.permissions || [];
    } else {
      this.contextData.workspaces = [];
      this.contextData.permissions = [];
    }

    this.render();
  }

  /**
   * Load workspace context
   */
  private async loadWorkspaceContext(): Promise<void> {
    try {
      // Get current auth state
      const authState = this.authStore?.getState();
      if (!authState?.currentOrganization) {
        return;
      }

      // Load workspaces for current organization
      await this.loadWorkspacesForOrganization(authState.currentOrganization.id);

      // Get current workspace state
      const workspaceState = this.workspaceStore?.getState();
      if (workspaceState) {
        this.contextData.currentWorkspace = workspaceState.currentWorkspace;
        this.contextData.currentProject = workspaceState.currentProject;
        this.contextData.currentFolder = workspaceState.currentFolder;
        this.contextData.breadcrumbs = workspaceState.breadcrumbs || [];
      }

      this.render();
    } catch (error) {
      logger.error('Failed to load workspace context', { error });
    }
  }

  /**
   * Load workspaces for organization
   */
  private async loadWorkspacesForOrganization(organizationId: Uuid): Promise<void> {
    try {
      // Mock API call - replace with actual implementation
      const workspaces = await this.fetchWorkspacesForOrganization(organizationId);
      this.contextData.workspaces = workspaces;

      logger.debug('Loaded workspaces for organization', {
        organizationId,
        workspaceCount: workspaces.length
      });
    } catch (error) {
      logger.error('Failed to load workspaces for organization', { error, organizationId });
      this.contextData.workspaces = [];
    }
  }

  /**
   * Fetch workspaces from API (mock implementation)
   */
  private async fetchWorkspacesForOrganization(organizationId: Uuid): Promise<WorkspaceDto[]> {
    // Mock implementation - replace with actual API call
    return new Promise((resolve) => {
      setTimeout(() => {
        const mockWorkspaces: WorkspaceDto[] = [
          {
            id: 'workspace-1' as Uuid,
            name: 'Default Workspace',
            description: 'Main workspace for the organization',
            organizationId,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-15T00:00:00Z'
          },
          {
            id: 'workspace-2' as Uuid,
            name: 'Development',
            description: 'Development and testing workspace',
            organizationId,
            createdAt: '2024-01-02T00:00:00Z',
            updatedAt: '2024-01-14T00:00:00Z'
          }
        ];
        resolve(mockWorkspaces);
      }, 200);
    });
  }

  /**
   * Set current workspace
   */
  public async setCurrentWorkspace(workspaceId: Uuid): Promise<void> {
    try {
      const workspace = this.contextData.workspaces.find(w => w.id === workspaceId);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      // Update workspace store
      this.workspaceStore?.setCurrentWorkspace(workspace);

      // Clear project and folder when switching workspaces
      this.workspaceStore?.setCurrentProject(null);
      this.workspaceStore?.setCurrentFolder(null);

      logger.info('Switched to workspace', { workspaceId, workspaceName: workspace.name });

      // Sync to server
      await this.syncWorkspaceToServer(workspace);

    } catch (error) {
      logger.error('Failed to set current workspace', { error, workspaceId });
      throw error;
    }
  }

  /**
   * Set current project
   */
  public async setCurrentProject(project: ProjectDto | null): Promise<void> {
    try {
      this.workspaceStore?.setCurrentProject(project);

      if (project) {
        // Clear folder when switching projects
        this.workspaceStore?.setCurrentFolder(null);
        logger.info('Switched to project', { projectId: project.id, projectName: project.name });
      } else {
        logger.info('Cleared current project');
      }

      // Sync to server
      if (project) {
        await this.syncProjectToServer(project);
      }

    } catch (error) {
      logger.error('Failed to set current project', { error, project: project?.id });
      throw error;
    }
  }

  /**
   * Set current folder
   */
  public async setCurrentFolder(folder: FolderDto | null): Promise<void> {
    try {
      this.workspaceStore?.setCurrentFolder(folder);

      if (folder) {
        logger.info('Switched to folder', { folderId: folder.id, folderName: folder.name });
      } else {
        logger.info('Cleared current folder');
      }

      // Sync to server
      if (folder) {
        await this.syncFolderToServer(folder);
      }

    } catch (error) {
      logger.error('Failed to set current folder', { error, folder: folder?.id });
      throw error;
    }
  }

  /**
   * Navigate with context preservation
   */
  public navigateWithContext(path: string, options?: {
    workspaceId?: Uuid;
    projectId?: Uuid;
    folderId?: Uuid;
    preserveState?: boolean;
  }): void {
    try {
      const navigationState: Record<string, any> = {};

      // Preserve current context if requested
      if (options?.preserveState) {
        if (this.contextData.currentWorkspace) {
          navigationState.workspaceId = this.contextData.currentWorkspace.id;
        }
        if (this.contextData.currentProject) {
          navigationState.projectId = this.contextData.currentProject.id;
        }
        if (this.contextData.currentFolder) {
          navigationState.folderId = this.contextData.currentFolder.id;
        }
      }

      // Override with provided context
      if (options?.workspaceId) {
        navigationState.workspaceId = options.workspaceId;
      }
      if (options?.projectId) {
        navigationState.projectId = options.projectId;
      }
      if (options?.folderId) {
        navigationState.folderId = options.folderId;
      }

      // Update workspace store with navigation
      this.workspaceStore?.navigateToRoute(path, navigationState);

      logger.debug('Navigation with context', { path, navigationState });

    } catch (error) {
      logger.error('Failed to navigate with context', { error, path, options });
    }
  }

  /**
   * Get current context summary
   */
  public getContextSummary(): {
    workspace?: string;
    project?: string;
    folder?: string;
    breadcrumbPath: string;
  } {
    return {
      workspace: this.contextData.currentWorkspace?.name,
      project: this.contextData.currentProject?.name,
      folder: this.contextData.currentFolder?.name,
      breadcrumbPath: this.contextData.breadcrumbs
        .filter(b => !b.current)
        .map(b => b.label)
        .join(' > ')
    };
  }

  /**
   * Render workspace context information (minimal UI indicator)
   */
  private render(): void {
    // Only render if we have a current workspace
    if (!this.contextData.currentWorkspace) {
      this.container.innerHTML = '';
      return;
    }

    // Create a minimal context indicator
    this.container.innerHTML = `
      <div class="hidden lg:flex items-center text-xs text-gray-500 dark:text-gray-400 ml-4">
        <svg class="h-3 w-3 mr-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-4m-5 0H3m2 0h4M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 8v-2a2 2 0 012-2h2a2 2 0 012 2v2" />
        </svg>
        <span class="truncate max-w-24" title="${this.contextData.currentWorkspace.name}">
          ${this.contextData.currentWorkspace.name}
        </span>
        ${this.contextData.currentProject ? `
          <svg class="h-3 w-3 mx-1" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
          </svg>
          <span class="truncate max-w-20" title="${this.contextData.currentProject.name}">
            ${this.contextData.currentProject.name}
          </span>
        ` : ''}
      </div>
    `;
  }

  /**
   * Schedule state sync to server (debounced)
   */
  private scheduleSyncToServer(): void {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }

    this.syncTimeout = window.setTimeout(() => {
      this.syncContextToServer();
    }, 1000); // Debounce for 1 second
  }

  /**
   * Sync context state to server
   */
  private async syncContextToServer(): Promise<void> {
    try {
      const syncData = {
        workspaceId: this.contextData.currentWorkspace?.id,
        projectId: this.contextData.currentProject?.id,
        folderId: this.contextData.currentFolder?.id,
        timestamp: new Date().toISOString()
      };

      // Mock API call - replace with actual implementation
      await this.sendContextSync(syncData);

      logger.debug('Context synced to server', syncData);

    } catch (error) {
      logger.warn('Failed to sync context to server', { error });
    }
  }

  /**
   * Send context sync to server (mock implementation)
   */
  private async sendContextSync(data: any): Promise<void> {
    // Mock implementation - replace with actual API call
    return new Promise((resolve) => {
      setTimeout(resolve, 100);
    });
  }

  /**
   * Sync workspace selection to server
   */
  private async syncWorkspaceToServer(workspace: WorkspaceDto): Promise<void> {
    try {
      // Mock API call - replace with actual implementation
      await this.sendWorkspaceSync(workspace.id);
      logger.debug('Workspace synced to server', { workspaceId: workspace.id });
    } catch (error) {
      logger.warn('Failed to sync workspace to server', { error, workspaceId: workspace.id });
    }
  }

  /**
   * Sync project selection to server
   */
  private async syncProjectToServer(project: ProjectDto): Promise<void> {
    try {
      // Mock API call - replace with actual implementation
      await this.sendProjectSync(project.id);
      logger.debug('Project synced to server', { projectId: project.id });
    } catch (error) {
      logger.warn('Failed to sync project to server', { error, projectId: project.id });
    }
  }

  /**
   * Sync folder selection to server
   */
  private async syncFolderToServer(folder: FolderDto): Promise<void> {
    try {
      // Mock API call - replace with actual implementation
      await this.sendFolderSync(folder.id);
      logger.debug('Folder synced to server', { folderId: folder.id });
    } catch (error) {
      logger.warn('Failed to sync folder to server', { error, folderId: folder.id });
    }
  }

  /**
   * Mock sync methods (replace with actual API calls)
   */
  private async sendWorkspaceSync(workspaceId: Uuid): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 100));
  }

  private async sendProjectSync(projectId: Uuid): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 100));
  }

  private async sendFolderSync(folderId: Uuid): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 100));
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Listen for organization changes
    window.addEventListener('organization:changed', () => {
      this.loadWorkspaceContext();
    });

    // Listen for workspace context requests
    window.addEventListener('workspace:context:get', (event: CustomEvent) => {
      const callback = event.detail.callback;
      if (callback) {
        callback(this.getContextSummary());
      }
    });

    // Listen for navigation events
    window.addEventListener('navigation:context:update', (event: CustomEvent) => {
      const { workspaceId, projectId, folderId } = event.detail;
      
      if (workspaceId) {
        this.setCurrentWorkspace(workspaceId).catch(error => {
          logger.error('Failed to handle workspace context update', { error, workspaceId });
        });
      }
      
      if (projectId) {
        // Would need to fetch project data first
        logger.debug('Project context update requested', { projectId });
      }
      
      if (folderId) {
        // Would need to fetch folder data first
        logger.debug('Folder context update requested', { folderId });
      }
    });
  }

  /**
   * Get available workspaces
   */
  public getAvailableWorkspaces(): WorkspaceDto[] {
    return [...this.contextData.workspaces];
  }

  /**
   * Get current context data
   */
  public getContextData(): WorkspaceContextData {
    return { ...this.contextData };
  }

  /**
   * Check if user has permission
   */
  public hasPermission(permission: string): boolean {
    return this.contextData.permissions.includes(permission);
  }

  /**
   * Refresh context data
   */
  public async refresh(): Promise<void> {
    await this.loadWorkspaceContext();
  }

  /**
   * Clean up resources
   */
  public destroy(): void {
    this.unsubscribeWorkspace?.();
    this.unsubscribeAuth?.();
    
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }
    
    this.container.innerHTML = '';
    logger.debug('Workspace context destroyed');
  }
}