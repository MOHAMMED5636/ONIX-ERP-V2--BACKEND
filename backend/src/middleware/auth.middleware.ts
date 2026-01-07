import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/env';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
  body: any;
  query: any;
  params: any;
  headers: any;
}

export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const token = req.headers.authorization?.split(' ')[1]; // Bearer <token>
    
    if (!token) {
      res.status(401).json({ 
        success: false, 
        message: 'No token provided',
        code: 'NO_TOKEN'
      });
      return;
    }
    
    const decoded = jwt.verify(token, config.jwt.secret) as any;
    req.user = {
      id: decoded.id,
      email: decoded.email,
      role: decoded.role,
    };
    
    next();
  } catch (error) {
    // Provide more specific error information
    let errorMessage = 'Invalid or expired token';
    let errorCode = 'INVALID_TOKEN';
    
    if (error instanceof jwt.TokenExpiredError) {
      errorMessage = 'Token has expired';
      errorCode = 'TOKEN_EXPIRED';
    } else if (error instanceof jwt.JsonWebTokenError) {
      errorMessage = 'Invalid token';
      errorCode = 'INVALID_TOKEN';
    }
    
    res.status(401).json({ 
      success: false, 
      message: errorMessage,
      code: errorCode
    });
    return;
  }
};

// Optional authentication middleware - allows request to continue even if token is invalid
// Useful for endpoints that can work with or without authentication
export const optionalAuthenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    
    if (token) {
      try {
        const decoded = jwt.verify(token, config.jwt.secret) as any;
        req.user = {
          id: decoded.id,
          email: decoded.email,
          role: decoded.role,
        };
      } catch (error) {
        // Token invalid or expired, but continue without user
        req.user = undefined;
      }
    }
    
    next();
  } catch (error) {
    // If there's any other error, continue without authentication
    req.user = undefined;
    next();
  }
};

