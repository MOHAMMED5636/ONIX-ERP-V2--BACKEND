import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import os from 'os';
import { config } from './config/env';
import { errorHandler } from './middleware/error.middleware';

// Routes
import authRoutes from './routes/auth.routes';
import clientsRoutes from './routes/clients.routes';
import tendersRoutes from './routes/tenders.routes';
import documentsRoutes from './routes/documents.routes';
import dashboardRoutes from './routes/dashboard.routes';
import employeeRoutes from './routes/employee.routes';
import projectsRoutes from './routes/projects.routes';
import tasksRoutes from './routes/tasks.routes';
import companiesRoutes from './routes/companies.routes';

const app = express();

// Middleware
// Configure Helmet to allow images from same origin
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "http://localhost:3001", "http://localhost:3000", "https:"],
    },
  },
}));

// CORS configuration - allow frontend origin and common dev ports
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Get local network IP for dynamic CORS
    function getLocalIPAddress(): string {
      const interfaces = os.networkInterfaces();
      for (const name of Object.keys(interfaces)) {
        const nets = interfaces[name];
        if (nets) {
          for (const net of nets) {
            if (net.family === 'IPv4' && !net.internal) {
              return net.address;
            }
          }
        }
      }
      return 'localhost';
    }
    const LOCAL_IP = getLocalIPAddress();
    
    const allowedOrigins = [
      config.frontendUrl,
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:5173', // Vite default
      'http://localhost:5174',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      `http://${LOCAL_IP}:3000`, // Dynamic office network access
      `http://${LOCAL_IP}:3001`,
      `http://${LOCAL_IP}:5173`, // Vite on network
      `http://${LOCAL_IP}:5174`,
    ];
    
    // Allow all origins in development, or if origin is in allowed list
    if (allowedOrigins.indexOf(origin) !== -1 || config.nodeEnv === 'development') {
      callback(null, true);
    } else {
      // In production, still allow all for now (can restrict later)
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
// Request logging - log all requests including method and path
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Morgan HTTP request logger
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true, limit: '10mb' })); // Increase limit for file uploads

// Serve static files (photos) with CORS headers
// This must come before authentication middleware
import fs from 'fs';

const uploadsPath = path.join(process.cwd(), 'uploads');
const photosPath = path.join(uploadsPath, 'photos');

// Ensure directories exist
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
  console.log(`📁 Created uploads directory: ${uploadsPath}`);
}
if (!fs.existsSync(photosPath)) {
  fs.mkdirSync(photosPath, { recursive: true });
  console.log(`📸 Created photos directory: ${photosPath}`);
}

console.log(`📁 Serving static files from: ${uploadsPath}`);
console.log(`📸 Photo directory: ${photosPath}`);

app.use('/uploads', (req, res, next) => {
  // Set CORS headers for static files
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  
  // Log photo requests for debugging
  if (req.path.includes('/photos/')) {
    const relativePath = req.path.replace('/uploads', '');
    const filePath = path.join(uploadsPath, relativePath);
    const fileExists = fs.existsSync(filePath);
    console.log(`📸 Photo request: ${req.method} ${req.path}`);
    console.log(`   → Looking for file: ${filePath}`);
    console.log(`   → File exists: ${fileExists ? '✅ YES' : '❌ NO'}`);
    
    if (!fileExists) {
      console.log(`   ⚠️  WARNING: Photo file not found at: ${filePath}`);
      // List files in photos directory for debugging
      if (fs.existsSync(photosPath)) {
        const files = fs.readdirSync(photosPath);
        console.log(`   📋 Available photos (${files.length}):`, files.slice(0, 5));
      }
    }
  }
  
  next();
}, express.static(uploadsPath, {
  dotfiles: 'ignore',
  maxAge: '1d',
  etag: true,
  lastModified: true
}));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/clients', clientsRoutes);
app.use('/api/tenders', tendersRoutes);
app.use('/api/documents', documentsRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/companies', companiesRoutes);

// API root endpoint - list all available endpoints
app.get('/api', (req, res) => {
  res.json({
    success: true,
    message: 'ONIX ERP Backend API',
    version: '1.0.0',
    endpoints: {
      auth: {
        login: 'POST /api/auth/login',
        me: 'GET /api/auth/me',
        logout: 'POST /api/auth/logout',
        profile: 'PUT /api/auth/profile',
        changePassword: 'POST /api/auth/change-password',
      },
      projects: {
        list: 'GET /api/projects',
        get: 'GET /api/projects/:id',
        create: 'POST /api/projects',
        update: 'PUT /api/projects/:id',
        delete: 'DELETE /api/projects/:id',
        assign: 'POST /api/projects/:id/assign',
        stats: 'GET /api/projects/:id/stats',
        checklists: 'GET /api/projects/:projectId/checklists',
        attachments: 'GET /api/projects/:projectId/attachments',
      },
      tasks: {
        list: 'GET /api/tasks',
        get: 'GET /api/tasks/:id',
        create: 'POST /api/tasks',
        update: 'PUT /api/tasks/:id',
        delete: 'DELETE /api/tasks/:id',
        assign: 'POST /api/tasks/:id/assign',
        stats: 'GET /api/tasks/stats',
        kanban: 'GET /api/tasks/kanban',
        checklists: 'GET /api/tasks/:taskId/checklists',
        attachments: 'GET /api/tasks/:taskId/attachments',
        comments: 'GET /api/tasks/:taskId/comments',
      },
      clients: {
        list: 'GET /api/clients',
        get: 'GET /api/clients/:id',
        create: 'POST /api/clients',
        update: 'PUT /api/clients/:id',
        delete: 'DELETE /api/clients/:id',
      },
      tenders: {
        assign: 'POST /api/tenders/assign',
        invitation: 'GET /api/tenders/invitation/:token',
        accept: 'POST /api/tenders/invitation/:token/accept',
      },
      dashboard: {
        stats: 'GET /api/dashboard/stats',
        summary: 'GET /api/dashboard/summary',
        projects: 'GET /api/dashboard/projects',
        tasks: 'GET /api/dashboard/tasks',
        team: 'GET /api/dashboard/team',
        calendar: 'GET /api/dashboard/calendar',
      },
      employees: {
        list: 'GET /api/employees',
        get: 'GET /api/employees/:id',
        create: 'POST /api/employees',
        update: 'PUT /api/employees/:id',
        delete: 'DELETE /api/employees/:id',
      },
      documents: {
        list: 'GET /api/documents',
        upload: 'POST /api/documents',
        download: 'GET /api/documents/:id/download',
        delete: 'DELETE /api/documents/:id',
      },
    },
    documentation: 'See API documentation for detailed endpoint information',
    timestamp: new Date().toISOString(),
  });
});

// Root route
app.get('/', (req, res) => {
  res.json({ 
    message: 'ONIX ERP Backend API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      api: '/api',
      docs: 'API documentation available at /api endpoints'
    },
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use(errorHandler);

export default app;

