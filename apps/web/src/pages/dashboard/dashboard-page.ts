/**
 * Dashboard Page
 * 
 * Main dashboard interface with responsive project cards, real-time activity feed,
 * and quick action buttons for video recording and project management.
 */

import type { DashboardSession } from '@streetstudio/dashboard';
import type { 
  ProjectDto, 
  VideoDto, 
  MemberDto,
  NotificationDto, 
  Uuid 
} from '@streetstudio/shared';
import { formatRelativeTime } from '../../utils/format-time.js';
import { DashboardStatsWidget } from './components/dashboard-stats-widget.js';
import { ProjectCard } from './components/project-card.js';
import { VideoCard } from './components/video-card.js';
import { ActivityFeed } from './components/activity-feed.js';
import { QuickActions } from './components/quick-actions.js';

export interface DashboardData {
  recentProjects: ProjectDto[];
  recentVideos: VideoDto[];
  notifications: NotificationDto[];
  weeklyStats: {
    videosCreated: number;
    commentsReceived: number;
    teamMembers: number;
  };
  currentMember: MemberDto;
}

export class DashboardPage {
  private element: HTMLElement;
  private session: DashboardSession;
  private data: DashboardData | null = null;
  private refreshTimer: number | null = null;
  private isLoading = false;

  constructor(session: DashboardSession) {
    this.session = session;
    this.element = document.createElement('div');
    this.element.className = 'flex-1 relative overflow-hidden';
    this.initialize();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  private async initialize(): Promise<void> {
    // Show loading state immediately
    this.isLoading = true;
    this.render();
    
    await this.loadDashboardData();
    this.render();
    this.setupEventListeners();
    this.startAutoRefresh();
  }

  /**
   * Load dashboard data from API
   */
  private async loadDashboardData(): Promise<void> {
    if (this.isLoading) return;
    
    this.isLoading = true;
    try {
      // Get current member info
      const currentMember = await this.session.currentMember();
      
      // Load dashboard data in parallel
      const [recentProjects, recentVideos, notifications, weeklyStats] = await Promise.all([
        this.loadRecentProjects(),
        this.loadRecentVideos(), 
        this.loadNotifications(),
        this.loadWeeklyStats()
      ]);

      this.data = {
        currentMember,
        recentProjects,
        recentVideos,
        notifications,
        weeklyStats
      };
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
      this.showErrorState();
    } finally {
      this.isLoading = false;
    }
  }

  private async loadRecentProjects(): Promise<ProjectDto[]> {
    try {
      // Mock implementation - replace with actual API call
      return [
        {
          id: '1' as Uuid,
          name: 'Product Demo Videos',
          description: 'Comprehensive product demonstration recordings',
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
          updatedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          videoCount: 5,
          memberCount: 3,
          thumbnailUrl: '/api/projects/1/thumbnail'
        } as ProjectDto,
        {
          id: '2' as Uuid,
          name: 'Team Training Sessions',
          description: 'Internal team training and onboarding content',
          createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
          updatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          videoCount: 8,
          memberCount: 12,
          thumbnailUrl: '/api/projects/2/thumbnail'
        } as ProjectDto
      ];
    } catch (error) {
      console.warn('Failed to load recent projects:', error);
      return [];
    }
  }

  private async loadRecentVideos(): Promise<VideoDto[]> {
    try {
      // Mock implementation - replace with actual API call
      return [
        {
          id: '1' as Uuid,
          title: 'Feature Walkthrough - New Dashboard',
          description: 'Complete walkthrough of the new dashboard interface',
          duration: 154, // 2:34
          createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
          status: 'ready',
          thumbnailUrl: '/api/videos/1/thumbnail',
          commentCount: 3,
          viewCount: 15
        } as VideoDto,
        {
          id: '2' as Uuid, 
          title: 'Bug Report Demonstration',
          description: 'Demonstrating bug reproduction steps',
          duration: 105, // 1:45
          createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(), // 5 hours ago
          status: 'ready',
          thumbnailUrl: '/api/videos/2/thumbnail',
          commentCount: 1,
          viewCount: 8
        } as VideoDto
      ];
    } catch (error) {
      console.warn('Failed to load recent videos:', error);
      return [];
    }
  }
  private async loadNotifications(): Promise<NotificationDto[]> {
    try {
      // Mock implementation - replace with actual API call
      return [
        {
          id: '1' as Uuid,
          type: 'comment',
          message: 'Sarah commented on "Feature Walkthrough"',
          createdAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
          read: false,
          metadata: {
            videoId: '1' as Uuid,
            commentId: '1' as Uuid
          }
        } as NotificationDto,
        {
          id: '2' as Uuid,
          type: 'project_invite',
          message: 'You were added to "Team Training Sessions"',
          createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
          read: false,
          metadata: {
            projectId: '2' as Uuid
          }
        } as NotificationDto
      ];
    } catch (error) {
      console.warn('Failed to load notifications:', error);
      return [];
    }
  }

  private async loadWeeklyStats(): Promise<DashboardData['weeklyStats']> {
    try {
      // Mock implementation - replace with actual API call
      return {
        videosCreated: 7,
        commentsReceived: 23,
        teamMembers: 12
      };
    } catch (error) {
      console.warn('Failed to load weekly stats:', error);
      return {
        videosCreated: 0,
        commentsReceived: 0,
        teamMembers: 0
      };
    }
  }

  /**
   * Render the dashboard with current data
   */
  private render(): void {
    if (this.isLoading && !this.data) {
      this.renderLoadingState();
      return;
    }

    if (!this.data) {
      this.renderErrorState();
      return;
    }

    this.renderDashboard();
  }
  /**
   * Render main dashboard interface
   */
  private renderDashboard(): void {
    this.element.innerHTML = `
      <div class="p-4 sm:p-6 max-w-7xl mx-auto">
        <!-- Page Header -->
        <div class="mb-8">
          <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                Welcome back, ${this.data?.currentMember?.displayName || 'User'}!
              </h1>
              <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Here's what's happening with your videos and projects.
              </p>
            </div>
            <div class="mt-4 sm:mt-0">
              <button 
                id="refresh-dashboard" 
                class="inline-flex items-center px-3 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                ${this.isLoading ? 'disabled' : ''}
              >
                <svg class="w-4 h-4 mr-2 ${this.isLoading ? 'animate-spin' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
                </svg>
                Refresh
              </button>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div id="quick-actions-container" class="mb-8">
          <!-- Quick actions component will be rendered here -->
        </div>

        <!-- Main Content Grid -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-8">
          <!-- Main Content (Projects and Videos) -->
          <div class="lg:col-span-2 space-y-8">
            <!-- Recent Projects -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
              <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div class="flex items-center justify-between">
                  <h2 class="text-lg font-medium text-gray-900 dark:text-white">
                    Recent Projects
                  </h2>
                  <a 
                    href="/projects" 
                    class="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium transition-colors"
                  >
                    View all →
                  </a>
                </div>
              </div>
              <div id="projects-container" class="p-6">
                <!-- Project cards will be rendered here -->
              </div>
            </div>

            <!-- Recent Videos -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
              <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div class="flex items-center justify-between">
                  <h2 class="text-lg font-medium text-gray-900 dark:text-white">
                    Recent Videos
                  </h2>
                  <a 
                    href="/recordings" 
                    class="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium transition-colors"
                  >
                    View all →
                  </a>
                </div>
              </div>
              <div id="videos-container" class="p-6">
                <!-- Video cards will be rendered here -->
              </div>
            </div>
          </div>

          <!-- Sidebar Content -->
          <div class="space-y-6">
            <!-- Weekly Stats -->
            <div id="stats-container">
              <!-- Stats widget will be rendered here -->
            </div>

            <!-- Activity Feed -->
            <div class="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
              <div class="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <h2 class="text-lg font-medium text-gray-900 dark:text-white">
                  Recent Activity
                </h2>
              </div>
              <div id="activity-feed-container" class="p-6">
                <!-- Activity feed component will be rendered here -->
              </div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Render child components
    this.renderChildComponents();
  }
  /**
   * Render child components
   */
  private renderChildComponents(): void {
    if (!this.data) return;

    // Render quick actions
    const quickActionsContainer = document.getElementById('quick-actions-container');
    if (quickActionsContainer) {
      const quickActions = new QuickActions();
      quickActionsContainer.appendChild(quickActions.getElement());
    }

    // Render project cards
    const projectsContainer = document.getElementById('projects-container');
    if (projectsContainer && this.data.recentProjects.length > 0) {
      const projectsGrid = document.createElement('div');
      projectsGrid.className = 'grid grid-cols-1 sm:grid-cols-2 gap-4';
      
      this.data.recentProjects.forEach(project => {
        const projectCard = new ProjectCard(project);
        projectsGrid.appendChild(projectCard.getElement());
      });
      
      projectsContainer.appendChild(projectsGrid);
    } else if (projectsContainer) {
      this.renderEmptyState(projectsContainer, 'No recent projects', 'Create your first project to get started');
    }

    // Render video cards  
    const videosContainer = document.getElementById('videos-container');
    if (videosContainer && this.data.recentVideos.length > 0) {
      const videosGrid = document.createElement('div');
      videosGrid.className = 'space-y-4';
      
      this.data.recentVideos.forEach(video => {
        const videoCard = new VideoCard(video);
        videosGrid.appendChild(videoCard.getElement());
      });
      
      videosContainer.appendChild(videosGrid);
    } else if (videosContainer) {
      this.renderEmptyState(videosContainer, 'No recent videos', 'Record your first video to see it here');
    }

    // Render stats widget
    const statsContainer = document.getElementById('stats-container');
    if (statsContainer) {
      const statsWidget = new DashboardStatsWidget(this.data.weeklyStats);
      statsContainer.appendChild(statsWidget.getElement());
    }

    // Render activity feed
    const activityContainer = document.getElementById('activity-feed-container');
    if (activityContainer) {
      const activityFeed = new ActivityFeed(this.data.notifications);
      activityContainer.appendChild(activityFeed.getElement());
    }
  }

  /**
   * Render empty state for sections with no content
   */
  private renderEmptyState(container: HTMLElement, title: string, message: string): void {
    container.innerHTML = `
      <div class="text-center py-8">
        <div class="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg class="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
          </svg>
        </div>
        <h3 class="text-sm font-medium text-gray-900 dark:text-white mb-1">${title}</h3>
        <p class="text-sm text-gray-600 dark:text-gray-400">${message}</p>
      </div>
    `;
  }

  /**
   * Render loading state
   */
  private renderLoadingState(): void {
    this.element.innerHTML = `
      <div class="p-6 max-w-7xl mx-auto">
        <div class="animate-pulse">
          <!-- Header skeleton -->
          <div class="mb-8">
            <div class="h-8 bg-gray-200 dark:bg-gray-700 rounded w-96 mb-2"></div>
            <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-64"></div>
          </div>
          
          <!-- Quick actions skeleton -->
          <div class="mb-8">
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              ${Array.from({length: 4}, () => `
                <div class="h-20 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
              `).join('')}
            </div>
          </div>
          
          <!-- Content grid skeleton -->
          <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div class="lg:col-span-2 space-y-8">
              <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div class="h-6 bg-gray-200 dark:bg-gray-700 rounded w-32 mb-4"></div>
                <div class="space-y-3">
                  ${Array.from({length: 2}, () => `
                    <div class="h-16 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  `).join('')}
                </div>
              </div>
            </div>
            <div class="space-y-6">
              <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                <div class="h-6 bg-gray-200 dark:bg-gray-700 rounded w-24 mb-4"></div>
                <div class="space-y-3">
                  ${Array.from({length: 3}, () => `
                    <div class="h-12 bg-gray-200 dark:bg-gray-700 rounded"></div>
                  `).join('')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  /**
   * Render error state
   */
  private renderErrorState(): void {
    this.element.innerHTML = `
      <div class="p-6 max-w-7xl mx-auto">
        <div class="text-center py-12">
          <div class="w-16 h-16 bg-red-100 dark:bg-red-900 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg class="w-8 h-8 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.84L13.732 4.86c-.77-1.175-2.694-1.175-3.464 0L3.34 16.16c-.77 1.173.192 2.84 1.732 2.84z"></path>
            </svg>
          </div>
          <h3 class="text-lg font-medium text-gray-900 dark:text-white mb-1">Failed to load dashboard</h3>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">We couldn't load your dashboard data. Please try again.</p>
          <button 
            id="retry-load"
            class="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <svg class="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path>
            </svg>
            Try Again
          </button>
        </div>
      </div>
    `;
    
    // Add retry functionality
    const retryButton = document.getElementById('retry-load');
    if (retryButton) {
      retryButton.addEventListener('click', async () => {
        await this.loadDashboardData();
        this.render();
      });
    }
  }

  private showErrorState(): void {
    this.data = null;
    this.render();
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Listen for refresh button clicks
    document.addEventListener('click', async (event) => {
      const target = event.target as HTMLElement;
      if (target.id === 'refresh-dashboard' || target.closest('#refresh-dashboard')) {
        event.preventDefault();
        await this.refresh();
      }
    });

    // Listen for real-time updates via WebSocket
    document.addEventListener('streetstudio:real-time-update', (event) => {
      const customEvent = event as CustomEvent;
      this.handleRealTimeUpdate(customEvent.detail);
    });

    // Listen for visibility changes to refresh when page becomes visible
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.data) {
        // Refresh data when user returns to the page
        this.refresh();
      }
    });
  }

  /**
   * Handle real-time updates from WebSocket
   */
  private handleRealTimeUpdate(update: any): void {
    if (!this.data) return;

    switch (update.type) {
      case 'new_comment':
        // Update comment counts for affected videos
        const video = this.data.recentVideos.find(v => v.id === update.videoId);
        if (video) {
          video.commentCount = (video.commentCount || 0) + 1;
          this.updateVideoCard(video);
        }
        break;
        
      case 'project_updated':
        // Refresh project data
        this.refreshProjectData(update.projectId);
        break;
        
      case 'new_notification':
        // Add new notification to the feed
        this.data.notifications.unshift(update.notification);
        this.updateActivityFeed();
        break;
        
      default:
        // For other updates, do a soft refresh
        setTimeout(() => this.refresh(), 1000);
    }
  }
  /**
   * Update specific video card without full re-render
   */
  private updateVideoCard(video: VideoDto): void {
    const videoCard = document.querySelector(`[data-video-id="${video.id}"]`);
    if (videoCard) {
      const commentCount = videoCard.querySelector('[data-comment-count]');
      if (commentCount) {
        commentCount.textContent = `${video.commentCount} comments`;
      }
    }
  }

  /**
   * Refresh specific project data
   */
  private async refreshProjectData(projectId: Uuid): Promise<void> {
    try {
      // In a real implementation, fetch updated project data
      // For now, just refresh the entire dashboard
      await this.refresh();
    } catch (error) {
      console.error('Failed to refresh project data:', error);
    }
  }

  /**
   * Update activity feed without full re-render
   */
  private updateActivityFeed(): void {
    const activityContainer = document.getElementById('activity-feed-container');
    if (activityContainer && this.data) {
      // Clear and re-render activity feed
      activityContainer.innerHTML = '';
      const activityFeed = new ActivityFeed(this.data.notifications);
      activityContainer.appendChild(activityFeed.getElement());
    }
  }

  /**
   * Start auto-refresh timer
   */
  private startAutoRefresh(): void {
    // Refresh every 5 minutes
    this.refreshTimer = window.setInterval(() => {
      if (!document.hidden && this.data) {
        this.refresh();
      }
    }, 5 * 60 * 1000);
  }

  /**
   * Stop auto-refresh timer
   */
  private stopAutoRefresh(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Refresh dashboard data
   */
  public async refresh(): Promise<void> {
    await this.loadDashboardData();
    this.render();
  }

  /**
   * Cleanup resources
   */
  public destroy(): void {
    this.stopAutoRefresh();
    // Remove event listeners
    document.removeEventListener('click', this.setupEventListeners);
    document.removeEventListener('streetstudio:real-time-update', this.setupEventListeners);
    document.removeEventListener('visibilitychange', this.setupEventListeners);
  }
}