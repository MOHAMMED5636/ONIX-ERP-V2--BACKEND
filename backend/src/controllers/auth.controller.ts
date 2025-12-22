import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import prisma from '../config/database';
import { config } from '../config/env';
import { AuthRequest } from '../middleware/auth.middleware';

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, role } = req.body;
    
    // Input validation
    if (!email || !password || !role) {
      res.status(400).json({ 
        success: false, 
        message: 'Email, password, and role are required' 
      });
      return;
    }
    
    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
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
    
    // Generate JWT token
    const payload = { id: user.id, email: user.email, role: user.role };
    const secret = config.jwt.secret as string;
    const token = jwt.sign(payload, secret, {
      expiresIn: config.jwt.expiresIn
    } as SignOptions);
    
    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
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
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
      },
    });
    
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

