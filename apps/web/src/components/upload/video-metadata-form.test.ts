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

  describe('Form Submission', () => {
    it('should call onSubmit with valid form data', () => {
      const onSubmit = vi.fn();
      form = new VideoMetadataForm(container, {
        initialData: { title: 'Test Video' },
        onSubmit
      });

      const formEl = container.querySelector('form') as HTMLFormElement;
      formEl.dispatchEvent(new Event('submit', { bubbles: true }));

      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Test Video',
        description: '',
        projectId: null,
        tags: [],
        isPrivate: false,
        developerMode: false
      }));
    });

    it('should not call onSubmit with invalid data', () => {
      const onSubmit = vi.fn();
      form = new VideoMetadataForm(container, { onSubmit });

      const formEl = container.querySelector('form') as HTMLFormElement;
      formEl.dispatchEvent(new Event('submit', { bubbles: true }));

      expect(onSubmit).not.toHaveBeenCalled();
    });

    it('should display validation errors on failed submission', () => {
      form = new VideoMetadataForm(container);

      const formEl = container.querySelector('form') as HTMLFormElement;
      formEl.dispatchEvent(new Event('submit', { bubbles: true }));

      const titleError = container.querySelector('#title-error');
      expect(titleError?.textContent).toBeTruthy();
    });
  });

  describe('Tag Management', () => {
    beforeEach(() => {
      form = new VideoMetadataForm(container, {
        initialData: { title: 'Video' },
        existingTags: [
          { name: 'tutorial', count: 5 },
          { name: 'demo', count: 3 },
          { name: 'testing', count: 1 }
        ]
      });
    });

    it('should add tags via Enter key', () => {
      const tagInput = container.querySelector('#tag-input') as HTMLInputElement;
      tagInput.value = 'newtag';
      tagInput.dispatchEvent(new Event('input', { bubbles: true }));

      const keyEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      tagInput.dispatchEvent(keyEvent);

      const data = form.getFormData();
      expect(data.tags).toContain('newtag');
    });

    it('should add tags via comma key', () => {
      const tagInput = container.querySelector('#tag-input') as HTMLInputElement;
      tagInput.value = 'commtag';
      tagInput.dispatchEvent(new Event('input', { bubbles: true }));

      const keyEvent = new KeyboardEvent('keydown', { key: ',', bubbles: true });
      tagInput.dispatchEvent(keyEvent);

      const data = form.getFormData();
      expect(data.tags).toContain('commtag');
    });

    it('should normalize tags to lowercase', () => {
      const tagInput = container.querySelector('#tag-input') as HTMLInputElement;
      tagInput.value = 'MyTag';
      tagInput.dispatchEvent(new Event('input', { bubbles: true }));

      const keyEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      tagInput.dispatchEvent(keyEvent);

      const data = form.getFormData();
      expect(data.tags).toContain('mytag');
    });

    it('should prevent duplicate tags', () => {
      form.setFormData({ title: 'Video', tags: ['existing'] });

      const tagInput = container.querySelector('#tag-input') as HTMLInputElement;
      tagInput.value = 'existing';
      tagInput.dispatchEvent(new Event('input', { bubbles: true }));

      const keyEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
      tagInput.dispatchEvent(keyEvent);

      const data = form.getFormData();
      const existingCount = data.tags.filter(t => t === 'existing').length;
      expect(existingCount).toBe(1);
    });

    it('should remove tags when remove button is clicked', () => {
      form.setFormData({ title: 'Video', tags: ['tag1', 'tag2'] });

      const removeBtn = container.querySelector('.tag-remove') as HTMLButtonElement;
      removeBtn?.click();

      const data = form.getFormData();
      expect(data.tags.length).toBeLessThan(2);
    });

    it('should remove last tag on backspace with empty input', () => {
      form.setFormData({ title: 'Video', tags: ['alpha', 'beta'] });

      const tagInput = container.querySelector('#tag-input') as HTMLInputElement;
      tagInput.value = '';

      const keyEvent = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true });
      tagInput.dispatchEvent(keyEvent);

      const data = form.getFormData();
      expect(data.tags).not.toContain('beta');
    });

    it('should show tag suggestions on input', () => {
      const tagInput = container.querySelector('#tag-input') as HTMLInputElement;
      tagInput.value = 'tut';
      tagInput.dispatchEvent(new Event('input', { bubbles: true }));

      const suggestions = container.querySelector('#tag-suggestions');
      expect(suggestions?.style.display).toBe('block');
      expect(suggestions?.textContent).toContain('tutorial');
    });

    it('should hide suggestions on Escape', () => {
      const tagInput = container.querySelector('#tag-input') as HTMLInputElement;
      tagInput.value = 'tut';
      tagInput.dispatchEvent(new Event('input', { bubbles: true }));

      const keyEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      tagInput.dispatchEvent(keyEvent);

      const suggestions = container.querySelector('#tag-suggestions');
      expect(suggestions?.style.display).toBe('none');
    });
  });

  describe('Change Notifications', () => {
    it('should call onChange when title changes', () => {
      const onChange = vi.fn();
      form = new VideoMetadataForm(container, { onChange });

      const titleInput = container.querySelector('#video-title') as HTMLInputElement;
      titleInput.value = 'New Title';
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));

      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
        title: 'New Title'
      }));
    });

    it('should call onChange when privacy toggle changes', () => {
      const onChange = vi.fn();
      form = new VideoMetadataForm(container, { onChange });

      const privateCheckbox = container.querySelector('#video-private') as HTMLInputElement;
      privateCheckbox.checked = true;
      privateCheckbox.dispatchEvent(new Event('change', { bubbles: true }));

      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
        isPrivate: true
      }));
    });

    it('should call onChange when project selection changes', () => {
      const onChange = vi.fn();
      form = new VideoMetadataForm(container, {
        onChange,
        projects: [{ id: 'proj-1' as any, name: 'Project' }]
      });

      const select = container.querySelector('#video-project') as HTMLSelectElement;
      select.value = 'proj-1';
      select.dispatchEvent(new Event('change', { bubbles: true }));

      expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
        projectId: 'proj-1'
      }));
    });
  });

  describe('Public API', () => {
    beforeEach(() => {
      form = new VideoMetadataForm(container, {
        initialData: { title: 'Original Title' }
      });
    });

    it('should return current form data', () => {
      const data = form.getFormData();
      expect(data.title).toBe('Original Title');
      expect(data.tags).toEqual([]);
      expect(data.isPrivate).toBe(false);
    });

    it('should update form data programmatically', () => {
      form.setFormData({
        title: 'Updated Title',
        isPrivate: true,
        tags: ['new-tag']
      });

      const data = form.getFormData();
      expect(data.title).toBe('Updated Title');
      expect(data.isPrivate).toBe(true);
      expect(data.tags).toContain('new-tag');
    });

    it('should check form validity', () => {
      expect(form.isValid()).toBe(true);

      form.setFormData({ title: '' });
      expect(form.isValid()).toBe(false);
    });

    it('should reset form to initial state', () => {
      form.setFormData({ title: 'Modified', tags: ['tag1'] });
      form.reset();

      const data = form.getFormData();
      expect(data.title).toBe('');
      expect(data.tags).toEqual([]);
      expect(data.isPrivate).toBe(false);
    });

    it('should update available projects', () => {
      form.setProjects([
        { id: 'new-proj' as any, name: 'New Project' }
      ]);

      const select = container.querySelector('#video-project') as HTMLSelectElement;
      expect(select.options.length).toBe(2); // "No project" + new project
    });

    it('should update available tags for autocomplete', () => {
      form.setAvailableTags([
        { name: 'custom-tag', count: 10 }
      ]);

      // Trigger tag search
      const tagInput = container.querySelector('#tag-input') as HTMLInputElement;
      tagInput.value = 'custom';
      tagInput.dispatchEvent(new Event('input', { bubbles: true }));

      const suggestions = container.querySelector('#tag-suggestions');
      expect(suggestions?.textContent).toContain('custom-tag');
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      form = new VideoMetadataForm(container);
    });

    it('should have aria-label on form', () => {
      const formEl = container.querySelector('form');
      expect(formEl?.getAttribute('aria-label')).toBe('Video metadata');
    });

    it('should mark title as required with aria-required', () => {
      const titleInput = container.querySelector('#video-title');
      expect(titleInput?.getAttribute('aria-required')).toBe('true');
    });

    it('should set aria-invalid on validation error', () => {
      // Trigger validation
      const formEl = container.querySelector('form') as HTMLFormElement;
      formEl.dispatchEvent(new Event('submit', { bubbles: true }));

      const titleInput = container.querySelector('#video-title');
      expect(titleInput?.getAttribute('aria-invalid')).toBe('true');
    });

    it('should have role=switch on toggle inputs', () => {
      const privateInput = container.querySelector('#video-private');
      expect(privateInput?.getAttribute('role')).toBe('switch');
    });

    it('should have combobox role on tag input', () => {
      const tagInput = container.querySelector('#tag-input');
      expect(tagInput?.getAttribute('role')).toBe('combobox');
    });

    it('should update aria-expanded on tag suggestions', () => {
      const tagInput = container.querySelector('#tag-input') as HTMLInputElement;
      expect(tagInput?.getAttribute('aria-expanded')).toBe('false');
    });

    it('should have aria-label on tag remove buttons', () => {
      form.setFormData({ title: 'Video', tags: ['mytag'] });

      const removeBtn = container.querySelector('.tag-remove');
      expect(removeBtn?.getAttribute('aria-label')).toContain('Remove tag');
    });
  });

  describe('Character Counter', () => {
    beforeEach(() => {
      form = new VideoMetadataForm(container);
    });

    it('should show character count for title', () => {
      const countEl = container.querySelector('#title-char-count');
      expect(countEl?.textContent).toBe('0/255');
    });

    it('should update character count on input', () => {
      const titleInput = container.querySelector('#video-title') as HTMLInputElement;
      titleInput.value = 'Hello';
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));

      const countEl = container.querySelector('#title-char-count');
      expect(countEl?.textContent).toBe('5/255');
    });
  });
});
