/**
 * Contextual Help and Support Contact Integration
 * 
 * Help panel component with FAQ search, support contact links,
 * and contextual tips based on current page.
 * 
 * Implements Requirement 13.8.
 */

import { logger } from '../../app/client-logger.js';

export interface HelpArticle {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  relatedPages: string[];
}

export interface SupportContact {
  type: 'email' | 'chat' | 'docs' | 'community';
  label: string;
  url: string;
  description: string;
  icon: string;
}

export interface ContextualTip {
  id: string;
  page: string;
  title: string;
  content: string;
  dismissible: boolean;
}

export interface ContextualHelpConfig {
  articles: HelpArticle[];
  supportContacts: SupportContact[];
  contextualTips: ContextualTip[];
  docsBaseUrl: string;
  supportEmail: string;
  onArticleView?: (article: HelpArticle) => void;
}

const DEFAULT_SUPPORT_CONTACTS: SupportContact[] = [
  {
    type: 'email',
    label: 'Email Support',
    url: 'mailto:support@streetstudio.com',
    description: 'Get help from our support team (response within 24h)',
    icon: '✉️',
  },
  {
    type: 'docs',
    label: 'Documentation',
    url: 'https://docs.streetstudio.com',
    description: 'Browse guides, tutorials, and API docs',
    icon: '📖',
  },
  {
    type: 'community',
    label: 'Community Forum',
    url: 'https://community.streetstudio.com',
    description: 'Ask questions and share with other users',
    icon: '💬',
  },
  {
    type: 'chat',
    label: 'Live Chat',
    url: '#live-chat',
    description: 'Chat with our team (business hours)',
    icon: '🗨️',
  },
];

const DEFAULT_FAQ: HelpArticle[] = [
  {
    id: 'faq-recording',
    title: 'How do I start a recording?',
    content: 'Navigate to the Recording page or click the record button in the top bar. Select the screen, window, or tab you want to capture, then click Start Recording.',
    category: 'Recording',
    tags: ['recording', 'capture', 'screen', 'start'],
    relatedPages: ['/recordings', '/dashboard'],
  },
  {
    id: 'faq-upload',
    title: 'My upload keeps failing. What should I do?',
    content: 'Upload failures are usually caused by network issues. Try: 1) Check your internet connection, 2) Refresh the page, 3) Try uploading a smaller file first. Uploads automatically resume from where they left off.',
    category: 'Uploads',
    tags: ['upload', 'error', 'fail', 'network'],
    relatedPages: ['/recordings', '/projects'],
  },
  {
    id: 'faq-playback',
    title: 'Video is buffering or not playing',
    content: 'If video playback is slow, try: 1) Lower the quality setting, 2) Check your internet speed, 3) Close other browser tabs using bandwidth. The player automatically adjusts quality based on your connection.',
    category: 'Playback',
    tags: ['video', 'playback', 'buffer', 'quality', 'slow'],
    relatedPages: ['/review', '/projects'],
  },
  {
    id: 'faq-collaboration',
    title: 'How do I share a video with my team?',
    content: 'Open the video and click the Share button. You can invite team members by email, generate a share link, or add the video to a project that your team has access to.',
    category: 'Collaboration',
    tags: ['share', 'team', 'collaborate', 'invite'],
    relatedPages: ['/review', '/projects', '/settings'],
  },
  {
    id: 'faq-offline',
    title: 'Can I use StreetStudio offline?',
    content: 'Some features work offline: you can view previously loaded videos, compose comments (they sync when online), and access cached content. Recording and uploading require an internet connection.',
    category: 'General',
    tags: ['offline', 'connection', 'network'],
    relatedPages: ['/dashboard', '/settings'],
  },
  {
    id: 'faq-permissions',
    title: 'I can\'t access a feature or page',
    content: 'Access is controlled by your organization role. Contact your admin to request access, or check Settings > Account to see your current permissions.',
    category: 'Account',
    tags: ['permission', 'access', 'role', 'admin', 'denied'],
    relatedPages: ['/settings', '/organization'],
  },
  {
    id: 'faq-editor',
    title: 'How do I trim or edit a video?',
    content: 'Open a video and click Edit. Use the timeline handles to set trim points, or position the playhead and click Split. Changes are previewed in real-time and don\'t affect the original until you export.',
    category: 'Editing',
    tags: ['edit', 'trim', 'cut', 'split', 'timeline'],
    relatedPages: ['/editor'],
  },
  {
    id: 'faq-error-report',
    title: 'How do I report a bug?',
    content: 'Click the Help button and select "Report a Problem". Describe what happened, and we\'ll include relevant context to help our team investigate. You can also email support@streetstudio.com directly.',
    category: 'General',
    tags: ['bug', 'report', 'problem', 'feedback', 'error'],
    relatedPages: [],
  },
];

const DEFAULT_TIPS: ContextualTip[] = [
  {
    id: 'tip-dashboard-shortcuts',
    page: '/dashboard',
    title: 'Keyboard shortcuts',
    content: 'Press Ctrl+K (or Cmd+K on Mac) to quickly search across all your content.',
    dismissible: true,
  },
  {
    id: 'tip-recording-quality',
    page: '/recordings',
    title: 'Recording quality',
    content: 'For best quality, close unnecessary browser tabs before recording. This frees up system resources.',
    dismissible: true,
  },
  {
    id: 'tip-editor-undo',
    page: '/editor',
    title: 'Undo/Redo',
    content: 'Use Ctrl+Z to undo and Ctrl+Shift+Z to redo. All edits are non-destructive until you export.',
    dismissible: true,
  },
  {
    id: 'tip-review-comments',
    page: '/review',
    title: 'Timestamp comments',
    content: 'Click anywhere on the timeline to add a comment at that exact moment in the video.',
    dismissible: true,
  },
];

export class ContextualHelpService {
  private config: ContextualHelpConfig;
  private dismissedTips: Set<string> = new Set();
  private helpPanelElement: HTMLElement | null = null;

  constructor(config?: Partial<ContextualHelpConfig>) {
    this.config = {
      articles: config?.articles || DEFAULT_FAQ,
      supportContacts: config?.supportContacts || DEFAULT_SUPPORT_CONTACTS,
      contextualTips: config?.contextualTips || DEFAULT_TIPS,
      docsBaseUrl: config?.docsBaseUrl || 'https://docs.streetstudio.com',
      supportEmail: config?.supportEmail || 'support@streetstudio.com',
      onArticleView: config?.onArticleView,
    };

    this.loadDismissedTips();
  }

  private loadDismissedTips(): void {
    try {
      const stored = localStorage.getItem('streetstudio_dismissed_tips');
      if (stored) {
        const tips = JSON.parse(stored) as string[];
        tips.forEach(id => this.dismissedTips.add(id));
      }
    } catch {
      // Ignore storage errors
    }
  }

  private saveDismissedTips(): void {
    try {
      localStorage.setItem(
        'streetstudio_dismissed_tips',
        JSON.stringify(Array.from(this.dismissedTips))
      );
    } catch {
      // Ignore storage errors
    }
  }

  /**
   * Search FAQ articles
   */
  public searchArticles(query: string): HelpArticle[] {
    if (!query.trim()) return this.config.articles;

    const terms = query.toLowerCase().split(/\s+/);

    return this.config.articles
      .map(article => {
        const searchText = `${article.title} ${article.content} ${article.tags.join(' ')} ${article.category}`.toLowerCase();
        const score = terms.reduce((acc, term) => acc + (searchText.includes(term) ? 1 : 0), 0);
        return { article, score };
      })
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.article);
  }

  /**
   * Get contextual tips for the current page
   */
  public getTipsForPage(page?: string): ContextualTip[] {
    const currentPage = page || window.location.pathname;

    return this.config.contextualTips.filter(tip => {
      if (this.dismissedTips.has(tip.id)) return false;
      return currentPage.startsWith(tip.page);
    });
  }

  /**
   * Get relevant articles for the current page
   */
  public getArticlesForPage(page?: string): HelpArticle[] {
    const currentPage = page || window.location.pathname;

    return this.config.articles.filter(article =>
      article.relatedPages.some(relatedPage => currentPage.startsWith(relatedPage))
    );
  }

  /**
   * Dismiss a contextual tip
   */
  public dismissTip(tipId: string): void {
    this.dismissedTips.add(tipId);
    this.saveDismissedTips();
  }

  /**
   * Get support contacts
   */
  public getSupportContacts(): SupportContact[] {
    return this.config.supportContacts;
  }

  /**
   * Show the help panel
   */
  public showHelpPanel(): void {
    if (this.helpPanelElement) {
      this.closeHelpPanel();
      return;
    }

    this.helpPanelElement = this.createHelpPanelElement();
    document.body.appendChild(this.helpPanelElement);

    // Focus search input
    const searchInput = this.helpPanelElement.querySelector('#help-search') as HTMLInputElement;
    if (searchInput) {
      setTimeout(() => searchInput.focus(), 100);
    }
  }

  /**
   * Close the help panel
   */
  public closeHelpPanel(): void {
    if (this.helpPanelElement && this.helpPanelElement.parentNode) {
      this.helpPanelElement.parentNode.removeChild(this.helpPanelElement);
    }
    this.helpPanelElement = null;
  }

  /**
   * Check if help panel is open
   */
  public isHelpPanelOpen(): boolean {
    return this.helpPanelElement !== null;
  }

  private createHelpPanelElement(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'help-panel-overlay';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'help-panel-title');
    panel.style.cssText = `
      position: fixed;
      top: 0;
      right: 0;
      bottom: 0;
      width: 400px;
      max-width: 100vw;
      background: white;
      box-shadow: -4px 0 20px rgba(0, 0, 0, 0.15);
      z-index: 9999;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    `;

    const currentTips = this.getTipsForPage();
    const pageArticles = this.getArticlesForPage();

    panel.innerHTML = `
      <div style="padding: 20px; border-bottom: 1px solid #E5E7EB;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
          <h2 id="help-panel-title" style="font-size: 18px; font-weight: 600; color: #111827; margin: 0;">
            Help & Support
          </h2>
          <button id="help-close" aria-label="Close help panel" style="
            background: none;
            border: none;
            cursor: pointer;
            padding: 4px;
            color: #6B7280;
            border-radius: 4px;
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <div style="position: relative;">
          <input 
            type="text" 
            id="help-search" 
            placeholder="Search help articles..."
            aria-label="Search help articles"
            style="
              width: 100%;
              padding: 10px 12px 10px 36px;
              border: 1px solid #D1D5DB;
              border-radius: 8px;
              font-size: 14px;
              color: #374151;
              box-sizing: border-box;
            "
          />
          <svg style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #9CA3AF;" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/>
            <path d="M21 21l-4.35-4.35"/>
          </svg>
        </div>
      </div>

      <div id="help-content" style="flex: 1; overflow-y: auto; padding: 16px 20px;">
        ${currentTips.length > 0 ? `
          <div id="help-tips" style="margin-bottom: 20px;">
            <h3 style="font-size: 12px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px;">
              Tips for this page
            </h3>
            ${currentTips.map(tip => `
              <div class="help-tip" data-tip-id="${tip.id}" style="
                background: #EFF6FF;
                border: 1px solid #BFDBFE;
                border-radius: 8px;
                padding: 12px;
                margin-bottom: 8px;
              ">
                <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                  <div>
                    <p style="font-size: 13px; font-weight: 500; color: #1E40AF; margin: 0 0 4px;">${this.escapeHtml(tip.title)}</p>
                    <p style="font-size: 13px; color: #3B82F6; margin: 0;">${this.escapeHtml(tip.content)}</p>
                  </div>
                  ${tip.dismissible ? `
                    <button class="dismiss-tip" data-tip-id="${tip.id}" aria-label="Dismiss tip" style="
                      background: none;
                      border: none;
                      cursor: pointer;
                      padding: 2px;
                      color: #93C5FD;
                      flex-shrink: 0;
                      margin-left: 8px;
                    ">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"/>
                      </svg>
                    </button>
                  ` : ''}
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}

        <div id="help-articles">
          <h3 style="font-size: 12px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 8px;">
            ${pageArticles.length > 0 ? 'Relevant articles' : 'Frequently asked questions'}
          </h3>
          <div id="help-article-list">
            ${this.renderArticles(pageArticles.length > 0 ? pageArticles : this.config.articles)}
          </div>
        </div>
      </div>

      <div style="padding: 16px 20px; border-top: 1px solid #E5E7EB; background: #F9FAFB;">
        <h3 style="font-size: 12px; font-weight: 600; color: #6B7280; text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 12px;">
          Contact Support
        </h3>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
          ${this.config.supportContacts.map(contact => `
            <a href="${contact.url}" 
               ${contact.type !== 'chat' ? 'target="_blank" rel="noopener noreferrer"' : ''}
               class="support-contact"
               style="
                 display: flex;
                 align-items: center;
                 gap: 8px;
                 padding: 8px 12px;
                 background: white;
                 border: 1px solid #E5E7EB;
                 border-radius: 6px;
                 text-decoration: none;
                 color: #374151;
                 font-size: 13px;
                 transition: border-color 0.2s;
               "
               title="${contact.description}"
            >
              <span>${contact.icon}</span>
              <span>${contact.label}</span>
            </a>
          `).join('')}
        </div>
      </div>
    `;

    this.attachPanelListeners(panel);
    return panel;
  }

  private renderArticles(articles: HelpArticle[]): string {
    if (articles.length === 0) {
      return `
        <p style="color: #9CA3AF; font-size: 14px; text-align: center; padding: 20px 0;">
          No matching articles found. Try a different search term.
        </p>
      `;
    }

    return articles.map(article => `
      <details class="help-article" data-article-id="${article.id}" style="
        border: 1px solid #E5E7EB;
        border-radius: 8px;
        margin-bottom: 8px;
        overflow: hidden;
      ">
        <summary style="
          padding: 12px 16px;
          cursor: pointer;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
          list-style: none;
          display: flex;
          align-items: center;
          justify-content: space-between;
        ">
          <span>${this.escapeHtml(article.title)}</span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2" style="flex-shrink: 0; margin-left: 8px; transition: transform 0.2s;">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </summary>
        <div style="padding: 0 16px 12px; font-size: 13px; color: #6B7280; line-height: 1.6;">
          ${this.escapeHtml(article.content)}
          <div style="margin-top: 8px;">
            <span style="
              display: inline-block;
              padding: 2px 8px;
              background: #F3F4F6;
              border-radius: 4px;
              font-size: 11px;
              color: #6B7280;
            ">${article.category}</span>
          </div>
        </div>
      </details>
    `).join('');
  }

  private attachPanelListeners(panel: HTMLElement): void {
    // Close button
    const closeBtn = panel.querySelector('#help-close') as HTMLButtonElement;
    closeBtn.addEventListener('click', () => this.closeHelpPanel());

    // Search
    const searchInput = panel.querySelector('#help-search') as HTMLInputElement;
    searchInput.addEventListener('input', () => {
      const query = searchInput.value;
      const results = this.searchArticles(query);
      const articleList = panel.querySelector('#help-article-list') as HTMLElement;
      articleList.innerHTML = this.renderArticles(results);

      // Re-attach article listeners
      this.attachArticleListeners(panel);
    });

    // Dismiss tips
    const dismissBtns = panel.querySelectorAll('.dismiss-tip');
    dismissBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tipId = (btn as HTMLElement).dataset.tipId;
        if (tipId) {
          this.dismissTip(tipId);
          const tipElement = panel.querySelector(`[data-tip-id="${tipId}"]`) as HTMLElement;
          if (tipElement) {
            tipElement.style.display = 'none';
          }
        }
      });
    });

    // Article view tracking
    this.attachArticleListeners(panel);

    // Escape key
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.closeHelpPanel();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  }

  private attachArticleListeners(panel: HTMLElement): void {
    const articles = panel.querySelectorAll('.help-article');
    articles.forEach(articleEl => {
      articleEl.addEventListener('toggle', () => {
        if ((articleEl as HTMLDetailsElement).open) {
          const articleId = (articleEl as HTMLElement).dataset.articleId;
          const article = this.config.articles.find(a => a.id === articleId);
          if (article) {
            this.config.onArticleView?.(article);
            logger.debug('Help article viewed', { articleId: article.id, title: article.title });
          }
        }
      });
    });
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Singleton instance
let helpService: ContextualHelpService | null = null;

export function initializeContextualHelp(config?: Partial<ContextualHelpConfig>): ContextualHelpService {
  helpService = new ContextualHelpService(config);
  return helpService;
}

export function getContextualHelpService(): ContextualHelpService {
  if (!helpService) {
    helpService = new ContextualHelpService();
  }
  return helpService;
}
