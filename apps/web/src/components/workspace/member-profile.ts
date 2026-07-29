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

  private render(): void {
    if (this.isLoading) {
      this.element.innerHTML = this.renderLoading();
      return;
    }

    if (!this.profile) {
      this.element.innerHTML = this.renderError();
      return;
    }

    const initials = this.getInitials(this.profile.displayName);

    this.element.innerHTML = `
      <div class="p-6 max-w-4xl mx-auto">
        <!-- Back Button -->
        <button
          data-action="back"
          class="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6 transition-colors"
          aria-label="Back to members list"
        >
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
          Back to Members
        </button>

        <!-- Profile Header -->
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6" data-profile-header>
          <div class="flex items-start gap-6">
            <div class="w-20 h-20 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center flex-shrink-0">
              ${this.profile.avatarUrl
                ? `<img src="${this.profile.avatarUrl}" alt="${this.profile.displayName}" class="w-20 h-20 rounded-full object-cover"/>`
                : `<span class="text-2xl font-bold text-blue-700 dark:text-blue-300">${initials}</span>`
              }
            </div>
            <div class="flex-1">
              <h1 class="text-2xl font-bold text-gray-900 dark:text-white">${this.profile.displayName}</h1>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">${this.profile.email}</p>
              ${this.profile.bio ? `<p class="text-sm text-gray-700 dark:text-gray-300 mt-2">${this.profile.bio}</p>` : ''}
              <div class="flex items-center gap-4 mt-3">
                <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                  ${this.profile.role}
                </span>
                <span class="text-xs text-gray-500 dark:text-gray-400">
                  Joined ${this.formatDate(this.profile.joinedAt)}
                </span>
                ${this.getStatusBadge(this.profile.status)}
              </div>
            </div>
          </div>
        </div>

        <!-- Stats Grid -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6" data-profile-stats>
          ${this.renderStatCard('Videos Created', this.profile.stats.videosCreated, 'video')}
          ${this.renderStatCard('Comments Posted', this.profile.stats.commentsPosted, 'comment')}
          ${this.renderStatCard('Projects Contributed', this.profile.stats.projectsContributed, 'project')}
        </div>

        <!-- Activity History -->
        <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700" data-activity-history>
          <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 class="text-lg font-medium text-gray-900 dark:text-white">Activity History</h2>
          </div>
          <div class="p-6">
            ${this.renderActivityHistory()}
          </div>
        </div>
      </div>
    `;
  }

  private renderStatCard(label: string, value: number, type: string): string {
    const icons: Record<string, string> = {
      video: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>',
      comment: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>',
      project: '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>'
    };

    return `
      <div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
            <svg class="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              ${icons[type] || ''}
            </svg>
          </div>
          <div>
            <p class="text-2xl font-bold text-gray-900 dark:text-white">${value}</p>
            <p class="text-xs text-gray-500 dark:text-gray-400">${label}</p>
          </div>
        </div>
      </div>
    `;
  }

  private renderActivityHistory(): string {
    if (!this.profile || this.profile.activityHistory.length === 0) {
      return `
        <p class="text-sm text-gray-500 dark:text-gray-400 text-center py-8">
          No activity recorded yet.
        </p>
      `;
    }

    const items = this.profile.activityHistory.map(activity => `
      <div class="flex items-start gap-3 py-3 border-b border-gray-100 dark:border-gray-700 last:border-0" data-activity-id="${activity.id}">
        <div class="w-8 h-8 rounded-full ${this.getActivityColor(activity.type)} flex items-center justify-center flex-shrink-0 mt-0.5">
          ${this.getActivityIcon(activity.type)}
        </div>
        <div class="flex-1 min-w-0">
          <p class="text-sm text-gray-900 dark:text-white">${activity.description}</p>
          ${activity.resourceName ? `<p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">${activity.resourceName}</p>` : ''}
        </div>
        <span class="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
          ${this.formatRelativeTime(activity.timestamp)}
        </span>
      </div>
    `).join('');

    return `<div class="divide-y divide-gray-100 dark:divide-gray-700">${items}</div>`;
  }

  private renderLoading(): string {
    return `
      <div class="p-6 max-w-4xl mx-auto animate-pulse">
        <div class="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded mb-6"></div>
        <div class="bg-white dark:bg-gray-800 rounded-lg border p-6 mb-6">
          <div class="flex items-start gap-6">
            <div class="w-20 h-20 rounded-full bg-gray-200 dark:bg-gray-700"></div>
            <div class="flex-1 space-y-3">
              <div class="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded"></div>
              <div class="h-4 w-36 bg-gray-200 dark:bg-gray-700 rounded"></div>
              <div class="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderError(): string {
    return `
      <div class="p-6 max-w-4xl mx-auto">
        <button data-action="back" class="inline-flex items-center text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white mb-6">
          <svg class="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
          </svg>
          Back to Members
        </button>
        <div class="text-center py-12">
          <p class="text-gray-500 dark:text-gray-400">Failed to load member profile.</p>
          <button data-action="retry" class="mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium">
            Try Again
          </button>
        </div>
      </div>
    `;
  }

  private setupEventListeners(): void {
    this.element.addEventListener('click', async (event) => {
      const target = event.target as HTMLElement;
      const action = target.closest('[data-action]')?.getAttribute('data-action');

      if (action === 'back' && this.config.onBack) {
        this.config.onBack();
      } else if (action === 'retry') {
        await this.loadProfile();
        this.render();
        this.setupEventListeners();
      }
    });
  }

  private getActivityColor(type: string): string {
    const colors: Record<string, string> = {
      comment: 'bg-purple-100 dark:bg-purple-900/30',
      upload: 'bg-green-100 dark:bg-green-900/30',
      edit: 'bg-blue-100 dark:bg-blue-900/30',
      view: 'bg-gray-100 dark:bg-gray-700',
      project_created: 'bg-yellow-100 dark:bg-yellow-900/30'
    };
    return colors[type] || colors.view;
  }

  private getActivityIcon(type: string): string {
    const icons: Record<string, string> = {
      comment: '<svg class="w-4 h-4 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z"/></svg>',
      upload: '<svg class="w-4 h-4 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>',
      edit: '<svg class="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/></svg>',
      view: '<svg class="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>',
      project_created: '<svg class="w-4 h-4 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/></svg>'
    };
    return icons[type] || icons.view;
  }

  private getStatusBadge(status: string): string {
    const styles: Record<string, string> = {
      active: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
      inactive: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-400',
      suspended: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
    };
    const style = styles[status] || styles.inactive;
    return `<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style}">${status}</span>`;
  }

  private getInitials(name: string): string {
    return name.split(' ').map(p => p.charAt(0)).slice(0, 2).join('').toUpperCase();
  }

  private formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    });
  }

  private formatRelativeTime(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  /** Get loaded profile (for testing) */
  public getProfile(): MemberProfileData | null {
    return this.profile;
  }

  public destroy(): void {
    this.element.innerHTML = '';
    this.profile = null;
  }
}
