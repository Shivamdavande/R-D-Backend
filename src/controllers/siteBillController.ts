import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { SiteBill } from '../models/SiteBill';
import { Site } from '../models/Site';
import path from 'path';
import fs from 'fs';

/**
 * Upload an Excel bill attachment for a site (Owner only)
 */
export const uploadSiteBill = async (req: AuthRequest, res: Response) => {
  try {
    const siteId = req.params.id;
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please select an Excel or Document bill file to upload.' });
    }

    const site = await Site.findById(siteId);
    if (!site) {
      return res.status(404).json({ success: false, message: 'Site not found.' });
    }

    const relativeUrl = `/uploads/${req.file.filename}`;
    const newBill = await SiteBill.create({
      siteId: site._id,
      fileUrl: relativeUrl,
      originalName: req.file.originalname || req.file.filename,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      uploadedBy: req.user?._id,
      notes: req.body.notes || ''
    });

    const populated = await SiteBill.findById(newBill._id).populate('uploadedBy', 'name email role');

    return res.status(201).json({
      success: true,
      message: 'Excel bill document uploaded successfully.',
      bill: populated
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to upload Excel bill.' });
  }
};

/**
 * Get all Excel bill documents for a site
 */
export const getSiteBills = async (req: AuthRequest, res: Response) => {
  try {
    const siteId = req.params.id;
    const bills = await SiteBill.find({ siteId })
      .populate('uploadedBy', 'name email role')
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: bills.length,
      bills
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch site bills.' });
  }
};

/**
 * Delete an Excel bill document (Owner only)
 */
export const deleteSiteBill = async (req: AuthRequest, res: Response) => {
  try {
    const { id, billId } = req.params;
    const bill = await SiteBill.findOne({ _id: billId, siteId: id });
    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill document not found.' });
    }

    // Attempt to remove local file from disk
    try {
      const filePath = path.join(__dirname, '../../', bill.fileUrl);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (fsErr) {
      console.log('Notice: Failed to delete physical bill file:', fsErr);
    }

    await SiteBill.findByIdAndDelete(billId);

    return res.status(200).json({
      success: true,
      message: 'Excel bill document deleted successfully.'
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to delete bill document.' });
  }
};

/**
 * Download an Excel bill document with attachment headers and original filename
 */
export const downloadSiteBill = async (req: AuthRequest, res: Response) => {
  try {
    const { id, billId } = req.params;
    const bill = await SiteBill.findOne({ _id: billId, siteId: id });
    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill document not found.' });
    }

    const filePath = path.join(__dirname, '../../', bill.fileUrl);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'Bill file not found on server.' });
    }

    return res.download(filePath, bill.originalName || 'Site_Bill.xlsx');
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to download bill file.' });
  }
};
