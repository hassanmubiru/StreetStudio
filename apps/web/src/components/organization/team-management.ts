/**
 * Team Management Component
 *
 * Provides team creation, member assignment, and team-based
 * permission controls for organization management.
 *
 * Requirements: 8.5
 */

export type Uuid = string;

/** Represents a team in the organization */
export interface Team {
  id: Uuid;
  organizationId: Uuid;
  name: string;
  description: string;
  memberIds: Uuid[];
  permissions?: string[];
  createdAt: string;
}

/** Represents a member that can be assigned to teams */
export interface TeamMember {
  id: Uuid;
  displayName: string;
  email: string;
  avatarUrl?: string;
  roleId?: Uuid;
}

/** Callbacks for team management operations */
export interface TeamManagementCallbacks {
  onCreateTeam: (team: { name: string; description: string }) => Promise<Team>;
  onUpdateTeam: (teamId: Uuid, updates: { name?: string; description?: string }) => Promise<Team>;
  onDeleteTeam: (teamId: Uuid) => Promise<boolean>;
  onAddMember: (teamId: Uuid, memberId: Uuid) => Promise<boolean>;
  onRemoveMember: (teamId: Uuid, memberId: Uuid) => Promise<boolean>;
  onUpdateTeamPermissions?: (teamId: Uuid, permissions: string[]) => Promise<boolean>;
}

/** Options for the team management component */
export interface TeamManagementOptions {
  organizationId: Uuid;
  teams: Team[];
  availableMembers: TeamMember[];
  isAdmin: boolean;
}

/**
 * Validates a team name
 */
export function validateTeamName(name: string): { valid: boolean; error?: string } {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Team name is required' };
  }
  if (trimmed.length > 100) {
    return { valid: false, error: 'Team name must be 100 characters or less' };
  }
  if (!/^[a-zA-Z0-9\s\-_]+$/.test(trimmed)) {
    return { valid: false, error: 'Team name can only contain letters, numbers, spaces, hyphens, and underscores' };
  }
  return { valid: true };
}

/**
 * Gets members that belong to a team
 */
export function getTeamMembers(team: Team, allMembers: TeamMember[]): TeamMember[] {
  return allMembers.filter(m => team.memberIds.includes(m.id));
}

/**
 * Gets members available to add to a team (not already in it)
 */
export function getAvailableMembers(team: Team, allMembers: TeamMember[]): TeamMember[] {
  return allMembers.filter(m => !team.memberIds.includes(m.id));
}

/**
 * Team Management UI Component
 */
export class TeamManagement {
  private container: HTMLElement;
  private options: TeamManagementOptions;
  private callbacks: TeamManagementCallbacks;
  private selectedTeamId: Uuid | null = null;
  private isCreating = false;
  private memberSearchQuery = '';

  constructor(
    container: HTMLElement,
    options: TeamManagementOptions,
    callbacks: TeamManagementCallbacks
  ) {
    this.container = container;
    this.options = options;
    this.callbacks = callbacks;
    this.render();
  }

  public setTeams(teams: Team[]): void {
    this.options.teams = teams;
    this.render();
  }

  public setAvailableMembers(members: TeamMember[]): void {
    this.options.availableMembers = members;
    this.render();
  }

  public getSelectedTeam(): Team | undefined {
    return this.options.teams.find(t => t.id === this.selectedTeamId);
  }

  public selectTeam(teamId: Uuid): void {
    this.selectedTeamId = teamId;
    this.isCreating = false;
    this.render();
  }

  public startCreateTeam(): void {
    this.isCreating = true;
    this.selectedTeamId = null;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = '';
    this.container.className = 'team-management';
    this.container.setAttribute('role', 'region');
    this.container.setAttribute('aria-label', 'Team management');

    // Header
    const header = document.createElement('div');
    header.className = 'team-management-header';
    header.innerHTML = `
      <h2 class="team-management-title">Teams</h2>
      <p class="team-management-description">Create teams and assign members for collaborative access control</p>
    `;

    if (this.options.isAdmin) {
      const createBtn = document.createElement('button');
      createBtn.className = 'team-create-btn';
      createBtn.textContent = 'Create Team';
      createBtn.setAttribute('aria-label', 'Create a new team');
      createBtn.addEventListener('click', () => this.startCreateTeam());
      header.appendChild(createBtn);
    }

    this.container.appendChild(header);

    // Layout
    const layout = document.createElement('div');
    layout.className = 'team-management-layout';

    // Team list
    const listPanel = this.renderTeamList();
    layout.appendChild(listPanel);

    // Detail panel
    const detailPanel = document.createElement('div');
    detailPanel.className = 'team-detail-panel';

    if (this.isCreating) {
      detailPanel.appendChild(this.renderTeamEditor());
    } else if (this.selectedTeamId) {
      detailPanel.appendChild(this.renderTeamDetail());
    } else {
      detailPanel.innerHTML = '<p class="team-detail-placeholder">Select a team to manage members</p>';
    }

    layout.appendChild(detailPanel);
    this.container.appendChild(layout);
  }

  private renderTeamList(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'team-list-panel';
    panel.setAttribute('role', 'listbox');
    panel.setAttribute('aria-label', 'Organization teams');

    if (this.options.teams.length === 0) {
      panel.innerHTML = '<p class="team-list-empty">No teams created yet</p>';
      return panel;
    }

    for (const team of this.options.teams) {
      const item = document.createElement('div');
      item.className = 'team-list-item';
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', (team.id === this.selectedTeamId).toString());
      item.dataset.teamId = team.id;

      if (team.id === this.selectedTeamId) {
        item.classList.add('selected');
      }

      item.innerHTML = `
        <div class="team-item-info">
          <span class="team-item-name">${this.escapeHtml(team.name)}</span>
          <span class="team-item-member-count">${team.memberIds.length} member${team.memberIds.length !== 1 ? 's' : ''}</span>
        </div>
        <span class="team-item-description">${this.escapeHtml(team.description)}</span>
      `;

      item.addEventListener('click', () => this.selectTeam(team.id));
      panel.appendChild(item);
    }

    return panel;
  }

  private renderTeamDetail(): HTMLElement {
    const team = this.options.teams.find(t => t.id === this.selectedTeamId);
    if (!team) {
      const el = document.createElement('div');
      el.textContent = 'Team not found';
      return el;
    }

    const detail = document.createElement('div');
    detail.className = 'team-detail';

    // Team header
    const teamHeader = document.createElement('div');
    teamHeader.className = 'team-detail-header';
    teamHeader.innerHTML = `
      <h3 class="team-detail-name">${this.escapeHtml(team.name)}</h3>
      <p class="team-detail-description">${this.escapeHtml(team.description)}</p>
    `;

    if (this.options.isAdmin) {
      const actionsBar = document.createElement('div');
      actionsBar.className = 'team-detail-actions';

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'team-delete-btn';
      deleteBtn.textContent = 'Delete Team';
      deleteBtn.setAttribute('aria-label', `Delete team ${team.name}`);
      deleteBtn.addEventListener('click', () => this.handleDeleteTeam(team.id));
      actionsBar.appendChild(deleteBtn);

      teamHeader.appendChild(actionsBar);
    }

    detail.appendChild(teamHeader);

    // Current members list
    const membersSection = document.createElement('div');
    membersSection.className = 'team-members-section';
    membersSection.innerHTML = `<h4 class="team-members-title">Members (${team.memberIds.length})</h4>`;

    const membersList = document.createElement('div');
    membersList.className = 'team-members-list';
    membersList.setAttribute('role', 'list');
    membersList.setAttribute('aria-label', 'Team members');

    const teamMembers = getTeamMembers(team, this.options.availableMembers);

    if (teamMembers.length === 0) {
      membersList.innerHTML = '<p class="team-no-members">No members assigned to this team</p>';
    } else {
      for (const member of teamMembers) {
        const memberItem = document.createElement('div');
        memberItem.className = 'team-member-item';
        memberItem.setAttribute('role', 'listitem');
        memberItem.innerHTML = `
          <div class="team-member-info">
            <span class="team-member-name">${this.escapeHtml(member.displayName)}</span>
            <span class="team-member-email">${this.escapeHtml(member.email)}</span>
          </div>
        `;

        if (this.options.isAdmin) {
          const removeBtn = document.createElement('button');
          removeBtn.className = 'team-member-remove-btn';
          removeBtn.textContent = 'Remove';
          removeBtn.setAttribute('aria-label', `Remove ${member.displayName} from team`);
          removeBtn.addEventListener('click', () => this.handleRemoveMember(team.id, member.id));
          memberItem.appendChild(removeBtn);
        }

        membersList.appendChild(memberItem);
      }
    }

    membersSection.appendChild(membersList);
    detail.appendChild(membersSection);

    // Add member section (admin only)
    if (this.options.isAdmin) {
      const addSection = this.renderAddMemberSection(team);
      detail.appendChild(addSection);
    }

    return detail;
  }

  private renderAddMemberSection(team: Team): HTMLElement {
    const section = document.createElement('div');
    section.className = 'team-add-member-section';
    section.innerHTML = `<h4 class="team-add-member-title">Add Members</h4>`;

    // Search input
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.className = 'team-member-search';
    searchInput.placeholder = 'Search members to add...';
    searchInput.setAttribute('aria-label', 'Search for members to add to team');
    searchInput.value = this.memberSearchQuery;
    searchInput.addEventListener('input', () => {
      this.memberSearchQuery = searchInput.value;
      this.renderAvailableMembersList(team, availableList);
    });
    section.appendChild(searchInput);

    // Available members list
    const availableList = document.createElement('div');
    availableList.className = 'team-available-members';
    availableList.setAttribute('role', 'list');
    availableList.setAttribute('aria-label', 'Available members');
    this.renderAvailableMembersList(team, availableList);
    section.appendChild(availableList);

    return section;
  }

  private renderAvailableMembersList(team: Team, container: HTMLElement): void {
    container.innerHTML = '';
    const available = getAvailableMembers(team, this.options.availableMembers);
    const filtered = this.memberSearchQuery
      ? available.filter(m =>
          m.displayName.toLowerCase().includes(this.memberSearchQuery.toLowerCase()) ||
          m.email.toLowerCase().includes(this.memberSearchQuery.toLowerCase())
        )
      : available;

    if (filtered.length === 0) {
      container.innerHTML = '<p class="team-no-available">No members available to add</p>';
      return;
    }

    for (const member of filtered.slice(0, 10)) {
      const item = document.createElement('div');
      item.className = 'team-available-member-item';
      item.setAttribute('role', 'listitem');
      item.innerHTML = `
        <div class="team-member-info">
          <span class="team-member-name">${this.escapeHtml(member.displayName)}</span>
          <span class="team-member-email">${this.escapeHtml(member.email)}</span>
        </div>
      `;

      const addBtn = document.createElement('button');
      addBtn.className = 'team-member-add-btn';
      addBtn.textContent = 'Add';
      addBtn.setAttribute('aria-label', `Add ${member.displayName} to team`);
      addBtn.addEventListener('click', () => this.handleAddMember(team.id, member.id));
      item.appendChild(addBtn);

      container.appendChild(item);
    }
  }

  private renderTeamEditor(): HTMLElement {
    const editor = document.createElement('div');
    editor.className = 'team-editor';
    editor.setAttribute('role', 'form');
    editor.setAttribute('aria-label', 'Create new team');

    editor.innerHTML = `
      <div class="form-group">
        <label for="team-name-input" class="form-label">Team Name</label>
        <input type="text" id="team-name-input" class="team-name-input form-input"
          placeholder="Enter team name" maxlength="100"
          aria-describedby="team-name-error" />
        <span id="team-name-error" class="form-error" aria-live="polite"></span>
      </div>
      <div class="form-group">
        <label for="team-desc-input" class="form-label">Description</label>
        <input type="text" id="team-desc-input" class="team-desc-input form-input"
          placeholder="Describe this team's purpose" maxlength="200" />
      </div>
    `;

    const actionsBar = document.createElement('div');
    actionsBar.className = 'team-editor-actions';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'team-cancel-btn';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => {
      this.isCreating = false;
      this.render();
    });

    const saveBtn = document.createElement('button');
    saveBtn.className = 'team-save-btn';
    saveBtn.textContent = 'Create Team';
    saveBtn.addEventListener('click', async () => {
      const nameInput = editor.querySelector('.team-name-input') as HTMLInputElement;
      const descInput = editor.querySelector('.team-desc-input') as HTMLInputElement;
      const errorEl = editor.querySelector('#team-name-error') as HTMLElement;

      const validation = validateTeamName(nameInput.value);
      if (!validation.valid) {
        errorEl.textContent = validation.error ?? '';
        nameInput.setAttribute('aria-invalid', 'true');
        return;
      }

      errorEl.textContent = '';
      nameInput.removeAttribute('aria-invalid');

      try {
        await this.callbacks.onCreateTeam({
          name: nameInput.value.trim(),
          description: descInput.value.trim(),
        });
        this.isCreating = false;
        this.render();
      } catch {
        errorEl.textContent = 'Failed to create team. Please try again.';
      }
    });

    actionsBar.appendChild(cancelBtn);
    actionsBar.appendChild(saveBtn);
    editor.appendChild(actionsBar);

    return editor;
  }

  private async handleDeleteTeam(teamId: Uuid): Promise<void> {
    const team = this.options.teams.find(t => t.id === teamId);
    if (!team) return;

    const confirmed = window.confirm(`Are you sure you want to delete team "${team.name}"?`);
    if (!confirmed) return;

    try {
      await this.callbacks.onDeleteTeam(teamId);
      this.selectedTeamId = null;
      this.options.teams = this.options.teams.filter(t => t.id !== teamId);
      this.render();
    } catch {
      // Error handling
    }
  }

  private async handleAddMember(teamId: Uuid, memberId: Uuid): Promise<void> {
    try {
      await this.callbacks.onAddMember(teamId, memberId);
      const team = this.options.teams.find(t => t.id === teamId);
      if (team && !team.memberIds.includes(memberId)) {
        team.memberIds.push(memberId);
      }
      this.render();
    } catch {
      // Error handling
    }
  }

  private async handleRemoveMember(teamId: Uuid, memberId: Uuid): Promise<void> {
    try {
      await this.callbacks.onRemoveMember(teamId, memberId);
      const team = this.options.teams.find(t => t.id === teamId);
      if (team) {
        team.memberIds = team.memberIds.filter(id => id !== memberId);
      }
      this.render();
    } catch {
      // Error handling
    }
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public destroy(): void {
    this.container.innerHTML = '';
  }
}
