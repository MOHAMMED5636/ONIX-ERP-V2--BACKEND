import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import prisma from '../config/database';
import { config } from '../config/env';
import { AuthRequest } from '../middleware/auth.middleware';
import { getPhotoUrl } from '../utils/photo.utils';

/** Permissions per role for unified login / role-based access */
function getPermissionsForRole(role: string): string[] {
  switch (role) {
    case 'ADMIN':
    case 'HR':
    case 'PROJECT_MANAGER':
    case 'CONTRACTOR':
    case 'TENDER_ENGINEER':
      return ['*'];
    case 'EMPLOYEE':
      return ['view:dashboard', 'view:profile', 'view:projects', 'view:assigned_tasks', 'view:project_details'];
    default:
      return ['view:dashboard', 'view:profile'];
  }
}

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('=== LOGIN REQUEST ===');
    console.log(`[${new Date().toISOString()}] POST /api/auth/login`);
    const bodyRole = req.body.role;
    console.log('Received request body:', { email: req.body.email, password: req.body.password ? '***' : undefined, role: bodyRole ?? '(optional)' });
    
    let { email, password, role } = req.body;
    
    if (!email || !password) {
      res.status(400).json({ success: false, message: 'Email and password are required' });
      return;
    }
    
    email = email.trim().toLowerCase();
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ success: false, message: 'Invalid email format' });
      return;
    }
    
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        firstName: true,
        lastName: true,
        role: true,
        jobTitle: true,
        photo: true,
        phone: true,
        department: true,
        position: true,
        isActive: true,
        forcePasswordChange: true,
        employeeId: true,
      },
    }); 
    
    if (!user) {
      console.log('❌ Invalid credentials - user not found');
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }
    if (role && user.role !== role) {
      console.log('❌ Invalid credentials - role mismatch');
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      console.log('❌ Invalid credentials - password mismatch');
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }
    
    if (!user.isActive) {
      console.log('❌ Account is deactivated');
      res.status(403).json({ success: false, message: 'Account is deactivated' });
      return;
    }
    
    // Generate JWT token (always generate, even if password change required)
    const payload = { id: user.id, email: user.email, role: user.role };
    const secret = config.jwt.secret as string;
    const token = jwt.sign(payload, secret, {
      expiresIn: config.jwt.expiresIn
    } as SignOptions);
    
    console.log(`✅ Login successful for user: ${user.email} (${user.role})`);
    
    // Get photo URL - verify file exists before returning URL
    const photoUrl = getPhotoUrl(user.photo, req.protocol, req.get('host') || 'localhost:3001');
    
    if (user.photo && !photoUrl) {
      console.log(`⚠️  Photo file not found for user ${user.email}: ${user.photo}`);
    } else if (photoUrl) {
      console.log(`📸 Photo URL for ${user.email}: ${photoUrl}`);
    }

    const permissions = getPermissionsForRole(user.role);
    const userPayload = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      jobTitle: user.jobTitle,
      photo: photoUrl,
      forcePasswordChange: user.forcePasswordChange ?? false,
      employeeId: user.employeeId ?? null,
      permissions,
    };

    if (user.forcePasswordChange) {
      res.status(200).json({
        success: true,
        requiresPasswordChange: true,
        message: 'Password change required. Please change your password to continue.',
        data: {
          token,
          user: { ...userPayload, forcePasswordChange: true },
        },
      });
      return;
    }
    
    res.json({
      success: true,
      requiresPasswordChange: false,
      data: {
        token,
        user: userPayload,
      },
    });
    console.log('=== LOGIN REQUEST COMPLETED ===\n');
  } catch (error) {
    console.error('❌ Login error:', error);
    console.error('❌ Error details:', error instanceof Error ? error.message : String(error));
    console.error('❌ Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    console.log('=== LOGIN REQUEST FAILED ===\n');
    
    // Return more detailed error in development
    const errorMessage = process.env.NODE_ENV === 'development' 
      ? (error instanceof Error ? error.message : 'Internal server error')
      : 'Internal server error';
    
    res.status(500).json({ 
      success: false, 
      message: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { error: error instanceof Error ? error.stack : String(error) })
    });
  }
};

export const getCurrentUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user || !req.user.id) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        jobTitle: true,
        photo: true,
        phone: true,
        department: true,
        position: true,
        isActive: true,
        forcePasswordChange: true,
        employeeId: true,
      },
    });
    
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ success: false, message: 'Account is deactivated' });
      return;
    }
    
    const photoUrl = getPhotoUrl(user.photo, req.protocol, req.get('host') || 'localhost:3001');
    if (user.photo && !photoUrl) {
      console.log(`⚠️  Photo file not found for user ${user.email}: ${user.photo}`);
    }
    
    const permissions = getPermissionsForRole(user.role);
    res.json({ 
      success: true, 
      data: {
        ...user,
        photo: photoUrl,
        employeeId: user.employeeId ?? null,
        permissions,
      }
    });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Since JWT tokens are stateless, we can't invalidate them server-side
    // without implementing a token blacklist. This endpoint validates the token
    // and returns success, allowing the frontend to clear the token from storage.
    
    // The token is already validated by the authenticate middleware
    // We can optionally log the logout event or update user's last logout time
    
    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

