import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { uploadCompanyAssets } from '../middleware/upload.middleware';
import * as companiesController from '../controllers/companies.controller';
import * as departmentsController from '../controllers/departments.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Company routes
router.get('/stats', companiesController.getCompanyStats);
router.get('/', companiesController.getAllCompanies);
router.post('/', uploadCompanyAssets, companiesController.createCompany);

// Company-specific department routes (MUST come before /:id to avoid route conflicts)
router.get('/:companyId/departments', departmentsController.getCompanyDepartments);
router.post('/:companyId/departments', departmentsController.createCompanyDepartment);

// Company CRUD routes (must come after specific routes)
router.get('/:id', companiesController.getCompanyById);
router.put('/:id', uploadCompanyAssets, companiesController.updateCompany);
router.delete('/:id', companiesController.deleteCompany);

export default router;

