import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { Expense } from '../models/Expense';
import { Site } from '../models/Site';
import { ActivityLog } from '../models/ActivityLog';
import { uploadToImageKit } from '../services/imageKitService';

export const addExpense = async (req: AuthRequest, res: Response) => {
  try {
    const siteId = req.params.id || req.body.siteId;
    const {
      date,
      category,
      itemName,
      quantity,
      unit,
      rate,
      vendor,
      paymentMethod,
      notes,
      billImageUrl,
      clientLocalId
    } = req.body;

    if (!siteId || !category || !itemName || quantity === undefined || !unit || rate === undefined) {
      return res.status(400).json({
        success: false,
        message: 'Site ID, Category, Item Name, Quantity, Unit, and Rate are required.'
      });
    }

    const numQty = Number(quantity);
    const numRate = Number(rate);

    if (isNaN(numQty) || numQty <= 0) {
      return res.status(400).json({ success: false, message: 'Quantity must be a positive number.' });
    }

    if (isNaN(numRate) || numRate < 0) {
      return res.status(400).json({ success: false, message: 'Rate must be a non-negative number.' });
    }

    const amount = Number((numQty * numRate).toFixed(2));

    const site = await Site.findById(siteId);
    if (!site) {
      return res.status(404).json({ success: false, message: 'Site not found.' });
    }

    // Handle file upload with permanent ImageKit cloud storage
    let uploadedBillUrl = billImageUrl;
    if (req.file) {
      try {
        const fileBuffer = req.file.buffer || (req.file.path ? require('fs').readFileSync(req.file.path) : null);
        if (fileBuffer) {
          const ikRes = await uploadToImageKit(fileBuffer, req.file.originalname || `bill_${Date.now()}.jpg`, `/sites/${siteId}/bills`);
          uploadedBillUrl = ikRes.url;
        } else {
          uploadedBillUrl = `/uploads/${req.file.filename}`;
        }
      } catch (ikErr) {
        uploadedBillUrl = `/uploads/${req.file.filename}`;
      }
    }

    const expense = await Expense.create({
      siteId,
      date: date ? new Date(date) : new Date(),
      category: category.trim(),
      itemName: itemName.trim(),
      quantity: numQty,
      unit: unit.trim(),
      rate: numRate,
      amount,
      vendor: vendor ? vendor.trim() : undefined,
      paymentMethod: paymentMethod || 'CASH',
      notes: notes ? notes.trim() : undefined,
      billImageUrl: uploadedBillUrl,
      createdBy: req.user!._id,
      clientLocalId,
      syncStatus: 'SYNCED',
      isDeleted: false
    });

    await expense.populate('createdBy', 'name email role');

    // Write Activity Log
    await ActivityLog.create({
      siteId: site._id,
      userId: req.user!._id,
      userName: req.user!.name,
      action: 'EXPENSE_ADDED',
      details: `${req.user!.name} added: ${numQty} ${unit.trim()} ${itemName.trim()} @ ₹${numRate} (Total: ₹${amount.toLocaleString()})`,
      expenseId: expense._id,
      newValues: {
        category: expense.category,
        itemName: expense.itemName,
        quantity: expense.quantity,
        unit: expense.unit,
        rate: expense.rate,
        amount: expense.amount
      }
    });

    return res.status(201).json({
      success: true,
      message: 'Expense added successfully.',
      expense
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to add expense.' });
  }
};

export const getSiteExpenses = async (req: AuthRequest, res: Response) => {
  try {
    const siteId = req.params.id;
    const { category, user, search, startDate, endDate, page = 1, limit = 100 } = req.query;

    const query: any = { siteId, isDeleted: false };

    if (category) {
      query.category = category;
    }

    if (user) {
      query.createdBy = user;
    }

    if (search) {
      query.$or = [
        { itemName: { $regex: search, $options: 'i' } },
        { vendor: { $regex: search, $options: 'i' } },
        { notes: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } }
      ];
    }

    if (startDate || endDate) {
      query.date = {};
      if (startDate) query.date.$gte = new Date(startDate as string);
      if (endDate) query.date.$lte = new Date(endDate as string);
    }

    const skip = (Number(page) - 1) * Number(limit);

    const expenses = await Expense.find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .populate('createdBy', 'name email role');

    const totalCount = await Expense.countDocuments(query);

    // Sum of filtered expenses
    const totalAmountResult = await Expense.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalAmount = totalAmountResult.length > 0 ? totalAmountResult[0].total : 0;

    return res.status(200).json({
      success: true,
      count: expenses.length,
      totalCount,
      totalAmount,
      page: Number(page),
      totalPages: Math.ceil(totalCount / Number(limit)),
      expenses
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch site expenses.' });
  }
};

export const getExpenseById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findById(id).populate('createdBy', 'name email role').populate('siteId', 'siteName status');

    if (!expense || expense.isDeleted) {
      return res.status(404).json({ success: false, message: 'Expense not found.' });
    }

    return res.status(200).json({ success: true, expense });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to fetch expense.' });
  }
};

export const updateExpense = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findById(id);

    if (!expense || expense.isDeleted) {
      return res.status(404).json({ success: false, message: 'Expense not found.' });
    }

    // Permission check for Supervisor: supervisors can edit their own entries
    if (req.user!.role !== 'OWNER' && expense.createdBy.toString() !== req.user!._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'You can only edit expenses that you created.'
      });
    }

    const previousValues = {
      itemName: expense.itemName,
      quantity: expense.quantity,
      unit: expense.unit,
      rate: expense.rate,
      amount: expense.amount,
      category: expense.category
    };

    const {
      date,
      category,
      itemName,
      quantity,
      unit,
      rate,
      vendor,
      paymentMethod,
      notes,
      billImageUrl
    } = req.body;

    if (date) expense.date = new Date(date);
    if (category) expense.category = category.trim();
    if (itemName) expense.itemName = itemName.trim();
    if (unit) expense.unit = unit.trim();
    if (vendor !== undefined) expense.vendor = vendor.trim();
    if (paymentMethod) expense.paymentMethod = paymentMethod;
    if (notes !== undefined) expense.notes = notes.trim();
    if (billImageUrl !== undefined) expense.billImageUrl = billImageUrl;

    if (req.file) {
      try {
        const fileBuffer = req.file.buffer || (req.file.path ? require('fs').readFileSync(req.file.path) : null);
        if (fileBuffer) {
          const ikRes = await uploadToImageKit(fileBuffer, req.file.originalname || `bill_${Date.now()}.jpg`, `/sites/${expense.siteId}/bills`);
          expense.billImageUrl = ikRes.url;
        } else {
          expense.billImageUrl = `/uploads/${req.file.filename}`;
        }
      } catch (ikErr) {
        expense.billImageUrl = `/uploads/${req.file.filename}`;
      }
    }

    if (quantity !== undefined || rate !== undefined) {
      if (quantity !== undefined) expense.quantity = Number(quantity);
      if (rate !== undefined) expense.rate = Number(rate);
      expense.amount = Number((expense.quantity * expense.rate).toFixed(2));
    }

    expense.updatedBy = req.user!._id;
    await expense.save();

    await ActivityLog.create({
      siteId: expense.siteId,
      userId: req.user!._id,
      userName: req.user!.name,
      action: 'EXPENSE_UPDATED',
      details: `${req.user!.name} edited expense ${expense.itemName}: ₹${previousValues.amount.toLocaleString()} → ₹${expense.amount.toLocaleString()}`,
      expenseId: expense._id,
      previousValues,
      newValues: {
        itemName: expense.itemName,
        quantity: expense.quantity,
        unit: expense.unit,
        rate: expense.rate,
        amount: expense.amount,
        category: expense.category
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Expense updated successfully.',
      expense
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to update expense.' });
  }
};

export const deleteExpense = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const expense = await Expense.findById(id);

    if (!expense || expense.isDeleted) {
      return res.status(404).json({ success: false, message: 'Expense not found.' });
    }

    // Only OWNER or creator can delete
    if (req.user!.role !== 'OWNER' && expense.createdBy.toString() !== req.user!._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Only the Owner or creator can delete an expense entry.'
      });
    }

    expense.isDeleted = true;
    expense.updatedBy = req.user!._id;
    await expense.save();

    await ActivityLog.create({
      siteId: expense.siteId,
      userId: req.user!._id,
      userName: req.user!.name,
      action: 'EXPENSE_DELETED',
      details: `${req.user!.name} deleted expense: ${expense.quantity} ${expense.unit} ${expense.itemName} (₹${expense.amount.toLocaleString()})`,
      expenseId: expense._id,
      previousValues: {
        itemName: expense.itemName,
        quantity: expense.quantity,
        unit: expense.unit,
        amount: expense.amount
      }
    });

    return res.status(200).json({
      success: true,
      message: 'Expense deleted successfully.'
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, message: error.message || 'Failed to delete expense.' });
  }
};
