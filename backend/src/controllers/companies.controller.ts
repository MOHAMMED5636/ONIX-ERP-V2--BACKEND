import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { CompanyStatus, LicenseStatus, Prisma } from '@prisma/client';

/** Parse optional date from string or Date; returns null for empty/invalid. */
function parseOptionalDate(value: unknown): Date | null {
  if (value == null || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  const d = new Date(value as string);
  return isNaN(d.getTime()) ? null : d;
}

/** Parse optional boolean from string or boolean. */
function parseOptionalBoolean(value: unknown): boolean | null {
  if (value == null || value === '') return null;
  if (typeof value === 'boolean') return value;
  const s = String(value).toLowerCase();
  if (s === 'true' || s === '1' || s === 'yes') return true;
  if (s === 'false' || s === '0' || s === 'no') return false;
  return null;
}

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

    console.log(`📡 Fetching company by ID: ${id}`);

    const company = await prisma.company.findUnique({
      where: { id },
    });

    if (!company) {
      res.status(404).json({ success: false, message: 'Company not found' });
      return;
    }

    console.log(`✅ Company found: ${company.name}`);
    console.log(`📋 License fields:`, {
      licenseCategory: company.licenseCategory,
      legalType: company.legalType,
      dunsNumber: company.dunsNumber,
      registerNo: company.registerNo,
      issueDate: company.issueDate,
      mainLicenseNo: company.mainLicenseNo,
      dcciNo: company.dcciNo,
      trnNumber: company.trnNumber,
      licenseExpiry: company.licenseExpiry
    });

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
    const body = req.body || {};
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
      licenseCategory,
      legalType,
      licenseExpiry,
      licenseStatus,
      dunsNumber,
      registerNo,
      issueDate,
      mainLicenseNo,
      dcciNo,
      trnNumber,
      logo,
      header,
      footer,
      employees,
      officeLatitude,
      officeLongitude,
      attendanceRadius,
      // Personal & Representative
      fullNameEn,
      fullNameAr,
      delegatedCardNumber,
      businessPartnerNumber,
      emiratesId,
      emiratesIdExpiry,
      passportNumber,
      nationality,
      dateOfBirth,
      gender,
      mobileNumber,
      phoneNumber,
      email,
      representativeTitleEn,
      representativeTitleAr,
      // Company extended
      nameAr,
      businessName,
      branchName,
      companyCategory: companyCategoryBody,
      companyType,
      clientRole,
      websiteUrl,
      // Licensing
      establishmentCode,
      establishmentFileNumber,
      licenseAuthority,
      licenseNumber,
      licenseType,
      licenseIssueDate,
      unifiedDedFileNumber,
      dedLicenseNumber,
      prequalificationSubmitted,
      prequalificationExpiry,
      commercialRegisterNumber,
      commercialRegisterDate,
      membershipNumber,
      membershipIssueDate,
      membershipExpiry,
      membershipLegalStatus,
      trakheesId,
      practiceRegisterNumber,
      practiceRegisterIssueDate,
      practiceRegisterExpiry,
      municipalityClassification,
      establishmentMolNumber,
      molCardIssueDate,
      molCardExpiry,
      sponsorName,
      establishmentLocation,
      subscriptionStartDate,
      subscriptionEndDate,
      // Tax
      vatRegistrationNumber,
      vatEffectiveRegistrationDate,
      vatReturnPeriod,
      vatReturnDueDate,
      vatTaxPeriodCycle,
      vatCertificateIssueDate,
      corporateTaxRegistrationNumber,
      corporateTaxEffectiveRegistrationDate,
      firstCorporateTaxPeriodStart,
      firstCorporateTaxPeriodEnd,
      firstCorporateTaxFilingDeadline,
      // Contact & Address
      officePhone,
      telephone2,
      faxNumber,
      companyEmail,
      contactPersonName,
      contactMobile,
      poBox,
      city,
      region,
      street,
      addressDetails,
      makaniNumber,
      parcelId,
      buildingNumber,
      floorNumber,
      subscriptionExpiryDate,
      // Ownership
      ownerName,
      partnersInfo,
      // Activities
      activitiesInfo,
      // Notes
      licenseRemarks,
      connectionType,
    } = body;

    // Validate required fields (name may be missing when using FormData)
    const companyName = typeof name === 'string' ? name.trim() : '';
    if (!companyName) {
      res.status(400).json({
        success: false,
        message: 'Company name is required',
      });
      return;
    }

    // Handle file uploads from multer
    // Multer with .fields() returns an object with fieldname as keys
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const logoFile = files?.logo?.[0];
    const headerFile = files?.header?.[0];
    const footerFile = files?.footer?.[0];

    // Get file paths if files were uploaded, otherwise use provided URLs
    const logoPath = logoFile 
      ? `/uploads/companies/${logoFile.filename}`
      : (logo && typeof logo === 'string' ? logo : null);
    const headerPath = headerFile
      ? `/uploads/companies/${headerFile.filename}`
      : (header && typeof header === 'string' ? header : null);
    const footerPath = footerFile
      ? `/uploads/companies/${footerFile.filename}`
      : (footer && typeof footer === 'string' ? footer : null);

    const lat = officeLatitude != null && officeLatitude !== '' ? parseFloat(String(officeLatitude)) : null;
    const lng = officeLongitude != null && officeLongitude !== '' ? parseFloat(String(officeLongitude)) : null;
    const radius = attendanceRadius != null && attendanceRadius !== '' ? parseInt(String(attendanceRadius), 10) : null;

    console.log(`📝 Creating company: ${companyName}`);
    console.log(`   Tag: ${tag || 'N/A'}`);
    console.log(`   Status: ${status || 'ACTIVE'}`);
    console.log(`   Created By: ${req.user?.id}`);
    console.log(`   Logo: ${logoPath || 'null'}`);
    console.log(`   Header: ${headerPath || 'null'}`);
    console.log(`   Footer: ${footerPath || 'null'}`);

    const partnersJson = partnersInfo != null && typeof partnersInfo === 'object'
      ? (Array.isArray(partnersInfo) ? partnersInfo : (typeof partnersInfo === 'string' ? JSON.parse(partnersInfo) : partnersInfo))
      : null;
    const activitiesJson = activitiesInfo != null && typeof activitiesInfo === 'object'
      ? (Array.isArray(activitiesInfo) ? activitiesInfo : (typeof activitiesInfo === 'string' ? JSON.parse(activitiesInfo) : activitiesInfo))
      : null;

    // Create company (type assertion: Prisma client may not yet reflect all schema fields in IDE)
    const createData = {
        name: companyName,
        tag: tag || null,
        address: address || null,
        industry: industry || null,
        founded: founded || null,
        status: (status as CompanyStatus) || CompanyStatus.ACTIVE,
        contactName: contactName || null,
        contactEmail: contactEmail || null,
        contactPhone: contactPhone || null,
        contactExtension: contactExtension || null,
        licenseCategory: licenseCategory || null,
        legalType: legalType || null,
        licenseExpiry: parseOptionalDate(licenseExpiry),
        licenseStatus: (licenseStatus as LicenseStatus) || LicenseStatus.ACTIVE,
        dunsNumber: dunsNumber || null,
        registerNo: registerNo || null,
        issueDate: parseOptionalDate(issueDate),
        mainLicenseNo: mainLicenseNo || null,
        dcciNo: dcciNo || null,
        trnNumber: trnNumber || null,
        logo: logoPath,
        header: headerPath,
        footer: footerPath,
        employees: employees ? (typeof employees === 'number' ? employees : parseInt(String(employees), 10)) : 0,
        createdBy: req.user?.id ?? null,
        officeLatitude: lat != null && !isNaN(lat) ? lat : null,
        officeLongitude: lng != null && !isNaN(lng) ? lng : null,
        attendanceRadius: radius != null && !isNaN(radius) && radius > 0 ? radius : null,
        fullNameEn: fullNameEn || null,
        fullNameAr: fullNameAr || null,
        delegatedCardNumber: delegatedCardNumber || null,
        businessPartnerNumber: businessPartnerNumber || null,
        emiratesId: emiratesId || null,
        emiratesIdExpiry: parseOptionalDate(emiratesIdExpiry),
        passportNumber: passportNumber || null,
        nationality: nationality || null,
        dateOfBirth: parseOptionalDate(dateOfBirth),
        gender: gender || null,
        mobileNumber: mobileNumber || null,
        phoneNumber: phoneNumber || null,
        email: email || null,
        representativeTitleEn: representativeTitleEn || null,
        representativeTitleAr: representativeTitleAr || null,
        nameAr: nameAr || null,
        businessName: businessName || null,
        branchName: branchName || null,
        companyCategory: companyCategoryBody || null,
        companyType: companyType || null,
        clientRole: clientRole || null,
        websiteUrl: websiteUrl || null,
        establishmentCode: establishmentCode || null,
        establishmentFileNumber: establishmentFileNumber || null,
        licenseAuthority: licenseAuthority || null,
        licenseNumber: licenseNumber || null,
        licenseType: licenseType || null,
        licenseIssueDate: parseOptionalDate(licenseIssueDate),
        unifiedDedFileNumber: unifiedDedFileNumber || null,
        dedLicenseNumber: dedLicenseNumber || null,
        prequalificationSubmitted: parseOptionalBoolean(prequalificationSubmitted),
        prequalificationExpiry: parseOptionalDate(prequalificationExpiry),
        commercialRegisterNumber: commercialRegisterNumber || null,
        commercialRegisterDate: parseOptionalDate(commercialRegisterDate),
        membershipNumber: membershipNumber || null,
        membershipIssueDate: parseOptionalDate(membershipIssueDate),
        membershipExpiry: parseOptionalDate(membershipExpiry),
        membershipLegalStatus: membershipLegalStatus || null,
        trakheesId: trakheesId || null,
        practiceRegisterNumber: practiceRegisterNumber || null,
        practiceRegisterIssueDate: parseOptionalDate(practiceRegisterIssueDate),
        practiceRegisterExpiry: parseOptionalDate(practiceRegisterExpiry),
        municipalityClassification: municipalityClassification || null,
        establishmentMolNumber: establishmentMolNumber || null,
        molCardIssueDate: parseOptionalDate(molCardIssueDate),
        molCardExpiry: parseOptionalDate(molCardExpiry),
        sponsorName: sponsorName || null,
        establishmentLocation: establishmentLocation || null,
        subscriptionStartDate: parseOptionalDate(subscriptionStartDate),
        subscriptionEndDate: parseOptionalDate(subscriptionEndDate),
        vatRegistrationNumber: vatRegistrationNumber || null,
        vatEffectiveRegistrationDate: parseOptionalDate(vatEffectiveRegistrationDate),
        vatReturnPeriod: vatReturnPeriod || null,
        vatReturnDueDate: vatReturnDueDate || null,
        vatTaxPeriodCycle: vatTaxPeriodCycle || null,
        vatCertificateIssueDate: parseOptionalDate(vatCertificateIssueDate),
        corporateTaxRegistrationNumber: corporateTaxRegistrationNumber || null,
        corporateTaxEffectiveRegistrationDate: parseOptionalDate(corporateTaxEffectiveRegistrationDate),
        firstCorporateTaxPeriodStart: parseOptionalDate(firstCorporateTaxPeriodStart),
        firstCorporateTaxPeriodEnd: parseOptionalDate(firstCorporateTaxPeriodEnd),
        firstCorporateTaxFilingDeadline: parseOptionalDate(firstCorporateTaxFilingDeadline),
        officePhone: officePhone || null,
        telephone2: telephone2 || null,
        faxNumber: faxNumber || null,
        companyEmail: companyEmail || null,
        contactPersonName: contactPersonName || null,
        contactMobile: contactMobile || null,
        poBox: poBox || null,
        city: city || null,
        region: region || null,
        street: street || null,
        addressDetails: addressDetails || null,
        makaniNumber: makaniNumber || null,
        parcelId: parcelId || null,
        buildingNumber: buildingNumber || null,
        floorNumber: floorNumber || null,
        subscriptionExpiryDate: parseOptionalDate(subscriptionExpiryDate),
        ownerName: ownerName || null,
        partnersInfo: partnersJson,
        activitiesInfo: activitiesJson,
        licenseRemarks: licenseRemarks || null,
        connectionType: connectionType || null,
    } as Prisma.CompanyUncheckedCreateInput;
    const company = await prisma.company.create({ data: createData });

    if (!company) {
      res.status(500).json({ success: false, message: 'Failed to create company' });
      return;
    }

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
    console.error('❌ Create company error:', error);
    console.error('   Error details:', error instanceof Error ? error.stack : error);
    console.error('   Request body:', JSON.stringify(req.body, null, 2));
    
    // More specific error messages
    let errorMessage = 'Internal server error';
    if (error instanceof Error) {
      if (error.message.includes('Unique constraint')) {
        errorMessage = 'A company with this name or tag already exists';
      } else if (error.message.includes('Invalid value')) {
        errorMessage = 'Invalid data provided. Please check all fields.';
      } else {
        errorMessage = error.message;
      }
    }
    
    res.status(500).json({ 
      success: false, 
      message: errorMessage,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

/**
 * Update company
 * PUT /api/companies/:id
 */
/** Company model keys that are allowed to be updated via API (excludes id, createdAt, updatedAt, relations). */
const COMPANY_UPDATE_ALLOWED = new Set([
  'name', 'tag', 'address', 'industry', 'founded', 'status', 'contactName', 'contactEmail', 'contactPhone', 'contactExtension',
  'licenseCategory', 'legalType', 'licenseExpiry', 'licenseStatus', 'dunsNumber', 'registerNo', 'issueDate', 'mainLicenseNo', 'dcciNo', 'trnNumber',
  'fullNameEn', 'fullNameAr', 'delegatedCardNumber', 'businessPartnerNumber', 'emiratesId', 'emiratesIdExpiry', 'passportNumber', 'nationality', 'dateOfBirth', 'gender',
  'mobileNumber', 'phoneNumber', 'email', 'representativeTitleEn', 'representativeTitleAr', 'nameAr', 'businessName', 'branchName', 'companyCategory', 'companyType', 'clientRole', 'websiteUrl',
  'establishmentCode', 'establishmentFileNumber', 'licenseAuthority', 'licenseNumber', 'licenseType', 'licenseIssueDate', 'unifiedDedFileNumber', 'dedLicenseNumber',
  'prequalificationSubmitted', 'prequalificationExpiry', 'commercialRegisterNumber', 'commercialRegisterDate', 'membershipNumber', 'membershipIssueDate', 'membershipExpiry', 'membershipLegalStatus',
  'trakheesId', 'practiceRegisterNumber', 'practiceRegisterIssueDate', 'practiceRegisterExpiry', 'municipalityClassification', 'establishmentMolNumber', 'molCardIssueDate', 'molCardExpiry',
  'sponsorName', 'establishmentLocation', 'subscriptionStartDate', 'subscriptionEndDate',
  'vatRegistrationNumber', 'vatEffectiveRegistrationDate', 'vatReturnPeriod', 'vatReturnDueDate', 'vatTaxPeriodCycle', 'vatCertificateIssueDate',
  'corporateTaxRegistrationNumber', 'corporateTaxEffectiveRegistrationDate', 'firstCorporateTaxPeriodStart', 'firstCorporateTaxPeriodEnd', 'firstCorporateTaxFilingDeadline',
  'officePhone', 'telephone2', 'faxNumber', 'companyEmail', 'contactPersonName', 'contactMobile', 'poBox', 'city', 'region', 'street', 'addressDetails',
  'makaniNumber', 'parcelId', 'buildingNumber', 'floorNumber', 'subscriptionExpiryDate', 'ownerName', 'partnersInfo', 'activitiesInfo', 'licenseRemarks', 'connectionType',
  'logo', 'header', 'footer', 'defaultCurrency', 'lengthUnit', 'areaUnit', 'volumeUnit', 'heightUnit', 'weightUnit',
  'officeLatitude', 'officeLongitude', 'attendanceRadius', 'employees', 'createdBy',
]);

/** Date fields on Company that need parsing when received from request. */
const COMPANY_DATE_FIELDS = new Set([
  'licenseExpiry', 'issueDate', 'emiratesIdExpiry', 'dateOfBirth', 'licenseIssueDate',
  'prequalificationExpiry', 'commercialRegisterDate', 'membershipIssueDate', 'membershipExpiry',
  'practiceRegisterIssueDate', 'practiceRegisterExpiry', 'molCardIssueDate', 'molCardExpiry',
  'subscriptionStartDate', 'subscriptionEndDate', 'vatEffectiveRegistrationDate', 'vatReturnDueDate',
  'vatCertificateIssueDate', 'corporateTaxEffectiveRegistrationDate', 'firstCorporateTaxPeriodStart',
  'firstCorporateTaxPeriodEnd', 'firstCorporateTaxFilingDeadline', 'subscriptionExpiryDate',
]);

export const updateCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const updateData = { ...(req.body || {}) };

    // Forbidden keys are omitted when building data below (only COMPANY_UPDATE_ALLOWED keys are passed to Prisma).

    // Parse date fields
    COMPANY_DATE_FIELDS.forEach((key) => {
      if (updateData[key] !== undefined && updateData[key] !== null && updateData[key] !== '') {
        const parsed = parseOptionalDate(updateData[key]);
        updateData[key] = parsed as never;
      }
    });
    if (updateData.prequalificationSubmitted !== undefined) {
      const v = parseOptionalBoolean(updateData.prequalificationSubmitted);
      updateData.prequalificationSubmitted = v as never;
    }
    if (updateData.partnersInfo !== undefined) {
      const v = updateData.partnersInfo;
      updateData.partnersInfo = (v != null && typeof v === 'object')
        ? (Array.isArray(v) ? v : (typeof v === 'string' ? JSON.parse(v) : v)) as never
        : null;
    }
    if (updateData.activitiesInfo !== undefined) {
      const v = updateData.activitiesInfo;
      updateData.activitiesInfo = (v != null && typeof v === 'object')
        ? (Array.isArray(v) ? v : (typeof v === 'string' ? JSON.parse(v) : v)) as never
        : null;
    }

    // Handle file uploads from multer
    // Multer with .fields() returns an object with fieldname as keys
    const files = req.files as { [fieldname: string]: Express.Multer.File[] } | undefined;
    const logoFile = files?.logo?.[0];
    const headerFile = files?.header?.[0];
    const footerFile = files?.footer?.[0];

    // Update file paths if new files were uploaded
    // If new file uploaded, use new file path; otherwise preserve existing URL from req.body
    if (logoFile) {
      updateData.logo = `/uploads/companies/${logoFile.filename}`;
      console.log(`📸 Logo uploaded: ${updateData.logo}`);
    } else if (updateData.logo && typeof updateData.logo === 'string' && updateData.logo.trim() !== '') {
      // Keep existing logo URL if provided (from FormData or JSON)
      updateData.logo = updateData.logo;
      console.log(`📸 Logo preserved: ${updateData.logo}`);
    } else {
      // If logo field is empty string or null, don't update it (preserve existing)
      delete updateData.logo;
    }

    if (headerFile) {
      updateData.header = `/uploads/companies/${headerFile.filename}`;
      console.log(`📸 Header uploaded: ${updateData.header}`);
    } else if (updateData.header && typeof updateData.header === 'string' && updateData.header.trim() !== '') {
      updateData.header = updateData.header;
      console.log(`📸 Header preserved: ${updateData.header}`);
    } else {
      delete updateData.header;
    }

    if (footerFile) {
      updateData.footer = `/uploads/companies/${footerFile.filename}`;
      console.log(`📸 Footer uploaded: ${updateData.footer}`);
    } else if (updateData.footer && typeof updateData.footer === 'string' && updateData.footer.trim() !== '') {
      updateData.footer = updateData.footer;
      console.log(`📸 Footer preserved: ${updateData.footer}`);
    } else {
      delete updateData.footer;
    }

    // Convert status enums if provided
    if (updateData.status) {
      updateData.status = updateData.status as CompanyStatus;
    }
    if (updateData.licenseStatus) {
      updateData.licenseStatus = updateData.licenseStatus as LicenseStatus;
    }

    // Convert employees to number
    if (updateData.employees !== undefined) {
      updateData.employees = parseInt(updateData.employees, 10);
    }

    // Convert office location (may come as strings from FormData)
    if (updateData.officeLatitude !== undefined && updateData.officeLatitude !== null && updateData.officeLatitude !== '') {
      updateData.officeLatitude = parseFloat(updateData.officeLatitude as string);
    } else if (updateData.officeLatitude === '') {
      updateData.officeLatitude = null;
    }
    if (updateData.officeLongitude !== undefined && updateData.officeLongitude !== null && updateData.officeLongitude !== '') {
      updateData.officeLongitude = parseFloat(updateData.officeLongitude as string);
    } else if (updateData.officeLongitude === '') {
      updateData.officeLongitude = null;
    }
    if (updateData.attendanceRadius !== undefined && updateData.attendanceRadius !== null && updateData.attendanceRadius !== '') {
      const r = parseInt(String(updateData.attendanceRadius), 10);
      updateData.attendanceRadius = !isNaN(r) && r > 0 ? r : null;
    } else if (updateData.attendanceRadius === '') {
      updateData.attendanceRadius = null;
    }

    const data: Record<string, unknown> = {};
    for (const key of Object.keys(updateData)) {
      if (COMPANY_UPDATE_ALLOWED.has(key) && updateData[key] !== undefined) {
        data[key] = updateData[key];
      }
    }

    const company = await prisma.company.update({
      where: { id },
      data,
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
 * Update company office location (for attendance check-in)
 * PATCH /api/companies/:id/office-location
 */
export const updateCompanyOfficeLocation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { latitude, longitude, radius } = req.body;

    if (latitude === undefined || longitude === undefined) {
      res.status(400).json({
        success: false,
        message: 'latitude and longitude are required',
      });
      return;
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      res.status(400).json({
        success: false,
        message: 'Invalid latitude or longitude',
      });
      return;
    }

    const updateData: { officeLatitude: number; officeLongitude: number; attendanceRadius?: number } = {
      officeLatitude: lat,
      officeLongitude: lng,
    };
    if (radius !== undefined && radius !== null && radius !== '') {
      const r = parseInt(String(radius), 10);
      if (!isNaN(r) && r > 0) updateData.attendanceRadius = r;
    }

    await prisma.company.update({
      where: { id },
      data: updateData,
    });

    res.json({
      success: true,
      message: 'Office location updated successfully',
      data: {
        latitude: updateData.officeLatitude as number,
        longitude: updateData.officeLongitude as number,
        radius: updateData.attendanceRadius ?? 200,
      },
    });
  } catch (error) {
    console.error('Update office location error:', error);
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
 * Cascades: Deletes all employees associated with the company, then deletes the company
 * (Departments are automatically deleted via onDelete: Cascade in schema)
 */
export const deleteCompany = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    // First, get the company to find its name
    const company = await prisma.company.findUnique({
      where: { id },
      select: { id: true, name: true },
    });

    if (!company) {
      res.status(404).json({ success: false, message: 'Company not found' });
      return;
    }

    console.log(`🗑️  Deleting company: ${company.name} (ID: ${id})`);

    // Find all employees (users) associated with this company
    // Employees are linked via the 'company' string field (company name)
    const employeesToDelete = await prisma.user.findMany({
      where: {
        company: company.name, // Match by company name
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
      },
    });

    console.log(`   Found ${employeesToDelete.length} employee(s) to delete`);

    // Delete all employees associated with this company
    if (employeesToDelete.length > 0) {
      const employeeIds = employeesToDelete.map(emp => emp.id);
      
      // Delete employees (this will cascade delete their assignments, tasks, etc. via Prisma relations)
      const deleteResult = await prisma.user.deleteMany({
        where: {
          id: { in: employeeIds },
        },
      });

      console.log(`   ✅ Deleted ${deleteResult.count} employee(s)`);
      employeesToDelete.forEach(emp => {
        console.log(`      - ${emp.firstName} ${emp.lastName} (${emp.email})`);
      });
    }

    // Now delete the company
    // This will automatically cascade delete departments (via onDelete: Cascade in schema)
    await prisma.company.delete({
      where: { id },
    });

    console.log(`✅ Company deleted: ${company.name} (ID: ${id})`);

    res.json({
      success: true,
      message: `Company deleted successfully. ${employeesToDelete.length} employee(s) were also deleted.`,
      deletedEmployees: employeesToDelete.length,
    });
  } catch (error) {
    console.error('❌ Delete company error:', error);
    if (error instanceof Error && error.message.includes('Record to delete does not exist')) {
      res.status(404).json({ success: false, message: 'Company not found' });
    } else {
      res.status(500).json({ 
        success: false, 
        message: 'Internal server error',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
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

