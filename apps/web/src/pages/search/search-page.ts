/**
 * Search Page Component - Placeholder
 */
export class SearchPage {
  public getElement(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'p-8';
    container.setAttribute('data-main-content', '');
    container.innerHTML = `
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">Search</h1>
      <p class="text-gray-600 dark:text-gray-400">Search interface coming soon.</p>
    `;
    return container;
  }
}