import { Response } from 'express';
import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';

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
    console.log('📦 Full req.body:', JSON.stringify(req.body, null, 2));
    console.log('📦 req.body keys:', Object.keys(req.body));
    console.log('📦 Content-Type:', req.headers['content-type']);
    console.log('📦 Files received:', req.files ? Object.keys(req.files) : 'No files');
    
    const { 
      // Basic fields
      firstName, lastName, role, phone, department, position, jobTitle, employeeId, projectIds,
      // Employee Directory - Personal Info
      employeeType, status, userAccount,
      // Employee Directory - Personal Details
      gender, maritalStatus, nationality, birthday, childrenCount, currentAddress,
      // Employee Directory - Contact Info
      contacts, emails,  // Arrays of contacts and emails
      // Employee Directory - Company Info
      company, companyLocation, managerId, attendanceProgram, joiningDate, exitDate, isLineManager,
      // Employee Directory - Legal Documents
      passportNumber, passportIssueDate, passportExpiryDate, passportAttachment,
      nationalIdNumber, nationalIdExpiryDate, nationalIdAttachment,
      residencyNumber, residencyExpiryDate, residencyAttachment,
      insuranceNumber, insuranceExpiryDate, insuranceAttachment,
      drivingLicenseNumber, drivingLicenseExpiryDate, drivingLicenseAttachment,
      labourIdNumber, labourIdExpiryDate, labourIdAttachment,
      remarks
    } = req.body;
    
    // Debug: Log passport fields
    console.log('📋 Received passport data:', {
      passportNumber: passportNumber,
      passportIssueDate: passportIssueDate,
      passportExpiryDate: passportExpiryDate,
      passportNumberType: typeof passportNumber,
      passportIssueDateType: typeof passportIssueDate,
      passportExpiryDateType: typeof passportExpiryDate,
      bodyKeys: Object.keys(req.body).filter(k => k.includes('passport'))
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

    // Generate unique email
    const email = await generateUniqueEmail(firstName, lastName);
    console.log('📧 Generated email:', email);

    // Parse boolean values from FormData (they come as strings)
    const userAccountBool = typeof userAccount === 'string' 
      ? (userAccount.toLowerCase().trim() === 'true' || userAccount.toLowerCase().trim() === '1' || userAccount.toLowerCase().trim() === 'yes')
      : Boolean(userAccount);

    // Generate temporary password (only if userAccount is true)
    let temporaryPassword: string | null = null;
    let hashedPassword: string | null = null;
    if (userAccountBool) {
      temporaryPassword = generateTemporaryPassword();
      hashedPassword = await bcrypt.hash(temporaryPassword, 10);
      console.log('🔐 Generated password hash for user account');
    } else {
      // Create a dummy password if no user account needed
      hashedPassword = await bcrypt.hash('NO_ACCOUNT_' + Date.now(), 10);
      console.log('🔐 Generated dummy password hash');
    }
    
    if (!hashedPassword) {
      throw new Error('Failed to generate password hash');
    }

    // Parse dates
    const parseDate = (dateStr: string | undefined): Date | null => {
      if (!dateStr) return null;
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : date;
    };

    // Helper function to parse FormData arrays (e.g., contacts[0], contacts[1] -> [contact0, contact1])
    const parseFormDataArray = (value: any): any[] | null => {
      if (!value) return null;
      if (Array.isArray(value)) return value;
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return Array.isArray(parsed) ? parsed : null;
        } catch {
          return null;
        }
      }
      // If it's an object with numeric keys (FormData array format)
      if (typeof value === 'object') {
        const keys = Object.keys(value).sort((a, b) => {
          const numA = parseInt(a.match(/\d+/)?.[0] || '0');
          const numB = parseInt(b.match(/\d+/)?.[0] || '0');
          return numA - numB;
        });
        if (keys.length > 0) {
          return keys.map(key => value[key]).filter(v => v !== null && v !== undefined);
        }
      }
      return null;
    };

    // Parse contacts and emails arrays from FormData
    const parsedContacts = parseFormDataArray(contacts);
    const parsedEmails = parseFormDataArray(emails);
    
    // Convert contacts and emails arrays to JSON strings
    const phoneNumbersJson = parsedContacts && parsedContacts.length > 0 ? JSON.stringify(parsedContacts) : null;
    const emailAddressesJson = parsedEmails && parsedEmails.length > 0 ? JSON.stringify(parsedEmails) : null;
    
    console.log('📋 Parsed contacts:', parsedContacts);
    console.log('📋 Parsed emails:', parsedEmails);

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
        phone: phone || null,
        department: department || null,
        position: position || null,
        jobTitle: jobTitle || null,
        photo: photoFilename || null,
        employeeId: employeeId || null,
        forcePasswordChange: userAccountBool ? true : false,
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
        birthday: parseDate(birthday),
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
        joiningDate: parseDate(joiningDate),
        exitDate: parseDate(exitDate),
        isLineManager: parseBoolean(isLineManager),
        
        // Employee Directory - Legal Documents
        passportNumber: passportNum || null,
        passportIssueDate: parseDate(passportIssue),
        passportExpiryDate: parseDate(passportExpiry),
        passportAttachment: passportAttachmentFile || passportAttachment || null,
        
        nationalIdNumber: nationalIdNumber || null,
        nationalIdExpiryDate: parseDate(nationalIdExpiryDate),
        nationalIdAttachment: nationalIdAttachmentFile || nationalIdAttachment || null,
        
        residencyNumber: residencyNumber || null,
        residencyExpiryDate: parseDate(residencyExpiryDate),
        residencyAttachment: residencyAttachmentFile || residencyAttachment || null,
        
        insuranceNumber: insuranceNumber || null,
        insuranceExpiryDate: parseDate(insuranceExpiryDate),
        insuranceAttachment: insuranceAttachmentFile || insuranceAttachment || null,
        
        drivingLicenseNumber: drivingLicenseNumber || null,
        drivingLicenseExpiryDate: parseDate(drivingLicenseExpiryDate),
        drivingLicenseAttachment: drivingLicenseAttachmentFile || drivingLicenseAttachment || null,
        
        labourIdNumber: labourIdNumber || null,
        labourIdExpiryDate: parseDate(labourIdExpiryDate),
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
        temporaryPassword: temporaryPassword, // Show only once
        message: 'Please save these credentials. They will not be shown again.',
      };
    }

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
 * Get all employees
 * GET /api/employees
 * Access: ADMIN, HR only
 */
export const getEmployees = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { page = 1, limit = 50, search, role, department } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    // Build where clause
    const where: any = {
      // Exclude ADMIN and TENDER_ENGINEER roles - only show actual employees
      role: {
        notIn: ['ADMIN', 'TENDER_ENGINEER']
      }
    };
    
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
          }
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      success: true,
      data: {
        employees,
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

    res.json({
      success: true,
      data: employee
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
    const { 
      // Basic fields
      firstName, lastName, role, phone, department, position, jobTitle, employeeId, isActive, projectIds,
      // Employee Directory - Personal Info
      employeeType, status, userAccount,
      // Employee Directory - Personal Details
      gender, maritalStatus, nationality, birthday, childrenCount, currentAddress,
      // Employee Directory - Contact Info
      contacts, emails,
      // Employee Directory - Company Info
      company, companyLocation, managerId, attendanceProgram, joiningDate, exitDate, isLineManager,
      // Employee Directory - Legal Documents
      passportNumber, passportIssueDate, passportExpiryDate, passportAttachment,
      nationalIdNumber, nationalIdExpiryDate, nationalIdAttachment,
      residencyNumber, residencyExpiryDate, residencyAttachment,
      insuranceNumber, insuranceExpiryDate, insuranceAttachment,
      drivingLicenseNumber, drivingLicenseExpiryDate, drivingLicenseAttachment,
      labourIdNumber, labourIdExpiryDate, labourIdAttachment,
      remarks
    } = req.body;
    
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

    // Validate minimum age (18 years) if birthday is being updated
    if (birthday !== undefined) {
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

    // Validate passport expiry date - must be at least 6 months from today
    if (passportExpiryDate !== undefined && passportExpiryDate !== null) {
      const expiryDate = new Date(passportExpiryDate);
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

    // Validate passport expiry date - must be at least 6 months from today
    if (passportExpiryDate) {
      const expiryDate = new Date(passportExpiryDate);
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

    // Parse dates helper
    const parseDate = (dateStr: string | undefined): Date | null => {
      if (!dateStr) return null;
      const date = new Date(dateStr);
      return isNaN(date.getTime()) ? null : date;
    };

    // Update employee
    const updateData: any = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (role !== undefined) updateData.role = role;
    if (phone !== undefined) updateData.phone = phone;
    if (department !== undefined) updateData.department = department;
    if (position !== undefined) updateData.position = position;
    if (jobTitle !== undefined) updateData.jobTitle = jobTitle;
    if (photoFilename !== undefined) updateData.photo = photoFilename;
    if (employeeId !== undefined) updateData.employeeId = employeeId;
    if (isActive !== undefined) updateData.isActive = isActive;
    
    // Employee Directory - Personal Info
    if (employeeType !== undefined) updateData.employeeType = employeeType;
    if (status !== undefined) updateData.status = status;
    if (userAccount !== undefined) updateData.userAccount = parseBoolean(userAccount);
    
    // Employee Directory - Personal Details
    if (gender !== undefined) updateData.gender = gender;
    if (maritalStatus !== undefined) updateData.maritalStatus = maritalStatus;
    if (nationality !== undefined) updateData.nationality = nationality;
    if (birthday !== undefined) updateData.birthday = parseDate(birthday);
    if (childrenCount !== undefined) updateData.childrenCount = childrenCount ? parseInt(childrenCount) : null;
    if (currentAddress !== undefined) updateData.currentAddress = currentAddress;
    
    // Employee Directory - Contact Info
    if (contacts !== undefined) updateData.phoneNumbers = Array.isArray(contacts) ? JSON.stringify(contacts) : null;
    if (emails !== undefined) updateData.emailAddresses = Array.isArray(emails) ? JSON.stringify(emails) : null;
    
    // Employee Directory - Company Info
    if (company !== undefined) updateData.company = company;
    if (companyLocation !== undefined) updateData.companyLocation = companyLocation;
    if (managerId !== undefined) updateData.managerId = managerId;
    if (attendanceProgram !== undefined) updateData.attendanceProgram = attendanceProgram;
    if (joiningDate !== undefined) updateData.joiningDate = parseDate(joiningDate);
    if (exitDate !== undefined) updateData.exitDate = parseDate(exitDate);
    if (isLineManager !== undefined) updateData.isLineManager = parseBoolean(isLineManager);
    
    // Employee Directory - Legal Documents
    if (passportNumber !== undefined) updateData.passportNumber = passportNumber;
    if (passportIssueDate !== undefined) updateData.passportIssueDate = parseDate(passportIssueDate);
    if (passportExpiryDate !== undefined) updateData.passportExpiryDate = parseDate(passportExpiryDate);
    if (passportAttachmentFile !== undefined) {
      updateData.passportAttachment = passportAttachmentFile;
    } else if (passportAttachment !== undefined) {
      updateData.passportAttachment = passportAttachment;
    }
    
    if (nationalIdNumber !== undefined) updateData.nationalIdNumber = nationalIdNumber;
    if (nationalIdExpiryDate !== undefined) updateData.nationalIdExpiryDate = parseDate(nationalIdExpiryDate);
    if (nationalIdAttachmentFile !== undefined) {
      updateData.nationalIdAttachment = nationalIdAttachmentFile;
    } else if (nationalIdAttachment !== undefined) {
      updateData.nationalIdAttachment = nationalIdAttachment;
    }
    
    if (residencyNumber !== undefined) updateData.residencyNumber = residencyNumber;
    if (residencyExpiryDate !== undefined) updateData.residencyExpiryDate = parseDate(residencyExpiryDate);
    if (residencyAttachmentFile !== undefined) {
      updateData.residencyAttachment = residencyAttachmentFile;
    } else if (residencyAttachment !== undefined) {
      updateData.residencyAttachment = residencyAttachment;
    }
    
    if (insuranceNumber !== undefined) updateData.insuranceNumber = insuranceNumber;
    if (insuranceExpiryDate !== undefined) updateData.insuranceExpiryDate = parseDate(insuranceExpiryDate);
    if (insuranceAttachmentFile !== undefined) {
      updateData.insuranceAttachment = insuranceAttachmentFile;
    } else if (insuranceAttachment !== undefined) {
      updateData.insuranceAttachment = insuranceAttachment;
    }
    
    if (drivingLicenseNumber !== undefined) updateData.drivingLicenseNumber = drivingLicenseNumber;
    if (drivingLicenseExpiryDate !== undefined) updateData.drivingLicenseExpiryDate = parseDate(drivingLicenseExpiryDate);
    if (drivingLicenseAttachmentFile !== undefined) {
      updateData.drivingLicenseAttachment = drivingLicenseAttachmentFile;
    } else if (drivingLicenseAttachment !== undefined) {
      updateData.drivingLicenseAttachment = drivingLicenseAttachment;
    }
    
    if (labourIdNumber !== undefined) updateData.labourIdNumber = labourIdNumber;
    if (labourIdExpiryDate !== undefined) updateData.labourIdExpiryDate = parseDate(labourIdExpiryDate);
    if (labourIdAttachmentFile !== undefined) {
      updateData.labourIdAttachment = labourIdAttachmentFile;
    } else if (labourIdAttachment !== undefined) {
      updateData.labourIdAttachment = labourIdAttachment;
    }
    
    if (remarks !== undefined) updateData.remarks = remarks;

    const employee = await prisma.user.update({
      where: { id },
      data: updateData,
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
        // Employee Directory fields
        employeeType: true,
        status: true,
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

    // Update project assignments if provided
    if (projectIds !== undefined) {
      // Remove existing assignments
      await prisma.projectAssignment.deleteMany({
        where: { employeeId: id }
      });

      // Add new assignments
      if (Array.isArray(projectIds) && projectIds.length > 0) {
        await prisma.projectAssignment.createMany({
          data: projectIds.map((projectId: string) => ({
            projectId,
            employeeId: id,
            assignedBy: req.user!.id,
          })),
          skipDuplicates: true,
        });
      }
    }

    res.json({
      success: true,
      message: 'Employee updated successfully',
      data: employee
    });
  } catch (error: any) {
    console.error('Update employee error:', error);
    
    if (error.code === 'P2002') {
      res.status(409).json({
        success: false,
        message: 'Employee ID or email already exists'
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Failed to update employee'
    });
  }
};

/**
 * Delete/Deactivate employee
 * DELETE /api/employees/:id
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

    // Soft delete - deactivate instead of deleting
    const employee = await prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
      }
    });

    res.json({
      success: true,
      message: 'Employee deactivated successfully',
      data: employee
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

    // Restore - reactivate the employee
    const employee = await prisma.user.update({
      where: { id },
      data: { isActive: true },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
      }
    });

    res.json({
      success: true,
      message: 'Employee restored successfully',
      data: employee
    });
  } catch (error) {
    console.error('Restore employee error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to restore employee'
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
    // Get total employees count (exclude ADMIN and TENDER_ENGINEER roles, only active employees)
    const totalEmployees = await prisma.user.count({
      where: {
        role: {
          notIn: ['ADMIN', 'TENDER_ENGINEER']
        },
        isActive: true
      }
    });

    // Get active employees count (status = 'Active' or isActive = true)
    const activeEmployees = await prisma.user.count({
      where: {
        role: {
          notIn: ['ADMIN', 'TENDER_ENGINEER']
        },
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
        role: {
          notIn: ['ADMIN', 'TENDER_ENGINEER']
        },
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
        role: {
          notIn: ['ADMIN', 'TENDER_ENGINEER']
        },
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
        role: {
          notIn: ['ADMIN', 'TENDER_ENGINEER']
        },
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


