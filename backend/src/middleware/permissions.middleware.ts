import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.middleware';

/**
 * Permission types for different actions
 */
export enum PermissionAction {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
}

/**
 * Resource types that need permission checks
 */
export enum ResourceType {
  COMPANY_POLICY = 'company_policy',
  DEPARTMENT = 'department',
  SUBDEPARTMENT = 'subdepartment',
  PROJECT = 'project',
  DOCUMENT = 'document',
}

/**
 * Roles that have full access (can perform all actions)
 */
const ADMIN_ROLES = ['ADMIN', 'HR', 'PROJECT_MANAGER'];

/**
 * Check if user role is an admin role
 */
const isAdminRole = (role: string): boolean => {
  return ADMIN_ROLES.includes(role);
};

/**
 * Check if user is an employee
 */
const isEmployee = (role: string): boolean => {
  return role === 'EMPLOYEE';
};

/**
 * Employee permissions configuration
 * Maps resource types to actions employees CAN perform
 */
const EMPLOYEE_PERMISSIONS: Record<ResourceType, PermissionAction[]> = {
  [ResourceType.COMPANY_POLICY]: [PermissionAction.READ], // View only
  [ResourceType.DEPARTMENT]: [PermissionAction.READ], // View only
  [ResourceType.SUBDEPARTMENT]: [PermissionAction.READ], // View only
  [ResourceType.PROJECT]: [PermissionAction.READ, PermissionAction.UPDATE], // View and update assigned projects only
  [ResourceType.DOCUMENT]: [PermissionAction.READ], // View documents related to assigned projects
};

/**
 * Check if employee has permission for a specific action on a resource
 */
const hasEmployeePermission = (
  resourceType: ResourceType,
  action: PermissionAction
): boolean => {
  const allowedActions = EMPLOYEE_PERMISSIONS[resourceType] || [];
  return allowedActions.includes(action);
};

/**
 * Log unauthorized access attempt for audit purposes
 */
const logUnauthorizedAttempt = (
  userId: string,
  userRole: string,
  resourceType: ResourceType,
  action: PermissionAction,
  resourceId?: string
): void => {
  console.warn('🚫 Unauthorized access attempt:', {
    userId,
    userRole,
    resourceType,
    action,
    resourceId,
    timestamp: new Date().toISOString(),
  });
};

/**
 * Middleware to restrict actions based on user role
 * Employees can only perform READ actions on most resources
 * Employees can READ and UPDATE their assigned projects
 */
export const requirePermission = (
  resourceType: ResourceType,
  action: PermissionAction
) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized: Authentication required',
        code: 'UNAUTHORIZED',
      });
      return;
    }

    const userRole = req.user.role;
    const userId = req.user.id;

    // Admin roles have full access
    if (isAdminRole(userRole)) {
      next();
      return;
    }

    // Employee role - check permissions
    if (isEmployee(userRole)) {
      // Check if employee has permission for this action
      if (!hasEmployeePermission(resourceType, action)) {
        // Log unauthorized attempt
        const resourceId = req.params.id || req.params.documentId || req.params.projectId;
        logUnauthorizedAttempt(userId, userRole, resourceType, action, resourceId);

        // Return access denied message
        res.status(403).json({
          success: false,
          message: 'Access Denied: You do not have permission to create or edit this content. Please contact your manager.',
          code: 'ACCESS_DENIED',
          details: {
            resourceType,
            action,
            userRole,
          },
        });
        return;
      }

      // For UPDATE/DELETE on projects, additional check is needed in controller
      // to ensure employee can only modify assigned projects
      if (resourceType === ResourceType.PROJECT && action === PermissionAction.UPDATE) {
        // Allow middleware to pass, but controller will verify assignment
        next();
        return;
      }
    }

    // For other roles (TENDER_ENGINEER, CONTRACTOR), allow by default
    // Add specific restrictions here if needed
    next();
  };
};

/**
 * Middleware to restrict employees from create/edit/delete operations
 * Shorthand for common restrictions
 */
export const restrictEmployeeModifications = () => {
  return requirePermission(ResourceType.DEPARTMENT, PermissionAction.CREATE);
};

/**
 * Helper to check if user can modify a resource
 * Used in controllers for additional validation
 */
export const canUserModify = (
  userRole: string,
  resourceType: ResourceType,
  action: PermissionAction
): boolean => {
  if (isAdminRole(userRole)) {
    return true;
  }

  if (isEmployee(userRole)) {
    return hasEmployeePermission(resourceType, action);
  }

  // Default: allow for other roles
  return true;
};

/**
 * Get user-friendly error message for access denied
 */
export const getAccessDeniedMessage = (
  resourceType: ResourceType,
  action: PermissionAction
): string => {
  if (action === PermissionAction.CREATE) {
    return 'Access Denied: You do not have permission to create this content. Please contact your manager.';
  }
  if (action === PermissionAction.UPDATE) {
    return 'Access Denied: You do not have permission to edit this content. Please contact your manager.';
  }
  if (action === PermissionAction.DELETE) {
    return 'Access Denied: You do not have permission to delete this content. Please contact your manager.';
  }
  return 'Access Denied: You do not have permission to perform this action. Please contact your manager.';
};
