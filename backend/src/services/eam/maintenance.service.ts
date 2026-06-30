import prisma from '../../config/database';
import { sendAssetToRepair, completeRepairReturn } from './asset.service';

const ticketInclude = {
  asset: { include: { category: true, assignedTo: { select: { id: true, firstName: true, lastName: true } } } },
  reporter: { select: { id: true, firstName: true, lastName: true, email: true } },
  technician: { select: { id: true, firstName: true, lastName: true, email: true } },
} as const;

export async function createMaintenanceTicket(input: {
  assetId: string;
  reporterId: string;
  issueType: string;
  priority?: string;
  notes?: string;
}) {
  const asset = await prisma.asset.findUnique({ where: { id: input.assetId } });
  if (!asset || asset.status === 'DISPOSED') throw new Error('ASSET_NOT_FOUND');

  return prisma.maintenanceTicket.create({
    data: {
      assetId: input.assetId,
      reporterId: input.reporterId,
      issueType: input.issueType as any,
      priority: (input.priority || 'MEDIUM') as any,
      status: 'OPEN',
      notes: input.notes?.trim() || null,
    },
    include: ticketInclude,
  });
}

export async function assignTechnician(ticketId: string, technicianId: string) {
  return prisma.maintenanceTicket.update({
    where: { id: ticketId },
    data: { technicianId, status: 'ASSIGNED_TO_TECH' },
    include: ticketInclude,
  });
}

export async function startRepair(ticketId: string, technicianId: string) {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.maintenanceTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) throw new Error('TICKET_NOT_FOUND');
    if (!['OPEN', 'ASSIGNED_TO_TECH'].includes(ticket.status)) throw new Error('INVALID_TICKET_STATUS');

    await sendAssetToRepair(
      {
        assetId: ticket.assetId,
        performedById: technicianId,
        ticketId,
        notes: `Maintenance ticket ${ticketId} started`,
      },
      tx,
    );

    return tx.maintenanceTicket.update({
      where: { id: ticketId },
      data: { status: 'IN_REPAIR', technicianId },
      include: ticketInclude,
    });
  });
}

export async function completeRepair(input: {
  ticketId: string;
  technicianId: string;
  destination: 'EMPLOYEE' | 'WAREHOUSE';
  repairCost?: number;
  resolution?: string;
}) {
  return prisma.$transaction(async (tx) => {
    const ticket = await tx.maintenanceTicket.findUnique({ where: { id: input.ticketId } });
    if (!ticket || ticket.status !== 'IN_REPAIR') throw new Error('INVALID_TICKET_STATUS');

    await completeRepairReturn(
      {
        assetId: ticket.assetId,
        performedById: input.technicianId,
        destination: input.destination,
        employeeId: input.destination === 'EMPLOYEE' ? ticket.reporterId : undefined,
        notes: input.resolution,
      },
      tx,
    );

    return tx.maintenanceTicket.update({
      where: { id: input.ticketId },
      data: {
        status: 'RESOLVED',
        repairCost: input.repairCost ?? null,
        resolution: input.resolution?.trim() || null,
        closedAt: new Date(),
      },
      include: ticketInclude,
    });
  });
}

export async function closeTicket(ticketId: string) {
  return prisma.maintenanceTicket.update({
    where: { id: ticketId },
    data: { status: 'CLOSED', closedAt: new Date() },
    include: ticketInclude,
  });
}

export async function listMaintenanceTickets(filters: {
  status?: string;
  technicianId?: string;
  reporterId?: string;
  assetId?: string;
}) {
  const where: any = {};
  if (filters.status) where.status = filters.status;
  if (filters.technicianId) where.technicianId = filters.technicianId;
  if (filters.reporterId) where.reporterId = filters.reporterId;
  if (filters.assetId) where.assetId = filters.assetId;

  return prisma.maintenanceTicket.findMany({
    where,
    include: ticketInclude,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}
