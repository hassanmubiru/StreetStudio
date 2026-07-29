/**
 * Unit Tests for Upload Metadata Form Validation
 * 
 * Tests the video upload validation schema, form validator behavior,
 * and metadata submission validation.
 * 
 * Requirements: 3.9
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  FormValidator,
  ValidationRules,
  ValidationSchemas,
  type ValidationResult,
  type ValidationSchema
} from './validation.js';

describe('Upload Metadata Form Validation', () => {
  let validator: FormValidator;

  beforeEach(() => {
    validator = new FormValidator(ValidationSchemas.videoUpload);
  });

  describe('Title Validation', () => {
    it('should require a title', () => {
      const result = validator.validate({ title: '', description: '', file: null });
      
      expect(result.isValid).toBe(false);
      expect(result.errors.title).toBeDefined();
      expect(result.errors.title).toContain('Title is required');
    });

    it('should reject null title', () => {
      const result = validator.validate({ title: null, description: '', file: null });

      expect(result.isValid).toBe(false);
      expect(result.errors.title).toBeDefined();
    });

    it('should reject whitespace-only title', () => {
      const result = validator.validate({ title: '   ', description: '', file: null });

      expect(result.isValid).toBe(false);
      expect(result.errors.title).toBeDefined();
    });

    it('should accept a valid title', () => {
      const mockFile = new File(['content'], 'video.mp4', { type: 'video/mp4' });
      const result = validator.validate({ title: 'My Video', description: '', file: mockFile });

      expect(result.errors.title).toBeUndefined();
    });

    it('should enforce maximum title length of 255 characters', () => {
      const longTitle = 'a'.repeat(256);
      const result = validator.validate({ title: longTitle, description: '', file: null });

      expect(result.isValid).toBe(false);
      expect(result.errors.title).toBeDefined();
      expect(result.errors.title!.some(e => e.includes('255') || e.includes('no more'))).toBe(true);
    });

    it('should accept title at maximum length', () => {
      const maxTitle = 'a'.repeat(255);
      const mockFile = new File(['content'], 'video.mp4', { type: 'video/mp4' });
      const result = validator.validate({ title: maxTitle, description: '', file: mockFile });

      expect(result.errors.title).toBeUndefined();
    });

    it('should reject titles containing < character', () => {
      const result = validator.validate({ title: 'Video <script>', description: '', file: null });

      expect(result.isValid).toBe(false);
      expect(result.errors.title).toBeDefined();
      expect(result.errors.title!.some(e => e.includes('<') || e.includes('>') || e.includes('{') || e.includes('}'))).toBe(true);
    });

    it('should reject titles containing > character', () => {
      const result = validator.validate({ title: 'Video > Other', description: '', file: null });

      expect(result.isValid).toBe(false);
      expect(result.errors.title).toBeDefined();
    });

    it('should reject titles containing { character', () => {
      const result = validator.validate({ title: 'Video {test}', description: '', file: null });

      expect(result.isValid).toBe(false);
      expect(result.errors.title).toBeDefined();
    });

    it('should reject titles containing } character', () => {
      const result = validator.validate({ title: 'Video }', description: '', file: null });

      expect(result.isValid).toBe(false);
      expect(result.errors.title).toBeDefined();
    });

    it('should accept titles with special but safe characters', () => {
      const mockFile = new File(['content'], 'video.mp4', { type: 'video/mp4' });
      const result = validator.validate({
        title: 'My Video - Episode 1 (2024) [Final]',
        description: '',
        file: mockFile
      });

      expect(result.errors.title).toBeUndefined();
    });
  });

  describe('Description Validation', () => {
    it('should allow empty descriptions', () => {
      const mockFile = new File(['content'], 'video.mp4', { type: 'video/mp4' });
      const result = validator.validate({ title: 'Valid Title', description: '', file: mockFile });

      expect(result.errors.description).toBeUndefined();
    });

    it('should allow null/undefined descriptions', () => {
      const mockFile = new File(['content'], 'video.mp4', { type: 'video/mp4' });
      const result = validator.validate({ title: 'Valid Title', file: mockFile });

      expect(result.errors.description).toBeUndefined();
    });

    it('should enforce maximum description length of 2000 characters', () => {
      const longDesc = 'x'.repeat(2001);
      const result = validator.validate({ title: 'Valid', description: longDesc, file: null });

      expect(result.errors.description).toBeDefined();
      expect(result.errors.description!.some(e => e.includes('2000') || e.includes('no more'))).toBe(true);
    });

    it('should accept description at maximum length', () => {
      const mockFile = new File(['content'], 'video.mp4', { type: 'video/mp4' });
      const maxDesc = 'x'.repeat(2000);
      const result = validator.validate({ title: 'Valid', description: maxDesc, file: mockFile });

      expect(result.errors.description).toBeUndefined();
    });

    it('should reject descriptions containing unsafe characters', () => {
      const result = validator.validate({
        title: 'Valid',
        description: 'Contains <script>alert("xss")</script>',
        file: null
      });

      expect(result.errors.description).toBeDefined();
    });

    it('should reject descriptions containing { } characters', () => {
      const result = validator.validate({
        title: 'Valid',
        description: 'Contains {injection}',
        file: null
      });

      expect(result.errors.description).toBeDefined();
    });
  });

  describe('File Validation', () => {
    it('should require a file', () => {
      const result = validator.validate({ title: 'Valid Title', description: '', file: null });

      expect(result.isValid).toBe(false);
      expect(result.errors.file).toBeDefined();
      expect(result.errors.file).toContain('Please select a video file');
    });

    it('should accept video files', () => {
      const videoFile = new File(['content'], 'video.mp4', { type: 'video/mp4' });
      const result = validator.validate({ title: 'Valid Title', description: '', file: videoFile });

      expect(result.errors.file).toBeUndefined();
    });

    it('should accept various video MIME types', () => {
      const types = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];

      types.forEach(type => {
        const file = new File(['content'], `video.${type.split('/')[1]}`, { type });
        const result = validator.validate({ title: 'Valid', description: '', file });
        expect(result.errors.file).toBeUndefined();
      });
    });

    it('should reject non-video file types', () => {
      const textFile = new File(['content'], 'document.txt', { type: 'text/plain' });
      const result = validator.validate({ title: 'Valid', description: '', file: textFile });

      expect(result.isValid).toBe(false);
      expect(result.errors.file).toBeDefined();
      expect(result.errors.file!.some(e => e.includes('video'))).toBe(true);
    });

    it('should reject image files', () => {
      const imageFile = new File(['content'], 'photo.jpg', { type: 'image/jpeg' });
      const result = validator.validate({ title: 'Valid', description: '', file: imageFile });

      expect(result.isValid).toBe(false);
      expect(result.errors.file).toBeDefined();
    });

    it('should reject files exceeding 2GB size limit', () => {
      const largeFile = new File(['content'], 'large.mp4', { type: 'video/mp4' });
      Object.defineProperty(largeFile, 'size', { value: 2.1 * 1024 * 1024 * 1024 });

      const result = validator.validate({ title: 'Valid', description: '', file: largeFile });

      expect(result.isValid).toBe(false);
      expect(result.errors.file).toBeDefined();
      expect(result.errors.file!.some(e => e.includes('2') || e.includes('GB'))).toBe(true);
    });

    it('should accept files at the 2GB limit', () => {
      const file = new File(['content'], 'video.mp4', { type: 'video/mp4' });
      Object.defineProperty(file, 'size', { value: 2 * 1024 * 1024 * 1024 });

      const result = validator.validate({ title: 'Valid', description: '', file });

      expect(result.errors.file).toBeUndefined();
    });
  });

  describe('Complete Form Validation', () => {
    it('should pass with all valid fields', () => {
      const mockFile = new File(['content'], 'video.mp4', { type: 'video/mp4' });
      const result = validator.validate({
        title: 'My Great Video',
        description: 'This is a description of my video',
        file: mockFile
      });

      expect(result.isValid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });

    it('should collect errors from multiple fields', () => {
      const result = validator.validate({
        title: '',
        description: '<invalid>',
        file: null
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.title).toBeDefined();
      expect(result.errors.file).toBeDefined();
    });

    it('should provide firstError for the first validation failure', () => {
      const result = validator.validate({
        title: '',
        description: '',
        file: null
      });

      expect(result.firstError).toBeTruthy();
      expect(typeof result.firstError).toBe('string');
    });
  });

  describe('Field-Level Validation', () => {
    it('should validate a single field', () => {
      const result = validator.validateField('title', '');

      expect(result.isValid).toBe(false);
      expect(result.errors.title).toBeDefined();
    });

    it('should pass for valid single field', () => {
      const result = validator.validateField('title', 'Valid Title');

      expect(result.isValid).toBe(true);
      expect(Object.keys(result.errors)).toHaveLength(0);
    });

    it('should handle unknown field names gracefully', () => {
      const result = validator.validateField('nonexistent', 'some value');

      expect(result.isValid).toBe(true);
    });
  });
});

describe('ValidationRules', () => {
  describe('required', () => {
    const rule = ValidationRules.required();

    it('should fail for null values', () => {
      expect(rule.validate(null)).toBe(false);
    });

    it('should fail for undefined values', () => {
      expect(rule.validate(undefined)).toBe(false);
    });

    it('should fail for empty strings', () => {
      expect(rule.validate('')).toBe(false);
    });

    it('should fail for whitespace-only strings', () => {
      expect(rule.validate('   ')).toBe(false);
    });

    it('should fail for empty arrays', () => {
      expect(rule.validate([])).toBe(false);
    });

    it('should pass for non-empty strings', () => {
      expect(rule.validate('hello')).toBe(true);
    });

    it('should pass for non-empty arrays', () => {
      expect(rule.validate(['item'])).toBe(true);
    });

    it('should pass for numbers (including 0)', () => {
      expect(rule.validate(0)).toBe(true);
    });

    it('should use custom error message', () => {
      const customRule = ValidationRules.required('Custom message');
      expect(customRule.message).toBe('Custom message');
    });
  });

  describe('maxLength', () => {
    const rule = ValidationRules.maxLength(100);

    it('should pass for strings within limit', () => {
      expect(rule.validate('short string')).toBe(true);
    });

    it('should pass for strings at limit', () => {
      expect(rule.validate('a'.repeat(100))).toBe(true);
    });

    it('should fail for strings exceeding limit', () => {
      expect(rule.validate('a'.repeat(101))).not.toBe(true);
    });

    it('should pass for empty strings (not required)', () => {
      expect(rule.validate('')).toBe(true);
    });
  });

  describe('minLength', () => {
    const rule = ValidationRules.minLength(3);

    it('should pass for strings at minimum', () => {
      expect(rule.validate('abc')).toBe(true);
    });

    it('should fail for strings below minimum', () => {
      expect(rule.validate('ab')).not.toBe(true);
    });

    it('should pass for empty strings (let required handle it)', () => {
      expect(rule.validate('')).toBe(true);
    });
  });

  describe('pattern', () => {
    const noHtmlRule = ValidationRules.pattern(/^[^<>{}]+$/, 'No HTML characters allowed');

    it('should pass for strings matching pattern', () => {
      expect(noHtmlRule.validate('clean text')).toBe(true);
    });

    it('should fail for strings not matching pattern', () => {
      expect(noHtmlRule.validate('<script>')).not.toBe(true);
    });

    it('should pass for empty strings (let required handle it)', () => {
      expect(noHtmlRule.validate('')).toBe(true);
    });
  });

  describe('fileSize', () => {
    const rule = ValidationRules.fileSize(2 * 1024 * 1024 * 1024); // 2GB

    it('should pass for files within limit', () => {
      const file = new File(['content'], 'test.mp4', { type: 'video/mp4' });
      Object.defineProperty(file, 'size', { value: 1024 * 1024 * 100 }); // 100MB
      expect(rule.validate(file)).toBe(true);
    });

    it('should pass for files at limit', () => {
      const file = new File(['content'], 'test.mp4', { type: 'video/mp4' });
      Object.defineProperty(file, 'size', { value: 2 * 1024 * 1024 * 1024 });
      expect(rule.validate(file)).toBe(true);
    });

    it('should fail for files exceeding limit', () => {
      const file = new File(['content'], 'test.mp4', { type: 'video/mp4' });
      Object.defineProperty(file, 'size', { value: 2.5 * 1024 * 1024 * 1024 });
      expect(rule.validate(file)).not.toBe(true);
    });

    it('should pass when no file provided', () => {
      expect(rule.validate(null)).toBe(true);
    });
  });

  describe('fileType', () => {
    const rule = ValidationRules.fileType(['video']);

    it('should pass for matching MIME type prefix', () => {
      const file = new File(['content'], 'test.mp4', { type: 'video/mp4' });
      expect(rule.validate(file)).toBe(true);
    });

    it('should fail for non-matching MIME type', () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' });
      expect(rule.validate(file)).not.toBe(true);
    });

    it('should pass when no file provided', () => {
      expect(rule.validate(null)).toBe(true);
    });

    it('should support exact MIME type matching', () => {
      const exactRule = ValidationRules.fileType(['video/mp4']);
      const mp4File = new File(['content'], 'test.mp4', { type: 'video/mp4' });
      const webmFile = new File(['content'], 'test.webm', { type: 'video/webm' });

      expect(exactRule.validate(mp4File)).toBe(true);
      expect(exactRule.validate(webmFile)).not.toBe(true);
    });
  });
});

describe('FormValidator', () => {
  it('should support custom validation schemas', () => {
    const schema: ValidationSchema = {
      name: [
        ValidationRules.required('Name is required'),
        ValidationRules.maxLength(50)
      ]
    };

    const validator = new FormValidator(schema);
    const result = validator.validate({ name: 'Test' });

    expect(result.isValid).toBe(true);
  });

  it('should handle single rule (not array)', () => {
    const schema: ValidationSchema = {
      name: ValidationRules.required('Name required')
    };

    const validator = new FormValidator(schema);
    const result = validator.validate({ name: '' });

    expect(result.isValid).toBe(false);
  });

  it('should report all field errors simultaneously', () => {
    const schema: ValidationSchema = {
      field1: [ValidationRules.required('Field 1 required')],
      field2: [ValidationRules.required('Field 2 required')],
      field3: [ValidationRules.required('Field 3 required')]
    };

    const validator = new FormValidator(schema);
    const result = validator.validate({ field1: '', field2: '', field3: '' });

    expect(result.isValid).toBe(false);
    expect(Object.keys(result.errors)).toHaveLength(3);
  });
});
