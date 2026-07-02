const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const BLOCKED_EXTENSIONS = new Set([
  '.exe', '.msi', '.bat', '.cmd', '.com', '.scr', '.pif',
  '.js', '.ts', '.py', '.rb', '.sh', '.bash', '.ps1', '.vbs', '.wsf',
  '.html', '.htm', '.php', '.asp', '.aspx', '.jsp', '.xml',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.xlsm', '.docm', '.pptm',
  '.dll', '.so', '.dylib', '.jar', '.class', '.swf'
]);

const PROMPT_INJECTION_PATTERNS = [
  'ignore_all_instructions', 'system_override', 'override_all',
  'ignore_previous', 'ignore_all_rules', 'forget_all',
  'disregard', 'new_instructions', 'follow_these'
];

const ALLOWED_MIME_TYPES = {
  'application/pdf': 'pdf',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image'
};

const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'];

const ALLOWED_MIME_SET = new Set(Object.keys(ALLOWED_MIME_TYPES));

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: async (req, file) => {
    const uuid = crypto.randomUUID();
    return {
      folder: 'evidence',
      public_id: uuid,
      resource_type: 'auto'
    };
  }
});

const sanitizeFileName = (name) => {
  let sanitized = name.replace(/\0/g, '');
  sanitized = sanitized.replace(/[\x00-\x1f\x7f]/g, '');
  return sanitized;
};

const checkPromptInjection = (name) => {
  const lower = name.toLowerCase();
  return PROMPT_INJECTION_PATTERNS.some(pattern => lower.includes(pattern));
};

const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  const sanitized = sanitizeFileName(file.originalname);

  if (checkPromptInjection(sanitized)) {
    return cb(new Error('File name contains prohibited patterns'), false);
  }

  if (sanitized.length > 255) {
    return cb(new Error('File name exceeds 255 characters'), false);
  }

  if (BLOCKED_EXTENSIONS.has(ext)) {
    return cb(new Error(`File type .${ext} is not allowed`), false);
  }

  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return cb(new Error(`File extension .${ext} is not allowed. Allowed: PDF, PNG, JPG, JPEG, WEBP`), false);
  }

  if (!ALLOWED_MIME_SET.has(file.mimetype)) {
    return cb(new Error(`File type ${file.mimetype} is not allowed`), false);
  }

  cb(null, true);
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE
  }
});

const uploadErrorHandler = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ success: false, error: 'File exceeds 10 MB limit', code: 'FILE_TOO_LARGE' });
    }
    return res.status(400).json({ success: false, error: err.message, code: 'UPLOAD_ERROR' });
  }
  if (err) {
    return res.status(400).json({ success: false, error: err.message, code: 'VALIDATION_ERROR' });
  }
  next();
};

module.exports = { upload, uploadErrorHandler, sanitizeFileName };
