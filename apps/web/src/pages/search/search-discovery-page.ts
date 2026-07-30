/**
 * Search Discovery Page Component
 * 
 * Provides search discovery features including:
 * - "No results" page with alternative suggestions
 * - Content discovery recommendations
 * - Popular content and trending search displays
 * - Search analytics and improvement suggestions
 * 
 * Requirements: 14.10
 */

import {
  SearchDiscoveryService,
  SearchSuggestionItem,
  ContentRecommendation,
  TrendingSearch,
  PopularContent,
  SearchAnalytics,
  SearchImprovementSuggestion,
} from '../../services/search-discovery.js';

export class SearchDiscoveryPage {
  private element: HTMLElement;
  private discoveryService: SearchDiscoveryService;
  private recommendations: ContentRecommendation[] = [];
  private trendingSearches: TrendingSearch[] = [];
  private popularContent: PopularContent[] = [];
  private analytics: SearchAnalytics | null = null;
  private isLoading = true;

  constructor() {
    this.discoveryService = new SearchDiscoveryService();
    this.element = document.createElement('div');
    this.element.className = 'p-8 max-w-6xl mx-auto';
    this.element.setAttribute('data-main-content', '');
    this.element.setAttribute('role', 'main');
    this.element.setAttribute('aria-label', 'Search discovery and recommendations');

    this.render();
    this.loadDiscoveryData();
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  public destroy(): void {
    this.discoveryService.destroy();
  }

  private async loadDiscoveryData(): Promise<void> {
    this.isLoading = true;
    this.render();

    try {
      const [recommendations, trending, popular] = await Promise.all([
        this.discoveryService.getRecommendations(),
        this.discoveryService.getTrendingSearches(),
        this.discoveryService.getPopularContent(),
      ]);

      this.recommendations = recommendations;
      this.trendingSearches = trending;
      this.popularContent = popular;
      this.analytics = this.discoveryService.getSearchAnalytics();
    } catch (error) {
      console.error('Failed to load discovery data:', error);
    } finally {
      this.isLoading = false;
      this.render();
    }
  }

  private render(): void {
    this.element.innerHTML = `
      <div>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">Discover</h1>
        <p class="text-gray-600 dark:text-gray-400 mb-8">
          Explore popular content, trending searches, and personalized recommendations.
        </p>

        ${this.isLoading ? this.renderLoadingState() : this.renderContent()}
      </div>
    `;

    this.attachEventListeners();
  }

  private renderContent(): string {
    return `
      ${this.renderTrendingSearches()}
      ${this.renderPopularContent()}
      ${this.renderRecommendations()}
      ${this.renderAnalytics()}
    `;
  }

  private renderTrendingSearches(): string {
    if (this.trendingSearches.length === 0) return '';

    return `
      <section class="mb-10" aria-labelledby="trending-heading">
        <h2 id="trending-heading" class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <svg class="w-5 h-5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path>
          </svg>
          Trending Searches
        </h2>
        <div class="flex flex-wrap gap-3" role="list" aria-label="Trending searches">
          ${this.trendingSearches.map(item => `
            <button
              class="inline-flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full hover:border-blue-300 dark:hover:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-sm"
              data-action="search-trending"
              data-query="${this.escapeAttr(item.query)}"
              role="listitem"
              aria-label="Search for ${this.escapeAttr(item.query)}, ${item.searchCount} searches, ${item.trend}"
            >
              ${this.getTrendIcon(item.trend)}
              <span class="text-gray-700 dark:text-gray-300">${this.escapeHtml(item.query)}</span>
              <span class="text-xs text-gray-400 dark:text-gray-500">${item.searchCount}</span>
            </button>
          `).join('')}
        </div>
      </section>
    `;
  }

  private renderPopularContent(): string {
    if (this.popularContent.length === 0) return '';

    return `
      <section class="mb-10" aria-labelledby="popular-heading">
        <h2 id="popular-heading" class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <svg class="w-5 h-5 text-yellow-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"></path>
          </svg>
          Popular Content
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" role="list" aria-label="Popular content">
          ${this.popularContent.map(item => `
            <a
              href="${this.escapeAttr(item.url)}"
              class="block p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
              role="listitem"
            >
              ${item.thumbnailUrl ? `
                <div class="w-full h-32 bg-gray-200 dark:bg-gray-700 rounded-md mb-3 overflow-hidden">
                  <img src="${this.escapeAttr(item.thumbnailUrl)}" alt="" class="w-full h-full object-cover" loading="lazy" />
                </div>
              ` : `
                <div class="w-full h-32 bg-gray-100 dark:bg-gray-700 rounded-md mb-3 flex items-center justify-center">
                  <svg class="w-10 h-10 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"></path>
                  </svg>
                </div>
              `}
              <h3 class="text-sm font-medium text-gray-900 dark:text-white truncate">${this.escapeHtml(item.title)}</h3>
              <div class="flex items-center gap-3 mt-2">
                <span class="text-xs font-medium px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 capitalize">${item.type}</span>
                <span class="text-xs text-gray-400 dark:text-gray-500">${item.viewCount} views</span>
              </div>
            </a>
          `).join('')}
        </div>
      </section>
    `;
  }

  private renderRecommendations(): string {
    if (this.recommendations.length === 0) return '';

    return `
      <section class="mb-10" aria-labelledby="recommendations-heading">
        <h2 id="recommendations-heading" class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <svg class="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"></path>
          </svg>
          Recommended for You
        </h2>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4" role="list" aria-label="Recommendations">
          ${this.recommendations.map(item => `
            <a
              href="${this.escapeAttr(item.url)}"
              class="flex items-start gap-4 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-colors"
              role="listitem"
            >
              ${item.thumbnailUrl ? `
                <div class="shrink-0 w-20 h-14 bg-gray-200 dark:bg-gray-700 rounded overflow-hidden">
                  <img src="${this.escapeAttr(item.thumbnailUrl)}" alt="" class="w-full h-full object-cover" loading="lazy" />
                </div>
              ` : `
                <div class="shrink-0 w-20 h-14 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center">
                  <svg class="w-6 h-6 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M7 4V2m0 2a2 2 0 012 2v1a2 2 0 01-2 2 2 2 0 01-2-2V6a2 2 0 012-2zm0 10v2m0-2a2 2 0 00-2-2H4a2 2 0 00-2 2v1a2 2 0 002 2h1a2 2 0 002-2v-1z"></path>
                  </svg>
                </div>
              `}
              <div class="flex-1 min-w-0">
                <h3 class="text-sm font-medium text-gray-900 dark:text-white truncate">${this.escapeHtml(item.title)}</h3>
                ${item.description ? `
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">${this.escapeHtml(item.description)}</p>
                ` : ''}
                <p class="text-xs text-purple-600 dark:text-purple-400 mt-1">${this.escapeHtml(item.reason)}</p>
              </div>
            </a>
          `).join('')}
        </div>
      </section>
    `;
  }

  private renderAnalytics(): string {
    if (!this.analytics) return '';

    const { totalSearches, successfulSearches, failedSearches, averageResultCount, improvementSuggestions } = this.analytics;

    if (totalSearches === 0 && improvementSuggestions.length <= 1) return '';

    return `
      <section class="mb-10" aria-labelledby="analytics-heading">
        <h2 id="analytics-heading" class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <svg class="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path>
          </svg>
          Search Insights
        </h2>

        ${totalSearches > 0 ? `
          <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-center">
              <div class="text-2xl font-bold text-gray-900 dark:text-white">${totalSearches}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">Total Searches</div>
            </div>
            <div class="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-center">
              <div class="text-2xl font-bold text-green-600 dark:text-green-400">${successfulSearches}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">Successful</div>
            </div>
            <div class="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-center">
              <div class="text-2xl font-bold text-red-500 dark:text-red-400">${failedSearches}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">No Results</div>
            </div>
            <div class="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 text-center">
              <div class="text-2xl font-bold text-blue-600 dark:text-blue-400">${averageResultCount}</div>
              <div class="text-xs text-gray-500 dark:text-gray-400 mt-1">Avg. Results</div>
            </div>
          </div>
        ` : ''}

        ${improvementSuggestions.length > 0 ? `
          <div class="space-y-3" role="list" aria-label="Search improvement suggestions">
            ${improvementSuggestions.map(suggestion => `
              <div
                class="flex items-start gap-3 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700"
                role="listitem"
              >
                ${this.getPriorityIcon(suggestion.priority)}
                <div class="flex-1">
                  <h3 class="text-sm font-medium text-gray-900 dark:text-white">${this.escapeHtml(suggestion.title)}</h3>
                  <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">${this.escapeHtml(suggestion.description)}</p>
                </div>
                ${suggestion.actionUrl ? `
                  <a
                    href="${this.escapeAttr(suggestion.actionUrl)}"
                    class="shrink-0 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Take action →
                  </a>
                ` : ''}
              </div>
            `).join('')}
          </div>
        ` : ''}
      </section>
    `;
  }

  private renderLoadingState(): string {
    return `
      <div class="space-y-8" aria-busy="true" aria-label="Loading discovery content">
        <!-- Trending skeleton -->
        <div>
          <div class="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-4 animate-pulse"></div>
          <div class="flex flex-wrap gap-3">
            ${Array.from({ length: 5 }, () => `
              <div class="h-9 w-32 bg-gray-200 dark:bg-gray-700 rounded-full animate-pulse"></div>
            `).join('')}
          </div>
        </div>
        <!-- Popular content skeleton -->
        <div>
          <div class="h-5 w-40 bg-gray-200 dark:bg-gray-700 rounded mb-4 animate-pulse"></div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${Array.from({ length: 3 }, () => `
              <div class="p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 animate-pulse">
                <div class="w-full h-32 bg-gray-200 dark:bg-gray-700 rounded-md mb-3"></div>
                <div class="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
                <div class="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;
  }

  private getTrendIcon(trend: string): string {
    switch (trend) {
      case 'rising':
        return '<svg class="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 10l7-7m0 0l7 7m-7-7v18"></path></svg>';
      case 'declining':
        return '<svg class="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3"></path></svg>';
      default:
        return '<svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14"></path></svg>';
    }
  }

  private getPriorityIcon(priority: string): string {
    switch (priority) {
      case 'high':
        return '<div class="shrink-0 w-2 h-2 mt-2 rounded-full bg-red-500" aria-label="High priority"></div>';
      case 'medium':
        return '<div class="shrink-0 w-2 h-2 mt-2 rounded-full bg-yellow-500" aria-label="Medium priority"></div>';
      default:
        return '<div class="shrink-0 w-2 h-2 mt-2 rounded-full bg-blue-400" aria-label="Low priority"></div>';
    }
  }

  private attachEventListeners(): void {
    // Trending search clicks
    this.element.querySelectorAll('[data-action="search-trending"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const query = (btn as HTMLElement).dataset.query;
        if (query) {
          this.navigateToSearch(query);
        }
      });
    });
  }

  private navigateToSearch(query: string): void {
    window.location.href = `/search?q=${encodeURIComponent(query)}`;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  private escapeAttr(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
