import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { requirePermission, ResourceType, PermissionAction } from '../middleware/permissions.middleware';
import { requireAbility } from '../middleware/abilities.middleware';
import { uploadCompanyAssets, uploadCompanyAttachmentFile, uploadCompanyLetterhead, uploadCompanyPayslipTemplate } from '../middleware/upload.middleware';
import * as companiesController from '../controllers/companies.controller';
import * as companyAttachmentsController from '../controllers/companyAttachments.controller';
import * as departmentsController from '../controllers/departments.controller';
import { AbilityKeys } from '../utils/roleAbilities';

const router = Router();

// All routes require authentication
router.use(authenticate);

const adminOnly = requireRole('ADMIN');
const adminOrHr = requireRole('ADMIN', 'HR');

// Company routes
router.get('/stats', requireAbility(AbilityKeys.COMPANY_READ), companiesController.getCompanyStats);
router.get('/', requireAbility(AbilityKeys.COMPANY_READ), companiesController.getAllCompanies);
router.post('/', requireAbility(AbilityKeys.COMPANY_CREATE), uploadCompanyAssets, companiesController.createCompany);

// Company-specific department routes (MUST come before /:id to avoid route conflicts)
// Employees can only VIEW departments (GET requests are allowed)
router.get('/:companyId/departments', requireAbility(AbilityKeys.COMPANY_OPEN), departmentsController.getCompanyDepartments);
// Employees CANNOT create departments
router.post('/:companyId/departments', requirePermission(ResourceType.DEPARTMENT, PermissionAction.CREATE), departmentsController.createCompanyDepartment);

// Company compliance / legal attachments (per company, multiple per category)
router.get('/:id/attachments', requireAbility(AbilityKeys.COMPANY_OPEN), companyAttachmentsController.listCompanyAttachments);
router.post(
  '/:id/attachments',
  requireAbility(AbilityKeys.COMPANY_ATTACHMENTS_MANAGE),
  uploadCompanyAttachmentFile,
  companyAttachmentsController.createCompanyAttachment
);
router.patch(
  '/:id/attachments/:attachmentId',
  requireAbility(AbilityKeys.COMPANY_ATTACHMENTS_MANAGE),
  companyAttachmentsController.updateCompanyAttachment
);
router.delete(
  '/:id/attachments/:attachmentId',
  requireAbility(AbilityKeys.COMPANY_ATTACHMENTS_MANAGE),
  companyAttachmentsController.deleteCompanyAttachment
);

// Company CRUD routes (must come after specific routes)
router.get('/:id/branding', companiesController.getCompanyBranding);
router.get('/:id', requireAbility(AbilityKeys.COMPANY_OPEN), companiesController.getCompanyById);
router.post(
  '/:id/letterhead',
  requireAbility(AbilityKeys.COMPANY_UPDATE),
  uploadCompanyLetterhead,
  companiesController.uploadCompanyLetterheadAsset
);
router.post(
  '/:id/payslip-template',
  requireAbility(AbilityKeys.COMPANY_UPDATE),
  uploadCompanyPayslipTemplate,
  companiesController.uploadCompanyPayslipTemplateAsset
);
router.put('/:id', requireAbility(AbilityKeys.COMPANY_UPDATE), uploadCompanyAssets, companiesController.updateCompany);
router.patch('/:id/office-location', requireAbility(AbilityKeys.COMPANY_UPDATE), companiesController.updateCompanyOfficeLocation);
router.delete('/:id', requireAbility(AbilityKeys.COMPANY_DELETE), companiesController.deleteCompany);

export default router;

