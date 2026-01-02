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
    const { firstName, lastName, role, phone, department, position, jobTitle, employeeId, projectIds } = req.body;
    
    // Get photo filename from uploaded file
    const photoFilename = (req as any).file ? (req as any).file.filename : null;

    // Validation
    if (!firstName || !lastName) {
      res.status(400).json({
        success: false,
        message: 'First name and last name are required'
      });
      return;
    }

    // Validate role
    const validRoles = ['EMPLOYEE', 'PROJECT_MANAGER', 'TENDER_ENGINEER'];
    if (role && !validRoles.includes(role)) {
      res.status(400).json({
        success: false,
        message: `Invalid role. Must be one of: ${validRoles.join(', ')}`
      });
      return;
    }

    // Generate unique email
    const email = await generateUniqueEmail(firstName, lastName);

    // Generate temporary password
    const temporaryPassword = generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 10);

    // Create employee
    const employee = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        role: role || 'EMPLOYEE',
        phone: phone || null,
        department: department || null,
        position: position || null,
        jobTitle: jobTitle || null,
        photo: photoFilename || null,
        employeeId: employeeId || null,
        forcePasswordChange: true, // Force password change on first login
        isActive: true,
        createdBy: req.user!.id,
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
      }
    });

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

    // Return employee with temporary password (shown only once)
    res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      data: {
        employee,
        credentials: {
          email: employee.email,
          temporaryPassword: temporaryPassword, // Show only once
          message: 'Please save these credentials. They will not be shown again.',
        }
      }
    });
  } catch (error: any) {
    console.error('Create employee error:', error);
    
    // Handle unique constraint violations
    if (error.code === 'P2002') {
      res.status(409).json({
        success: false,
        message: 'Employee with this email or employee ID already exists'
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Failed to create employee',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
    const where: any = {};
    
    if (search) {
      where.OR = [
        { firstName: { contains: search as string, mode: 'insensitive' } },
        { lastName: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
        { employeeId: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    if (role) {
      where.role = role;
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
    const { firstName, lastName, role, phone, department, position, jobTitle, employeeId, isActive, projectIds } = req.body;
    
    // Get photo filename from uploaded file (if new photo uploaded)
    const photoFilename = (req as any).file ? (req as any).file.filename : undefined;

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

    // Update employee
    const updateData: any = {};
    if (firstName) updateData.firstName = firstName;
    if (lastName) updateData.lastName = lastName;
    if (role) updateData.role = role;
    if (phone !== undefined) updateData.phone = phone;
    if (department !== undefined) updateData.department = department;
    if (position !== undefined) updateData.position = position;
    if (jobTitle !== undefined) updateData.jobTitle = jobTitle;
    if (photoFilename !== undefined) updateData.photo = photoFilename;
    if (employeeId !== undefined) updateData.employeeId = employeeId;
    if (isActive !== undefined) updateData.isActive = isActive;

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


