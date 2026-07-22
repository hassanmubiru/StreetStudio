/**
 * Navigation Controller
 * 
 * Manages navigation state, organization switching, and navigation UI.
 */

import type { Uuid } from '@streetstudio/shared';

export interface OrganizationChangeHandler {
  (organizationId: Uuid): void;
}

export class NavigationController {
  private orgChangeHandlers: Set<OrganizationChangeHandler> = new Set();

  /**
   * Initialize navigation controller
   */
  public initialize(): void {
    // TODO: Setup navigation UI components
    console.log('Navigation controller initialized');
  }

  /**
   * Handle organization change events
   */
  public onOrganizationChange(handler: OrganizationChangeHandler): () => void {
    this.orgChangeHandlers.add(handler);
    
    return () => {
      this.orgChangeHandlers.delete(handler);
    };
  }

  /**
   * Trigger organization change
   */
  public changeOrganization(organizationId: Uuid): void {
    for (const handler of this.orgChangeHandlers) {
      try {
        handler(organizationId);
      } catch (error) {
        console.error('Organization change handler error:', error);
      }
    }
  }
}