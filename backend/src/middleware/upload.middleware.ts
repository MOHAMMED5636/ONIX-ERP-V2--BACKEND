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
    fileSize: 5 * 1024 * 1024, // 5MB max file size
  },
  fileFilter: companyAssetsFileFilter,
}).fields([
  { name: 'logo', maxCount: 1 },
  { name: 'header', maxCount: 1 },
  { name: 'footer', maxCount: 1 },
]);
