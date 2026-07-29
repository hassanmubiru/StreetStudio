/**
 * Members Page
 * 
 * Organization member management page providing the full member
 * management interface including member listing, invitation,
 * profile viewing, and removal.
 * 
 * Validates: Requirements 8.1, 8.2, 8.8
 */

import type { Uuid, InvitationDto } from '@streetstudio/shared';
import { MemberManagement } from '../../components/workspace/member-management.js';
import { MemberProfile } from '../../components/workspace/member-profile.js';
import { logger } from '../../app/client-logger.js';

export interface MembersPageConfig {
  organizationId: Uuid;
  currentUserId: Uuid;
}

type PageView = 'list' | 'profile';

export class MembersPage {
  private config: MembersPageConfig;
  private element: HTMLElement;
  private currentView: PageView = 'list';
  private selectedMemberId: Uuid | null = null;
  private memberManagement: MemberManagement | null = null;
  private memberProfile: MemberProfile | null = null;

  constructor(config: MembersPageConfig) {
    this.config = config;
    this.element = document.createElement('div');
    this.element.className = 'members-page h-full';
    this.element.setAttribute('data-main-content', '');
    this.element.setAttribute('data-page', 'members');
  }

  public async getElement(): Promise<HTMLElement> {
    await this.showMembersList();
    return this.element;
  }

  private async showMembersList(): Promise<void> {
    this.currentView = 'list';
    this.selectedMemberId = null;
    this.element.innerHTML = '';

    this.memberManagement = new MemberManagement({
      organizationId: this.config.organizationId,
      currentUserId: this.config.currentUserId,
      onMemberInvited: (invitation: InvitationDto) => {
        logger.info('Member invited from members page', {
          email: invitation.email
        });
      },
      onMemberRemoved: (memberId: Uuid) => {
        logger.info('Member removed from members page', { memberId });
      },
      onNavigateToProfile: (memberId: Uuid) => {
        this.showMemberProfile(memberId);
      }
    });

    const managementElement = await this.memberManagement.getElement();
    this.element.appendChild(managementElement);
  }

  private async showMemberProfile(memberId: Uuid): Promise<void> {
    this.currentView = 'profile';
    this.selectedMemberId = memberId;
    this.element.innerHTML = '';

    this.memberProfile = new MemberProfile({
      organizationId: this.config.organizationId,
      memberId,
      onBack: () => {
        this.showMembersList();
      }
    });

    const profileElement = await this.memberProfile.getElement();
    this.element.appendChild(profileElement);
  }

  public getCurrentView(): PageView {
    return this.currentView;
  }

  public getSelectedMemberId(): Uuid | null {
    return this.selectedMemberId;
  }

  public destroy(): void {
    this.memberManagement?.destroy();
    this.memberProfile?.destroy();
    this.element.innerHTML = '';
  }
}
