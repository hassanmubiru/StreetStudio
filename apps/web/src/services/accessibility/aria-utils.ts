/**
 * ARIA Utilities
 * 
 * Helper functions for adding proper ARIA labels, roles, live regions,
 * and descriptions to components throughout the application.
 * 
 * Requirements: 11.2 - Proper ARIA labels, roles, and descriptions for all
 * interactive elements and dynamic content regions
 */

/** Standard ARIA landmark and widget roles */
export type AriaRole =
  | 'alert'
  | 'alertdialog'
  | 'application'
  | 'article'
  | 'banner'
  | 'button'
  | 'cell'
  | 'checkbox'
  | 'combobox'
  | 'complementary'
  | 'contentinfo'
  | 'dialog'
  | 'document'
  | 'feed'
  | 'figure'
  | 'form'
  | 'grid'
  | 'gridcell'
  | 'group'
  | 'heading'
  | 'img'
  | 'link'
  | 'list'
  | 'listbox'
  | 'listitem'
  | 'log'
  | 'main'
  | 'marquee'
  | 'math'
  | 'menu'
  | 'menubar'
  | 'menuitem'
  | 'menuitemcheckbox'
  | 'menuitemradio'
  | 'navigation'
  | 'none'
  | 'note'
  | 'option'
  | 'presentation'
  | 'progressbar'
  | 'radio'
  | 'radiogroup'
  | 'region'
  | 'row'
  | 'rowgroup'
  | 'rowheader'
  | 'search'
  | 'separator'
  | 'slider'
  | 'spinbutton'
  | 'status'
  | 'switch'
  | 'tab'
  | 'table'
  | 'tablist'
  | 'tabpanel'
  | 'term'
  | 'textbox'
  | 'timer'
  | 'toolbar'
  | 'tooltip'
  | 'tree'
  | 'treegrid'
  | 'treeitem';

/** Options for configuring ARIA live regions */
export interface AriaLiveRegionOptions {
  /** Politeness level for screen reader announcements */
  politeness: 'polite' | 'assertive' | 'off';
  /** Whether the entire region should be re-read on update */
  atomic?: boolean;
  /** Which types of updates to announce */
  relevant?: ('additions' | 'removals' | 'text' | 'all')[];
  /** Whether the region is currently busy updating */
  busy?: boolean;
}

/** Configuration for ARIA attributes on an element */
export interface AriaConfig {
  role?: AriaRole;
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  expanded?: boolean;
  hidden?: boolean;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean | 'grammar' | 'spelling';
  live?: AriaLiveRegionOptions;
  controls?: string;
  owns?: string;
  current?: boolean | 'page' | 'step' | 'location' | 'date' | 'time';
  hasPopup?: boolean | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog';
  level?: number;
  valueNow?: number;
  valueMin?: number;
  valueMax?: number;
  valueText?: string;
}

/**
 * ARIA utility class providing helper methods for managing ARIA attributes
 * on DOM elements.
 */
export class AriaUtils {
  /**
   * Apply a set of ARIA attributes to a DOM element.
   */
  static applyAriaConfig(element: HTMLElement, config: AriaConfig): void {
    if (config.role) {
      element.setAttribute('role', config.role);
    }

    if (config.label !== undefined) {
      element.setAttribute('aria-label', config.label);
    }

    if (config.labelledBy !== undefined) {
      element.setAttribute('aria-labelledby', config.labelledBy);
    }

    if (config.describedBy !== undefined) {
      element.setAttribute('aria-describedby', config.describedBy);
    }

    if (config.expanded !== undefined) {
      element.setAttribute('aria-expanded', String(config.expanded));
    }

    if (config.hidden !== undefined) {
      element.setAttribute('aria-hidden', String(config.hidden));
    }

    if (config.disabled !== undefined) {
      element.setAttribute('aria-disabled', String(config.disabled));
    }

    if (config.required !== undefined) {
      element.setAttribute('aria-required', String(config.required));
    }

    if (config.invalid !== undefined) {
      element.setAttribute('aria-invalid', String(config.invalid));
    }

    if (config.controls !== undefined) {
      element.setAttribute('aria-controls', config.controls);
    }

    if (config.owns !== undefined) {
      element.setAttribute('aria-owns', config.owns);
    }

    if (config.current !== undefined) {
      element.setAttribute('aria-current', String(config.current));
    }

    if (config.hasPopup !== undefined) {
      element.setAttribute('aria-haspopup', String(config.hasPopup));
    }

    if (config.level !== undefined) {
      element.setAttribute('aria-level', String(config.level));
    }

    if (config.valueNow !== undefined) {
      element.setAttribute('aria-valuenow', String(config.valueNow));
    }

    if (config.valueMin !== undefined) {
      element.setAttribute('aria-valuemin', String(config.valueMin));
    }

    if (config.valueMax !== undefined) {
      element.setAttribute('aria-valuemax', String(config.valueMax));
    }

    if (config.valueText !== undefined) {
      element.setAttribute('aria-valuetext', config.valueText);
    }

    if (config.live) {
      AriaUtils.applyLiveRegion(element, config.live);
    }
  }

  /**
   * Apply ARIA live region attributes to an element.
   */
  static applyLiveRegion(element: HTMLElement, options: AriaLiveRegionOptions): void {
    element.setAttribute('aria-live', options.politeness);

    if (options.atomic !== undefined) {
      element.setAttribute('aria-atomic', String(options.atomic));
    }

    if (options.relevant && options.relevant.length > 0) {
      element.setAttribute('aria-relevant', options.relevant.join(' '));
    }

    if (options.busy !== undefined) {
      element.setAttribute('aria-busy', String(options.busy));
    }
  }

  /**
   * Set the role of an element.
   */
  static setRole(element: HTMLElement, role: AriaRole): void {
    element.setAttribute('role', role);
  }

  /**
   * Set the accessible label for an element.
   */
  static setLabel(element: HTMLElement, label: string): void {
    element.setAttribute('aria-label', label);
  }

  /**
   * Associate an element with a label element by ID.
   */
  static setLabelledBy(element: HTMLElement, labelId: string): void {
    element.setAttribute('aria-labelledby', labelId);
  }

  /**
   * Associate an element with a description element by ID.
   */
  static setDescribedBy(element: HTMLElement, descriptionId: string): void {
    element.setAttribute('aria-describedby', descriptionId);
  }

  /**
   * Mark an element as expanded or collapsed (for disclosure widgets).
   */
  static setExpanded(element: HTMLElement, expanded: boolean): void {
    element.setAttribute('aria-expanded', String(expanded));
  }

  /**
   * Mark an element as hidden from assistive technologies.
   */
  static setHidden(element: HTMLElement, hidden: boolean): void {
    element.setAttribute('aria-hidden', String(hidden));
  }

  /**
   * Set the current state for navigation items.
   */
  static setCurrent(element: HTMLElement, current: boolean | 'page' | 'step' | 'location' | 'date' | 'time'): void {
    if (current === false) {
      element.removeAttribute('aria-current');
    } else {
      element.setAttribute('aria-current', String(current));
    }
  }

  /**
   * Set error state and associate error message with a form field.
   */
  static setError(element: HTMLElement, errorId: string | null): void {
    if (errorId) {
      element.setAttribute('aria-invalid', 'true');
      element.setAttribute('aria-errormessage', errorId);
    } else {
      element.removeAttribute('aria-invalid');
      element.removeAttribute('aria-errormessage');
    }
  }

  /**
   * Create a visually hidden element that is accessible to screen readers.
   */
  static createScreenReaderOnly(text: string, tagName: string = 'span'): HTMLElement {
    const element = document.createElement(tagName);
    element.textContent = text;
    element.className = 'sr-only';
    element.style.position = 'absolute';
    element.style.width = '1px';
    element.style.height = '1px';
    element.style.padding = '0';
    element.style.margin = '-1px';
    element.style.overflow = 'hidden';
    element.style.clip = 'rect(0, 0, 0, 0)';
    element.style.whiteSpace = 'nowrap';
    element.style.border = '0';
    return element;
  }

  /**
   * Create a live region element for dynamic content announcements.
   */
  static createLiveRegion(options: AriaLiveRegionOptions): HTMLElement {
    const region = document.createElement('div');
    region.className = 'sr-only';
    region.style.position = 'absolute';
    region.style.width = '1px';
    region.style.height = '1px';
    region.style.padding = '0';
    region.style.margin = '-1px';
    region.style.overflow = 'hidden';
    region.style.clip = 'rect(0, 0, 0, 0)';
    region.style.whiteSpace = 'nowrap';
    region.style.border = '0';
    AriaUtils.applyLiveRegion(region, options);
    return region;
  }

  /**
   * Generate a unique ID for ARIA attribute associations.
   */
  static generateId(prefix: string = 'aria'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  }

  /**
   * Set up proper ARIA attributes for a tabbed interface.
   */
  static setupTabInterface(tablist: HTMLElement, tabs: HTMLElement[], panels: HTMLElement[]): void {
    AriaUtils.setRole(tablist, 'tablist');

    tabs.forEach((tab, index) => {
      const panelId = panels[index]?.id || AriaUtils.generateId('tabpanel');
      const tabId = tab.id || AriaUtils.generateId('tab');

      tab.id = tabId;
      AriaUtils.setRole(tab, 'tab');
      tab.setAttribute('aria-controls', panelId);
      tab.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
      tab.setAttribute('tabindex', index === 0 ? '0' : '-1');

      if (panels[index]) {
        panels[index].id = panelId;
        AriaUtils.setRole(panels[index], 'tabpanel');
        panels[index].setAttribute('aria-labelledby', tabId);
        panels[index].setAttribute('tabindex', '0');
        if (index !== 0) {
          panels[index].setAttribute('hidden', '');
        }
      }
    });
  }

  /**
   * Set up proper ARIA attributes for a disclosure (accordion) widget.
   */
  static setupDisclosure(trigger: HTMLElement, content: HTMLElement, expanded: boolean = false): void {
    const contentId = content.id || AriaUtils.generateId('disclosure');
    content.id = contentId;

    trigger.setAttribute('aria-controls', contentId);
    trigger.setAttribute('aria-expanded', String(expanded));

    if (!expanded) {
      content.setAttribute('hidden', '');
    }
  }
}
