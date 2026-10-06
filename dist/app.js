"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const errorHandler_1 = require("./middleware/errorHandler");
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const siteRoutes_1 = __importDefault(require("./routes/siteRoutes"));
const expenseRoutes_1 = __importDefault(require("./routes/expenseRoutes"));
const reportRoutes_1 = __importDefault(require("./routes/reportRoutes"));
const syncRoutes_1 = __importDefault(require("./routes/syncRoutes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const settingsRoutes_1 = __importDefault(require("./routes/settingsRoutes"));
const app = (0, express_1.default)();
// Middlewares
app.use((0, cors_1.default)());
app.use(express_1.default.json({ limit: '50mb' }));
app.use(express_1.default.urlencoded({ limit: '50mb', extended: true }));
// Serve uploaded receipt & site images
app.use('/uploads', express_1.default.static(path_1.default.join(__dirname, '../uploads'), {
    maxAge: '7d',
    immutable: true,
    setHeaders: (res, filePath) => {
        if (filePath.endsWith('.png')) {
            res.setHeader('Content-Type', 'image/png');
        }
        else if (filePath.endsWith('.webp')) {
            res.setHeader('Content-Type', 'image/webp');
        }
        else {
            res.setHeader('Content-Type', 'image/jpeg');
        }
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    }
}));
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
app.use('/api/auth', authRoutes_1.default);
app.use('/api/sites', siteRoutes_1.default);
app.use('/api/expenses', expenseRoutes_1.default);
app.use('/api/reports', reportRoutes_1.default);
app.use('/api/sync', syncRoutes_1.default);
app.use('/api/users', userRoutes_1.default);
app.use('/api/settings', settingsRoutes_1.default);
// Fallback API Routes without /api prefix (for backwards compatibility)
app.use('/auth', authRoutes_1.default);
app.use('/sites', siteRoutes_1.default);
app.use('/expenses', expenseRoutes_1.default);
app.use('/reports', reportRoutes_1.default);
app.use('/sync', syncRoutes_1.default);
app.use('/users', userRoutes_1.default);
app.use('/settings', settingsRoutes_1.default);
// JSON 404 Handler (prevents default Express HTML error pages)
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `API endpoint not found: ${req.method} ${req.originalUrl}`
    });
});
// Error Handler
app.use(errorHandler_1.errorHandler);
exports.default = app;
