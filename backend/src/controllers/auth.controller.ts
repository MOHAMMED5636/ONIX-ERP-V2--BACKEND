import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import prisma from '../config/database';
import { config } from '../config/env';
import { AuthRequest } from '../middleware/auth.middleware';

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    let { email, password, role } = req.body;
    
    // Input validation
    if (!email || !password || !role) {
      res.status(400).json({ 
        success: false, 
        message: 'Email, password, and role are required' 
      });
      return;
    }
    
    // Trim whitespace from email
    email = email.trim().toLowerCase();
    
    // Email format validation - more robust regex
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({ 
        success: false, 
        message: 'Invalid email format' 
      });
      return;
    }
    
    // Find user by email
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
      },
    }); 
    
    if (!user || user.role !== role) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }
    
    if (!user.isActive) {
      res.status(403).json({ success: false, message: 'Account is deactivated' });
      return;
    }
    
    // Generate JWT token (always generate, even if password change required)
    const payload = { id: user.id, email: user.email, role: user.role };
    const secret = config.jwt.secret as string;
    const token = jwt.sign(payload, secret, {
      expiresIn: config.jwt.expiresIn
    } as SignOptions);
    
    // Get photo URL
    const photoUrl = user.photo 
      ? (user.photo.startsWith('http') ? user.photo : `${req.protocol}://${req.get('host')}/uploads/photos/${user.photo}`)
      : null;

    // Check if password change is required
    if (user.forcePasswordChange) {
      res.status(200).json({
        success: true,
        requiresPasswordChange: true,
        message: 'Password change required. Please change your password to continue.',
        data: {
          token, // Still provide token for password change endpoint access
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            jobTitle: user.jobTitle,
            photo: photoUrl,
            forcePasswordChange: true,
          },
        },
      });
      return;
    }
    
    res.json({
      success: true,
      requiresPasswordChange: false,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          jobTitle: user.jobTitle,
          photo: photoUrl,
          forcePasswordChange: false,
        },
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
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
    
    res.json({ success: true, data: user });
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

