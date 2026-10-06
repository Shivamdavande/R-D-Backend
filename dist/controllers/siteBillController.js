"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteSiteBill = exports.getSiteBills = exports.uploadSiteBill = void 0;
const SiteBill_1 = require("../models/SiteBill");
const Site_1 = require("../models/Site");
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
/**
 * Upload an Excel bill attachment for a site (Owner only)
 */
const uploadSiteBill = async (req, res) => {
    try {
        const siteId = req.params.id;
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'Please select an Excel or Document bill file to upload.' });
        }
        const site = await Site_1.Site.findById(siteId);
        if (!site) {
            return res.status(404).json({ success: false, message: 'Site not found.' });
        }
        const relativeUrl = `/uploads/${req.file.filename}`;
        const newBill = await SiteBill_1.SiteBill.create({
            siteId: site._id,
            fileUrl: relativeUrl,
            originalName: req.file.originalname || req.file.filename,
            fileSize: req.file.size,
            mimeType: req.file.mimetype,
            uploadedBy: req.user?._id,
            notes: req.body.notes || ''
        });
        const populated = await SiteBill_1.SiteBill.findById(newBill._id).populate('uploadedBy', 'name email role');
        return res.status(201).json({
            success: true,
            message: 'Excel bill document uploaded successfully.',
            bill: populated
        });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message || 'Failed to upload Excel bill.' });
    }
};
exports.uploadSiteBill = uploadSiteBill;
/**
 * Get all Excel bill documents for a site
 */
const getSiteBills = async (req, res) => {
    try {
        const siteId = req.params.id;
        const bills = await SiteBill_1.SiteBill.find({ siteId })
            .populate('uploadedBy', 'name email role')
            .sort({ createdAt: -1 });
        return res.status(200).json({
            success: true,
            count: bills.length,
            bills
        });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message || 'Failed to fetch site bills.' });
    }
};
exports.getSiteBills = getSiteBills;
/**
 * Delete an Excel bill document (Owner only)
 */
const deleteSiteBill = async (req, res) => {
    try {
        const { id, billId } = req.params;
        const bill = await SiteBill_1.SiteBill.findOne({ _id: billId, siteId: id });
        if (!bill) {
            return res.status(404).json({ success: false, message: 'Bill document not found.' });
        }
        // Attempt to remove local file from disk
        try {
            const filePath = path_1.default.join(__dirname, '../../', bill.fileUrl);
            if (fs_1.default.existsSync(filePath)) {
                fs_1.default.unlinkSync(filePath);
            }
        }
        catch (fsErr) {
            console.log('Notice: Failed to delete physical bill file:', fsErr);
        }
        await SiteBill_1.SiteBill.findByIdAndDelete(billId);
        return res.status(200).json({
            success: true,
            message: 'Excel bill document deleted successfully.'
        });
    }
    catch (error) {
        return res.status(500).json({ success: false, message: error.message || 'Failed to delete bill document.' });
    }
};
exports.deleteSiteBill = deleteSiteBill;
