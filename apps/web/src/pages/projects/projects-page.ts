/**
 * Projects Page Component
 * 
 * Provides comprehensive project management with searchable and filterable grid layout.
 * Includes project creation, member invitation, and organization capabilities.
 */

import { apiClient } from '../../services/api.js';
import type { ProjectDto, MemberDto, OrganizationDto } from '@streetstudio/shared';
import { handleError } from '../../app/error-handler.js';
import { logger } from '../../app/client-logger.js';

export interface ProjectWithMembers extends ProjectDto {
  memberCount: number;
  lastActivity: string;
  thumbnailUrl?: string;
}

export class ProjectsPage {
  private container: HTMLElement | null = null;
  private projects: ProjectWithMembers[] = [];
  private filteredProjects: ProjectWithMembers[] = [];
  private searchQuery = '';
  private sortBy: 'name' | 'created' | 'activity' | 'members' = 'activity';
  private sortOrder: 'asc' | 'desc' = 'desc';
  private viewMode: 'grid' | 'list' = 'grid';
  private isLoading = false;

  public async getElement(): Promise<HTMLElement> {
    if (!this.container) {
      this.container = this.createContainer();
      await this.loadProjects();
    }
    return this.container;
  }