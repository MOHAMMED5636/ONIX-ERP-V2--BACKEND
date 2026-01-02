import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

/**
 * Update user profile (photo and jobTitle)
 * PUT /api/auth/profile
 * Access: Authenticated users (can only update their own profile)
 */
export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { jobTitle } = req.body;
    
    // Get photo filename from uploaded file (if new photo uploaded)
    const photoFilename = (req as any).file ? (req as any).file.filename : undefined;

    // Build update data
    const updateData: any = {};
    if (jobTitle !== undefined) updateData.jobTitle = jobTitle;
    if (photoFilename !== undefined) updateData.photo = photoFilename;

    // If no data to update
    if (Object.keys(updateData).length === 0) {
      res.status(400).json({
        success: false,
        message: 'No data provided to update'
      });
      return;
    }

    // Update user profile
    const user = await prisma.user.update({
      where: { id: userId },
      data: updateData,
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
      }
    });

    // Get photo URL
    const photoUrl = user.photo 
      ? (user.photo.startsWith('http') ? user.photo : `${req.protocol}://${req.get('host')}/uploads/photos/${user.photo}`)
      : null;

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        ...user,
        photo: photoUrl,
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile'
    });
  }
};

