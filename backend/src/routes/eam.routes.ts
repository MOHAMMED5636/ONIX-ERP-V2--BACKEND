import { Router } from 'express';
import { authenticate, optionalAuthenticate } from '../middleware/auth.middleware';
import { requireAbility } from '../middleware/abilities.middleware';
import { AbilityKeys } from '../utils/roleAbilities';
import * as eam from '../controllers/eam.controller';
import * as assetRequest from '../controllers/assetRequest.controller';

const router = Router();

// Public QR scan (optional auth — shows public message if not logged in)
router.get('/scan/:qrToken', optionalAuthenticate, eam.scanQrToken);

router.use(authenticate);

// Categories — read list is available to any authenticated user (needed for asset requests)
router.get('/categories', eam.getCategories);
router.post('/categories', requireAbility(AbilityKeys.EAM_MANAGE), eam.saveCategory);
router.put('/categories/:id', requireAbility(AbilityKeys.EAM_MANAGE), eam.saveCategory);

// Assets
router.get('/assets', requireAbility(AbilityKeys.EAM_VIEW), eam.getAssets);
router.get('/assets/my', eam.getMyAssets);
router.get('/assets/qr-pending', requireAbility(AbilityKeys.EAM_MANAGE), eam.getQrPending);
router.post('/assets/register', requireAbility(AbilityKeys.EAM_WAREHOUSE), eam.registerAssetHandler);
router.post('/assets/qr-labels/pdf', requireAbility(AbilityKeys.EAM_MANAGE), eam.printQrLabelsPdf);
router.get('/assets/:id', requireAbility(AbilityKeys.EAM_VIEW), eam.getAsset);
router.get('/assets/:id/logs', requireAbility(AbilityKeys.EAM_VIEW), eam.getAssetLogsHandler);
router.post('/assets/:id/assign', requireAbility(AbilityKeys.EAM_CUSTODY), eam.assignAssetHandler);
router.post('/assets/:id/transfer', requireAbility(AbilityKeys.EAM_CUSTODY), eam.transferAssetHandler);
router.post('/assets/:id/return-stock', requireAbility(AbilityKeys.EAM_CUSTODY), eam.returnToStockHandler);
router.post('/assets/:id/send-repair', requireAbility(AbilityKeys.EAM_CUSTODY), eam.sendToRepairHandler);
router.post('/assets/:id/scrap', requireAbility(AbilityKeys.EAM_MANAGE), eam.scrapAssetHandler);
router.patch('/assets/:id/serial', requireAbility(AbilityKeys.EAM_MANAGE), eam.patchSerialHandler);

// Maintenance
router.get('/maintenance/tickets', requireAbility(AbilityKeys.EAM_VIEW), eam.listTickets);
router.post('/maintenance/tickets', eam.createTicket);
router.post('/maintenance/tickets/:id/assign-tech', requireAbility(AbilityKeys.EAM_CUSTODY), eam.assignTechHandler);
router.post('/maintenance/tickets/:id/start-repair', requireAbility(AbilityKeys.EAM_CUSTODY), eam.startRepairHandler);
router.post('/maintenance/tickets/:id/complete', requireAbility(AbilityKeys.EAM_CUSTODY), eam.completeRepairHandler);
router.post('/maintenance/tickets/:id/close', requireAbility(AbilityKeys.EAM_CUSTODY), eam.closeTicketHandler);

// Procurement
router.get('/procurement/orders', requireAbility(AbilityKeys.EAM_VIEW), eam.getPurchaseOrders);
router.post('/procurement/orders', requireAbility(AbilityKeys.EAM_MANAGE), eam.postPurchaseOrder);
router.post('/procurement/orders/:id/approve', requireAbility(AbilityKeys.EAM_MANAGE), eam.approvePoHandler);
router.post('/procurement/grn/confirm', requireAbility(AbilityKeys.EAM_WAREHOUSE), eam.confirmGrnHandler);
router.get('/procurement/requisitions', requireAbility(AbilityKeys.EAM_VIEW), eam.getRequisitions);

// Reports & HR custody
router.get('/reports/finance', requireAbility(AbilityKeys.EAM_VIEW), eam.getFinanceReport);
router.get('/custody/:userId', requireAbility(AbilityKeys.EAM_VIEW), eam.getCustodyCount);

// Asset requests workflow — sub-paths must be registered before /requests/:id
router.get('/requests/approver-context', assetRequest.getApproverContext);
router.get('/requests', assetRequest.listRequests);
router.post('/requests', assetRequest.createRequest);
router.get('/requests/:id/available-assets', assetRequest.listRequestAvailableAssets);
router.post('/requests/:id/register-stock', assetRequest.registerRequestStock);
router.post('/requests/:id/submit', assetRequest.submitRequest);
router.post('/requests/:id/approve', assetRequest.approveRequest);
router.post('/requests/:id/assign', assetRequest.assignRequestAsset);
router.get('/requests/:id/custody-pdf', assetRequest.downloadCustodyPdf);
router.get('/requests/:id', assetRequest.getRequest);
router.put('/requests/:id', assetRequest.updateRequest);
router.post('/returns', requireAbility(AbilityKeys.EAM_CUSTODY), assetRequest.returnAsset);
router.get('/clearance/:userId', assetRequest.getClearance);

export default router;
