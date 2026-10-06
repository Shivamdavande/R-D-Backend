"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = __importDefault(require("./app"));
const db_1 = require("./config/db");
const env_1 = require("./config/env");
const imageCleanupService_1 = require("./services/imageCleanupService");
const dailyReportCronService_1 = require("./services/dailyReportCronService");
const startServer = async () => {
    await (0, db_1.connectDB)();
    // Start 14-day closed site image auto-cleanup background service
    (0, imageCleanupService_1.startImageCleanupCron)();
    // Start automated daily site summary report background service
    (0, dailyReportCronService_1.startDailyReportCron)();
    app_1.default.listen(env_1.config.port, () => {
        console.log(`=======================================================`);
        console.log(` 🚀 R&D Contractor Backend API Server Running`);
        console.log(` 📍 PORT: ${env_1.config.port}`);
        console.log(` 🌐 ENV: ${env_1.config.nodeEnv}`);
        console.log(` 🏷️  COMPANY: ${env_1.config.companyName}`);
        console.log(`=======================================================`);
    });
};
startServer();
