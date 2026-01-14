import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import * as companiesController from '../controllers/companies.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Company routes
router.get('/stats', companiesController.getCompanyStats);
router.get('/', companiesController.getAllCompanies);
router.get('/:id', companiesController.getCompanyById);
router.post('/', companiesController.createCompany);
router.put('/:id', companiesController.updateCompany);
router.delete('/:id', companiesController.deleteCompany);

export default router;

