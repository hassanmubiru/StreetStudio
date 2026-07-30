/**
 * Mention Autocomplete Component
 *
 * Provides @mention autocomplete with organization member search.
 * Renders a dropdown of matching members when the user types "@" in a text input,
 * allowing selection via keyboard or mouse. Integrates with the comment system
 * to resolve mentions to member IDs and display names.
 *
 * Requirements: 5.7, 7.6
 */

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type Uuid = string;

/** Represents a searchable organization member. */
export interface MentionCandidate {
  id: Uuid;
  displayName: string;
  email: string;
  avatarUrl?: string;
}

/** Result of a mention insertion into text. */
export interface MentionInsertResult {
  /** Updated text with the mention inserted. */
  text: string;
  /** New cursor position after insertion. */
  cursorPosition: number;
  /** The member that was mentioned. */
  member: MentionCandidate;
}

/** Configuration for mention autocomplete behavior. */
export interface MentionAutocompleteOptions {
  /** Minimum characters after "@" before searching (default 0). */
  minQueryLength?: number;
  /** Maximum number of suggestions to show (default 8). */
  maxSuggestions?: number;
  /** Debounce delay in ms for search queries (default 150). */
  debounceMs?: number;
  /** Placeholder text when no results are found. */
  noResultsText?: string;
}

/** Callback to search organization members. */
export type MemberSearchFn = (query: string) => Promise<MentionCandidate[]>;

/** Callback when a mention is selected. */
export type MentionSelectFn = (member: MentionCandidate) => void;

// --------------------------------------------------------------------------
// Utility Functions
// --------------------------------------------------------------------------

/**
 * Extracts the active mention query from text at the given cursor position.
 * Returns null if no active mention trigger is found.
 *
 * A mention trigger is "@" preceded by whitespace or at the start of text,
 * followed by word characters.
 */
export function extractMentionQuery(
  text: string,
  cursorPosition: number
): { query: string; triggerIndex: number } | null {
  if (cursorPosition <= 0 || cursorPosition > text.length) return null;

  const textUpToCursor = text.substring(0, cursorPosition);
  // Match @ that's preceded by whitespace/start and followed by word chars up to cursor
  const match = textUpToCursor.match(/(?:^|\s)@([\w.]*)$/);

  if (!match) return null;

  const query = match[1] ?? '';
  const triggerIndex = textUpToCursor.lastIndexOf('@');

  return { query, triggerIndex };
}

/**
 * Inserts a mention into text, replacing the active mention query.
 * Returns the new text and cursor position.
 */
export function insertMentionIntoText(
  text: string,
  cursorPosition: number,
  member: MentionCandidate
): MentionInsertResult {
  const mentionInfo = extractMentionQuery(text, cursorPosition);
  if (!mentionInfo) {
    // Fallback: append at cursor
    const mentionText = `@${member.displayName} `;
    const newText = text.substring(0, cursorPosition) + mentionText + text.substring(cursorPosition);
    return {
      text: newText,
      cursorPosition: cursorPosition + mentionText.length,
      member,
    };
  }

  const { triggerIndex } = mentionInfo;
  const before = text.substring(0, triggerIndex);
  const after = text.substring(cursorPosition);
  const mentionText = `@${member.displayName} `;
  const newText = before + mentionText + after;

  return {
    text: newText,
    cursorPosition: before.length + mentionText.length,
    member,
  };
}

/**
 * Filters candidates by a query string (case-insensitive match on displayName or email).
 */
export function filterCandidates(
  candidates: MentionCandidate[],
  query: string,
  maxResults: number
): MentionCandidate[] {
  if (!query) return candidates.slice(0, maxResults);

  const lowerQuery = query.toLowerCase();
  return candidates
    .filter(
      (c) =>
        c.displayName.toLowerCase().includes(lowerQuery) ||
        c.email.toLowerCase().includes(lowerQuery)
    )
    .slice(0, maxResults);
}

/**
 * Extracts all mentioned member display names from a text body.
 * Returns unique display names found in @mentions.
 * A mention is defined as "@" followed by word characters (letters, digits, dots, underscores).
 */
export function extractMentionsFromText(text: string): string[] {
  const mentionPattern = /@([\w.]+)/g;
  const mentions: string[] = [];
  let match: RegExpExecArray | null;

  while ((match = mentionPattern.exec(text)) !== null) {
    const captured = match[1];
    if (captured) mentions.push(captured);
  }

  return [...new Set(mentions)];
}

// --------------------------------------------------------------------------
// MentionAutocomplete Class
// --------------------------------------------------------------------------

/**
 * MentionAutocomplete manages the mention autocomplete dropdown UI.
 * It attaches to a textarea/input, listens for "@" triggers, searches
 * organization members, and handles selection via keyboard or mouse.
 */
export class MentionAutocomplete {
  private textarea: HTMLTextAreaElement;
  private dropdown: HTMLElement;
  private searchFn: MemberSearchFn;
  private onSelect: MentionSelectFn;
  private options: Required<MentionAutocompleteOptions>;

  private isVisible = false;
  private candidates: MentionCandidate[] = [];
  private selectedIndex = -1;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private abortController: AbortController | null = null;

  constructor(
    textarea: HTMLTextAreaElement,
    dropdown: HTMLElement,
    searchFn: MemberSearchFn,
    onSelect: MentionSelectFn,
    options: MentionAutocompleteOptions = {}
  ) {
    this.textarea = textarea;
    this.dropdown = dropdown;
    this.searchFn = searchFn;
    this.onSelect = onSelect;
    this.options = {
      minQueryLength: options.minQueryLength ?? 0,
      maxSuggestions: options.maxSuggestions ?? 8,
      debounceMs: options.debounceMs ?? 150,
      noResultsText: options.noResultsText ?? 'No members found',
    };

    this.setupDropdown();
    this.attachListeners();
  }

  private setupDropdown(): void {
    this.dropdown.className = 'mention-autocomplete-dropdown';
    this.dropdown.setAttribute('role', 'listbox');
    this.dropdown.setAttribute('aria-label', 'Member suggestions');
    this.dropdown.setAttribute('aria-hidden', 'true');
    this.dropdown.style.display = 'none';
  }

  private attachListeners(): void {
    this.textarea.addEventListener('input', this.handleInput.bind(this));
    this.textarea.addEventListener('keydown', this.handleKeydown.bind(this));
    this.textarea.addEventListener('blur', this.handleBlur.bind(this));
  }

  private handleInput(): void {
    const cursorPos = this.textarea.selectionStart ?? 0;
    const mentionInfo = extractMentionQuery(this.textarea.value, cursorPos);

    if (!mentionInfo) {
      this.hide();
      return;
    }

    const { query } = mentionInfo;

    if (query.length < this.options.minQueryLength) {
      this.hide();
      return;
    }

    this.debouncedSearch(query);
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (!this.isVisible) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.moveSelection(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.moveSelection(-1);
        break;
      case 'Enter':
        if (this.selectedIndex >= 0 && this.selectedIndex < this.candidates.length) {
          event.preventDefault();
          const enterCandidate = this.candidates[this.selectedIndex];
          if (enterCandidate) this.selectCandidate(enterCandidate);
        }
        break;
      case 'Tab':
        if (this.selectedIndex >= 0 && this.selectedIndex < this.candidates.length) {
          event.preventDefault();
          const tabCandidate = this.candidates[this.selectedIndex];
          if (tabCandidate) this.selectCandidate(tabCandidate);
        }
        break;
      case 'Escape':
        event.preventDefault();
        this.hide();
        break;
    }
  }

  private handleBlur(): void {
    // Delay hide to allow click on dropdown items
    setTimeout(() => this.hide(), 200);
  }

  private debouncedSearch(query: string): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      this.performSearch(query);
    }, this.options.debounceMs);
  }

  private async performSearch(query: string): Promise<void> {
    // Cancel any in-flight request
    if (this.abortController) {
      this.abortController.abort();
    }
    this.abortController = new AbortController();

    try {
      const results = await this.searchFn(query);
      const filtered = filterCandidates(results, query, this.options.maxSuggestions);
      this.candidates = filtered;
      this.selectedIndex = filtered.length > 0 ? 0 : -1;
      this.renderDropdown();
      this.show();
    } catch (error) {
      // Ignore aborted requests
      if (error instanceof DOMException && error.name === 'AbortError') return;
      this.hide();
    }
  }

  private renderDropdown(): void {
    this.dropdown.innerHTML = '';

    if (this.candidates.length === 0) {
      const noResults = document.createElement('div');
      noResults.className = 'mention-no-results';
      noResults.setAttribute('role', 'option');
      noResults.setAttribute('aria-disabled', 'true');
      noResults.textContent = this.options.noResultsText;
      this.dropdown.appendChild(noResults);
      return;
    }

    this.candidates.forEach((candidate, index) => {
      const item = document.createElement('div');
      item.className = 'mention-candidate-item';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(index === this.selectedIndex));
      item.setAttribute('data-member-id', candidate.id);

      if (index === this.selectedIndex) {
        item.classList.add('selected');
      }

      // Avatar
      const avatar = document.createElement('span');
      avatar.className = 'mention-candidate-avatar';
      avatar.textContent = candidate.displayName.charAt(0).toUpperCase();
      avatar.setAttribute('aria-hidden', 'true');
      if (candidate.avatarUrl) {
        const img = document.createElement('img');
        img.src = candidate.avatarUrl;
        img.alt = '';
        img.className = 'mention-candidate-avatar-img';
        avatar.textContent = '';
        avatar.appendChild(img);
      }
      item.appendChild(avatar);

      // Info
      const info = document.createElement('div');
      info.className = 'mention-candidate-info';

      const name = document.createElement('span');
      name.className = 'mention-candidate-name';
      name.textContent = candidate.displayName;
      info.appendChild(name);

      const email = document.createElement('span');
      email.className = 'mention-candidate-email';
      email.textContent = candidate.email;
      info.appendChild(email);

      item.appendChild(info);

      item.addEventListener('mousedown', (e) => {
        e.preventDefault(); // Prevent blur
        this.selectCandidate(candidate);
      });

      item.addEventListener('mouseenter', () => {
        this.selectedIndex = index;
        this.updateSelectionUI();
      });

      this.dropdown.appendChild(item);
    });
  }

  private moveSelection(direction: number): void {
    if (this.candidates.length === 0) return;

    this.selectedIndex += direction;
    if (this.selectedIndex < 0) {
      this.selectedIndex = this.candidates.length - 1;
    } else if (this.selectedIndex >= this.candidates.length) {
      this.selectedIndex = 0;
    }

    this.updateSelectionUI();
  }

  private updateSelectionUI(): void {
    const items = this.dropdown.querySelectorAll('.mention-candidate-item');
    items.forEach((item, index) => {
      const isSelected = index === this.selectedIndex;
      item.classList.toggle('selected', isSelected);
      item.setAttribute('aria-selected', String(isSelected));
    });
  }

  private selectCandidate(candidate: MentionCandidate): void {
    const result = insertMentionIntoText(
      this.textarea.value,
      this.textarea.selectionStart,
      candidate
    );

    this.textarea.value = result.text;
    this.textarea.selectionStart = result.cursorPosition;
    this.textarea.selectionEnd = result.cursorPosition;
    this.textarea.focus();

    this.onSelect(candidate);
    this.hide();

    // Trigger input event for any other listeners
    this.textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  private show(): void {
    if (this.candidates.length === 0 && !this.options.noResultsText) {
      this.hide();
      return;
    }
    this.isVisible = true;
    this.dropdown.style.display = 'block';
    this.dropdown.setAttribute('aria-hidden', 'false');
    this.textarea.setAttribute('aria-expanded', 'true');
    this.textarea.setAttribute('aria-controls', this.dropdown.id || 'mention-dropdown');
  }

  private hide(): void {
    this.isVisible = false;
    this.dropdown.style.display = 'none';
    this.dropdown.setAttribute('aria-hidden', 'true');
    this.textarea.setAttribute('aria-expanded', 'false');
    this.textarea.removeAttribute('aria-controls');
    this.candidates = [];
    this.selectedIndex = -1;
  }

  /** Check if the dropdown is currently visible. */
  public isDropdownVisible(): boolean {
    return this.isVisible;
  }

  /** Get the currently selected candidate, or null. */
  public getSelectedCandidate(): MentionCandidate | null {
    if (this.selectedIndex >= 0 && this.selectedIndex < this.candidates.length) {
      return this.candidates[this.selectedIndex] ?? null;
    }
    return null;
  }

  /** Destroy the autocomplete and remove listeners. */
  public destroy(): void {
    this.textarea.removeEventListener('input', this.handleInput.bind(this));
    this.textarea.removeEventListener('keydown', this.handleKeydown.bind(this));
    this.textarea.removeEventListener('blur', this.handleBlur.bind(this));
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    if (this.abortController) this.abortController.abort();
    this.hide();
  }
}
