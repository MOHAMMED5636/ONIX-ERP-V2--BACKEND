import { Request, Response } from 'express';
import prisma from '../config/database';
import { generateInvitationToken } from '../utils/token';
import { sendTenderInvitationEmail } from '../services/email.service';
import { AuthRequest } from '../middleware/auth.middleware';

export const assignTenderToEngineer = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { tenderId, engineerId } = req.body;
    
    // Generate secure invitation token
    const invitationToken = generateInvitationToken(tenderId, engineerId);
    const invitationLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/tender/invitation/${invitationToken}`;
    
    // Get tender and engineer details
    const tender = await prisma.tender.findUnique({ where: { id: tenderId } });
    const engineer = await prisma.user.findUnique({ where: { id: engineerId } });
    
    if (!tender || !engineer) {
      res.status(404).json({ success: false, message: 'Tender or Engineer not found' });
      return;
    }
    
    // Create invitation record
    const invitation = await prisma.tenderInvitation.create({
      data: {
        tenderId,
        engineerId,
        invitationToken,
        status: 'PENDING',
      },
    });
    
    // Send invitation email
    try {
      await sendTenderInvitationEmail(
        engineer.email,
        `${engineer.firstName} ${engineer.lastName}`,
        tender,
        invitationLink,
        tender.attachmentFile || undefined
      );
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      // Continue even if email fails
    }
    
    res.json({
      success: true,
      data: {
        invitation,
        invitationLink,
      },
    });
  } catch (error) {
    console.error('Assign tender error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const getInvitationByToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    
    const invitation = await prisma.tenderInvitation.findUnique({
      where: { invitationToken: token },
      include: {
        tender: {
          include: {
            project: true,
            client: true,
          },
        },
        engineer: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });
    
    if (!invitation) {
      res.status(404).json({ success: false, message: 'Invitation not found' });
      return;
    }
    
    res.json({ success: true, data: invitation });
  } catch (error) {
    console.error('Get invitation error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

export const acceptInvitation = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { token } = req.params;
    
    // Find invitation by token
    const invitation = await prisma.tenderInvitation.findUnique({
      where: { invitationToken: token },
      include: { tender: true, engineer: true },
    });
    
    if (!invitation) {
      res.status(404).json({ success: false, message: 'Invitation not found' });
      return;
    }
    
    if (invitation.status !== 'PENDING') {
      res.status(400).json({ success: false, message: 'Invitation already processed' });
      return;
    }
    
    // Verify engineer matches logged-in user
    if (invitation.engineerId !== req.user!.id) {
      res.status(403).json({ success: false, message: 'Unauthorized' });
      return;
    }
    
    // Update invitation status
    await prisma.tenderInvitation.update({
      where: { id: invitation.id },
      data: {
        status: 'ACCEPTED',
        acceptedAt: new Date(),
      },
    });
    
    res.json({ success: true, message: 'Invitation accepted' });
  } catch (error) {
    console.error('Accept invitation error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

