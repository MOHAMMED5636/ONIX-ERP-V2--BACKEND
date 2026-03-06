import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import prisma from '../config/database';
import { config } from '../config/env';
import { AuthRequest } from '../middleware/auth.middleware';
import { getPhotoUrl } from '../utils/photo.utils';
import { sendLoginOtpEmail } from '../services/email.service';

/** Permissions per role for unified login / role-based access */
function getPermissionsForRole(role: string): string[] {
  switch (role) {
    case 'ADMIN':
      return ['*']; // Full system access
    case 'HR':
    case 'PROJECT_MANAGER':
    case 'CONTRACTOR':
    case 'TENDER_ENGINEER':
      return ['*'];
    case 'MANAGER':
      // Manager: SAME base permissions as EMPLOYEE + manager-specific permissions
      // Managers use the SAME module/interface as employees, NOT admin
      return [
        'view:dashboard',
        'view:profile',
        'view:projects',
        'view:assigned_tasks',
        'view:project_details',
        'update:task_status',        // Same as employee: Can update task status
        'create:subtasks',           // Same as employee: Can create child/subtasks
        'delegate:subtasks',         // Same as employee: Can delegate child/subtasks
        'comment:tasks',             // Same as employee: Can comment on tasks
        'upload:files',              // Same as employee: Can upload files
        // Manager-specific additions:
        'view:team_tasks',           // Can view tasks of team members
        'view:team_performance',     // Can view team performance statistics
        'manage:team_tasks',         // Can reassign tasks within team
        'approve:leave',             // Can approve/reject leave
      ];
    case 'EMPLOYEE':
      return [
        'view:dashboard',
        'view:profile',
        'view:projects',
        'view:assigned_tasks',
        'view:project_details',
        'update:task_status',        // Can update task status
        'create:subtasks',           // Can create child/subtasks
        'delegate:subtasks',         // Can delegate child/subtasks assigned to them
        'comment:tasks',             // Can comment on tasks
        'upload:files',              // Can upload files
      ];
    default:
      return ['view:dashboard', 'view:profile'];
  }
}

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('=== LOGIN REQUEST ===');
    console.log(`[${new Date().toISOString()}] POST /api/auth/login`);
    console.log('Received request body:', { email: req.body.email, password: req.body.password ? '***' : undefined });
    
    let { email: emailOrMobile, password } = req.body;
    
    if (!emailOrMobile || !password) {
      res.status(400).json({ success: false, message: 'Email/mobile number and password are required' });
      return;
    }
    
    const trimmed = emailOrMobile.trim();
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    const mobileRegex = /^(\+?\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,9}[-.\s]?\d{1,9}$/;
    const normalizedMobile = trimmed.replace(/[-.\s()]/g, '');
    const isEmail = emailRegex.test(trimmed.toLowerCase());
    const isMobile = mobileRegex.test(normalizedMobile);
    
    if (!isEmail && !isMobile) {
      res.status(400).json({ success: false, message: 'Invalid email or mobile number format' });
      return;
    }
    
    // Find user by email OR phone
    const user = isEmail
      ? await prisma.user.findUnique({
          where: { email: trimmed.toLowerCase() },
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
        })
      : await prisma.user.findFirst({
          where: { 
            OR: [
              { phone: trimmed },
              { phone: normalizedMobile }
            ]
          },
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
    
    // Generate JWT token (stateless: id = userId, never reuse; no global user storage)
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

/** Returns current user from DB using only JWT payload (req.user.id). Stateless, no cache. */
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
        nationalIdNumber: true,
        nationalIdExpiryDate: true,
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

/**
 * Generate secure 6-digit numeric OTP
 */
const generateOtp = (): string => {
  // Generate random 6-digit number (100000 to 999999)
  return Math.floor(100000 + Math.random() * 900000).toString();
};

/**
 * Request login OTP
 * POST /api/auth/request-login-otp
 */
export const requestLoginOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('=== REQUEST LOGIN OTP ===');
    console.log(`[${new Date().toISOString()}] POST /api/auth/request-login-otp`);
    
    const { email } = req.body;
    
    if (!email) {
      res.status(400).json({ success: false, message: 'Email is required' });
      return;
    }
    
    const trimmedEmail = email.trim().toLowerCase();
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    
    if (!emailRegex.test(trimmedEmail)) {
      res.status(400).json({ success: false, message: 'Invalid email format' });
      return;
    }
    
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: trimmedEmail },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
      },
    });
    
    // Don't reveal if user exists or not (security best practice)
    // But we still need to check if user exists to send OTP
    if (!user) {
      console.log(`❌ User not found: ${trimmedEmail}`);
      // Return success message even if user doesn't exist (security)
      res.json({
        success: true,
        message: 'If the email exists, an OTP has been sent to your email address.',
      });
      return;
    }
    
    if (!user.isActive) {
      console.log(`❌ Account is deactivated: ${trimmedEmail}`);
      res.status(403).json({ success: false, message: 'Account is deactivated' });
      return;
    }
    
    // Generate 6-digit OTP
    const otp = generateOtp();
    const otpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now
    
    // Save OTP to database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginOtp: otp,
        loginOtpExpiry: otpExpiry,
      },
    });
    
    console.log(`✅ OTP generated for user: ${user.email}`);
    console.log(`   OTP: ${otp} (expires at: ${otpExpiry.toISOString()})`);
    
    // Send OTP via email
    try {
      const userName = `${user.firstName} ${user.lastName}`;
      await sendLoginOtpEmail(user.email, userName, otp);
      console.log(`✅ OTP email sent to: ${user.email}`);
    } catch (emailError: any) {
      console.error('❌ Failed to send OTP email:', emailError);
      console.error('   Error details:', {
        code: emailError?.code,
        message: emailError?.message,
        response: emailError?.response,
        command: emailError?.command,
      });
      
      // Clear OTP if email fails
      await prisma.user.update({
        where: { id: user.id },
        data: {
          loginOtp: null,
          loginOtpExpiry: null,
        },
      });
      
      // Provide more helpful error message
      let errorMessage = 'Failed to send OTP email. Please try again later.';
      if (emailError?.message) {
        errorMessage = emailError.message;
      } else if (emailError?.code === 'EAUTH') {
        errorMessage = 'Email authentication failed. Please check SMTP credentials.';
      } else if (emailError?.code === 'ECONNECTION' || emailError?.code === 'ETIMEDOUT') {
        errorMessage = 'Cannot connect to email server. Please check SMTP settings.';
      }
      
      res.status(500).json({
        success: false,
        message: errorMessage,
        ...(process.env.NODE_ENV === 'development' && {
          error: emailError?.message,
          code: emailError?.code,
        }),
      });
      return;
    }
    
    res.json({
      success: true,
      message: 'OTP has been sent to your email address. Please check your inbox.',
    });
    
    console.log('=== REQUEST LOGIN OTP COMPLETED ===\n');
  } catch (error) {
    console.error('❌ Request login OTP error:', error);
    console.error('❌ Error details:', error instanceof Error ? error.message : String(error));
    console.log('=== REQUEST LOGIN OTP FAILED ===\n');
    
    const errorMessage = process.env.NODE_ENV === 'development'
      ? (error instanceof Error ? error.message : 'Internal server error')
      : 'Internal server error';
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { error: error instanceof Error ? error.stack : String(error) }),
    });
  }
};

/**
 * Verify login OTP and login user
 * POST /api/auth/verify-login-otp
 */
export const verifyLoginOtp = async (req: Request, res: Response): Promise<void> => {
  try {
    console.log('=== VERIFY LOGIN OTP ===');
    console.log(`[${new Date().toISOString()}] POST /api/auth/verify-login-otp`);
    
    const { email, otp } = req.body;
    
    if (!email || !otp) {
      res.status(400).json({ success: false, message: 'Email and OTP are required' });
      return;
    }
    
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedOtp = otp.trim();
    
    // Validate OTP format (6 digits)
    if (!/^\d{6}$/.test(trimmedOtp)) {
      res.status(400).json({ success: false, message: 'Invalid OTP format. OTP must be 6 digits.' });
      return;
    }
    
    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email: trimmedEmail },
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
        loginOtp: true,
        loginOtpExpiry: true,
      },
    });
    
    if (!user) {
      console.log('❌ Invalid OTP - user not found');
      res.status(401).json({ success: false, message: 'Invalid OTP' });
      return;
    }
    
    if (!user.isActive) {
      console.log('❌ Account is deactivated');
      res.status(403).json({ success: false, message: 'Account is deactivated' });
      return;
    }
    
    // Verify OTP
    if (!user.loginOtp || user.loginOtp !== trimmedOtp) {
      console.log('❌ Invalid OTP - OTP mismatch');
      res.status(401).json({ success: false, message: 'Invalid OTP' });
      return;
    }
    
    // Check OTP expiry
    if (!user.loginOtpExpiry || new Date() > user.loginOtpExpiry) {
      console.log('❌ Invalid OTP - OTP expired');
      // Clear expired OTP
      await prisma.user.update({
        where: { id: user.id },
        data: {
          loginOtp: null,
          loginOtpExpiry: null,
        },
      });
      res.status(401).json({ success: false, message: 'OTP has expired. Please request a new OTP.' });
      return;
    }
    
    // OTP is valid - clear it from database
    await prisma.user.update({
      where: { id: user.id },
      data: {
        loginOtp: null,
        loginOtpExpiry: null,
      },
    });
    
    // Generate JWT token
    const payload = { id: user.id, email: user.email, role: user.role };
    const secret = config.jwt.secret as string;
    const token = jwt.sign(payload, secret, {
      expiresIn: config.jwt.expiresIn,
    } as SignOptions);
    
    console.log(`✅ OTP verified and login successful for user: ${user.email} (${user.role})`);
    
    // Get photo URL
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
    
    console.log('=== VERIFY LOGIN OTP COMPLETED ===\n');
  } catch (error) {
    console.error('❌ Verify login OTP error:', error);
    console.error('❌ Error details:', error instanceof Error ? error.message : String(error));
    console.log('=== VERIFY LOGIN OTP FAILED ===\n');
    
    const errorMessage = process.env.NODE_ENV === 'development'
      ? (error instanceof Error ? error.message : 'Internal server error')
      : 'Internal server error';
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      ...(process.env.NODE_ENV === 'development' && { error: error instanceof Error ? error.stack : String(error) }),
    });
  }
};
