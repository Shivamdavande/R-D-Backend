"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailLog = void 0;
const mongoose_1 = require("mongoose");
const emailLogSchema = new mongoose_1.Schema({
    emailType: {
        type: String,
        enum: ['REGISTRATION_OTP', 'SUPERVISOR_SITE_ASSIGNMENT', 'SITE_FINAL_REPORT', 'PASSWORD_RESET', 'DAILY_SITE_SUMMARY'],
        required: true,
        index: true
    },
    recipient: { type: String, required: true, lowercase: true, trim: true, index: true },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User' },
    siteId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Site' },
    status: {
        type: String,
        enum: ['SENT', 'FAILED', 'PENDING'],
        default: 'PENDING',
        index: true
    },
    messageId: { type: String },
    sentAt: { type: Date },
    failureReason: { type: String },
    metadata: { type: mongoose_1.Schema.Types.Mixed }
}, { timestamps: true });
exports.EmailLog = (0, mongoose_1.model)('EmailLog', emailLogSchema);
