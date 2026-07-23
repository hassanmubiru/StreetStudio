/**
 * Project Detail Page Component
 * 
 * Provides hierarchical folder structure view with drag-and-drop organization
 * and real-time updates for collaborative project management.
 */

import { apiClient } from '../../services/api.js';
import type { ProjectDto, FolderDto, VideoDto } from '@streetstudio/shared';
import { handleError } from '../../app/error-handler.js';
import { logger } from '../../app/client-logger.js';

export interface FolderItem extends FolderDto {
  children?: FolderItem[];
  videos?: VideoDto[];
  isExpanded?: boolean;
  isSelected?: boolean;
}

export class ProjectDetailPage {
  private container: HTMLElement | null = null;
  private projectId: string = '';
  private project: ProjectDto | null = null;
  private folderTree: FolderItem[] = [];
  private currentFolderId: string | null = null;
  private draggedItem: { type: 'folder' | 'video'; id: string; element: HTMLElement } | null = null;
  private isLoading = false;

  constructor(projectId: string) {
    this.projectId = projectId;
  }

  public async getElement(): Promise<HTMLElement> {
    if (!this.container) {
      this.container = this.createContainer();
      await this.loadProject();
      await this.loadFolderStructure();
    }
    return this.container;
  }