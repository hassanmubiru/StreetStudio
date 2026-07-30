/**
 * Unit Tests: Contextual Help Service
 * 
 * Tests FAQ search, contextual tips, support contacts,
 * and help panel rendering.
 */

// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ContextualHelpService, type HelpArticle, type ContextualTip } from './contextual-help.js';

// Mock logger
vi.mock('../../app/client-logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('ContextualHelpService', () => {
  let service: ContextualHelpService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ContextualHelpService();
  });

  afterEach(() => {
    service.closeHelpPanel();
    document.body.innerHTML = '';
  });

  describe('searchArticles', () => {
    it('returns all articles for empty query', () => {
      const results = service.searchArticles('');
      expect(results.length).toBeGreaterThan(0);
    });

    it('finds articles matching search terms', () => {
      const results = service.searchArticles('recording');
      expect(results.length).toBeGreaterThan(0);
      
      // First result should be most relevant
      const titles = results.map(r => r.title.toLowerCase());
      expect(titles.some(t => t.includes('recording'))).toBe(true);
    });

    it('finds articles by tag', () => {
      const results = service.searchArticles('upload error');
      expect(results.length).toBeGreaterThan(0);
    });

    it('returns empty array for no matches', () => {
      const results = service.searchArticles('xyznonexistentquery');
      expect(results).toHaveLength(0);
    });

    it('ranks results by relevance (more term matches higher)', () => {
      const results = service.searchArticles('video playback buffer quality');
      
      // The buffering/playback article should rank high
      if (results.length > 0) {
        expect(results[0].tags).toContain('playback');
      }
    });

    it('searches case-insensitively', () => {
      const results1 = service.searchArticles('Recording');
      const results2 = service.searchArticles('recording');
      expect(results1.length).toBe(results2.length);
    });
  });

  describe('getTipsForPage', () => {
    it('returns tips for matching page', () => {
      const tips = service.getTipsForPage('/dashboard');
      expect(tips.length).toBeGreaterThan(0);
      expect(tips[0].page).toBe('/dashboard');
    });

    it('returns empty array for page with no tips', () => {
      const tips = service.getTipsForPage('/nonexistent-page');
      expect(tips).toHaveLength(0);
    });

    it('excludes dismissed tips', () => {
      service.dismissTip('tip-dashboard-shortcuts');
      const tips = service.getTipsForPage('/dashboard');
      const dismissed = tips.find(t => t.id === 'tip-dashboard-shortcuts');
      expect(dismissed).toBeUndefined();
    });

    it('uses current window.location when no page provided', () => {
      // window.location.pathname is typically '/' in test environment
      const tips = service.getTipsForPage();
      // Should not throw
      expect(Array.isArray(tips)).toBe(true);
    });
  });

  describe('getArticlesForPage', () => {
    it('returns relevant articles for a page', () => {
      const articles = service.getArticlesForPage('/recordings');
      expect(articles.length).toBeGreaterThan(0);
    });

    it('returns empty array for page with no related articles', () => {
      const articles = service.getArticlesForPage('/nonexistent');
      expect(articles).toHaveLength(0);
    });
  });

  describe('dismissTip', () => {
    it('persists dismissed tip to localStorage', () => {
      service.dismissTip('tip-1');
      
      const stored = localStorage.getItem('streetstudio_dismissed_tips');
      expect(stored).toBeTruthy();
      expect(JSON.parse(stored!)).toContain('tip-1');
    });

    it('prevents dismissed tip from showing again', () => {
      const tipsBeforeDismiss = service.getTipsForPage('/dashboard');
      const tipToRemove = tipsBeforeDismiss[0];
      
      if (tipToRemove) {
        service.dismissTip(tipToRemove.id);
        const tipsAfterDismiss = service.getTipsForPage('/dashboard');
        expect(tipsAfterDismiss.find(t => t.id === tipToRemove.id)).toBeUndefined();
      }
    });
  });

  describe('getSupportContacts', () => {
    it('returns default support contacts', () => {
      const contacts = service.getSupportContacts();
      expect(contacts.length).toBeGreaterThan(0);
      
      const types = contacts.map(c => c.type);
      expect(types).toContain('email');
      expect(types).toContain('docs');
    });

    it('support contacts have required fields', () => {
      const contacts = service.getSupportContacts();
      contacts.forEach(contact => {
        expect(contact.type).toBeTruthy();
        expect(contact.label).toBeTruthy();
        expect(contact.url).toBeTruthy();
        expect(contact.description).toBeTruthy();
        expect(contact.icon).toBeTruthy();
      });
    });
  });

  describe('showHelpPanel', () => {
    it('creates and appends help panel to body', () => {
      service.showHelpPanel();

      const panel = document.querySelector('.help-panel-overlay');
      expect(panel).toBeTruthy();
    });

    it('panel has search input', () => {
      service.showHelpPanel();

      const searchInput = document.querySelector('#help-search');
      expect(searchInput).toBeTruthy();
    });

    it('panel has close button', () => {
      service.showHelpPanel();

      const closeBtn = document.querySelector('#help-close');
      expect(closeBtn).toBeTruthy();
    });

    it('close button removes the panel', () => {
      service.showHelpPanel();
      
      const closeBtn = document.querySelector('#help-close') as HTMLButtonElement;
      closeBtn.click();

      expect(document.querySelector('.help-panel-overlay')).toBeFalsy();
    });

    it('toggling showHelpPanel closes existing panel', () => {
      service.showHelpPanel();
      expect(service.isHelpPanelOpen()).toBe(true);

      service.showHelpPanel(); // Should close
      expect(service.isHelpPanelOpen()).toBe(false);
    });

    it('Escape key closes the panel', () => {
      service.showHelpPanel();
      
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(document.querySelector('.help-panel-overlay')).toBeFalsy();
    });

    it('search filters articles in the panel', () => {
      service.showHelpPanel();
      
      const searchInput = document.querySelector('#help-search') as HTMLInputElement;
      searchInput.value = 'recording';
      searchInput.dispatchEvent(new Event('input'));

      const articleList = document.querySelector('#help-article-list');
      expect(articleList?.innerHTML).toContain('recording');
    });

    it('displays contextual tips for current page', () => {
      // Mock location for dashboard
      Object.defineProperty(window, 'location', {
        value: { pathname: '/dashboard', href: 'http://localhost/dashboard' },
        configurable: true,
      });

      const serviceWithTips = new ContextualHelpService();
      serviceWithTips.showHelpPanel();

      const tipsSection = document.querySelector('#help-tips');
      expect(tipsSection).toBeTruthy();
    });
  });

  describe('closeHelpPanel', () => {
    it('removes panel from DOM', () => {
      service.showHelpPanel();
      service.closeHelpPanel();

      expect(document.querySelector('.help-panel-overlay')).toBeFalsy();
    });

    it('sets isHelpPanelOpen to false', () => {
      service.showHelpPanel();
      expect(service.isHelpPanelOpen()).toBe(true);

      service.closeHelpPanel();
      expect(service.isHelpPanelOpen()).toBe(false);
    });

    it('does nothing if panel is not open', () => {
      // Should not throw
      service.closeHelpPanel();
      expect(service.isHelpPanelOpen()).toBe(false);
    });
  });

  describe('accessibility', () => {
    it('help panel has dialog role', () => {
      service.showHelpPanel();
      const panel = document.querySelector('.help-panel-overlay');
      expect(panel?.getAttribute('role')).toBe('dialog');
      expect(panel?.getAttribute('aria-modal')).toBe('true');
    });

    it('help panel has labeled title', () => {
      service.showHelpPanel();
      const panel = document.querySelector('.help-panel-overlay');
      expect(panel?.getAttribute('aria-labelledby')).toBe('help-panel-title');
      expect(document.querySelector('#help-panel-title')).toBeTruthy();
    });

    it('search input has aria-label', () => {
      service.showHelpPanel();
      const searchInput = document.querySelector('#help-search');
      expect(searchInput?.getAttribute('aria-label')).toBe('Search help articles');
    });

    it('close button has aria-label', () => {
      service.showHelpPanel();
      const closeBtn = document.querySelector('#help-close');
      expect(closeBtn?.getAttribute('aria-label')).toBe('Close help panel');
    });
  });

  describe('custom configuration', () => {
    it('uses custom articles', () => {
      const customArticles: HelpArticle[] = [
        { id: 'custom-1', title: 'Custom Article', content: 'Custom content', category: 'Custom', tags: ['custom'], relatedPages: [] },
      ];

      const customService = new ContextualHelpService({ articles: customArticles });
      const results = customService.searchArticles('custom');
      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Custom Article');
    });

    it('uses custom support contacts', () => {
      const customContacts = [
        { type: 'email' as const, label: 'Custom Support', url: 'mailto:custom@test.com', description: 'Custom support', icon: '📧' },
      ];

      const customService = new ContextualHelpService({ supportContacts: customContacts });
      const contacts = customService.getSupportContacts();
      expect(contacts).toHaveLength(1);
      expect(contacts[0].label).toBe('Custom Support');
    });

    it('calls onArticleView when article is expanded', () => {
      const onArticleView = vi.fn();
      const customService = new ContextualHelpService({ onArticleView });
      customService.showHelpPanel();

      const firstArticle = document.querySelector('.help-article') as HTMLDetailsElement;
      if (firstArticle) {
        firstArticle.open = true;
        firstArticle.dispatchEvent(new Event('toggle'));
        expect(onArticleView).toHaveBeenCalled();
      }
    });
  });
});
