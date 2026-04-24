import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { getPhotoUrl } from '../utils/photo.utils';
import { labourDetailsToSelfServicePayroll } from '../utils/payroll.utils';
import { shapeEmployeeForClient } from '../utils/employee-response';

function parseBodyDate(v: unknown): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseBodyInt(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = parseInt(String(v), 10);
  return Number.isNaN(n) ? null : n;
}

function optionalString(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/**
 * Update own profile (self-service). Sensitive fields (email, role, employeeId, etc.) are not accepted here.
 * PUT /api/auth/profile
 */
export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.id;
    const b = req.body;
    const {
      jobTitle,
      phone,
      position,
      nationalIdNumber,
      nationalIdExpiryDate,
      firstName,
      lastName,
      department,
      company,
      companyLocation,
      employeeType,
      joiningDate,
      attendanceProgram,
      gender,
      maritalStatus,
      nationality,
      birthday,
      childrenCount,
      currentAddress,
      phoneNumbers,
      emailAddresses,
      passportNumber,
      passportIssueDate,
      passportExpiryDate,
      residencyNumber,
      residencyExpiryDate,
      visaNumber,
      insuranceNumber,
      insuranceExpiryDate,
      labourIdNumber,
      labourIdExpiryDate,
      drivingLicenseNumber,
      drivingLicenseExpiryDate,
    } = b;
    
    // Debug: Log request details
    console.log('📸 Profile update request received');
    console.log('   User ID:', userId);
    console.log('   Job Title:', jobTitle);
    console.log('   Phone:', phone);
    console.log('   Position:', position);
    console.log('   National ID Number:', nationalIdNumber);
    console.log('   Body keys:', Object.keys(b || {}));
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

    const updateData: Record<string, unknown> = {};

    if (firstName !== undefined) {
      const t = String(firstName ?? '').trim();
      if (t.length > 0) updateData.firstName = t;
    }
    if (lastName !== undefined) {
      const t = String(lastName ?? '').trim();
      if (t.length > 0) updateData.lastName = t;
    }

    if (jobTitle !== undefined) updateData.jobTitle = optionalString(jobTitle);
    if (phone !== undefined) updateData.phone = optionalString(phone);
    if (position !== undefined) updateData.position = optionalString(position);
    if (department !== undefined) updateData.department = optionalString(department);
    if (company !== undefined) updateData.company = optionalString(company);
    if (companyLocation !== undefined) updateData.companyLocation = optionalString(companyLocation);
    if (employeeType !== undefined) updateData.employeeType = optionalString(employeeType);
    if (attendanceProgram !== undefined) updateData.attendanceProgram = optionalString(attendanceProgram);

    if (nationalIdNumber !== undefined) updateData.nationalIdNumber = optionalString(nationalIdNumber);
    if (gender !== undefined) updateData.gender = optionalString(gender);
    if (maritalStatus !== undefined) updateData.maritalStatus = optionalString(maritalStatus);
    if (nationality !== undefined) updateData.nationality = optionalString(nationality);
    if (currentAddress !== undefined) updateData.currentAddress = optionalString(currentAddress);
    if (passportNumber !== undefined) updateData.passportNumber = optionalString(passportNumber);
    if (residencyNumber !== undefined) updateData.residencyNumber = optionalString(residencyNumber);
    if (visaNumber !== undefined) updateData.visaNumber = optionalString(visaNumber);
    if (insuranceNumber !== undefined) updateData.insuranceNumber = optionalString(insuranceNumber);
    if (labourIdNumber !== undefined) updateData.labourIdNumber = optionalString(labourIdNumber);
    if (drivingLicenseNumber !== undefined) updateData.drivingLicenseNumber = optionalString(drivingLicenseNumber);

    const nidExp = parseBodyDate(nationalIdExpiryDate);
    if (nidExp !== undefined) updateData.nationalIdExpiryDate = nidExp;
    const bd = parseBodyDate(birthday);
    if (bd !== undefined) updateData.birthday = bd;
    const pid = parseBodyDate(passportIssueDate);
    if (pid !== undefined) updateData.passportIssueDate = pid;
    const pex = parseBodyDate(passportExpiryDate);
    if (pex !== undefined) updateData.passportExpiryDate = pex;
    const rex = parseBodyDate(residencyExpiryDate);
    if (rex !== undefined) updateData.residencyExpiryDate = rex;
    const iex = parseBodyDate(insuranceExpiryDate);
    if (iex !== undefined) updateData.insuranceExpiryDate = iex;
    const lex = parseBodyDate(labourIdExpiryDate);
    if (lex !== undefined) updateData.labourIdExpiryDate = lex;
    const dex = parseBodyDate(drivingLicenseExpiryDate);
    if (dex !== undefined) updateData.drivingLicenseExpiryDate = dex;
    const jd = parseBodyDate(joiningDate);
    if (jd !== undefined) updateData.joiningDate = jd;

    const cc = parseBodyInt(childrenCount);
    if (cc !== undefined) updateData.childrenCount = cc;

    if (phoneNumbers !== undefined) {
      if (phoneNumbers === null || phoneNumbers === '') {
        updateData.phoneNumbers = null;
      } else if (typeof phoneNumbers === 'string') {
        const raw = phoneNumbers.trim();
        if (!raw) updateData.phoneNumbers = null;
        else {
          try {
            JSON.parse(raw);
            updateData.phoneNumbers = raw;
          } catch {
            const lines = raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
            updateData.phoneNumbers =
              lines.length > 0
                ? JSON.stringify(lines.map((value) => ({ type: 'phone', value, countryCode: '' })))
                : null;
          }
        }
      }
    }

    if (emailAddresses !== undefined) {
      if (emailAddresses === null || emailAddresses === '') {
        updateData.emailAddresses = null;
      } else if (typeof emailAddresses === 'string') {
        const raw = emailAddresses.trim();
        if (!raw) updateData.emailAddresses = null;
        else {
          try {
            JSON.parse(raw);
            updateData.emailAddresses = raw;
          } catch {
            const lines = raw.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
            updateData.emailAddresses =
              lines.length > 0
                ? JSON.stringify(lines.map((value) => ({ type: 'email', value })))
                : null;
          }
        }
      }
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
        company: true,
        companyLocation: true,
        employeeType: true,
        joiningDate: true,
        attendanceProgram: true,
        gender: true,
        maritalStatus: true,
        nationality: true,
        birthday: true,
        childrenCount: true,
        currentAddress: true,
        phoneNumbers: true,
        emailAddresses: true,
        passportNumber: true,
        passportIssueDate: true,
        passportExpiryDate: true,
        residencyNumber: true,
        residencyExpiryDate: true,
        visaNumber: true,
        insuranceNumber: true,
        insuranceExpiryDate: true,
        labourIdNumber: true,
        labourIdExpiryDate: true,
        drivingLicenseNumber: true,
        drivingLicenseExpiryDate: true,
        isLabour: true,
        labourDetails: {
          select: {
            basicSalary: true,
            contractTotalSalary: true,
            allowance1: true,
            allowance2: true,
          },
        },
      },
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

    const { labourDetails: profileLabour, ...userWithoutLabour } = user;
    const shaped = shapeEmployeeForClient(userWithoutLabour as unknown as Record<string, unknown>, req);
    const responseData = {
      ...shaped,
      photo: photoUrl || user.photo || null,
      payroll: labourDetailsToSelfServicePayroll(profileLabour),
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

