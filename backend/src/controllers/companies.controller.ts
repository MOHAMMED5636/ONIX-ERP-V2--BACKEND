import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { CompanyStatus, LicenseStatus } from '@prisma/client';

/**
 * Get all companies
 * GET /api/companies
 */
export const getAllCompanies = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { 
      status, 
      licenseStatus,
      search,
      page = '1',
      limit = '100',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page as string, 10);
    const limitNum = parseInt(limit as string, 10);
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (status && status !== 'all') {
      where.status = status as CompanyStatus;
    }

    if (licenseStatus && licenseStatus !== 'all') {
      where.licenseStatus = licenseStatus as LicenseStatus;
    }

    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { tag: { contains: search as string, mode: 'insensitive' } },
        { address: { contains: search as string, mode: 'insensitive' } },
        { industry: { contains: search as string, mode: 'insensitive' } },
        { contactEmail: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [companies, total] = await Promise.all([
      prisma.company.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: {
          [sortBy as string]: sortOrder as 'asc' | 'desc',
        },
      }),
      prisma.company.count({ where }),
    ]);

    res.json({
      success: true,
      data: companies,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    console.error('Get all companies error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Get company by ID
 * GET /api/companies/:id
 */
export const getCompanyById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const company = await prisma.company.findUnique({
      where: { id },
    });

    if (!company) {
      res.status(404).json({ success: false, message: 'Company not found' });
      return;
    }

    res.json({
      success: true,
      data: company,
    });
  } catch (error) {
    console.error('Get company by ID error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

/**
 * Create new company
 * POST /api/companies
 */
export const createCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      name,
      tag,
      address,
      industry,
      founded,
      status,
      contactName,
      contactEmail,
      contactPhone,
      contactExtension,
      licenseExpiry,
      licenseStatus,
      logo,
      header,
      footer,
      employees,
    } = req.body;

    // Validate required fields
    if (!name) {
      res.status(400).json({
        success: false,
        message: 'Company name is required',
      });
      return;
    }

    console.log(`📝 Creating company: ${name}`);
    console.log(`   Tag: ${tag || 'N/A'}`);
    console.log(`   Status: ${status || 'ACTIVE'}`);
    console.log(`   Created By: ${req.user?.id}`);

    // Create company
    const company = await prisma.company.create({
      data: {
        name,
        tag: tag || null,
        address: address || null,
        industry: industry || null,
        founded: founded || null,
        status: (status as CompanyStatus) || CompanyStatus.ACTIVE,
        contactName: contactName || null,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        contactExtension: contactExtension || null,
        licenseExpiry: licenseExpiry ? new Date(licenseExpiry) : null,
        licenseStatus: (licenseStatus as LicenseStatus) || LicenseStatus.ACTIVE,
        logo: logo || null,
        header: header || null,
        footer: footer || null,
        employees: employees ? parseInt(employees, 10) : 0,
        createdBy: req.user?.id || null,
      },
    });

    console.log(`✅ Company created successfully: ${company.id}`);
    console.log(`   Final Status: ${company.status}`);

    // Verify the company was saved correctly
    const verifyCompany = await prisma.company.findUnique({
      where: { id: company.id },
      select: { id: true, name: true, status: true, tag: true }
    });
    console.log(`   Verified in DB:`, verifyCompany);

    res.status(201).json({
      success: true,
      message: 'Company created successfully',
      data: company,
    });
  } catch (error) {
    console.error('Create company error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Update company
 * PUT /api/companies/:id
 */
export const updateCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    // Convert status enums if provided
    if (updateData.status) {
      updateData.status = updateData.status as CompanyStatus;
    }
    if (updateData.licenseStatus) {
      updateData.licenseStatus = updateData.licenseStatus as LicenseStatus;
    }

    // Convert dates
    if (updateData.licenseExpiry) {
      updateData.licenseExpiry = new Date(updateData.licenseExpiry);
    }

    // Convert employees to number
    if (updateData.employees !== undefined) {
      updateData.employees = parseInt(updateData.employees, 10);
    }

    const company = await prisma.company.update({
      where: { id },
      data: updateData,
    });

    console.log(`✅ Company updated: ${company.id}`);

    res.json({
      success: true,
      message: 'Company updated successfully',
      data: company,
    });
  } catch (error) {
    console.error('Update company error:', error);
    if (error instanceof Error && error.message.includes('Record to update not found')) {
      res.status(404).json({ success: false, message: 'Company not found' });
    } else {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
};

/**
 * Delete company
 * DELETE /api/companies/:id
 */
export const deleteCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    await prisma.company.delete({
      where: { id },
    });

    console.log(`✅ Company deleted: ${id}`);

    res.json({
      success: true,
      message: 'Company deleted successfully',
    });
  } catch (error) {
    console.error('Delete company error:', error);
    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      res.status(404).json({ success: false, message: 'Company not found' });
    } else {
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  }
};

/**
 * Get company statistics
 * GET /api/companies/stats
 */
export const getCompanyStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const totalCompanies = await prisma.company.count();
    const activeCompanies = await prisma.company.count({
      where: { status: CompanyStatus.ACTIVE }
    });
    const totalEmployees = await prisma.company.aggregate({
      _sum: { employees: true }
    });
    const industries = await prisma.company.groupBy({
      by: ['industry'],
      _count: { id: true }
    });
    const activeLicenses = await prisma.company.count({
      where: { licenseStatus: LicenseStatus.ACTIVE }
    });

    res.json({
      success: true,
      data: {
        totalCompanies,
        activeCompanies,
        totalEmployees: totalEmployees._sum.employees || 0,
        industries: industries.length,
        activeLicenses,
      },
    });
  } catch (error) {
    console.error('Get company stats error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

