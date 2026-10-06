"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SiteBill = void 0;
const mongoose_1 = require("mongoose");
require("./User");
const siteBillSchema = new mongoose_1.Schema({
    siteId: { type: mongoose_1.Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    fileUrl: { type: String, required: true },
    originalName: { type: String, required: true },
    fileSize: { type: Number },
    mimeType: { type: String },
    uploadedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, default: Date.now },
    notes: { type: String }
}, { timestamps: true });
exports.SiteBill = (0, mongoose_1.model)('SiteBill', siteBillSchema);
