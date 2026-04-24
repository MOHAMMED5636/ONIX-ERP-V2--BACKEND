import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { requirePermission, ResourceType, PermissionAction } from '../middleware/permissions.middleware';
import { uploadCompanyAssets } from '../middleware/upload.middleware';
import * as companiesController from '../controllers/companies.controller';
import * as departmentsController from '../controllers/departments.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

/** Company list / CRUD / stats: ADMIN & HR only (not PROJECT_MANAGER, EMPLOYEE, etc.) */
const adminOrHr = requireRole('ADMIN', 'HR');

// Company routes
router.get('/stats', adminOrHr, companiesController.getCompanyStats);
router.get('/', adminOrHr, companiesController.getAllCompanies);
router.post('/', adminOrHr, uploadCompanyAssets, companiesController.createCompany);

// Company-specific department routes (MUST come before /:id to avoid route conflicts)
// Employees can only VIEW departments (GET requests are allowed)
router.get('/:companyId/departments', departmentsController.getCompanyDepartments);
// Employees CANNOT create departments
router.post('/:companyId/departments', requirePermission(ResourceType.DEPARTMENT, PermissionAction.CREATE), departmentsController.createCompanyDepartment);

// Company CRUD routes (must come after specific routes)
router.get('/:id', adminOrHr, companiesController.getCompanyById);
router.put('/:id', adminOrHr, uploadCompanyAssets, companiesController.updateCompany);
router.patch('/:id/office-location', adminOrHr, companiesController.updateCompanyOfficeLocation);
router.delete('/:id', adminOrHr, companiesController.deleteCompany);

export default router;

