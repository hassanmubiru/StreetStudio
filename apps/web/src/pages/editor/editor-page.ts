/**
 * Editor Page Component - Placeholder
 */
export class EditorPage {
  public getElement(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'p-8';
    container.setAttribute('data-main-content', '');
    container.innerHTML = `
      <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-4">Video Editor</h1>
      <p class="text-gray-600 dark:text-gray-400">Video editing interface coming soon.</p>
    `;
    return container;
  }
}