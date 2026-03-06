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
      console.log('   📸 File upload detected:', {
        filename: file.filename,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        path: file.path,
        fieldname: file.fieldname
      });
      
      // Verify the file actually exists
      const fs = require('fs');
      const path = require('path');
      
      if (!fs.existsSync(file.path)) {
        console.error('   ❌ CRITICAL: File does not exist at multer path:', file.path);
        res.status(500).json({
          success: false,
          message: 'File upload failed - file was not saved correctly'
        });
        return;
      }
      
      // Verify file size is not zero
      const stats = fs.statSync(file.path);
      if (stats.size === 0) {
        console.error('   ❌ CRITICAL: Uploaded file is empty (0 bytes)');
        fs.unlinkSync(file.path); // Delete empty file
        res.status(400).json({
          success: false,
          message: 'Uploaded file is empty. Please try again.'
        });
        return;
      }
      
      console.log('   ✅ File verified:', {
        exists: true,
        size: stats.size,
        path: file.path
      });
      
      // Sanitize filename to ensure no path separators
      if (photoFilename) {
        // Remove any path separators that might have been included
        photoFilename = photoFilename.replace(/[\/\\]/g, '_');
        console.log('   ✅ Sanitized filename:', photoFilename);
      } else {
        console.error('   ❌ CRITICAL: No filename in file object');
        res.status(500).json({
          success: false,
          message: 'File upload failed - no filename received'
        });
        return;
      }
    } else {
      console.log('   ℹ️  No file uploaded in this request');
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
      
      // Double-check file exists before updating database
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(process.cwd(), 'uploads', 'photos', photoFilename);
      if (!fs.existsSync(filePath)) {
        console.error('   ❌ CRITICAL: File does not exist before database update:', filePath);
        res.status(500).json({
          success: false,
          message: 'File upload failed - file was not saved correctly'
        });
        return;
      }
    }

    // If no data to update (but allow photo-only updates)
    if (Object.keys(updateData).length === 0) {
      console.log('   ⚠️  No update data provided');
      res.status(400).json({
        success: false,
        message: 'No data provided to update'
      });
      return;
    }
    
    // Log what will be updated
    console.log('   📝 Updating profile with:', Object.keys(updateData));

    console.log('   Update data:', updateData);

    // Update user profile (persist to DB)
    await prisma.user.update({
      where: { id: userId },
      data: updateData,
    });

    const user = await prisma.user.findUnique({
      where: { id: userId },
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

    if (!user) {
      res.status(500).json({ success: false, message: 'Failed to read updated profile' });
      return;
    }

    console.log('   ✅ User updated in database');
    console.log('   Photo in database (saved):', user.photo);

    // Get photo URL - construct URL directly since we just uploaded the file
    const host = req.get('host') || 'localhost:3001';
    const protocol = req.protocol || 'http';
    
    // Construct photo URL directly (don't verify since we just uploaded it)
    let photoUrl: string | null = null;
    if (user.photo) {
      // Extract just the filename (remove any path or URL parts)
      let filename = user.photo;
      if (filename.includes('/uploads/photos/')) {
        filename = filename.split('/uploads/photos/')[1].split('?')[0];
      } else if (filename.includes('\\uploads\\photos\\')) {
        filename = filename.split('\\uploads\\photos\\')[1];
      } else if (filename.startsWith('http://') || filename.startsWith('https://')) {
        // Extract filename from full URL
        const urlParts = filename.split('/');
        filename = urlParts[urlParts.length - 1].split('?')[0];
      }
      
      // Always construct full URL with protocol and host
      photoUrl = `${protocol}://${host}/uploads/photos/${filename}`;
      
      // Verify file exists before returning URL
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(process.cwd(), 'uploads', 'photos', filename);
      const fileExists = fs.existsSync(filePath);
      
      console.log('   📸 Photo URL construction:', {
        filename: filename,
        filePath: filePath,
        fileExists: fileExists ? '✅ YES' : '❌ NO',
        photoUrl: photoUrl
      });
      
      if (!fileExists) {
        console.error(`   ❌ CRITICAL: Photo file not found at: ${filePath}`);
        console.error(`   ❌ This means the file upload failed or file was deleted`);
        // Still return the URL but log the error - frontend will handle 404
      }
    }
    
    console.log('   ✅ Final photo URL:', photoUrl);
    console.log('   ✅ Photo filename in DB:', user.photo);

    // Ensure photo URL is always included in response if photo was updated
    const responseData = {
      ...user,
      photo: photoUrl || user.photo || null, // Always return the constructed URL or existing photo
    };

    console.log('   ✅ Sending response:', {
      success: true,
      photoInResponse: !!responseData.photo,
      photoUrl: responseData.photo,
      photoFilename: user.photo
    });

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

