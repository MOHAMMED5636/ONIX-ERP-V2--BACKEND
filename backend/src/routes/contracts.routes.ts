import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { upload } from '../middleware/upload.middleware';
import * as contractsController from '../controllers/contracts.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Contract routes
// Get all contracts with filters
router.get('/', contractsController.getAllContracts);

// Get contract statistics
router.get('/stats', contractsController.getContractStats);

// Get contract by reference number (must come before /:id to avoid route conflicts)
router.get('/by-reference', contractsController.getContractByReferenceNumber);

// Get a single contract by ID
router.get('/:id', contractsController.getContractById);

// Create a new contract (with document upload and multiple attachments)
router.post('/', requireRole('ADMIN', 'HR', 'PROJECT_MANAGER'), upload.fields([
  { name: 'contractDocument', maxCount: 1 },
  { name: 'attachment_0', maxCount: 1 },
  { name: 'attachment_1', maxCount: 1 },
  { name: 'attachment_2', maxCount: 1 },
  { name: 'attachment_3', maxCount: 1 },
  { name: 'attachment_4', maxCount: 1 },
  { name: 'attachment_5', maxCount: 1 },
  { name: 'attachment_6', maxCount: 1 },
  { name: 'attachment_7', maxCount: 1 },
  { name: 'attachment_8', maxCount: 1 },
  { name: 'attachment_9', maxCount: 1 },
]), contractsController.createContract);

// Update a contract (with optional document upload)
router.put('/:id', requireRole('ADMIN', 'HR', 'PROJECT_MANAGER'), upload.single('contractDocument'), contractsController.updateContract);

// Approve a contract
router.post('/:id/approve', requireRole('ADMIN', 'HR'), contractsController.approveContract);

// Delete a contract
router.delete('/:id', requireRole('ADMIN', 'HR'), contractsController.deleteContract);

export default router;
