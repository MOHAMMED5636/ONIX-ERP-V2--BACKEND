import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { upload } from '../middleware/upload.middleware';
import { excelUpload } from '../middleware/excelUpload.middleware';
import * as clientsController from '../controllers/clients.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Client routes
// Get all clients with filters
router.get('/', clientsController.getAllClients);

// Get client statistics
router.get('/stats', clientsController.getClientStats);

// Client Import/Export (Excel) - schema/template/import/export
router.get('/import/schema', requireRole('ADMIN', 'HR'), clientsController.getClientImportSchema);
router.get('/import/template', requireRole('ADMIN', 'HR'), clientsController.downloadClientTemplate);
router.post('/import', requireRole('ADMIN', 'HR'), excelUpload.single('file'), clientsController.importClientsExcel);
router.get('/export', requireRole('ADMIN', 'HR'), clientsController.exportClientsExcel);

// Get a single client by ID
router.get('/:id', clientsController.getClientById);

// Create a new client (with single or multiple document uploads)
router.post(
  '/',
  requireRole('ADMIN', 'HR'),
  upload.fields([
    { name: 'document', maxCount: 1 },
    { name: 'documents', maxCount: 19 },
    { name: 'representativePowerOfAttorney', maxCount: 1 },
    { name: 'undertakingLetter', maxCount: 1 },
  ]),
  clientsController.createClient
);

// Update a client (with single or multiple document uploads)
router.put(
  '/:id',
  requireRole('ADMIN', 'HR'),
  upload.fields([
    { name: 'document', maxCount: 1 },
    { name: 'documents', maxCount: 19 },
    { name: 'representativePowerOfAttorney', maxCount: 1 },
    { name: 'undertakingLetter', maxCount: 1 },
  ]),
  clientsController.updateClient
);

// Delete all clients (admin only) - must be before /:id route
router.delete('/all', requireRole('ADMIN'), clientsController.deleteAllClients);

// Delete a client
router.delete('/:id', requireRole('ADMIN', 'HR'), clientsController.deleteClient);

export default router;

