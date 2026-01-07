import fs from 'fs';
import path from 'path';

const photosPath = path.join(process.cwd(), 'uploads', 'photos');

/**
 * Verify if a photo file exists on disk
 * @param filename - Photo filename (can be just filename or full path/URL)
 * @returns The filename if file exists, null otherwise
 */
export const verifyPhotoExists = (filename: string | null | undefined): string | null => {
  if (!filename) return null;
  
  // Extract just the filename from various formats
  let actualFilename = filename;
  
  // If it's a full URL, extract filename
  if (filename.includes('/uploads/photos/')) {
    actualFilename = filename.split('/uploads/photos/')[1];
  } else if (filename.includes('\\uploads\\photos\\')) {
    // Windows path separator
    actualFilename = filename.split('\\uploads\\photos\\')[1];
  } else if (filename.startsWith('http://') || filename.startsWith('https://')) {
    // External URL, return as-is (can't verify external files)
    return filename;
  }
  
  // Check if file exists
  const filePath = path.join(photosPath, actualFilename);
  const exists = fs.existsSync(filePath);
  
  if (!exists) {
    console.log(`⚠️  Photo file not found: ${actualFilename}`);
    console.log(`   Expected at: ${filePath}`);
    return null;
  }
  
  return actualFilename;
};

/**
 * Construct photo URL from filename
 * @param filename - Photo filename
 * @param protocol - Request protocol (http/https)
 * @param host - Request host
 * @returns Full photo URL or null if filename is invalid
 */
export const getPhotoUrl = (
  filename: string | null | undefined,
  protocol: string,
  host: string
): string | null => {
  if (!filename) return null;
  
  // If already a full external URL, return as-is
  if (filename.startsWith('http://') || filename.startsWith('https://')) {
    // For local URLs, extract and reconstruct to ensure consistency
    if (filename.includes('/uploads/photos/')) {
      const extractedFilename = filename.split('/uploads/photos/')[1];
      const verified = verifyPhotoExists(extractedFilename);
      if (!verified) return null;
      return `${protocol}://${host}/uploads/photos/${verified}`;
    }
    return filename; // External URL
  }
  
  // Verify file exists before returning URL
  const verified = verifyPhotoExists(filename);
  if (!verified) return null;
  
  return `${protocol}://${host}/uploads/photos/${verified}`;
};


