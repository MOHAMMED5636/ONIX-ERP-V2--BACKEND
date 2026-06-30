import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request } from 'express';

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads', 'photos');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, uploadsDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    // Generate unique filename: timestamp-random-originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    let name = path.basename(file.originalname, ext);
    
    // Sanitize filename: remove any path separators, special characters, and spaces
    // Replace slashes, backslashes, and other problematic characters with underscores
    name = name.replace(/[\/\\\?\*\|"<>:]/g, '_');
    // Replace spaces with underscores
    name = name.replace(/\s+/g, '_');
    // Remove any remaining special characters except dots, dashes, and underscores
    name = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    // Limit length to 50 characters
    if (name.length > 50) {
      name = name.substring(0, 50);
    }
    // If name is empty after sanitization, use a default
    if (!name || name.trim() === '') {
      name = 'photo';
    }
    
    const finalFilename = `${name}-${uniqueSuffix}${ext}`;
    console.log('📸 Generated filename:', finalFilename);
    cb(null, finalFilename);
  }
});

// File filter - only allow images
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  console.log('📸 File filter check:', {
    fieldname: file.fieldname,
    originalname: file.originalname,
    mimetype: file.mimetype,
    size: file.size
  });
  
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  
  if (allowedMimes.includes(file.mimetype)) {
    console.log('   ✅ File type allowed');
    cb(null, true);
  } else {
    console.log('   ❌ File type not allowed:', file.mimetype);
    cb(new Error(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, GIF, and WebP images are allowed.`));
  }
};

// Configure multer
export const uploadPhoto = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
  fileFilter: fileFilter,
});

// Helper function to get photo URL
export const getPhotoUrl = (filename: string | null | undefined): string | null => {
  if (!filename) return null;
  
  // If it's already a full URL, return as is
  if (filename.startsWith('http://') || filename.startsWith('https://')) {
    return filename;
  }
  
  // Otherwise, return relative path
  return `/uploads/photos/${filename}`;
};

// Documents upload configuration
const documentsDir = path.join(process.cwd(), 'uploads', 'documents');
if (!fs.existsSync(documentsDir)) {
  fs.mkdirSync(documentsDir, { recursive: true });
}const documentsStorage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, documentsDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});// File filter for documents - allow common document types
const documentsFileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'image/jpeg',
    'image/jpg',
    'image/png',
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, Word, Excel, text, and image files are allowed.'));
  }
};// Export documents upload middleware
export const upload = multer({
  storage: documentsStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size for documents
  },
  fileFilter: documentsFileFilter,
});

// Multiple document uploads for employee legal documents
export const uploadLegalDocuments = multer({
  storage: documentsStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
    files: 10, // Max 10 files
  },
  fileFilter: documentsFileFilter,
}).fields([
  { name: 'passportAttachment', maxCount: 1 },
  { name: 'nationalIdAttachment', maxCount: 1 },
  { name: 'residencyAttachment', maxCount: 1 },
  { name: 'insuranceAttachment', maxCount: 1 },
  { name: 'drivingLicenseAttachment', maxCount: 1 },
  { name: 'labourIdAttachment', maxCount: 1 },
  { name: 'curriculumVitaeAttachment', maxCount: 1 },
]);

// Combined upload for employee: photo + legal documents in a single multer instance
// This prevents "Unexpected end of form" errors when chaining multiple multer instances
export const uploadEmployeeFiles = multer({
  storage: multer.diskStorage({
    destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
      // Route to appropriate directory based on field name
      if (file.fieldname === 'photo') {
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }
        cb(null, uploadsDir);
      } else {
        // Legal documents
        if (!fs.existsSync(documentsDir)) {
          fs.mkdirSync(documentsDir, { recursive: true });
        }
        cb(null, documentsDir);
      }
    },
    filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname);
      let name = path.basename(file.originalname, ext);
      
      // Sanitize filename
      name = name.replace(/[\/\\\?\*\|"<>:]/g, '_');
      name = name.replace(/\s+/g, '_');
      name = name.replace(/[^a-zA-Z0-9._-]/g, '_');
      if (name.length > 50) {
        name = name.substring(0, 50);
      }
      if (!name || name.trim() === '') {
        name = file.fieldname === 'photo' ? 'photo' : 'document';
      }
      
      const finalFilename = `${name}-${uniqueSuffix}${ext}`;
      cb(null, finalFilename);
    }
  }),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
    files: 10, // Max 10 files total
  },
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    // Use photo filter for photo, documents filter for legal documents
    if (file.fieldname === 'photo') {
      const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, GIF, and WebP images are allowed.`));
      }
    } else {
      // Legal documents
      const allowedMimes = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain',
        'image/jpeg',
        'image/jpg',
        'image/png',
      ];
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Invalid file type. Only PDF, Word, Excel, text, and image files are allowed.'));
      }
    }
  }
}).fields([
  { name: 'photo', maxCount: 1 },
  { name: 'passportAttachment', maxCount: 1 },
  { name: 'nationalIdAttachment', maxCount: 1 },
  { name: 'residencyAttachment', maxCount: 1 },
  { name: 'insuranceAttachment', maxCount: 1 },
  { name: 'drivingLicenseAttachment', maxCount: 1 },
  { name: 'labourIdAttachment', maxCount: 1 },
  { name: 'curriculumVitaeAttachment', maxCount: 1 },
]);

// Company assets upload configuration (logo, header, footer)
const companyAssetsDir = path.join(process.cwd(), 'uploads', 'companies');
if (!fs.existsSync(companyAssetsDir)) {
  fs.mkdirSync(companyAssetsDir, { recursive: true });
}

const companyAssetsStorage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, companyAssetsDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    let name = path.basename(file.originalname, ext);
    
    // Sanitize filename
    name = name.replace(/[\/\\\?\*\|"<>:]/g, '_');
    name = name.replace(/\s+/g, '_');
    name = name.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (name.length > 50) {
      name = name.substring(0, 50);
    }
    if (!name || name.trim() === '') {
      name = 'asset';
    }
    
    const finalFilename = `${name}-${uniqueSuffix}${ext}`;
    cb(null, finalFilename);
  }
});

const companyAssetsFileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'application/pdf'
  ];
  
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and PDF files are allowed.'));
  }
};

// Export company assets upload middleware
export const uploadCompanyAssets = multer({
  storage: companyAssetsStorage,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB — letterhead PDFs can be larger than logos
  },
  fileFilter: companyAssetsFileFilter,
}).fields([
  { name: 'logo', maxCount: 1 },
  { name: 'header', maxCount: 1 },
  { name: 'footer', maxCount: 1 },
  { name: 'letterhead', maxCount: 1 },
  { name: 'payslipTemplate', maxCount: 1 },
  { name: 'stamp', maxCount: 1 },
]);

/** Dedicated letterhead upload (single file, avoids huge full-company FormData). */
export const uploadCompanyLetterhead = multer({
  storage: companyAssetsStorage,
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
  fileFilter: companyAssetsFileFilter,
}).single('letterhead');

/** Dedicated payslip template upload (PNG/JPG recommended). */
export const uploadCompanyPayslipTemplate = multer({
  storage: companyAssetsStorage,
  limits: {
    fileSize: 15 * 1024 * 1024,
  },
  fileFilter: companyAssetsFileFilter,
}).single('payslipTemplate');

const companyStampFileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed for the company seal.'));
  }
};

/** Official company seal/stamp (PNG/JPG) for payslips and HR PDFs. */
export const uploadCompanyStamp = multer({
  storage: companyAssetsStorage,
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: companyStampFileFilter,
}).single('stamp');

// Leave documents (medical certificates, proofs) - stored under uploads/leave-documents
const leaveDocumentsDir = path.join(process.cwd(), 'uploads', 'leave-documents');
if (!fs.existsSync(leaveDocumentsDir)) {
  fs.mkdirSync(leaveDocumentsDir, { recursive: true });
}

const leaveDocumentsStorage = multer.diskStorage({
  destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
    cb(null, leaveDocumentsDir);
  },
  filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    let name = path.basename(file.originalname, ext);
    name = name.replace(/[\/\\\?\*\|"<>:]/g, '_').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
    if (name.length > 50) name = name.substring(0, 50);
    if (!name) name = 'document';
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

export const uploadLeaveDocuments = multer({
  storage: leaveDocumentsStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: documentsFileFilter,
}).array('documents', 10);

const resignationDocumentsDir = path.join(process.cwd(), 'uploads', 'resignation-documents');
if (!fs.existsSync(resignationDocumentsDir)) {
  fs.mkdirSync(resignationDocumentsDir, { recursive: true });
}

const resignationDocumentsStorage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) => {
    cb(null, resignationDocumentsDir);
  },
  filename: (_req: Request, file: Express.Multer.File, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    let name = path.basename(file.originalname, ext);
    name = name.replace(/[\/\\\?\*\|"<>:]/g, '_').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
    if (name.length > 50) name = name.substring(0, 50);
    if (!name) name = 'resignation-doc';
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  },
});

export const uploadResignationDocuments = multer({
  storage: resignationDocumentsStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: documentsFileFilter,
}).fields([
  { name: 'employmentContract', maxCount: 1 },
  { name: 'supportingDocuments', maxCount: 10 },
]);

// Company policy file upload (PDF/DOC/DOCX) — stored under uploads/policies
const policyFilesDir = path.join(process.cwd(), 'uploads', 'policies');
if (!fs.existsSync(policyFilesDir)) {
  fs.mkdirSync(policyFilesDir, { recursive: true });
}

const policyFilesStorage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) => {
    cb(null, policyFilesDir);
  },
  filename: (_req: Request, file: Express.Multer.File, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `policy-${uniqueSuffix}${ext}`);
  },
});

const policyFilesFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ];
  if (allowedMimes.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Invalid file type. Only PDF or Word documents are allowed.'));
};

export const uploadPolicyFile = multer({
  storage: policyFilesStorage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: policyFilesFilter,
}).single('file');

// System feedback screenshots (optional attachment) — images only
const feedbackDir = path.join(process.cwd(), 'uploads', 'feedback');
if (!fs.existsSync(feedbackDir)) {
  fs.mkdirSync(feedbackDir, { recursive: true });
}

const feedbackStorage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) => {
    cb(null, feedbackDir);
  },
  filename: (_req: Request, file: Express.Multer.File, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `feedback-${uniqueSuffix}${ext}`);
  },
});

const feedbackImageFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowed = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid screenshot type: ${file.mimetype}. Use JPEG, PNG, GIF, or WebP.`));
  }
};

export const uploadFeedbackScreenshot = multer({
  storage: feedbackStorage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: feedbackImageFilter,
}).single('screenshot');

// Company compliance attachments — PDF, Office, images (same rules as documents)
const companyAttachmentsDir = path.join(process.cwd(), 'uploads', 'company-attachments');
if (!fs.existsSync(companyAttachmentsDir)) {
  fs.mkdirSync(companyAttachmentsDir, { recursive: true });
}

const companyAttachmentsStorage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) => {
    cb(null, companyAttachmentsDir);
  },
  filename: (_req: Request, file: Express.Multer.File, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    let name = path.basename(file.originalname, ext);
    name = name.replace(/[\/\\\?\*\|"<>:]/g, '_').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
    if (name.length > 50) name = name.substring(0, 50);
    if (!name) name = 'attachment';
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  },
});

export const uploadCompanyAttachmentFile = multer({
  storage: companyAttachmentsStorage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: documentsFileFilter,
}).single('file');

// Project chat attachments (photo / video / document)
const projectChatDir = path.join(process.cwd(), 'uploads', 'project-chat');
if (!fs.existsSync(projectChatDir)) {
  fs.mkdirSync(projectChatDir, { recursive: true });
}

const projectChatStorage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) => {
    cb(null, projectChatDir);
  },
  filename: (_req: Request, file: Express.Multer.File, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '';
    let name = path.basename(file.originalname, ext);
    name = name.replace(/[\/\\\?\*\|"<>:]/g, '_').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
    if (name.length > 40) name = name.substring(0, 40);
    if (!name) name = 'file';
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  },
});

const projectChatPhotoMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
const projectChatVideoMimes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/mpeg'];

export const uploadProjectChatFile = multer({
  storage: projectChatStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB (videos)
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const kind = String((req.body as { kind?: string })?.kind || 'document').toLowerCase();
    if (kind === 'photo') {
      if (projectChatPhotoMimes.includes(file.mimetype)) {
        cb(null, true);
        return;
      }
      cb(new Error('Photo must be JPEG, PNG, GIF, or WebP.'));
      return;
    }
    if (kind === 'video') {
      if (projectChatVideoMimes.includes(file.mimetype)) {
        cb(null, true);
        return;
      }
      cb(new Error('Video must be MP4, WebM, MOV, AVI, or MPEG.'));
      return;
    }
    const docMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'image/jpeg',
      'image/jpg',
      'image/png',
    ];
    if (docMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid document type. Use PDF, Word, Excel, text, or image files.'));
    }
  },
}).single('file');

const teamChatDir = path.join(process.cwd(), 'uploads', 'team-chat');
if (!fs.existsSync(teamChatDir)) {
  fs.mkdirSync(teamChatDir, { recursive: true });
}

const teamChatStorage = multer.diskStorage({
  destination: (_req: Request, _file: Express.Multer.File, cb) => {
    cb(null, teamChatDir);
  },
  filename: (_req: Request, file: Express.Multer.File, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '';
    let name = path.basename(file.originalname, ext);
    name = name.replace(/[\/\\\?\*\|"<>:]/g, '_').replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
    if (name.length > 40) name = name.substring(0, 40);
    if (!name) name = 'file';
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  },
});

export const uploadTeamChatFile = multer({
  storage: teamChatStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
    const kind = String((req.body as { kind?: string })?.kind || 'document').toLowerCase();
    if (kind === 'photo') {
      if (projectChatPhotoMimes.includes(file.mimetype)) {
        cb(null, true);
        return;
      }
      cb(new Error('Photo must be JPEG, PNG, GIF, or WebP.'));
      return;
    }
    if (kind === 'video') {
      if (projectChatVideoMimes.includes(file.mimetype)) {
        cb(null, true);
        return;
      }
      cb(new Error('Video must be MP4, WebM, MOV, AVI, or MPEG.'));
      return;
    }
    const docMimes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'image/jpeg',
      'image/jpg',
      'image/png',
    ];
    if (docMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid document type. Use PDF, Word, Excel, text, or image files.'));
    }
  },
}).single('file');
