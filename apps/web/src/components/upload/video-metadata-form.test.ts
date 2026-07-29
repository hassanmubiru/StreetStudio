/**
 * Unit Tests for Video Metadata Form
 * 
 * Tests form validation, submission, tag management, and accessibility.
 * 
 * Requirements: 3.9, 4.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VideoMetadataForm } from './video-metadata-form.js';
import type { VideoMetadataFormData, VideoMetadataFormConfig } from './video-metadata-form.js';

// Mock dependencies
vi.mock('../../services/api.js', () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: { projects: [], tags: [] } })
  }
}));

vi.mock('../../app/client-logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  }
}));

describe('VideoMetadataForm', () => {
  let container: HTMLElement;
  let form: VideoMetadataForm;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.clearAllMocks();
  });

  afterEach(() => {
    if (form) form.destroy();
    document.body.removeChild(container);
  });

  describe('Initialization', () => {
    it('should render form with all fields', () => {
      form = new VideoMetadataForm(container);

      expect(container.querySelector('#video-title')).toBeTruthy();
      expect(container.querySelector('#video-description')).toBeTruthy();
      expect(container.querySelector('#video-project')).toBeTruthy();
      expect(container.querySelector('#tag-input')).toBeTruthy();
      expect(container.querySelector('#video-private')).toBeTruthy();
      expect(container.querySelector('#video-developer-mode')).toBeTruthy();
    });

    it('should populate with initial data', () => {
      form = new VideoMetadataForm(container, {
        initialData: {
          title: 'My Video',
          description: 'A test video',
          isPrivate: true,
          tags: ['demo']
        }
      });

      const titleInput = container.querySelector('#video-title') as HTMLInputElement;
      const descInput = container.querySelector('#video-description') as HTMLTextAreaElement;
      const privateCheckbox = container.querySelector('#video-private') as HTMLInputElement;

      expect(titleInput.value).toBe('My Video');
      expect(descInput.value).toBe('A test video');
      expect(privateCheckbox.checked).toBe(true);
    });

    it('should hide developer mode when configured', () => {
      form = new VideoMetadataForm(container, {
        showDeveloperMode: false
      });

      expect(container.querySelector('#video-developer-mode')).toBeFalsy();
    });

    it('should render project options', () => {
      form = new VideoMetadataForm(container, {
        projects: [
          { id: 'proj-1' as any, name: 'Project Alpha' },
          { id: 'proj-2' as any, name: 'Project Beta' }
        ]
      });

      const select = container.querySelector('#video-project') as HTMLSelectElement;
      expect(select.options.length).toBe(3); // "No project" + 2 projects
      expect(select.options[1].textContent).toBe('Project Alpha');
      expect(select.options[2].textContent).toBe('Project Beta');
    });
  });

  describe('Title Validation', () => {
    beforeEach(() => {
      form = new VideoMetadataForm(container);
    });

    it('should require title field', () => {
      const result = form.validate();
      expect(result.isValid).toBe(false);
      expect(result.errors.title).toBeDefined();
      expect(result.errors.title.length).toBeGreaterThan(0);
    });

    it('should accept valid title', () => {
      form.setFormData({ title: 'My Valid Title' });
      const result = form.validate();
      expect(result.isValid).toBe(true);
    });

    it('should reject title with HTML-like characters', () => {
      form.setFormData({ title: 'Title with <script>' });
      const result = form.validate();
      expect(result.isValid).toBe(false);
      expect(result.errors.title).toBeDefined();
    });

    it('should reject title with curly braces', () => {
      form.setFormData({ title: 'Title with {injection}' });
      const result = form.validate();
      expect(result.isValid).toBe(false);
    });

    it('should reject title exceeding 255 characters', () => {
      form.setFormData({ title: 'a'.repeat(256) });
      const result = form.validate();
      expect(result.isValid).toBe(false);
      expect(result.errors.title).toBeDefined();
    });

    it('should accept title at exactly 255 characters', () => {
      form.setFormData({ title: 'a'.repeat(255) });
      const result = form.validate();
      expect(result.isValid).toBe(true);
    });
  });

  describe('Description Validation', () => {
    beforeEach(() => {
      form = new VideoMetadataForm(container, {
        initialData: { title: 'Valid Title' }
      });
    });

    it('should allow empty description', () => {
      form.setFormData({ description: '' });
      const result = form.validate();
      expect(result.isValid).toBe(true);
    });

    it('should reject description exceeding 2000 characters', () => {
      form.setFormData({ description: 'a'.repeat(2001) });
      const result = form.validate();
      expect(result.isValid).toBe(false);
      expect(result.errors.description).toBeDefined();
    });

    it('should reject description with HTML-like characters', () => {
      form.setFormData({ description: 'Description with <div>html</div>' });
      const result = form.validate();
      expect(result.isValid).toBe(false);
    });

    it('should accept valid description', () => {
      form.setFormData({ description: 'A valid description of my video.' });
      const result = form.validate();
      expect(result.isValid).toBe(true);
    });
  });
