import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth.middleware';
import { QuestionnaireAnswer } from '@prisma/client';

// ============================================
// QUESTIONNAIRE TEMPLATES
// ============================================

// Get all templates (for managers)
export const getQuestionnaireTemplates = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const templates = await prisma.questionnaireTemplate.findMany({
      where: {
        isActive: true,
      },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: templates,
    });
  } catch (error) {
    console.error('Get questionnaire templates error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Get single template
export const getQuestionnaireTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { templateId } = req.params;

    const template = await prisma.questionnaireTemplate.findUnique({
      where: { id: templateId },
      include: {
        questions: {
          orderBy: { order: 'asc' },
          include: {
            responses: {
              include: {
                employee: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true,
                  },
                },
              },
            },
          },
        },
        creator: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!template) {
      res.status(404).json({ success: false, message: 'Template not found' });
      return;
    }

    res.json({
      success: true,
      data: template,
    });
  } catch (error) {
    console.error('Get questionnaire template error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Create template (Managers only)
export const createQuestionnaireTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    // Check if user is manager/admin/hr
    const userRole = req.user?.role;
    if (!['ADMIN', 'PROJECT_MANAGER', 'HR'].includes(userRole || '')) {
      res.status(403).json({
        success: false,
        message: 'Access denied. Only managers can create templates.',
      });
      return;
    }

    const { name, description, questions } = req.body;

    if (!name) {
      res.status(400).json({
        success: false,
        message: 'Template name is required',
      });
      return;
    }

    const template = await prisma.questionnaireTemplate.create({
      data: {
        name,
        description: description || null,
        createdBy: req.user?.id || null,
        questions: questions && questions.length > 0 ? {
          create: questions.map((q: any, index: number) => ({
            questionText: q.questionText,
            description: q.description || null,
            order: q.order !== undefined ? q.order : index,
            isRequired: q.isRequired !== undefined ? q.isRequired : true,
          })),
        } : undefined,
      },
      include: {
        questions: {
          orderBy: { order: 'asc' },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: 'Template created successfully',
      data: template,
    });
  } catch (error) {
    console.error('Create questionnaire template error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Update template (Managers only)
export const updateQuestionnaireTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userRole = req.user?.role;
    if (!['ADMIN', 'PROJECT_MANAGER', 'HR'].includes(userRole || '')) {
      res.status(403).json({
        success: false,
        message: 'Access denied. Only managers can update templates.',
      });
      return;
    }

    const { templateId } = req.params;
    const { name, description, isActive, isLocked } = req.body;

    const template = await prisma.questionnaireTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      res.status(404).json({ success: false, message: 'Template not found' });
      return;
    }

    if (template.isLocked && isLocked === false) {
      // Only allow unlocking if user has permission
      if (userRole !== 'ADMIN') {
        res.status(403).json({
          success: false,
          message: 'Only admins can unlock templates.',
        });
        return;
      }
    }

    const updated = await prisma.questionnaireTemplate.update({
      where: { id: templateId },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(isActive !== undefined && { isActive }),
        ...(isLocked !== undefined && { isLocked }),
      },
    });

    res.json({
      success: true,
      message: 'Template updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Update questionnaire template error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Delete template (Managers only)
export const deleteQuestionnaireTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userRole = req.user?.role;
    if (!['ADMIN', 'PROJECT_MANAGER', 'HR'].includes(userRole || '')) {
      res.status(403).json({
        success: false,
        message: 'Access denied. Only managers can delete templates.',
      });
      return;
    }

    const { templateId } = req.params;

    const template = await prisma.questionnaireTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      res.status(404).json({ success: false, message: 'Template not found' });
      return;
    }

    if (template.isLocked) {
      res.status(403).json({
        success: false,
        message: 'Cannot delete locked template. Unlock it first.',
      });
      return;
    }

    await prisma.questionnaireTemplate.delete({
      where: { id: templateId },
    });

    res.json({
      success: true,
      message: 'Template deleted successfully',
    });
  } catch (error) {
    console.error('Delete questionnaire template error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ============================================
// QUESTIONNAIRE QUESTIONS
// ============================================

// Get questions for a project/task
export const getQuestions = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId, taskId, subtaskId } = req.query;

    const where: any = {};
    if (projectId) where.projectId = projectId as string;
    if (taskId) where.taskId = taskId as string;
    if (subtaskId) where.subtaskId = String(subtaskId); // Convert to string

    const questions = await prisma.questionnaireQuestion.findMany({
      where,
      include: {
        responses: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
              },
            },
          },
          orderBy: { answeredAt: 'desc' },
        },
      },
      orderBy: { order: 'asc' },
    });

    res.json({
      success: true,
      data: questions,
    });
  } catch (error) {
    console.error('Get questions error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Create question (Managers only)
export const createQuestion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    console.log('📝 Creating questionnaire question...');
    console.log('📝 Request body:', JSON.stringify(req.body, null, 2));
    console.log('📝 User:', { id: req.user?.id, role: req.user?.role });
    
    const userRole = req.user?.role;
    if (!['ADMIN', 'PROJECT_MANAGER', 'HR'].includes(userRole || '')) {
      res.status(403).json({
        success: false,
        message: 'Access denied. Only managers can create questions.',
      });
      return;
    }

    const { questionText, description, order, isRequired, projectId, taskId, subtaskId, templateId } = req.body;
    
    // Convert subtaskId to string if it's a number (frontend sends numeric IDs)
    const subtaskIdString = subtaskId ? String(subtaskId) : null;
    
    console.log('📝 Parsed data:', {
      questionText,
      description,
      order,
      isRequired,
      projectId,
      taskId,
      subtaskId: subtaskIdString,
      templateId,
    });

    if (!questionText) {
      res.status(400).json({
        success: false,
        message: 'Question text is required',
      });
      return;
    }

    // Validate that at least one target is provided
    if (!projectId && !taskId && !subtaskIdString && !templateId) {
      res.status(400).json({
        success: false,
        message: 'Either projectId, taskId, subtaskId, or templateId must be provided',
      });
      return;
    }

    console.log('📝 Attempting to create question in database...');
    
    const question = await prisma.questionnaireQuestion.create({
      data: {
        questionText,
        description: description || null,
        order: order || 0,
        isRequired: isRequired !== undefined ? isRequired : true,
        projectId: projectId || null,
        taskId: taskId || null,
        subtaskId: subtaskIdString || null,
        templateId: templateId || null,
        createdBy: req.user?.id || null,
      },
    });

    console.log('✅ Question created successfully:', question.id);

    res.status(201).json({
      success: true,
      message: 'Question created successfully',
      data: question,
    });
  } catch (error: any) {
    console.error('❌ Create question error:', error);
    console.error('❌ Error details:', {
      message: error?.message,
      code: error?.code,
      meta: error?.meta,
      stack: error?.stack,
      name: error?.name,
    });
    console.error('❌ Request body:', req.body);
    console.error('❌ User:', req.user?.id, req.user?.role);
    
    // Handle Prisma errors specifically
    if (error?.code === 'P2003') {
      res.status(400).json({
        success: false,
        message: 'Invalid foreign key reference. Check if projectId, taskId, or subtaskId exists.',
        error: error?.meta?.field_name,
      });
      return;
    }
    
    if (error?.code === 'P2002') {
      res.status(400).json({
        success: false,
        message: 'A question with these details already exists.',
        error: error?.meta?.target,
      });
      return;
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error?.message : undefined,
      errorCode: error?.code,
    });
  }
};

// Update question (Managers only)
export const updateQuestion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userRole = req.user?.role;
    if (!['ADMIN', 'PROJECT_MANAGER', 'HR'].includes(userRole || '')) {
      res.status(403).json({
        success: false,
        message: 'Access denied. Only managers can update questions.',
      });
      return;
    }

    const { questionId } = req.params;
    const { questionText, description, order, isRequired, isLocked } = req.body;

    const question = await prisma.questionnaireQuestion.findUnique({
      where: { id: questionId },
    });

    if (!question) {
      res.status(404).json({ success: false, message: 'Question not found' });
      return;
    }

    if (question.isLocked && isLocked === false && userRole !== 'ADMIN') {
      res.status(403).json({
        success: false,
        message: 'Only admins can unlock questions.',
      });
      return;
    }

    const updated = await prisma.questionnaireQuestion.update({
      where: { id: questionId },
      data: {
        ...(questionText !== undefined && { questionText }),
        ...(description !== undefined && { description }),
        ...(order !== undefined && { order }),
        ...(isRequired !== undefined && { isRequired }),
        ...(isLocked !== undefined && { isLocked }),
      },
    });

    res.json({
      success: true,
      message: 'Question updated successfully',
      data: updated,
    });
  } catch (error) {
    console.error('Update question error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Delete question (Managers only)
export const deleteQuestion = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userRole = req.user?.role;
    if (!['ADMIN', 'PROJECT_MANAGER', 'HR'].includes(userRole || '')) {
      res.status(403).json({
        success: false,
        message: 'Access denied. Only managers can delete questions.',
      });
      return;
    }

    const { questionId } = req.params;

    const question = await prisma.questionnaireQuestion.findUnique({
      where: { id: questionId },
    });

    if (!question) {
      res.status(404).json({ success: false, message: 'Question not found' });
      return;
    }

    if (question.isLocked) {
      res.status(403).json({
        success: false,
        message: 'Cannot delete locked question. Unlock it first.',
      });
      return;
    }

    await prisma.questionnaireQuestion.delete({
      where: { id: questionId },
    });

    res.json({
      success: true,
      message: 'Question deleted successfully',
    });
  } catch (error) {
    console.error('Delete question error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ============================================
// QUESTIONNAIRE RESPONSES
// ============================================

// Submit response (Employees can answer)
export const submitResponse = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { questionId } = req.params;
    const { answer, remarks } = req.body;

    if (!answer) {
      res.status(400).json({
        success: false,
        message: 'Answer is required',
      });
      return;
    }

    // Validate answer enum
    const validAnswers = ['ACTION_PLAN_APPLIED', 'NOT_AVAILABLE', 'NOT_APPLIED', 'PENDING'];
    if (!validAnswers.includes(answer)) {
      res.status(400).json({
        success: false,
        message: 'Invalid answer. Must be one of: ACTION_PLAN_APPLIED, NOT_AVAILABLE, NOT_APPLIED, PENDING',
      });
      return;
    }

    const question = await prisma.questionnaireQuestion.findUnique({
      where: { id: questionId },
    });

    if (!question) {
      res.status(404).json({ success: false, message: 'Question not found' });
      return;
    }

    if (question.isLocked) {
      res.status(403).json({
        success: false,
        message: 'This question is locked and cannot be answered.',
      });
      return;
    }

    // Check if response already exists
    const existingResponse = await prisma.questionnaireResponse.findUnique({
      where: {
        questionId_answeredBy: {
          questionId,
          answeredBy: req.user!.id,
        },
      },
    });

    let response;
    if (existingResponse) {
      if (existingResponse.isLocked) {
        res.status(403).json({
          success: false,
          message: 'This response is locked and cannot be modified.',
        });
        return;
      }

      // Update existing response
      response = await prisma.questionnaireResponse.update({
        where: { id: existingResponse.id },
        data: {
          answer: answer as QuestionnaireAnswer,
          remarks: remarks || null,
          answeredAt: new Date(),
        },
      });
    } else {
      // Create new response
      response = await prisma.questionnaireResponse.create({
        data: {
          questionId,
          answer: answer as QuestionnaireAnswer,
          remarks: remarks || null,
          answeredBy: req.user!.id,
          answeredAt: new Date(),
        },
      });
    }

    res.json({
      success: true,
      message: 'Response submitted successfully',
      data: response,
    });
  } catch (error: any) {
    console.error('Submit response error:', error);
    if (error.code === 'P2002') {
      res.status(400).json({
        success: false,
        message: 'You have already submitted a response to this question.',
      });
      return;
    }
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Get responses for a question (Managers can view all, Employees can view their own)
export const getResponses = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { questionId } = req.params;
    const userRole = req.user?.role;
    const userId = req.user?.id;

    const question = await prisma.questionnaireQuestion.findUnique({
      where: { id: questionId },
    });

    if (!question) {
      res.status(404).json({ success: false, message: 'Question not found' });
      return;
    }

    // Employees can only see their own responses, managers can see all
    const where: any = { questionId };
    if (!['ADMIN', 'PROJECT_MANAGER', 'HR'].includes(userRole || '')) {
      where.answeredBy = userId;
    }

    const responses = await prisma.questionnaireResponse.findMany({
      where,
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
        question: {
          select: {
            id: true,
            questionText: true,
          },
        },
      },
      orderBy: { answeredAt: 'desc' },
    });

    res.json({
      success: true,
      data: responses,
    });
  } catch (error) {
    console.error('Get responses error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Lock/Unlock response (Managers only)
export const lockResponse = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userRole = req.user?.role;
    if (!['ADMIN', 'PROJECT_MANAGER', 'HR'].includes(userRole || '')) {
      res.status(403).json({
        success: false,
        message: 'Access denied. Only managers can lock responses.',
      });
      return;
    }

    const { responseId } = req.params;
    const { isLocked } = req.body;

    const response = await prisma.questionnaireResponse.findUnique({
      where: { id: responseId },
    });

    if (!response) {
      res.status(404).json({ success: false, message: 'Response not found' });
      return;
    }

    const updated = await prisma.questionnaireResponse.update({
      where: { id: responseId },
      data: { isLocked: isLocked !== undefined ? isLocked : true },
    });

    res.json({
      success: true,
      message: `Response ${isLocked ? 'locked' : 'unlocked'} successfully`,
      data: updated,
    });
  } catch (error) {
    console.error('Lock response error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// ============================================
// QUESTIONNAIRE ASSIGNMENTS
// ============================================

// Assign template to project/task (Managers only)
export const assignTemplate = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userRole = req.user?.role;
    if (!['ADMIN', 'PROJECT_MANAGER', 'HR'].includes(userRole || '')) {
      res.status(403).json({
        success: false,
        message: 'Access denied. Only managers can assign templates.',
      });
      return;
    }

    const { templateId } = req.params;
    const { projectId, taskId, subtaskId } = req.body;

    // Convert subtaskId to string if it's a number
    const subtaskIdString = subtaskId ? String(subtaskId) : null;

    if (!projectId && !taskId && !subtaskIdString) {
      res.status(400).json({
        success: false,
        message: 'Either projectId, taskId, or subtaskId must be provided',
      });
      return;
    }

    const template = await prisma.questionnaireTemplate.findUnique({
      where: { id: templateId },
      include: { questions: true },
    });

    if (!template) {
      res.status(404).json({ success: false, message: 'Template not found' });
      return;
    }

    // Create assignment
    const assignment = await prisma.questionnaireAssignment.create({
      data: {
        templateId,
        projectId: projectId || null,
        taskId: taskId || null,
        subtaskId: subtaskIdString || null,
        assignedBy: req.user?.id || null,
      },
    });

      // Create questions from template for the assigned target
      if (template.questions.length > 0) {
        await prisma.questionnaireQuestion.createMany({
          data: template.questions.map((q: any) => ({
            questionText: q.questionText,
            description: q.description,
            order: q.order,
            isRequired: q.isRequired,
            projectId: projectId || null,
            taskId: taskId || null,
            subtaskId: subtaskIdString || null,
            createdBy: req.user?.id || null,
          })),
        });
      }

    res.status(201).json({
      success: true,
      message: 'Template assigned successfully',
      data: assignment,
    });
  } catch (error) {
    console.error('Assign template error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Get assignments
export const getAssignments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId, taskId, subtaskId } = req.query;

    const where: any = { isActive: true };
    if (projectId) where.projectId = projectId as string;
    if (taskId) where.taskId = taskId as string;
    if (subtaskId) where.subtaskId = String(subtaskId); // Convert to string

    const assignments = await prisma.questionnaireAssignment.findMany({
      where,
      include: {
        template: {
          include: {
            questions: {
              orderBy: { order: 'asc' },
            },
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });

    res.json({
      success: true,
      data: assignments,
    });
  } catch (error) {
    console.error('Get assignments error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

// Get questionnaire status (Pending/Completed) for a project/task
export const getQuestionnaireStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { projectId, taskId, subtaskId } = req.query;

    const where: any = {};
    if (projectId) where.projectId = projectId as string;
    if (taskId) where.taskId = taskId as string;
    if (subtaskId) where.subtaskId = String(subtaskId); // Convert to string

    const questions = await prisma.questionnaireQuestion.findMany({
      where,
      include: {
        responses: {
          include: {
            employee: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
      orderBy: { order: 'asc' },
    });

    // Calculate status
    const totalQuestions = questions.length;
    const answeredQuestions = questions.filter((q: any) => 
      q.responses.some((r: any) => r.answer !== 'PENDING')
    ).length;
    const completed = totalQuestions > 0 && answeredQuestions === totalQuestions;

    // Get all responses grouped by employee
    const employeeResponses: any = {};
    questions.forEach((q: any) => {
      q.responses.forEach((r: any) => {
        const empId = r.employee.id;
        if (!employeeResponses[empId]) {
          employeeResponses[empId] = {
            employee: r.employee,
            responses: [],
            answeredCount: 0,
            totalCount: totalQuestions,
          };
        }
        employeeResponses[empId].responses.push({
          questionId: q.id,
          questionText: q.questionText,
          answer: r.answer,
          remarks: r.remarks,
          answeredAt: r.answeredAt,
        });
        if (r.answer !== 'PENDING') {
          employeeResponses[empId].answeredCount++;
        }
      });
    });

    res.json({
      success: true,
      data: {
        status: completed ? 'COMPLETED' : 'PENDING',
        totalQuestions,
        answeredQuestions,
        completionPercentage: totalQuestions > 0 
          ? Math.round((answeredQuestions / totalQuestions) * 100) 
          : 0,
        employeeResponses: Object.values(employeeResponses),
        questions: questions.map((q: any) => ({
          id: q.id,
          questionText: q.questionText,
          isRequired: q.isRequired,
          isLocked: q.isLocked,
          responseCount: q.responses.length,
        })),
      },
    });
  } catch (error) {
    console.error('Get questionnaire status error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
