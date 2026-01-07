import app from './app';
import { config } from './config/env';
import prisma from './config/database';

const PORT = typeof config.port === 'string' ? parseInt(config.port, 10) : config.port;
const HOST = '0.0.0.0'; // Listen on all network interfaces

// Get local network IP address
import os from 'os';
function getLocalIPAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const nets = interfaces[name];
    if (nets) {
      for (const net of nets) {
        // Skip internal (i.e. 127.0.0.1) and non-IPv4 addresses
        if (net.family === 'IPv4' && !net.internal) {
          return net.address;
        }
      }
    }
  }
  return 'localhost';
}

const LOCAL_IP = getLocalIPAddress();

const server = app.listen(PORT, HOST, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📡 API available at http://localhost:${PORT}/api`);
  console.log(`🌐 Network API: http://${LOCAL_IP}:${PORT}/api`);
  console.log(`🏥 Health check: http://localhost:${PORT}/health`);
  console.log(`🌐 Network Health: http://${LOCAL_IP}:${PORT}/health`);
  console.log(`\n💡 Access from other computers on your network:`);
  console.log(`   Backend: http://${LOCAL_IP}:${PORT}`);
  console.log(`   API: http://${LOCAL_IP}:${PORT}/api\n`);
});

// Handle server errors
server.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Please use a different port.`);
    process.exit(1);
  } else {
    console.error('❌ Server error:', error);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await prisma.$disconnect();
  server.close(() => {
    console.log('Process terminated');
  });
});

