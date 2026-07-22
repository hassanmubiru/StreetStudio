/**
 * Dashboard Page
 * 
 * Main dashboard for authenticated users.
 */

import type { DashboardSession } from '@streetstudio/dashboard';

export class DashboardPage {
  private element: HTMLElement;
  private session: DashboardSession;

  constructor(session: DashboardSession) {
    this.session = session;
    this.element = document.createElement('div');
    this.render();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  private render(): void {
    this.element.className = 'flex-1 relative overflow-hidden';
    this.element.innerHTML = `
      <div class="p-6">
        <!-- Page Header -->
        <div class="mb-8">
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">
            Dashboard
          </h1>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Welcome back! Here's what's happening with your videos.
          </p>
        </div>

        <!-- Quick Actions -->
        <div class="mb-8">
          <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
            Quick Actions
          </h2>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <button class="bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-lg text-left transition-colors">
              <div class="flex items-center">
                <svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                </svg>
                <span class="font-medium">Start Recording</span>
              </div>
            </button>
            
            <button class="bg-green-600 hover:bg-green-700 text-white p-4 rounded-lg text-left transition-colors">
              <div class="flex items-center">
                <svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"></path>
                </svg>
                <span class="font-medium">New Project</span>
              </div>
            </button>
            
            <button class="bg-purple-600 hover:bg-purple-700 text-white p-4 rounded-lg text-left transition-colors">
              <div class="flex items-center">
                <svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2h4a1 1 0 011 1v1a1 1 0 01-1 1H3a1 1 0 01-1-1V5a1 1 0 011-1h4zM3 7v12a2 2 0 002 2h14a2 2 0 002-2V7H3z"></path>
                </svg>
                <span class="font-medium">Upload Video</span>
              </div>
            </button>
            
            <button class="bg-gray-600 hover:bg-gray-700 text-white p-4 rounded-lg text-left transition-colors">
              <div class="flex items-center">
                <svg class="w-6 h-6 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                </svg>
                <span class="font-medium">Search Videos</span>
              </div>
            </button>
          </div>
        </div>

        <!-- Recent Activity -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <!-- Recent Projects -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Recent Projects
            </h2>
            <div class="space-y-3">
              <div class="flex items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div class="w-10 h-10 bg-blue-100 dark:bg-blue-900 rounded-lg flex items-center justify-center mr-3">
                  <svg class="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900 dark:text-white">
                    Product Demo Videos
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    Updated 2 hours ago • 5 videos
                  </p>
                </div>
              </div>
              
              <div class="flex items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div class="w-10 h-10 bg-green-100 dark:bg-green-900 rounded-lg flex items-center justify-center mr-3">
                  <svg class="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path>
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900 dark:text-white">
                    Team Training
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    Updated yesterday • 3 videos
                  </p>
                </div>
              </div>
            </div>
            
            <div class="mt-4">
              <a href="/projects" class="text-blue-600 hover:text-blue-500 text-sm font-medium">
                View all projects →
              </a>
            </div>
          </div>

          <!-- Recent Videos -->
          <div class="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
              Recent Videos
            </h2>
            <div class="space-y-3">
              <div class="flex items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div class="w-16 h-10 bg-gray-300 dark:bg-gray-600 rounded flex items-center justify-center mr-3">
                  <svg class="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m-3-9a9 9 0 110 18 9 9 0 010-18z"></path>
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900 dark:text-white">
                    Feature walkthrough.mp4
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    3 comments • 2:34 duration
                  </p>
                </div>
              </div>
              
              <div class="flex items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div class="w-16 h-10 bg-gray-300 dark:bg-gray-600 rounded flex items-center justify-center mr-3">
                  <svg class="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h1m4 0h1m-6 4h8m-3-9a9 9 0 110 18 9 9 0 010-18z"></path>
                  </svg>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-gray-900 dark:text-white">
                    Bug report demo.mp4
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    1 comment • 1:45 duration
                  </p>
                </div>
              </div>
            </div>
            
            <div class="mt-4">
              <a href="/recordings" class="text-blue-600 hover:text-blue-500 text-sm font-medium">
                View all videos →
              </a>
            </div>
          </div>
        </div>

        <!-- Statistics -->
        <div class="mt-8">
          <h2 class="text-lg font-medium text-gray-900 dark:text-white mb-4">
            This Week
          </h2>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
              <div class="flex items-center">
                <div class="p-2 bg-blue-100 dark:bg-blue-900 rounded-lg">
                  <svg class="w-6 h-6 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                  </svg>
                </div>
                <div class="ml-4">
                  <p class="text-2xl font-semibold text-gray-900 dark:text-white">7</p>
                  <p class="text-sm text-gray-600 dark:text-gray-400">Videos Created</p>
                </div>
              </div>
            </div>
            
            <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
              <div class="flex items-center">
                <div class="p-2 bg-green-100 dark:bg-green-900 rounded-lg">
                  <svg class="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"></path>
                  </svg>
                </div>
                <div class="ml-4">
                  <p class="text-2xl font-semibold text-gray-900 dark:text-white">23</p>
                  <p class="text-sm text-gray-600 dark:text-gray-400">Comments Received</p>
                </div>
              </div>
            </div>
            
            <div class="bg-white dark:bg-gray-800 p-6 rounded-lg shadow">
              <div class="flex items-center">
                <div class="p-2 bg-purple-100 dark:bg-purple-900 rounded-lg">
                  <svg class="w-6 h-6 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"></path>
                  </svg>
                </div>
                <div class="ml-4">
                  <p class="text-2xl font-semibold text-gray-900 dark:text-white">12</p>
                  <p class="text-sm text-gray-600 dark:text-gray-400">Team Members</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}