import { Response } from 'express';
import { shapeEmployeeForClient } from '../utils/employee-response';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { labourDetailsToSelfServicePayroll } from '../utils/payroll.utils';
import {
  liftNestedFormSectionsOntoRoot,
  normalizeEmployeeDirectoryBody,
  parseEmployeeDate,
  resolveDrivingLicenseNumberForDb,
  resolveEmailAddressesJson,
  resolveLabourIdNumberForDb,
  resolvePhoneNumbersJson,
  shouldPatchEmailAddresses,
  shouldPatchPhoneNumbers,
} from '../utils/employee-directory-body';
import { buildEmployeeUpdateChangeRows, formatEmployeeFieldForLog } from '../utils/employee-change-log';
import { sendEmployeeErpAccessEmail } from '../services/employeeErpAccessEmail.service';

/** Prefer department id (authoritative name in DB); else use string from the form. */
async function resolveDepartmentForUser(department: unknown, departmentId: unknown): Promise<string | null> {
  if (departmentId != null && String(departmentId).trim() !== '') {
    const row = await prisma.department.findUnique({
      where: { id: String(departmentId).trim() },
      select: { name: true },
    });
    if (row?.name) return row.name;
  }
  if (department != null && String(department).trim() !== '') {
    return String(department).trim();
  }
  return null;
}

/**
 * Multipart forms often submit `""` for every key; empty string must not erase existing DB values.
 * JSON `null` still means "clear this field" where we honor it below.
 */
function shouldPatchOptionalScalar(v: unknown): boolean {
  if (v === undefined) return false;
  if (v === null) return true;
  if (typeof v === 'string' && v.trim() === '') return false;
  return true;
}

/**
 * Generate a secure random password
 */
const generateTemporaryPassword = (): string => {
  const length = 12;
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return password;
};

/**
 * Generate email from name
 */
const generateEmail = (firstName: string, lastName: string): string => {
  const baseEmail = `${firstName.toLowerCase()}.${lastName.toLowerCase()}@onixgroup.ae`;
  return baseEmail;
};

/**
 * Helper function to convert string/boolean to boolean
 */
const parseBoolean = (value: any): boolean => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    return lower === 'true' || lower === '1' || lower === 'yes';
  }
  return false;
};

/** Parse projectIds from JSON body or multipart string. */
function resolveProjectIdsList(projectIds: unknown): string[] {
  if (projectIds === undefined || projectIds === null) return [];
  if (Array.isArray(projectIds)) return projectIds.map((x) => String(x)).filter(Boolean);
  if (typeof projectIds === 'string') {
    const t = projectIds.trim();
    if (!t) return [];
    try {
      const parsed = JSON.parse(t);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x)).filter(Boolean);
    } catch {
      /* use delimiter split */
    }
    return t.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function sortJoinProjectIds(ids: string[]): string {
  return [...new Set(ids)].sort().join(',');
}

function employeeAuditRoleLabel(role: string | undefined): string {
  if (role === 'ADMIN') return 'Admin';
  if (role === 'HR') return 'HR';
  return role ? String(role) : 'Unknown';
}

/**
 * Check if email exists and generate unique one
 */
const generateUniqueEmail = async (firstName: string, lastName: string): Promise<string> => {
  let email = generateEmail(firstName, lastName);
  let counter = 1;
  
  while (await prisma.user.findUnique({ where: { email } })) {
    email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${counter}@onixgroup.ae`;
    counter++;
  }
  
  return email;
};

/**
 * Create new employee
 * POST /api/employees
 * Access: ADMIN, HR only
 */
export const createEmployee = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Check authentication
    if (!req.user || !req.user.id) {
      console.error('❌ Authentication failed: No user ID found');
      res.status(401).json({
        success: false,
        message: 'Authentication required. Please log in again.',
      });
      return;
    }
    
    console.log('📝 Creating employee - Request received');
    console.log('📝 User ID:', req.user.id);
    console.log('📝 User email:', req.user.email);
    console.log('📝 User role:', req.user.role);
    
    // Debug: Log entire req.body to see what's actually received
    const rawCreateBody = (req.body || {}) as Record<string, unknown>;
    const body = normalizeEmployeeDirectoryBody(rawCreateBody) as Record<string, any>;
    const flatForLegalResolversCreate = { ...rawCreateBody, ...body } as Record<string, unknown>;

    console.log('📦 Full req.body:', JSON.stringify(req.body, null, 2));
    console.log('📦 req.body keys:', Object.keys(req.body || {}));
    console.log('📦 Content-Type:', req.headers['content-type']);
    console.log('📦 Files received:', req.files ? Object.keys(req.files) : 'No files');
    
    const { 
      // Basic fields
      firstName, lastName, role, phone, department, departmentId, position, jobTitle, employeeId, projectIds,
      // ERP Access (login credentials)
      workEmail, password: plainPassword,
      // Employee Directory - Personal Info
      employeeType, status, userAccount,
      // Employee Directory - Personal Details
      gender, maritalStatus, nationality, birthday, childrenCount, currentAddress,
      // Employee Directory - Contact Info (resolved via resolvePhoneNumbersJson / resolveEmailAddressesJson on body)
      // Employee Directory - Company Info
      company, companyLocation, managerId, attendanceProgram, joiningDate, exitDate, isLineManager,
      // Employee Directory - Legal Documents
      passportNumber, passportIssueDate, passportExpiryDate, passportAttachment,
      nationalIdNumber, nationalIdExpiryDate, nationalIdAttachment,
      residencyNumber, residencyExpiryDate, residencyAttachment, visaNumber,
      insuranceNumber, insuranceExpiryDate, insuranceAttachment,
      drivingLicenseNumber, drivingLicenseExpiryDate, drivingLicenseAttachment,
      labourIdNumber, labourIdExpiryDate, labourIdAttachment,
      remarks
    } = body;
    
    // Debug: Log passport fields
    console.log('📋 Received passport data:', {
      passportNumber: passportNumber,
      passportIssueDate: passportIssueDate,
      passportExpiryDate: passportExpiryDate,
      passportNumberType: typeof passportNumber,
      passportIssueDateType: typeof passportIssueDate,
      passportExpiryDateType: typeof passportExpiryDate,
      bodyKeys: Object.keys(body).filter(k => k.includes('passport'))
    });
    
    // Get all uploaded files from multer (photo + legal documents)
    const files = (req as any).files || {};
    
    // Get photo filename (photo is in files.photo array when using .fields())
    const photoFilename = files.photo?.[0]?.filename || null;
    
    // Get legal document filenames from uploaded files
    const passportAttachmentFile = files.passportAttachment?.[0]?.filename || null;
    const nationalIdAttachmentFile = files.nationalIdAttachment?.[0]?.filename || null;
    const residencyAttachmentFile = files.residencyAttachment?.[0]?.filename || null;
    const insuranceAttachmentFile = files.insuranceAttachment?.[0]?.filename || null;
    const drivingLicenseAttachmentFile = files.drivingLicenseAttachment?.[0]?.filename || null;
    const labourIdAttachmentFile = files.labourIdAttachment?.[0]?.filename || null;

    // Validation - ensure required fields are present and valid
    if (!firstName || typeof firstName !== 'string' || firstName.trim() === '') {
      console.error('❌ Invalid firstName:', firstName, typeof firstName);
      res.status(400).json({
        success: false,
        message: 'First name is required and must be a non-empty string'
      });
      return;
    }
    
    if (!lastName || typeof lastName !== 'string' || lastName.trim() === '') {
      console.error('❌ Invalid lastName:', lastName, typeof lastName);
      res.status(400).json({
        success: false,
        message: 'Last name is required and must be a non-empty string'
      });
      return;
    }
    
    // Trim names
    const trimmedFirstName = firstName.trim();
    const trimmedLastName = lastName.trim();
    
    if (trimmedFirstName.length === 0 || trimmedLastName.length === 0) {
      res.status(400).json({
        success: false,
        message: 'First name and last name cannot be empty'
      });
      return;
    }

    // Employee ID: required and unique
    if (!employeeId || typeof employeeId !== 'string' || employeeId.trim() === '') {
      res.status(400).json({
        success: false,
        message: 'Employee ID is required'
      });
      return;
    }
    const trimmedEmployeeId = employeeId.trim();
    const existingByEmployeeId = await prisma.user.findFirst({
      where: { employeeId: trimmedEmployeeId },
    });
    if (existingByEmployeeId) {
      res.status(409).json({
        success: false,
        message: 'An employee with this Employee ID already exists. Please use a unique Employee ID.'
      });
      return;
    }

    // Status: required
    if (!status || typeof status !== 'string' || status.trim() === '') {
      res.status(400).json({
        success: false,
        message: 'Status is required'
      });
      return;
    }

    // Employee type: required
    if (!employeeType || typeof employeeType !== 'string' || employeeType.trim() === '') {
      res.status(400).json({
        success: false,
        message: 'Employee type is required'
      });
      return;
    }

    // Validate minimum age (18 years)
    if (birthday) {
      const birthDate = new Date(birthday);
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      
      if (age < 18) {
        res.status(400).json({
          success: false,
          message: 'This employee cannot be added to the company unless they are at least 18 years old.'
        });
        return;
      }
    }

    // Process passport fields - trim strings if they are strings
    const passportNum = typeof passportNumber === 'string' ? passportNumber.trim() : passportNumber;
    const passportIssue = typeof passportIssueDate === 'string' ? passportIssueDate.trim() : passportIssueDate;
    const passportExpiry = typeof passportExpiryDate === 'string' ? passportExpiryDate.trim() : passportExpiryDate;
    
    // Debug logging
    console.log('Passport validation:', {
      passportNumber: passportNumber,
      passportNum: passportNum,
      passportIssueDate: passportIssueDate,
      passportIssue: passportIssue,
      passportExpiryDate: passportExpiryDate,
      passportExpiry: passportExpiry
    });
    
    // Validate passport fields - Passport is required
    const missingFields = [];
    if (!passportNum || passportNum === '') {
      missingFields.push('passport number');
    }
    if (!passportIssue || passportIssue === '') {
      missingFields.push('passport issue date');
    }
    if (!passportExpiry || passportExpiry === '') {
      missingFields.push('passport expiry date');
    }
    
    if (missingFields.length > 0) {
      res.status(400).json({
        success: false,
        message: `Passport ${missingFields.join(', ')} ${missingFields.length === 1 ? 'is' : 'are'} required.`,
        receivedData: { passportNumber, passportIssueDate, passportExpiryDate }
      });
      return;
    }

    // Validate passport expiry date - must be at least 6 months from today
    if (passportExpiry) {
      const expiryDate = new Date(passportExpiry);
      const today = new Date();
      
      // Check if date is valid
      if (isNaN(expiryDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid passport expiry date format.'
        });
        return;
      }
      
      // Calculate 6 months from today
      const sixMonthsFromNow = new Date();
      sixMonthsFromNow.setMonth(today.getMonth() + 6);
      
      // Check if expiry date is at least 6 months away
      if (expiryDate < sixMonthsFromNow) {
        res.status(400).json({
          success: false,
          message: 'Passport must be valid for at least 6 months from today. Please upload a passport with a later expiry date.'
        });
        return;
      }
    }

    // Validate role
    const validRoles = ['EMPLOYEE', 'PROJECT_MANAGER', 'TENDER_ENGINEER', 'HR', 'ADMIN'];
    if (role && !validRoles.includes(role)) {
      res.status(400).json({
        success: false,
        message: `Invalid role. Must be one of: ${validRoles.join(', ')}`
      });
      return;
    }

    // Verify manager exists if provided
    if (managerId) {
      const manager = await prisma.user.findUnique({
        where: { id: managerId },
      });
      if (!manager) {
        res.status(404).json({
          success: false,
          message: 'Manager not found'
        });
        return;
      }
    }

    // Parse boolean values from FormData (they come as strings)
    const userAccountBool = typeof userAccount === 'string' 
      ? (userAccount.toLowerCase().trim() === 'true' || userAccount.toLowerCase().trim() === '1' || userAccount.toLowerCase().trim() === 'yes')
      : Boolean(userAccount);

    // ERP Access: work email OR mobile number (use provided or generate email)
    const emailOrMobileProvided = typeof workEmail === 'string' && workEmail.trim().length > 0;
    let email: string;
    let phoneForLogin: string | null = null;
    if (userAccountBool && emailOrMobileProvided) {
      const trimmed = workEmail.trim();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const mobileRegex = /^(\+?\d{1,3}[-.\s]?)?\(?\d{1,4}\)?[-.\s]?\d{1,9}[-.\s]?\d{1,9}$/;
      const normalizedMobile = trimmed.replace(/[-.\s()]/g, '');
      
      if (emailRegex.test(trimmed.toLowerCase())) {
        // Email provided
        email = trimmed.toLowerCase();
        const existing = await prisma.user.findUnique({ where: { email } });
        if (existing) {
          res.status(409).json({ success: false, message: 'An account with this email already exists. Please use a different work email.' });
          return;
        }
        console.log('📧 Using provided work email:', email);
      } else if (mobileRegex.test(normalizedMobile)) {
        // Mobile number provided - store in phone, generate email
        // Normalize phone: remove spaces, dashes, parentheses for consistent storage
        phoneForLogin = normalizedMobile;
        // Check if phone already exists (try both normalized and original format)
        const existingByPhone = await prisma.user.findFirst({ 
          where: { 
            OR: [
              { phone: trimmed },
              { phone: normalizedMobile }
            ]
          } 
        });
        if (existingByPhone) {
          res.status(409).json({ success: false, message: 'An account with this mobile number already exists. Please use a different mobile number.' });
          return;
        }
        email = await generateUniqueEmail(firstName, lastName);
        console.log('📱 Using provided mobile number:', phoneForLogin);
        console.log('📧 Generated email for mobile login:', email);
      } else {
        res.status(400).json({ success: false, message: 'Work email or mobile number must be a valid email address or mobile number.' });
        return;
      }
    } else {
      email = await generateUniqueEmail(firstName, lastName);
      console.log('📧 Generated email:', email);
    }

    // Password: use provided (when ERP access enabled) or generate temp, or dummy when no access
    const passwordProvided = typeof plainPassword === 'string' && plainPassword.length > 0;
    let temporaryPassword: string | null = null;
    let hashedPassword: string | null = null;
    if (userAccountBool) {
      if (passwordProvided) {
        if (plainPassword.length < 8) {
          res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
          return;
        }
        const hasLetter = /[a-zA-Z]/.test(plainPassword);
        const hasNumber = /\d/.test(plainPassword);
        if (!hasLetter || !hasNumber) {
          res.status(400).json({ success: false, message: 'Password must contain at least one letter and one number.' });
          return;
        }
        hashedPassword = await bcrypt.hash(plainPassword, 10);
        console.log('🔐 Using provided password (hashed)');
      } else {
        temporaryPassword = generateTemporaryPassword();
        hashedPassword = await bcrypt.hash(temporaryPassword, 10);
        console.log('🔐 Generated temporary password for user account');
      }
    } else {
      hashedPassword = await bcrypt.hash('NO_ACCOUNT_' + Date.now(), 10);
      console.log('🔐 Generated dummy password hash');
    }
    
    if (!hashedPassword) {
      throw new Error('Failed to generate password hash');
    }

    const phoneNumbersJson = resolvePhoneNumbersJson(body);
    const emailAddressesJson = resolveEmailAddressesJson(body);

    /** Sync `User.phone` when only `contacts[]` was sent (directory UI often leaves top-level `phone` empty). */
    let primaryPhoneForUser: string | null = phoneForLogin;
    if (!primaryPhoneForUser && typeof phone === 'string' && phone.trim()) {
      primaryPhoneForUser = phone.trim();
    }
    if (!primaryPhoneForUser && phoneNumbersJson) {
      try {
        const arr = JSON.parse(phoneNumbersJson) as unknown;
        if (Array.isArray(arr) && arr.length > 0) {
          const first = arr[0] as Record<string, unknown>;
          const v = first?.value ?? first?.phone ?? first?.number ?? first?.mobile;
          if (v != null && String(v).trim() !== '') primaryPhoneForUser = String(v).trim();
        }
      } catch {
        /* ignore */
      }
    }

    console.log('📋 Resolved phoneNumbers JSON length:', phoneNumbersJson?.length ?? 0);
    console.log('📋 Resolved emailAddresses JSON length:', emailAddressesJson?.length ?? 0);

    // Log data before creating employee
    console.log('📝 About to create employee with:', {
      email,
      firstName,
      lastName,
      role: role || 'EMPLOYEE',
      hasPassword: !!hashedPassword,
      employeeId,
      passportNumber: passportNum,
      passportIssueDate: passportIssue,
      passportExpiryDate: passportExpiry,
      createdBy: req.user.id,
    });

    // Validate email and password before creating
    if (!email || email.trim() === '') {
      throw new Error('Generated email is empty');
    }
    if (!hashedPassword || hashedPassword.trim() === '') {
      throw new Error('Password hash is empty');
    }
    
    console.log('✅ All validations passed, creating employee in database...');

    const departmentStored = await resolveDepartmentForUser(
      department,
      departmentId ?? rawCreateBody.departmentId
    );
    
    // Create employee with detailed error handling
    let employee;
    try {
      employee = await prisma.user.create({
      data: {
        email: email.trim(),
        password: hashedPassword,
        firstName: trimmedFirstName,
        lastName: trimmedLastName,
        role: role || 'EMPLOYEE',
        phone: primaryPhoneForUser, // work-email mobile, explicit phone, or first entry from contacts JSON
        department: departmentStored,
        position: position || null,
        jobTitle: jobTitle || null,
        photo: photoFilename || null,
        employeeId: trimmedEmployeeId,
        // First login must change password only when we generated a temp password (not when HR set one).
        forcePasswordChange: userAccountBool && !passwordProvided,
        isActive: status === 'active' || status === 'Active' || !status ? true : false,
        createdBy: req.user!.id,
        
        // Employee Directory - Personal Info
        employeeType: employeeType || null,
        status: status || null,
        userAccount: parseBoolean(userAccount),
        
        // Employee Directory - Personal Details
        gender: gender || null,
        maritalStatus: maritalStatus || null,
        nationality: nationality || null,
        birthday: parseEmployeeDate(birthday),
        childrenCount: childrenCount ? (isNaN(parseInt(String(childrenCount))) ? null : parseInt(String(childrenCount))) : null,
        currentAddress: currentAddress || null,
        
        // Employee Directory - Contact Info
        phoneNumbers: phoneNumbersJson,
        emailAddresses: emailAddressesJson,
        
        // Employee Directory - Company Info
        company: company || null,
        companyLocation: companyLocation || null,
        managerId: managerId || null,
        attendanceProgram: attendanceProgram || null,
        joiningDate: parseEmployeeDate(joiningDate),
        exitDate: parseEmployeeDate(exitDate),
        isLineManager: parseBoolean(isLineManager),
        
        // Employee Directory - Legal Documents
        passportNumber: passportNum || null,
        passportIssueDate: parseEmployeeDate(passportIssue),
        passportExpiryDate: parseEmployeeDate(passportExpiry),
        passportAttachment: passportAttachmentFile || passportAttachment || null,
        
        nationalIdNumber: nationalIdNumber || null,
        nationalIdExpiryDate: parseEmployeeDate(nationalIdExpiryDate),
        nationalIdAttachment: nationalIdAttachmentFile || nationalIdAttachment || null,
        
        residencyNumber: residencyNumber || null,
        residencyExpiryDate: parseEmployeeDate(residencyExpiryDate),
        residencyAttachment: residencyAttachmentFile || residencyAttachment || null,
        visaNumber: typeof visaNumber === 'string' ? visaNumber.trim() || null : visaNumber || null,
        
        insuranceNumber: insuranceNumber || null,
        insuranceExpiryDate: parseEmployeeDate(insuranceExpiryDate),
        insuranceAttachment: insuranceAttachmentFile || insuranceAttachment || null,
        
        drivingLicenseNumber:
          resolveDrivingLicenseNumberForDb(flatForLegalResolversCreate) ??
          (drivingLicenseNumber != null && String(drivingLicenseNumber).trim() !== ''
            ? String(drivingLicenseNumber).trim()
            : null),
        drivingLicenseExpiryDate: parseEmployeeDate(drivingLicenseExpiryDate),
        drivingLicenseAttachment: drivingLicenseAttachmentFile || drivingLicenseAttachment || null,

        labourIdNumber:
          resolveLabourIdNumberForDb(flatForLegalResolversCreate) ??
          (labourIdNumber != null && String(labourIdNumber).trim() !== ''
            ? String(labourIdNumber).trim()
            : null),
        labourIdExpiryDate: parseEmployeeDate(labourIdExpiryDate),
        labourIdAttachment: labourIdAttachmentFile || labourIdAttachment || null,
        
        remarks: remarks || null,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        phone: true,
        department: true,
        position: true,
        jobTitle: true,
        photo: true,
        employeeId: true,
        isActive: true,
        createdAt: true,
        // Employee Directory fields
        employeeType: true,
        status: true,
        userAccount: true,
        gender: true,
        maritalStatus: true,
        nationality: true,
        birthday: true,
        childrenCount: true,
        currentAddress: true,
        phoneNumbers: true,
        emailAddresses: true,
        company: true,
        companyLocation: true,
        managerId: true,
        manager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          }
        },
        attendanceProgram: true,
        joiningDate: true,
        exitDate: true,
        isLineManager: true,
        passportNumber: true,
        passportIssueDate: true,
        passportExpiryDate: true,
        passportAttachment: true,
        nationalIdNumber: true,
        nationalIdExpiryDate: true,
        nationalIdAttachment: true,
        residencyNumber: true,
        residencyExpiryDate: true,
        residencyAttachment: true,
        visaNumber: true,
        insuranceNumber: true,
        insuranceExpiryDate: true,
        insuranceAttachment: true,
        drivingLicenseNumber: true,
        drivingLicenseExpiryDate: true,
        drivingLicenseAttachment: true,
        labourIdNumber: true,
        labourIdExpiryDate: true,
        labourIdAttachment: true,
        remarks: true,
      }
    });
    } catch (prismaError: any) {
      console.error('❌ Prisma create error:', prismaError);
      console.error('❌ Prisma error code:', prismaError.code);
      console.error('❌ Prisma error meta:', prismaError.meta);
      console.error('❌ Prisma error message:', prismaError.message);
      
      // Handle specific Prisma errors
      if (prismaError.code === 'P2002') {
        const field = prismaError.meta?.target?.[0] || 'field';
        res.status(409).json({
          success: false,
          message: `Employee with this ${field} already exists`,
          error: prismaError.message,
        });
        return;
      }
      
      // Re-throw to be caught by outer catch block
      throw prismaError;
    }

    console.log('✅ Employee created successfully in database:', employee.id);

    // Assign to projects if provided
    if (projectIds && Array.isArray(projectIds) && projectIds.length > 0) {
      await prisma.projectAssignment.createMany({
        data: projectIds.map((projectId: string) => ({
          projectId,
          employeeId: employee.id,
          assignedBy: req.user!.id,
        })),
        skipDuplicates: true,
      });
    }

    // After successful DB commit: send ERP access email + log it (non-blocking for creation success)
    let erpAccessEmailStatus: 'SENT' | 'FAILED' | 'SKIPPED' = 'SKIPPED';
    if (userAccountBool) {
      try {
        const fullName = `${employee.firstName || ''} ${employee.lastName || ''}`.trim();
        const passToSend = passwordProvided ? plainPassword : temporaryPassword;
        const result = await sendEmployeeErpAccessEmail({
          employeeId: employee.id,
          toEmail: employee.email,
          employeeName: fullName,
          department: employee.department || null,
          passwordToSend: passToSend || null,
        });
        erpAccessEmailStatus = result.status;
      } catch (e) {
        // Safety: never fail employee creation due to email side-effect
        console.warn('⚠️ ERP access email failed unexpectedly:', e);
        erpAccessEmailStatus = 'FAILED';
      }
    }

    // Return employee with temporary password (shown only once if userAccount is true)
    const responseData: any = {
      success: true,
      message: 'Employee created successfully',
      data: {
        employee,
      }
    };

    if (userAccountBool && temporaryPassword) {
      responseData.data.credentials = {
        email: employee.email,
        temporaryPassword: temporaryPassword,
        message: 'Please save these credentials. They will not be shown again. User should change password on first login.',
      };
    }

    responseData.data.employee = shapeEmployeeForClient(
      responseData.data.employee as unknown as Record<string, unknown>,
      req
    ) as typeof employee;

    responseData.data.erpAccessEmail = { status: erpAccessEmailStatus };

    res.status(201).json(responseData);
  } catch (error: any) {
    console.error('❌ Create employee error:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error code:', error.code);
    console.error('❌ Error name:', error.name);
    
    // Handle unique constraint violations
    if (error.code === 'P2002') {
      res.status(409).json({
        success: false,
        message: 'Employee with this email or employee ID already exists'
      });
      return;
    }

    // Log full error details
    console.error('❌ Full error object:', JSON.stringify(error, Object.getOwnPropertyNames(error)));
    console.error('❌ Error meta:', error.meta);
    
    res.status(500).json({
      success: false,
      message: 'Failed to create employee',
      error: error.message || 'Unknown error occurred',
      errorCode: error.code,
      errorName: error.name,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    });
  }
};

/**
 * Check availability of Employee ID (and optionally email) for validation before create
 * GET /api/employees/check-availability?employeeId=XXX&email=YYY
 * Returns { employeeIdAvailable: boolean, emailAvailable?: boolean }
 */
export const checkEmployeeAvailability = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { employeeId, email } = req.query;
    const result: { employeeIdAvailable?: boolean; emailAvailable?: boolean } = {};

    if (employeeId !== undefined && employeeId !== null && String(employeeId).trim() !== '') {
      const id = String(employeeId).trim();
      const existing = await prisma.user.findFirst({ where: { employeeId: id } });
      result.employeeIdAvailable = !existing;
    }

    if (email !== undefined && email !== null && String(email).trim() !== '') {
      const e = String(email).trim().toLowerCase();
      const existing = await prisma.user.findUnique({ where: { email: e } });
      result.emailAvailable = !existing;
    }

    res.json({ success: true, ...result });
  } catch (error) {
    console.error('Check availability error:', error);
    res.status(500).json({ success: false, message: 'Failed to check availability' });
  }
};

/**
 * Get all employees
 * GET /api/employees
 * Access: ADMIN, HR only
 */
export const getEmployees = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // For employee assignment dropdowns, allow fetching more employees (up to 500)
    // Default limit increased to 200 to show more employees in dropdowns
    const { page = 1, limit = 200, search, role, department, companyId, companyName, forTaskAssignment } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    console.log('📋 getEmployees called:', {
      userRole: req.user?.role,
      userEmail: req.user?.email,
      userId: req.user?.id,
      forTaskAssignment,
      companyId,
      companyName
    });

    // Build where clause
    const where: any = {
      // Exclude ADMIN and TENDER_ENGINEER roles - only show actual employees
      role: {
        notIn: ['ADMIN', 'TENDER_ENGINEER']
      },
    };

    // By default, non‑ADMIN/HR roles should only see active employees.
    // ADMIN and HR see both active and inactive employees so they can restore.
    const requesterRole = req.user?.role;
    const isPrivilegedViewer = requesterRole === 'ADMIN' || requesterRole === 'HR';
    if (!isPrivilegedViewer) {
      where.isActive = true;
    }

    // For task assignment dropdowns: ALL managers (MANAGER, PROJECT_MANAGER) can see all employees
    // ADMIN and HR also see all employees
    // No managerId filter is applied - all managers can assign tasks to any employee
    if (forTaskAssignment === 'true') {
      console.log(`✅ ${req.user?.role} role: Showing all employees for task assignment (no managerId filter)`);
    }

    // Filter by company so each company's Employee Directory shows only its employees
    // Skip company filtering for task assignment - managers should see their team members regardless of company
    if (forTaskAssignment !== 'true') {
      let companyNameFilter: string | null = null;
      if (companyName && typeof companyName === 'string' && companyName.trim()) {
        companyNameFilter = companyName.trim();
      } else if (companyId && typeof companyId === 'string' && companyId.trim()) {
        const company = await prisma.company.findUnique({
          where: { id: companyId.trim() },
          select: { name: true },
        });
        if (company) companyNameFilter = company.name.trim();
      }
      if (companyNameFilter) {
        where.company = { equals: companyNameFilter, mode: 'insensitive' };
      }
    }
    
    if (search) {
      where.OR = [
        { firstName: { contains: search as string, mode: 'insensitive' } },
        { lastName: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { employeeId: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (role) {
      // Only allow EMPLOYEE, HR, PROJECT_MANAGER roles
      if (['EMPLOYEE', 'HR', 'PROJECT_MANAGER'].includes(role as string)) {
        where.role = role;
      }
    }

    if (department) {
      where.department = { contains: department as string, mode: 'insensitive' };
    }

    console.log('🔍 Query where clause:', JSON.stringify(where, null, 2));

    // Get employees
    const [employees, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: Number(limit),
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          phone: true,
          department: true,
          position: true,
          jobTitle: true,
          photo: true,
          employeeId: true,
          isActive: true,
          forcePasswordChange: true,
          createdAt: true,
          updatedAt: true,
          // Employee Directory fields
          employeeType: true,
          status: true,
          userAccount: true,
          gender: true,
          maritalStatus: true,
          nationality: true,
          birthday: true,
          childrenCount: true,
          currentAddress: true,
          phoneNumbers: true,
          emailAddresses: true,
          company: true,
          companyLocation: true,
          managerId: true,
          manager: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
            }
          },
          attendanceProgram: true,
          joiningDate: true,
          exitDate: true,
          isLineManager: true,
          passportNumber: true,
          passportIssueDate: true,
          passportExpiryDate: true,
          passportAttachment: true,
          nationalIdNumber: true,
          nationalIdExpiryDate: true,
          nationalIdAttachment: true,
          residencyNumber: true,
          residencyExpiryDate: true,
          residencyAttachment: true,
          visaNumber: true,
          insuranceNumber: true,
          insuranceExpiryDate: true,
          insuranceAttachment: true,
          drivingLicenseNumber: true,
          drivingLicenseExpiryDate: true,
          drivingLicenseAttachment: true,
          labourIdNumber: true,
          labourIdExpiryDate: true,
          labourIdAttachment: true,
          remarks: true,
          assignedProjects: {
            select: {
              project: {
                select: {
                  id: true,
                  name: true,
                  referenceNumber: true,
                }
              }
            }
          },
          positionAssignments: {
            select: { positionId: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    console.log(`✅ Found ${employees.length} employees (total: ${total})`);

    const employeesForClient = employees.map((e) =>
      shapeEmployeeForClient(e as unknown as Record<string, unknown>, req)
    );

    res.json({
      success: true,
      data: {
        employees: employeesForClient,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          pages: Math.ceil(total / Number(limit)),
        }
      }
    });
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employees'
    });
  }
};

/**
 * Get employee by ID
 * GET /api/employees/:id
 * Access: ADMIN, HR, or the employee themselves
 */
export const getEmployeeById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const currentUser = req.user!;

    // Check if user can access this employee
    if (currentUser.role !== 'ADMIN' && currentUser.role !== 'HR' && currentUser.id !== id) {
      res.status(403).json({
        success: false,
        message: 'Forbidden: You can only view your own profile'
      });
      return;
    }

    const employee = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        phone: true,
        department: true,
        position: true,
        jobTitle: true,
        photo: true,
        employeeId: true,
        isActive: true,
        forcePasswordChange: true,
        createdAt: true,
        updatedAt: true,
        // Employee Directory fields
        employeeType: true,
        status: true,
        userAccount: true,
        gender: true,
        maritalStatus: true,
        nationality: true,
        birthday: true,
        childrenCount: true,
        currentAddress: true,
        phoneNumbers: true,
        emailAddresses: true,
        company: true,
        companyLocation: true,
        managerId: true,
        manager: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          }
        },
        attendanceProgram: true,
        joiningDate: true,
        exitDate: true,
        isLineManager: true,
        passportNumber: true,
        passportIssueDate: true,
        passportExpiryDate: true,
        passportAttachment: true,
        nationalIdNumber: true,
        nationalIdExpiryDate: true,
        nationalIdAttachment: true,
        residencyNumber: true,
        residencyExpiryDate: true,
        residencyAttachment: true,
        visaNumber: true,
        insuranceNumber: true,
        insuranceExpiryDate: true,
        insuranceAttachment: true,
        drivingLicenseNumber: true,
        drivingLicenseExpiryDate: true,
        drivingLicenseAttachment: true,
        labourIdNumber: true,
        labourIdExpiryDate: true,
        labourIdAttachment: true,
        remarks: true,
        isLabour: true,
        labourDetails: {
          select: {
            basicSalary: true,
            contractTotalSalary: true,
            allowance1: true,
            allowance2: true,
          },
        },
        positionAssignments: {
          select: { positionId: true },
        },
        assignedProjects: {
          select: {
            project: {
              select: {
                id: true,
                name: true,
                referenceNumber: true,
                status: true,
              }
            },
            role: true,
            assignedAt: true,
          }
        },
        assignedTasks: {
          select: {
            taskId: true,
            status: true,
            assignedAt: true,
          }
        }
      }
    });

    if (!employee) {
      res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
      return;
    }

    const { labourDetails: employeeLabourDetails, ...employeeRest } = employee;
    const shaped = shapeEmployeeForClient(employeeRest as unknown as Record<string, unknown>, req);
    res.json({
      success: true,
      data: {
        ...shaped,
        payroll: labourDetailsToSelfServicePayroll(employeeLabourDetails),
      },
    });
  } catch (error) {
    console.error('Get employee error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employee'
    });
  }
};

/**
 * Update employee
 * PUT /api/employees/:id
 * Access: ADMIN, HR only
 */
export const updateEmployee = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    // Log incoming request for debugging
    console.log('📝 Update employee request received');
    console.log('📝 Employee ID:', id);
    console.log('📝 Request body keys:', Object.keys(req.body || {}));
    console.log('📝 Request body (first 1000 chars):', JSON.stringify(req.body).substring(0, 1000));
    console.log('📝 Content-Type:', req.headers['content-type']);
    console.log('📝 Has files:', !!(req as any).file || !!(req as any).files);
    
    const rawBody = (req.body || {}) as Record<string, unknown>;
    const b = normalizeEmployeeDirectoryBody(rawBody) as Record<string, any>;
    /** Normalized wins over raw; then lift any nested legal/personal keys again (raw-only nesting). */
    const mergedBody = { ...rawBody, ...b } as Record<string, any>;
    liftNestedFormSectionsOntoRoot(mergedBody);
    const flatForLegalResolvers = mergedBody as Record<string, unknown>;

    const { 
      // Basic fields
      firstName, lastName, role, phone, department, position, jobTitle, employeeId, isActive, projectIds,
      // ERP Access (login credentials)
      workEmail, password: plainPasswordUpdate,
      // Employee Directory - Personal Info
      employeeType, status, userAccount,
      // Employee Directory - Personal Details
      gender, maritalStatus, nationality, birthday, childrenCount, currentAddress,
      // Employee Directory - Contact Info (patched via shouldPatch* + resolve* on b)
      // Employee Directory - Company Info
      company, companyLocation, managerId, attendanceProgram, joiningDate, exitDate, isLineManager,
      // Employee Directory - Legal Documents
      passportNumber, passportIssueDate, passportExpiryDate, passportAttachment,
      nationalIdNumber, nationalIdExpiryDate, nationalIdAttachment,
      residencyNumber, residencyExpiryDate, residencyAttachment, visaNumber,
      insuranceNumber, insuranceExpiryDate, insuranceAttachment,
      drivingLicenseNumber, drivingLicenseExpiryDate, drivingLicenseAttachment,
      labourIdNumber, labourIdExpiryDate, labourIdAttachment,
      remarks
    } = mergedBody;
    
    // Get photo filename from uploaded file (if new photo uploaded)
    const photoFilename = (req as any).file ? (req as any).file.filename : undefined;
    
    // Get legal document filenames from uploaded files
    const files = (req as any).files || {};
    const passportAttachmentFile = files.passportAttachment?.[0]?.filename;
    const nationalIdAttachmentFile = files.nationalIdAttachment?.[0]?.filename;
    const residencyAttachmentFile = files.residencyAttachment?.[0]?.filename;
    const insuranceAttachmentFile = files.insuranceAttachment?.[0]?.filename;
    const drivingLicenseAttachmentFile = files.drivingLicenseAttachment?.[0]?.filename;
    const labourIdAttachmentFile = files.labourIdAttachment?.[0]?.filename;

    // Check if employee exists
    const existingEmployee = await prisma.user.findUnique({
      where: { id }
    });

    if (!existingEmployee) {
      res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
      return;
    }

    // Validate minimum age (18 years) only when birthday is actually being changed (non-empty value)
    if (shouldPatchOptionalScalar(birthday)) {
      const birthDate = parseEmployeeDate(birthday);
      if (!birthDate || Number.isNaN(birthDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid birthday format.',
        });
        return;
      }
      const today = new Date();
      let age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
        age--;
      }
      if (age < 18) {
        res.status(400).json({
          success: false,
          message: 'This employee cannot be added to the company unless they are at least 18 years old.',
        });
        return;
      }
    }

    // Passport 6-month rule only when client sends a real new expiry (not empty FormData placeholders)
    if (shouldPatchOptionalScalar(passportExpiryDate)) {
      const expiryDate = parseEmployeeDate(passportExpiryDate);
      if (!expiryDate || Number.isNaN(expiryDate.getTime())) {
        res.status(400).json({
          success: false,
          message: 'Invalid passport expiry date format.',
        });
        return;
      }
      const today = new Date();
      const sixMonthsFromNow = new Date();
      sixMonthsFromNow.setMonth(today.getMonth() + 6);
      if (expiryDate < sixMonthsFromNow) {
        res.status(400).json({
          success: false,
          message:
            'Passport must be valid for at least 6 months from today. Please upload a passport with a later expiry date.',
        });
        return;
      }
    }

    // Verify manager exists if provided
    if (managerId !== undefined && managerId !== null) {
      const manager = await prisma.user.findUnique({
        where: { id: managerId },
      });
      if (!manager) {
        res.status(404).json({
          success: false,
          message: 'Manager not found'
        });
        return;
      }
    }

    // Update employee
    const updateData: any = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (shouldPatchOptionalScalar(role) && role !== null) {
      updateData.role = role;
    }
    if (shouldPatchOptionalScalar(phone)) {
      updateData.phone = phone === null ? null : String(phone).trim() || null;
    }
    const deptIdForUpdate = mergedBody.departmentId ?? rawBody.departmentId;
    const wantsDepartmentUpdate =
      shouldPatchOptionalScalar(department) ||
      (deptIdForUpdate !== undefined &&
        deptIdForUpdate !== null &&
        String(deptIdForUpdate).trim() !== '');
    if (wantsDepartmentUpdate) {
      updateData.department = await resolveDepartmentForUser(department, deptIdForUpdate);
    }
    if (shouldPatchOptionalScalar(position)) {
      updateData.position = position === null ? null : String(position).trim() || null;
    }
    if (shouldPatchOptionalScalar(jobTitle)) {
      updateData.jobTitle = jobTitle === null ? null : String(jobTitle).trim() || null;
    }
    if (photoFilename !== undefined) updateData.photo = photoFilename;
    if (shouldPatchOptionalScalar(employeeId)) {
      updateData.employeeId = employeeId === null ? null : String(employeeId).trim() || null;
    }
    if (isActive !== undefined) updateData.isActive = parseBoolean(isActive);
    
    // Employee Directory - Personal Info
    if (shouldPatchOptionalScalar(employeeType)) {
      updateData.employeeType = employeeType === null ? null : String(employeeType).trim() || null;
    }
    if (shouldPatchOptionalScalar(status)) {
      updateData.status = status === null ? null : String(status).trim() || null;
    }
    if (userAccount !== undefined) {
      const enableAccess = parseBoolean(userAccount);
      updateData.userAccount = enableAccess;
      updateData.isActive = enableAccess ? true : false;
    }
    
    // ERP Access: work email (must be unique)
    if (workEmail !== undefined && typeof workEmail === 'string' && workEmail.trim().length > 0) {
      const trimmed = workEmail.trim().toLowerCase();
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(trimmed)) {
        res.status(400).json({ success: false, message: 'Work email must be a valid email address.' });
        return;
      }
      const existing = await prisma.user.findFirst({ where: { email: trimmed, id: { not: id } } });
      if (existing) {
        res.status(409).json({ success: false, message: 'An account with this email already exists.' });
        return;
      }
      updateData.email = trimmed;
    }
    
    // ERP Access: password (when enabling or updating credentials)
    if (plainPasswordUpdate !== undefined && typeof plainPasswordUpdate === 'string' && plainPasswordUpdate.length > 0) {
      if (plainPasswordUpdate.length < 8) {
        res.status(400).json({ success: false, message: 'Password must be at least 8 characters long.' });
        return;
      }
      const hasLetter = /[a-zA-Z]/.test(plainPasswordUpdate);
      const hasNumber = /\d/.test(plainPasswordUpdate);
      if (!hasLetter || !hasNumber) {
        res.status(400).json({ success: false, message: 'Password must contain at least one letter and one number.' });
        return;
      }
      updateData.password = await bcrypt.hash(plainPasswordUpdate, 10);
      updateData.forcePasswordChange = false;
    }
    
    // Employee Directory - Personal Details
    if (shouldPatchOptionalScalar(gender)) {
      updateData.gender = gender === null ? null : String(gender).trim() || null;
    }
    if (shouldPatchOptionalScalar(maritalStatus)) {
      updateData.maritalStatus = maritalStatus === null ? null : String(maritalStatus).trim() || null;
    }
    if (shouldPatchOptionalScalar(nationality)) {
      updateData.nationality = nationality === null ? null : String(nationality).trim() || null;
    }
    if (shouldPatchOptionalScalar(birthday)) {
      updateData.birthday = parseEmployeeDate(birthday);
    }
    if (shouldPatchOptionalScalar(childrenCount)) {
      if (childrenCount === null) {
        updateData.childrenCount = null;
      } else {
        const n = parseInt(String(childrenCount), 10);
        updateData.childrenCount = Number.isNaN(n) ? null : n;
      }
    }
    if (shouldPatchOptionalScalar(currentAddress)) {
      updateData.currentAddress = currentAddress === null ? null : String(currentAddress).trim() || null;
    }
    
    // Employee Directory - Contact Info (FormData objects + flat phone/email fields)
    if (shouldPatchPhoneNumbers(mergedBody)) {
      updateData.phoneNumbers = resolvePhoneNumbersJson(mergedBody);
    }
    if (shouldPatchEmailAddresses(mergedBody)) {
      updateData.emailAddresses = resolveEmailAddressesJson(mergedBody);
    }
    
    // Employee Directory - Company Info
    if (shouldPatchOptionalScalar(company)) {
      updateData.company = company === null ? null : String(company).trim() || null;
    }
    if (shouldPatchOptionalScalar(companyLocation)) {
      updateData.companyLocation = companyLocation === null ? null : String(companyLocation).trim() || null;
    }
    if (managerId !== undefined) {
      if (managerId === null) {
        updateData.managerId = null;
      } else if (typeof managerId === 'string' && managerId.trim() === '') {
        updateData.managerId = null;
      } else {
        updateData.managerId = managerId;
      }
    }
    if (shouldPatchOptionalScalar(attendanceProgram)) {
      updateData.attendanceProgram =
        attendanceProgram === null ? null : String(attendanceProgram).trim() || null;
    }
    if (shouldPatchOptionalScalar(joiningDate)) {
      updateData.joiningDate = parseEmployeeDate(joiningDate);
    }
    if (shouldPatchOptionalScalar(exitDate)) {
      updateData.exitDate = parseEmployeeDate(exitDate);
    }
    if (isLineManager !== undefined) updateData.isLineManager = parseBoolean(isLineManager);
    
    // Employee Directory - Legal Documents
    if (shouldPatchOptionalScalar(passportNumber)) {
      updateData.passportNumber = passportNumber === null ? null : String(passportNumber).trim() || null;
    }
    if (shouldPatchOptionalScalar(passportIssueDate)) {
      updateData.passportIssueDate = parseEmployeeDate(passportIssueDate);
    }
    if (shouldPatchOptionalScalar(passportExpiryDate)) {
      updateData.passportExpiryDate = parseEmployeeDate(passportExpiryDate);
    }
    if (passportAttachmentFile !== undefined) {
      updateData.passportAttachment = passportAttachmentFile;
    } else if (shouldPatchOptionalScalar(passportAttachment)) {
      updateData.passportAttachment =
        passportAttachment === null ? null : String(passportAttachment).trim() || null;
    }

    if (shouldPatchOptionalScalar(nationalIdNumber)) {
      updateData.nationalIdNumber = nationalIdNumber === null ? null : String(nationalIdNumber).trim() || null;
    }
    if (shouldPatchOptionalScalar(nationalIdExpiryDate)) {
      updateData.nationalIdExpiryDate = parseEmployeeDate(nationalIdExpiryDate);
    }
    if (nationalIdAttachmentFile !== undefined) {
      updateData.nationalIdAttachment = nationalIdAttachmentFile;
    } else if (shouldPatchOptionalScalar(nationalIdAttachment)) {
      updateData.nationalIdAttachment =
        nationalIdAttachment === null ? null : String(nationalIdAttachment).trim() || null;
    }

    if (shouldPatchOptionalScalar(residencyNumber)) {
      updateData.residencyNumber = residencyNumber === null ? null : String(residencyNumber).trim() || null;
    }
    if (shouldPatchOptionalScalar(residencyExpiryDate)) {
      updateData.residencyExpiryDate = parseEmployeeDate(residencyExpiryDate);
    }
    if (shouldPatchOptionalScalar(visaNumber)) {
      updateData.visaNumber =
        visaNumber === null ? null : typeof visaNumber === 'string' ? visaNumber.trim() || null : visaNumber;
    }
    if (residencyAttachmentFile !== undefined) {
      updateData.residencyAttachment = residencyAttachmentFile;
    } else if (shouldPatchOptionalScalar(residencyAttachment)) {
      updateData.residencyAttachment =
        residencyAttachment === null ? null : String(residencyAttachment).trim() || null;
    }

    if (shouldPatchOptionalScalar(insuranceNumber)) {
      updateData.insuranceNumber = insuranceNumber === null ? null : String(insuranceNumber).trim() || null;
    }
    if (shouldPatchOptionalScalar(insuranceExpiryDate)) {
      updateData.insuranceExpiryDate = parseEmployeeDate(insuranceExpiryDate);
    }
    if (insuranceAttachmentFile !== undefined) {
      updateData.insuranceAttachment = insuranceAttachmentFile;
    } else if (shouldPatchOptionalScalar(insuranceAttachment)) {
      updateData.insuranceAttachment =
        insuranceAttachment === null ? null : String(insuranceAttachment).trim() || null;
    }

    const resolvedDrivingNo = resolveDrivingLicenseNumberForDb(flatForLegalResolvers);
    if (resolvedDrivingNo !== undefined && String(resolvedDrivingNo).trim() !== '') {
      updateData.drivingLicenseNumber = String(resolvedDrivingNo).trim();
    } else if (shouldPatchOptionalScalar(drivingLicenseNumber)) {
      updateData.drivingLicenseNumber =
        drivingLicenseNumber === null ? null : String(drivingLicenseNumber).trim() || null;
    }
    if (shouldPatchOptionalScalar(drivingLicenseExpiryDate)) {
      updateData.drivingLicenseExpiryDate = parseEmployeeDate(drivingLicenseExpiryDate);
    }
    if (drivingLicenseAttachmentFile !== undefined) {
      updateData.drivingLicenseAttachment = drivingLicenseAttachmentFile;
    } else if (shouldPatchOptionalScalar(drivingLicenseAttachment)) {
      updateData.drivingLicenseAttachment =
        drivingLicenseAttachment === null ? null : String(drivingLicenseAttachment).trim() || null;
    }

    const resolvedLabourNo = resolveLabourIdNumberForDb(flatForLegalResolvers);
    if (resolvedLabourNo !== undefined && String(resolvedLabourNo).trim() !== '') {
      updateData.labourIdNumber = String(resolvedLabourNo).trim();
    } else if (shouldPatchOptionalScalar(labourIdNumber)) {
      updateData.labourIdNumber =
        labourIdNumber === null ? null : String(labourIdNumber).trim() || null;
    }
    if (shouldPatchOptionalScalar(labourIdExpiryDate)) {
      updateData.labourIdExpiryDate = parseEmployeeDate(labourIdExpiryDate);
    }
    if (labourIdAttachmentFile !== undefined) {
      updateData.labourIdAttachment = labourIdAttachmentFile;
    } else if (shouldPatchOptionalScalar(labourIdAttachment)) {
      updateData.labourIdAttachment =
        labourIdAttachment === null ? null : String(labourIdAttachment).trim() || null;
    }

    if (shouldPatchOptionalScalar(remarks)) {
      updateData.remarks = remarks === null ? null : String(remarks).trim() || null;
    }

    let hasProjectAssignmentChange = false;
    let resolvedProjectIds: string[] = [];
    let existingProjectIds: string[] = [];

    if (projectIds !== undefined) {
      resolvedProjectIds = resolveProjectIdsList(projectIds);
      const existingAssignments = await prisma.projectAssignment.findMany({
        where: { employeeId: id },
        select: { projectId: true },
      });
      existingProjectIds = existingAssignments.map((a) => a.projectId);
      hasProjectAssignmentChange =
        sortJoinProjectIds(existingProjectIds) !== sortJoinProjectIds(resolvedProjectIds);
    }

    const changeReasonRaw = mergedBody.changeReason ?? mergedBody.updateReason;
    let changeReason = '';
    if (typeof changeReasonRaw === 'string') {
      changeReason = changeReasonRaw.trim();
    } else if (Array.isArray(changeReasonRaw)) {
      const first = changeReasonRaw.find((x) => x != null && String(x).trim() !== '');
      changeReason = first != null ? String(first).trim() : '';
    } else if (changeReasonRaw != null && typeof changeReasonRaw !== 'object') {
      changeReason = String(changeReasonRaw).trim();
    }

    const beforeSnapshot = { ...(existingEmployee as unknown as Record<string, unknown>) };
    const previewRows = buildEmployeeUpdateChangeRows({
      before: beforeSnapshot,
      updateData,
      employeeId: id,
      changedById: req.user!.id,
      changedByRole: '—',
      reason: '—',
    });
    const changedFieldKeys = new Set(previewRows.map((r) => r.fieldKey));

    const filteredUpdateData: Record<string, unknown> = {};
    for (const key of Object.keys(updateData)) {
      if (key === 'forcePasswordChange') {
        if (changedFieldKeys.has('password')) filteredUpdateData[key] = updateData[key];
        continue;
      }
      if (changedFieldKeys.has(key)) {
        filteredUpdateData[key] = updateData[key];
      }
    }

    const hasFieldUpdates = Object.keys(filteredUpdateData).length > 0;

    // Log update data for debugging
    console.log('📝 Update data being sent to Prisma:', JSON.stringify(filteredUpdateData, null, 2));
    console.log('📝 Employee ID:', id);
    console.log('📝 Update data keys:', Object.keys(filteredUpdateData));

    if (!hasFieldUpdates && !hasProjectAssignmentChange) {
      console.warn('⚠️ No fields to update - no effective changes');
      const existing = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          phone: true,
          department: true,
          position: true,
          jobTitle: true,
          photo: true,
          employeeId: true,
          isActive: true,
          updatedAt: true,
        },
      });

      if (!existing) {
        res.status(404).json({
          success: false,
          message: 'Employee not found',
        });
        return;
      }

      res.json({
        success: true,
        message: 'No changes to update',
        data: shapeEmployeeForClient(existing as unknown as Record<string, unknown>, req),
      });
      return;
    }

    if ((hasFieldUpdates || hasProjectAssignmentChange) && !changeReason) {
      res.status(400).json({
        success: false,
        message: 'A reason for this update is required (changeReason).',
      });
      return;
    }

    const actorId = req.user!.id;
    const auditRole = employeeAuditRoleLabel(req.user!.role);

    const fieldChangeRows = buildEmployeeUpdateChangeRows({
      before: beforeSnapshot,
      updateData: filteredUpdateData,
      employeeId: id,
      changedById: actorId,
      changedByRole: auditRole,
      reason: changeReason,
    });

    const changeRows = [...fieldChangeRows];
    if (hasProjectAssignmentChange) {
      const oldVal = sortJoinProjectIds(existingProjectIds) || '(none)';
      const newVal = sortJoinProjectIds(resolvedProjectIds) || '(none)';
      changeRows.push({
        employeeId: id,
        changedById: actorId,
        changedByRole: auditRole,
        fieldKey: 'projectAssignments',
        fieldLabel: 'Project assignments',
        oldValue: oldVal,
        newValue: newVal,
        reason: changeReason,
      });
    }

    const employeeSelect = {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      phone: true,
      department: true,
      position: true,
      jobTitle: true,
      photo: true,
      employeeId: true,
      isActive: true,
      updatedAt: true,
      employeeType: true,
      status: true,
      userAccount: true,
      gender: true,
      maritalStatus: true,
      nationality: true,
      birthday: true,
      childrenCount: true,
      currentAddress: true,
      phoneNumbers: true,
      emailAddresses: true,
      company: true,
      companyLocation: true,
      managerId: true,
      manager: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      },
      attendanceProgram: true,
      joiningDate: true,
      exitDate: true,
      isLineManager: true,
      passportNumber: true,
      passportIssueDate: true,
      passportExpiryDate: true,
      passportAttachment: true,
      nationalIdNumber: true,
      nationalIdExpiryDate: true,
      nationalIdAttachment: true,
      residencyNumber: true,
      residencyExpiryDate: true,
      residencyAttachment: true,
      visaNumber: true,
      insuranceNumber: true,
      insuranceExpiryDate: true,
      insuranceAttachment: true,
      drivingLicenseNumber: true,
      drivingLicenseExpiryDate: true,
      drivingLicenseAttachment: true,
      labourIdNumber: true,
      labourIdExpiryDate: true,
      labourIdAttachment: true,
      remarks: true,
    } as const;

    await prisma.$transaction(async (tx) => {
      if (changeRows.length > 0) {
        await tx.employeeChangeLog.createMany({ data: changeRows });
      }
      if (hasFieldUpdates) {
        await tx.user.update({
          where: { id },
          data: filteredUpdateData,
        });
      }
      if (projectIds !== undefined) {
        await tx.projectAssignment.deleteMany({
          where: { employeeId: id },
        });
        if (resolvedProjectIds.length > 0) {
          await tx.projectAssignment.createMany({
            data: resolvedProjectIds.map((projectId: string) => ({
              projectId,
              employeeId: id,
              assignedBy: actorId,
            })),
            skipDuplicates: true,
          });
        }
      }
    });

    const employee = await prisma.user.findUnique({
      where: { id },
      select: employeeSelect,
    });

    if (!employee) {
      res.status(404).json({
        success: false,
        message: 'Employee not found',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Employee updated successfully',
      data: shapeEmployeeForClient(employee as unknown as Record<string, unknown>, req),
    });
  } catch (error: any) {
    console.error('❌ Update employee error:', error);
    console.error('❌ Error details:', {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack,
    });
    
    if (error.code === 'P2002') {
      const field = error.meta?.target?.[0] || 'field';
      res.status(409).json({
        success: false,
        message: `${field === 'email' ? 'Email' : field === 'employeeId' ? 'Employee ID' : 'Field'} already exists`
      });
      return;
    }

    if (error.code === 'P2025') {
      res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
      return;
    }

    // Return actual error message for debugging
    const errorMessage = error?.message || 'Failed to update employee';
    console.error('❌ Returning error to client:', errorMessage);
    
    res.status(500).json({
      success: false,
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? {
        code: error?.code,
        meta: error?.meta,
      } : undefined
    });
  }
};

/**
 * Delete/Deactivate employee
 * DELETE /api/employees/:id
 * Query: permanent=true — remove row and related data so email/employee ID can be reused (no restore).
 * Default: soft deactivate (isActive=false) — restore still possible.
 * Access: ADMIN, HR only
 */
export const deleteEmployee = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // Don't allow deleting yourself
    if (req.user!.id === id) {
      res.status(400).json({
        success: false,
        message: 'You cannot delete your own account'
      });
      return;
    }

    const permanent =
      req.query.permanent === 'true' ||
      req.query.permanent === '1' ||
      (typeof req.body?.permanent === 'boolean' && req.body.permanent === true);

    const prior = await prisma.user.findUnique({
      where: { id },
      select: { isActive: true, email: true, firstName: true, lastName: true },
    });
    if (!prior) {
      res.status(404).json({ success: false, message: 'Employee not found' });
      return;
    }

    if (permanent) {
      const { permanentlyDeleteUser } = await import('../services/employeePermanentDelete.service');
      await permanentlyDeleteUser(id);
      res.json({
        success: true,
        message: 'Employee permanently removed. Email and employee ID may be reused.',
        data: { id, email: prior.email, firstName: prior.firstName, lastName: prior.lastName, permanent: true },
      });
      return;
    }

    const reasonRaw =
      (req.body && typeof req.body.changeReason === 'string' && req.body.changeReason.trim()) ||
      (typeof req.query.changeReason === 'string' && req.query.changeReason.trim()) ||
      'Employee deactivated';
    const actorId = req.user!.id;
    const auditRole = employeeAuditRoleLabel(req.user!.role);

    await prisma.$transaction(async (tx) => {
      await tx.employeeChangeLog.create({
        data: {
          employeeId: id,
          changedById: actorId,
          changedByRole: auditRole,
          fieldKey: 'isActive',
          fieldLabel: 'Account active',
          oldValue: formatEmployeeFieldForLog('isActive', prior.isActive) || null,
          newValue: formatEmployeeFieldForLog('isActive', false) || null,
          reason: reasonRaw,
        },
      });
      await tx.user.update({
        where: { id },
        data: { isActive: false },
      });
    });

    const employee = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
      },
    });

    res.json({
      success: true,
      message: 'Employee deactivated successfully',
      data: employee,
    });
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to deactivate employee'
    });
  }
};

/**
 * Restore/Reactivate employee
 * PUT /api/employees/:id/restore
 * Access: ADMIN, HR only
 */
export const restoreEmployee = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    console.log(`🔄 Restoring employee: ${id}`);

    // Check if employee exists
    const existingEmployee = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        role: true,
      }
    });

    if (!existingEmployee) {
      console.log(`❌ Employee not found: ${id}`);
      res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
      return;
    }

    // Check if employee is already active
    if (existingEmployee.isActive) {
      console.log(`ℹ️  Employee already active: ${id}`);
      res.json({
        success: true,
        message: 'Employee is already active',
        data: existingEmployee
      });
      return;
    }

    const reasonRaw =
      (req.body && typeof req.body.changeReason === 'string' && req.body.changeReason.trim()) ||
      (typeof req.query.changeReason === 'string' && req.query.changeReason.trim()) ||
      'Employee restored';
    const actorId = req.user!.id;
    const auditRole = employeeAuditRoleLabel(req.user!.role);

    await prisma.$transaction(async (tx) => {
      await tx.employeeChangeLog.create({
        data: {
          employeeId: id,
          changedById: actorId,
          changedByRole: auditRole,
          fieldKey: 'isActive',
          fieldLabel: 'Account active',
          oldValue: formatEmployeeFieldForLog('isActive', existingEmployee.isActive) || null,
          newValue: formatEmployeeFieldForLog('isActive', true) || null,
          reason: reasonRaw,
        },
      });
      await tx.user.update({
        where: { id },
        data: { isActive: true },
      });
    });

    const employee = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        role: true,
        jobTitle: true,
        department: true,
        employeeId: true,
      },
    });

    if (!employee) {
      res.status(404).json({ success: false, message: 'Employee not found' });
      return;
    }

    console.log(`✅ Employee restored successfully: ${employee.email} (${employee.id})`);

    res.json({
      success: true,
      message: 'Employee restored successfully',
      data: employee
    });
  } catch (error: any) {
    console.error('❌ Restore employee error:', error);
    console.error('❌ Error details:', {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
    });
    
    if (error.code === 'P2025') {
      res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: error?.message || 'Failed to restore employee'
    });
  }
};

/**
 * GET /api/employees/:id/change-history
 * Access: ADMIN, HR
 */
export const getEmployeeChangeHistory = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const exists = await prisma.user.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!exists) {
      res.status(404).json({ success: false, message: 'Employee not found' });
      return;
    }

    const logs = await prisma.employeeChangeLog.findMany({
      where: { employeeId: id },
      orderBy: { createdAt: 'desc' },
      include: {
        changedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
          },
        },
      },
    });

    res.json({
      success: true,
      data: logs.map((row) => {
        const actor = row.changedBy;
        const name =
          actor &&
          `${actor.firstName ?? ''} ${actor.lastName ?? ''}`.trim();
        return {
          id: row.id,
          fieldKey: row.fieldKey,
          fieldLabel: row.fieldLabel,
          fieldChanged: row.fieldLabel,
          oldValue: row.oldValue,
          newValue: row.newValue,
          reason: row.reason,
          changedAt: row.createdAt.toISOString(),
          changedByRole: row.changedByRole,
          changedBy: name || actor?.email || 'Unknown',
          changedById: row.changedById,
          changeType: 'UPDATE',
        };
      }),
    });
  } catch (error) {
    console.error('Get employee change history error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employee change history',
    });
  }
};

/**
 * POST /api/employees/rename-attendance-program
 * When HR renames a program in the directory list, sync all users with the old label.
 * Body: { from: string, to: string } (aliases: oldLabel/newLabel)
 */
export const renameAttendanceProgram = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const body = (req.body || {}) as Record<string, unknown>;
    const fromRaw = body.from ?? body.oldLabel ?? body.oldName;
    const toRaw = body.to ?? body.newLabel ?? body.newName;
    const from = typeof fromRaw === 'string' ? fromRaw.trim() : '';
    const to = typeof toRaw === 'string' ? toRaw.trim() : '';

    if (!from || !to) {
      res.status(400).json({
        success: false,
        message: 'Both current and new program names are required (from, to).',
      });
      return;
    }
    if (from === to) {
      res.status(400).json({
        success: false,
        message: 'New name must differ from the current name.',
      });
      return;
    }

    const result = await prisma.user.updateMany({
      where: { attendanceProgram: from },
      data: { attendanceProgram: to },
    });

    res.json({
      success: true,
      message: 'Attendance program label updated for affected employees.',
      updatedCount: result.count,
    });
  } catch (error) {
    console.error('Rename attendance program error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to rename attendance program',
    });
  }
};

/**
 * Get employee statistics
 * GET /api/employees/statistics
 * Access: ADMIN, HR only
 */
export const getEmployeeStatistics = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { companyId, companyName } = req.query;
    const role = req.user?.role;

    // Non–HR/Admin roles may only request scoped statistics (prevents org-wide leakage)
    const mustScopeCompany =
      role &&
      !['ADMIN', 'HR'].includes(role) &&
      ['MANAGER', 'PROJECT_MANAGER', 'EMPLOYEE', 'CONTRACTOR'].includes(role);
    if (mustScopeCompany) {
      const hasScope =
        (companyId && typeof companyId === 'string' && companyId.trim()) ||
        (companyName && typeof companyName === 'string' && companyName.trim());
      if (!hasScope) {
        res.status(403).json({
          success: false,
          message: 'Company scope is required for employee statistics',
        });
        return;
      }
    }

    // Resolve company filter so stats are per-company when viewing a company's directory
    let companyNameFilter: string | null = null;
    if (companyName && typeof companyName === 'string' && companyName.trim()) {
      companyNameFilter = companyName.trim();
    } else if (companyId && typeof companyId === 'string' && companyId.trim()) {
      const company = await prisma.company.findUnique({
        where: { id: companyId.trim() },
        select: { name: true },
      });
      if (company) companyNameFilter = company.name.trim();
    }

    const baseWhere: any = {
      role: { notIn: ['ADMIN', 'TENDER_ENGINEER'] },
    };
    if (companyNameFilter) {
      baseWhere.company = { equals: companyNameFilter, mode: 'insensitive' };
    }

    // Get total employees count (exclude ADMIN and TENDER_ENGINEER roles, only active employees)
    const totalEmployees = await prisma.user.count({
      where: { ...baseWhere, isActive: true }
    });

    // Get active employees count (status = 'Active' or isActive = true)
    const activeEmployees = await prisma.user.count({
      where: {
        ...baseWhere,
        isActive: true,
        OR: [
          { status: { equals: 'Active', mode: 'insensitive' } },
          { status: null }
        ]
      }
    });

    // Get inactive employees count
    const inactiveEmployees = await prisma.user.count({
      where: {
        ...baseWhere,
        OR: [
          { status: { equals: 'Inactive', mode: 'insensitive' } },
          { isActive: false }
        ]
      }
    });

    // Get employees by department (only active employees)
    const employeesByDepartment = await prisma.user.groupBy({
      by: ['department'],
      where: {
        ...baseWhere,
        isActive: true,
        department: {
          not: null
        }
      },
      _count: {
        id: true
      }
    });

    // Get unique departments count (only from active employees)
    const totalDepartments = await prisma.user.findMany({
      where: {
        ...baseWhere,
        isActive: true,
        department: {
          not: null
        }
      },
      select: {
        department: true
      },
      distinct: ['department']
    });

    res.json({
      success: true,
      data: {
        totalEmployees,
        activeEmployees,
        inactiveEmployees,
        totalDepartments: totalDepartments.length,
        employeesByDepartment: employeesByDepartment.map(dept => ({
          department: dept.department,
          count: dept._count.id
        }))
      }
    });
  } catch (error) {
    console.error('Get employee statistics error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch employee statistics'
    });
  }
};

const positionSelectForCompany = {
  id: true,
  subDepartment: {
    select: {
      department: {
        select: {
          company: { select: { name: true } },
        },
      },
    },
  },
} as const;

function isUuidString(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s.trim());
}

async function resolveSubDepartmentIdFromSlugOrName(
  departmentId: string,
  slugOrName: string
): Promise<string | null> {
  const raw = slugOrName.trim();
  if (!raw) return null;
  const wantSlug = raw.toLowerCase().replace(/\s+/g, '-');
  const subs = await prisma.subDepartment.findMany({
    where: { departmentId },
    select: { id: true, name: true },
  });
  for (const s of subs) {
    const n = s.name.trim();
    if (n.toLowerCase() === raw.toLowerCase()) return s.id;
    if (n.toLowerCase().replace(/\s+/g, '-') === wantSlug) return s.id;
  }
  return null;
}

async function resolveSubDepartmentIdForPositionLookup(
  subDepartmentIdInput: unknown,
  departmentIdInput: unknown
): Promise<string | null> {
  const raw =
    typeof subDepartmentIdInput === 'string' ? subDepartmentIdInput.trim() : '';
  if (!raw) return null;
  if (isUuidString(raw)) return raw;
  const dep =
    typeof departmentIdInput === 'string' ? departmentIdInput.trim() : '';
  if (dep && isUuidString(dep)) {
    const resolved = await resolveSubDepartmentIdFromSlugOrName(dep, raw);
    if (resolved) return resolved;
  }
  return null;
}

async function resolveOrgPositionForAssignment(
  positionIdInput: unknown,
  subDepartmentIdInput: unknown,
  positionNameInput: unknown,
  departmentIdInput: unknown
): Promise<
  | { ok: true; positionId: string; companyName: string }
  | { ok: false; status: number; message: string }
> {
  let pid =
    typeof positionIdInput === 'number' && Number.isFinite(positionIdInput)
      ? String(positionIdInput)
      : typeof positionIdInput === 'string'
        ? positionIdInput.trim()
        : '';
  if (pid === 'undefined' || pid === 'null') pid = '';

  const nameFallback =
    typeof positionNameInput === 'string' ? positionNameInput.trim() : '';

  const resolvedSubDeptId = await resolveSubDepartmentIdForPositionLookup(
    subDepartmentIdInput,
    departmentIdInput
  );

  let position: {
    id: string;
    subDepartment: {
      department: { company: { name: string } | null } | null;
    } | null;
  } | null = null;

  if (pid && isUuidString(pid)) {
    position = await prisma.position.findUnique({
      where: { id: pid },
      select: positionSelectForCompany,
    });
  }

  if (!position && resolvedSubDeptId && nameFallback) {
    position = await prisma.position.findFirst({
      where: {
        subDepartmentId: resolvedSubDeptId,
        name: { equals: nameFallback, mode: 'insensitive' },
      },
      select: positionSelectForCompany,
    });
  }

  if (!position) {
    const rawSd =
      typeof subDepartmentIdInput === 'string' ? subDepartmentIdInput.trim() : '';
    const rawDep =
      typeof departmentIdInput === 'string' ? departmentIdInput.trim() : '';
    const hint =
      resolvedSubDeptId && nameFallback
        ? ' No matching position name under that sub-department.'
        : rawSd && !isUuidString(rawSd) && (!rawDep || !isUuidString(rawDep))
          ? ' subDepartmentId looks like a URL slug; send departmentId (UUID) in the JSON body.'
          : ' Send positionId (UUID) or subDepartmentId + positionName.';
    return {
      ok: false,
      status: 404,
      message: `Position not found.${hint}` +
        (pid && isUuidString(pid) ? ` (position id: ${pid.slice(0, 8)}…)` : ''),
    };
  }

  const companyName = position.subDepartment?.department?.company?.name?.trim() ?? '';
  if (!companyName) {
    return {
      ok: false,
      status: 400,
      message: 'Position is not linked to a company in the database',
    };
  }

  return { ok: true, positionId: position.id, companyName };
}

async function assertEmployeeMatchesPositionCompany(
  employeeId: string,
  companyName: string
): Promise<{ ok: true } | { ok: false; status: number; message: string }> {
  const user = await prisma.user.findUnique({
    where: { id: employeeId },
    select: { id: true, company: true },
  });

  if (!user) {
    return { ok: false, status: 404, message: 'Employee not found' };
  }

  const userCompany = user.company?.trim() ?? '';
  if (!userCompany) {
    return {
      ok: false,
      status: 400,
      message: 'Employee has no company set; set company on their profile before assigning org positions',
    };
  }
  if (userCompany.toLowerCase() !== companyName.toLowerCase()) {
    return {
      ok: false,
      status: 403,
      message: 'This position belongs to a different company than the employee',
    };
  }

  return { ok: true };
}

/**
 * POST /api/employees/:id/position-assignments
 * Adds org-chart visibility for this position without changing primary department/position/jobTitle.
 */
export const assignEmployeeToOrgPosition = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const reasonRaw = req.body?.reason;
    const reason = typeof reasonRaw === 'string' && reasonRaw.trim() ? reasonRaw.trim() : undefined;

    const resolved = await resolveOrgPositionForAssignment(
      req.body?.positionId,
      req.body?.subDepartmentId,
      req.body?.positionName,
      req.body?.departmentId
    );
    if (!resolved.ok) {
      res.status(resolved.status).json({ success: false, message: resolved.message });
      return;
    }

    const positionId = resolved.positionId;

    const gate = await assertEmployeeMatchesPositionCompany(id, resolved.companyName);
    if (!gate.ok) {
      res.status(gate.status).json({ success: false, message: gate.message });
      return;
    }

    const existing = await prisma.employeePositionAssignment.findUnique({
      where: { userId_positionId: { userId: id, positionId } },
    });
    if (existing) {
      res.json({
        success: true,
        message: 'Employee already appears on this position',
        data: { alreadyAssigned: true, positionId },
      });
      return;
    }

    await prisma.employeePositionAssignment.create({
      data: {
        userId: id,
        positionId,
        assignedById: req.user?.id ?? null,
        reason: reason ?? null,
      },
    });

    res.json({
      success: true,
      message: 'Employee assigned to this position (primary directory fields unchanged)',
      data: { alreadyAssigned: false, positionId },
    });
  } catch (error) {
    console.error('assignEmployeeToOrgPosition error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to assign employee to position',
    });
  }
};

/**
 * DELETE /api/employees/:id/position-assignments/:positionId
 * Removes an additional org-chart assignment only (does not change primary directory fields).
 */
export const removeEmployeeOrgPositionAssignment = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id, positionId } = req.params;
    const pid = typeof positionId === 'string' ? positionId.trim() : '';
    if (!pid) {
      res.status(400).json({ success: false, message: 'positionId is required' });
      return;
    }

    const resolved = await resolveOrgPositionForAssignment(pid, undefined, undefined, undefined);
    if (!resolved.ok) {
      res.status(resolved.status).json({ success: false, message: resolved.message });
      return;
    }

    const gate = await assertEmployeeMatchesPositionCompany(id, resolved.companyName);
    if (!gate.ok) {
      res.status(gate.status).json({ success: false, message: gate.message });
      return;
    }

    const result = await prisma.employeePositionAssignment.deleteMany({
      where: { userId: id, positionId: resolved.positionId },
    });

    if (result.count === 0) {
      res.status(404).json({
        success: false,
        message: 'No assignment found for this employee and position',
      });
      return;
    }

    res.json({ success: true, message: 'Removed additional position assignment' });
  } catch (error) {
    console.error('removeEmployeeOrgPositionAssignment error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove position assignment',
    });
  }
};

