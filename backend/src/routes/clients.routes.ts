import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { requireRole } from '../middleware/role.middleware';
import { upload } from '../middleware/upload.middleware';
import * as clientsController from '../controllers/clients.controller';

const router = Router();

// All routes require authentication
router.use(authenticate);

// Client routes
// Get all clients with filters
router.get('/', clientsController.getAllClients);

// Get client statistics
router.get('/stats', clientsController.getClientStats);

// Get a single client by ID
router.get('/:id', clientsController.getClientById);

// Create a new client (with document upload)
router.post('/', requireRole('ADMIN', 'HR'), upload.single('document'), clientsController.createClient);

// Update a client (with optional document upload)
router.put('/:id', requireRole('ADMIN', 'HR'), upload.single('document'), clientsController.updateClient);

// Delete all clients (admin only) - must be before /:id route
router.delete('/all', requireRole('ADMIN'), clientsController.deleteAllClients);

// Delete a client
router.delete('/:id', requireRole('ADMIN', 'HR'), clientsController.deleteClient);

export default router;

