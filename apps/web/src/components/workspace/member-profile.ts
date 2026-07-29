/**
 * Member Profile Component
 * 
 * Displays detailed member information including profile data,
 * role, join date, and activity history within the organization.
 * 
 * Validates: Requirements 8.1
 */

import type { Uuid } from '@streetstudio/shared';
import { apiClient } from '../../services/api.js';
import { logger } from '../../app/client-logger.js';

export interface MemberActivity {
  id: Uuid;
  type: 'comment' | 'upload' | 'edit' | 'view' | 'project_created';
  description: string;
  timestamp: string;
  resourceId?: Uuid;
  resourceName?: string;
}

export interface MemberProfileData {
  id: Uuid;
  email: string;
  displayName: string;
  avatarUrl?: string;
  bio?: string;
  role: string;
  joinedAt: string;
  lastActivity: string;
  status: 'active' | 'inactive' | 'suspended';
  activityHistory: MemberActivity[];
  stats: {
    videosCreated: number;
    commentsPosted: number;
    projectsContributed: number;
  };
}

export interface MemberProfileConfig {
  organizationId: Uuid;
  memberId: Uuid;
  onBack?: () => void;
}

export class MemberProfile {
  private config: MemberProfileConfig;
  private element: HTMLElement;
  private profile: MemberProfileData | null = null;
  private isLoading = false;

  constructor(config: MemberProfileConfig) {
    this.config = config;
    this.element = document.createElement('div');
    this.element.className = 'member-profile';
    this.element.setAttribute('data-member-profile', '');
  }

  public async getElement(): Promise<HTMLElement> {
    await this.loadProfile();
    this.render();
    this.setupEventListeners();
    return this.element;
  }

  private async loadProfile(): Promise<void> {
    this.isLoading = true;
    try {
      const response = await apiClient.get<MemberProfileData>(
        `/organizations/${this.config.organizationId}/members/${this.config.memberId}`
      );
      this.profile = response.data;
    } catch (error) {
      logger.error('Failed to load member profile', {
        error,
        memberId: this.config.memberId
      });
      this.profile = null;
    } finally {
      this.isLoading = false;
    }
  }
