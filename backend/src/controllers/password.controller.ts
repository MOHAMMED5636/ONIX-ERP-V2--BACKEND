import { Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

/**
 * Change password
 * POST /api/auth/change-password
 * Access: Authenticated users
 */
export const changePassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user!.id;

    // Validation
    if (!currentPassword || !newPassword) {
      res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
      return;
    }

    // Password strength validation
    if (newPassword.length < 8) {
      res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters long'
      });
      return;
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true, forcePasswordChange: true }
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);
    if (!isValidPassword) {
      res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
      return;
    }

    // Check if new password is same as current
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      res.status(400).json({
        success: false,
        message: 'New password must be different from current password'
      });
      return;
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear forcePasswordChange flag
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        forcePasswordChange: false, // Clear the flag after password change
      }
    });

    res.json({
      success: true,
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to change password'
    });
  }
};

/**
 * Reset password (Admin/HR only)
 * POST /api/auth/reset-password/:userId
 * Access: ADMIN, HR only
 */
export const resetPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { newPassword } = req.body;

    // Validation
    if (!newPassword) {
      res.status(400).json({
        success: false,
        message: 'New password is required'
      });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
      return;
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: 'User not found'
      });
      return;
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and force change
    await prisma.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        forcePasswordChange: true, // Force user to change password on next login
      }
    });

    res.json({
      success: true,
      message: 'Password reset successfully. User will be required to change password on next login.'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
};

/**
 * Set password for employee (Admin only)
 * POST /api/admin/set-password
 * Access: ADMIN only
 * Allows admin to create/set a password for any employee without requiring old password
 */
export const setPassword = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const adminId = req.user!.id;
    const { employeeId, newPassword } = req.body;

    // Validation
    if (!employeeId || !newPassword) {
      res.status(400).json({
        success: false,
        message: 'Employee ID and new password are required'
      });
      return;
    }

    // Password strength validation
    if (newPassword.length < 8) {
      res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters long'
      });
      return;
    }

    // Check if password contains at least one letter and one number
    const hasLetter = /[a-zA-Z]/.test(newPassword);
    const hasNumber = /\d/.test(newPassword);
    if (!hasLetter || !hasNumber) {
      res.status(400).json({
        success: false,
        message: 'Password must contain at least one letter and one number'
      });
      return;
    }

    // Check if employee exists
    const employee = await prisma.user.findUnique({
      where: { id: employeeId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        employeeId: true
      }
    });

    if (!employee) {
      res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
      return;
    }

    // Get admin info for logging
    const admin = await prisma.user.findUnique({
      where: { id: adminId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true
      }
    });

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear forcePasswordChange flag (admin is setting it, so no force change needed)
    await prisma.user.update({
      where: { id: employeeId },
      data: {
        password: hashedPassword,
        forcePasswordChange: false, // Admin sets password, so no need to force change
      }
    });

    // Log the action for audit purposes
    console.log(`🔐 [AUDIT] Admin set password for employee:`, {
      adminId: adminId,
      adminEmail: admin?.email,
      adminName: `${admin?.firstName} ${admin?.lastName}`,
      employeeId: employeeId,
      employeeEmail: employee.email,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      employeeRole: employee.role,
      timestamp: new Date().toISOString(),
      action: 'SET_PASSWORD'
    });

    res.json({
      success: true,
      message: `Password set successfully for ${employee.firstName} ${employee.lastName}`
    });
  } catch (error) {
    console.error('Set password error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to set password'
    });
  }
};


