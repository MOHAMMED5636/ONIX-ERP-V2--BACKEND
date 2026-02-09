import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { getPhotoUrl } from '../utils/photo.utils';

/**
 * Update user profile (photo and jobTitle)
 * PUT /api/auth/profile
 * Access: Authenticated users (can only update their own profile)
 */
export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const { 
      jobTitle, 
      phone, 
      position,
      nationalIdNumber,
      nationalIdExpiryDate
    } = req.body;
    
    // Debug: Log request details
    console.log('📸 Profile update request received');
    console.log('   User ID:', userId);
    console.log('   Job Title:', jobTitle);
    console.log('   Phone:', phone);
    console.log('   Position:', position);
    console.log('   National ID Number:', nationalIdNumber);
    console.log('   Has file:', !!(req as any).file);
    console.log('   Request headers:', {
      'content-type': req.headers['content-type'],
      'content-length': req.headers['content-length']
    });
    
    // Get photo filename from uploaded file (if new photo uploaded)
    const file = (req as any).file;
    let photoFilename = file ? file.filename : undefined;
    
    if (file) {
      console.log('   File details:', {
        filename: file.filename,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path
      });
      
      // Sanitize filename to ensure no path separators
      if (photoFilename) {
        // Remove any path separators that might have been included
        photoFilename = photoFilename.replace(/[\/\\]/g, '_');
        // Also check the file.path to ensure it's correct
        const path = require('path');
        const expectedPath = path.join(process.cwd(), 'uploads', 'photos', photoFilename);
        console.log('   Expected file path:', expectedPath);
        console.log('   Actual file path:', file.path);
        
        // Verify the file actually exists at the expected location
        const fs = require('fs');
        if (fs.existsSync(file.path)) {
          console.log('   ✅ File exists at multer path');
        } else {
          console.log('   ⚠️  File does not exist at multer path');
        }
      }
    }

    // Build update data - allow employees to update their own profile fields
    const updateData: any = {};
    if (jobTitle !== undefined && jobTitle !== null) {
      updateData.jobTitle = jobTitle;
    }
    if (phone !== undefined && phone !== null) {
      updateData.phone = phone;
    }
    if (position !== undefined && position !== null) {
      updateData.position = position;
    }
    if (nationalIdNumber !== undefined && nationalIdNumber !== null) {
      updateData.nationalIdNumber = nationalIdNumber;
    }
    if (nationalIdExpiryDate !== undefined && nationalIdExpiryDate !== null) {
      // Parse date string if provided
      updateData.nationalIdExpiryDate = nationalIdExpiryDate ? new Date(nationalIdExpiryDate) : null;
    }
    if (photoFilename) {
      updateData.photo = photoFilename;
      console.log('   ✅ Photo will be updated to:', photoFilename);
    }

    // If no data to update
    if (Object.keys(updateData).length === 0) {
      res.status(400).json({
        success: false,
        message: 'No data provided to update'
      });
      return;
    }

    console.log('   Update data:', updateData);

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
        employeeId: true,
        nationalIdNumber: true,
        nationalIdExpiryDate: true,
      }
    });

    console.log('   ✅ User updated in database');
    console.log('   Photo in database:', user.photo);

    // Get photo URL - construct URL directly since we just uploaded the file
    const host = req.get('host') || 'localhost:3001';
    const protocol = req.protocol || 'http';
    
    // Construct photo URL directly (don't verify since we just uploaded it)
    let photoUrl: string | null = null;
    if (user.photo) {
      // If it's already a full URL, extract filename and reconstruct to ensure consistency
      if (user.photo.startsWith('http://') || user.photo.startsWith('https://')) {
        // Extract filename from URL if it contains /uploads/photos/
        if (user.photo.includes('/uploads/photos/')) {
          const filename = user.photo.split('/uploads/photos/')[1].split('?')[0]; // Remove query params
          photoUrl = `${protocol}://${host}/uploads/photos/${filename}`;
        } else {
          photoUrl = user.photo; // External URL, keep as-is
        }
      } else {
        // It's just a filename, construct full URL
        photoUrl = `${protocol}://${host}/uploads/photos/${user.photo}`;
      }
    }
    
    console.log('   Photo URL generated:', photoUrl);
    console.log('   Photo filename in DB:', user.photo);
    
    // Verify file exists (for logging only)
    if (user.photo && photoUrl) {
      const fs = require('fs');
      const path = require('path');
      // Extract just the filename (remove any path or URL parts)
      let filename = user.photo;
      if (filename.includes('/uploads/photos/')) {
        filename = filename.split('/uploads/photos/')[1].split('?')[0];
      } else if (filename.includes('\\uploads\\photos\\')) {
        filename = filename.split('\\uploads\\photos\\')[1];
      }
      const filePath = path.join(process.cwd(), 'uploads', 'photos', filename);
      const fileExists = fs.existsSync(filePath);
      console.log('   File exists check:', fileExists ? '✅ YES' : '❌ NO');
      console.log('   Checking file at:', filePath);
      if (!fileExists) {
        console.log(`   ⚠️  Photo file not found at: ${filePath}`);
        console.log(`   ⚠️  But will still return URL: ${photoUrl}`);
      }
    }

    const responseData = {
      ...user,
      photo: photoUrl, // Always return the constructed URL
    };

    console.log('   ✅ Sending response with photo:', responseData.photo);

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: responseData
    });
  } catch (error) {
    console.error('❌ Update profile error:', error);
    console.error('   Error details:', error instanceof Error ? error.message : error);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

