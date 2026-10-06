import express from 'express';
import cors from 'cors';
import path from 'path';
import { errorHandler } from './middleware/errorHandler';

import authRoutes from './routes/authRoutes';
import siteRoutes from './routes/siteRoutes';
import expenseRoutes from './routes/expenseRoutes';
import reportRoutes from './routes/reportRoutes';
import syncRoutes from './routes/syncRoutes';
import userRoutes from './routes/userRoutes';
import settingsRoutes from './routes/settingsRoutes';

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve uploaded receipt & site images
app.use(
  '/uploads',
  express.static(path.join(__dirname, '../uploads'), {
    maxAge: '7d',
    immutable: true,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.png')) {
        res.setHeader('Content-Type', 'image/png');
      } else if (filePath.endsWith('.webp')) {
        res.setHeader('Content-Type', 'image/webp');
      } else {
        res.setHeader('Content-Type', 'image/jpeg');
      }
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    }
  })
);

// Normalize duplicate /api/api prefixes
app.use((req, res, next) => {
  if (req.url.startsWith('/api/api/')) {
    req.url = req.url.replace('/api/api/', '/api/');
  }
  next();
});

// Root & Health check
app.get(['/api/health', '/health'], (req, res) => {
  res.status(200).json({
    status: 'OK',
    app: 'R&D CONSTRUCTIONS Contractor Backend',
    timestamp: new Date().toISOString()
  });
});

// Primary API Routes (/api/*)
app.use('/api/auth', authRoutes);
app.use('/api/sites', siteRoutes);
app.use('/api/expenses', expenseRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/users', userRoutes);
app.use('/api/settings', settingsRoutes);

// Fallback API Routes without /api prefix (for backwards compatibility)
app.use('/auth', authRoutes);
app.use('/sites', siteRoutes);
app.use('/expenses', expenseRoutes);
app.use('/reports', reportRoutes);
app.use('/sync', syncRoutes);
app.use('/users', userRoutes);
app.use('/settings', settingsRoutes);

// JSON 404 Handler (prevents default Express HTML error pages)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `API endpoint not found: ${req.method} ${req.originalUrl}`
  });
});

// Error Handler
app.use(errorHandler);

export default app;
