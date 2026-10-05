import { Schema, model, Document, Types } from 'mongoose';

export type PaymentMethod = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'CREDIT' | 'OTHER';

export interface IExpense extends Document {
  _id: Types.ObjectId;
  siteId: Types.ObjectId;
  date: Date;
  category: string;
  itemName: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  vendor?: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
  billImageUrl?: string;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  clientLocalId?: string;
  syncStatus: 'SYNCED' | 'PENDING';
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const expenseSchema = new Schema<IExpense>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    date: { type: Date, required: true, default: Date.now, index: true },
    category: { type: String, required: true, trim: true, index: true },
    itemName: { type: String, required: true, trim: true, index: true },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true, trim: true },
    rate: { type: Number, required: true, min: 0 },
    amount: { type: Number, required: true, min: 0 },
    vendor: { type: String, trim: true },
    paymentMethod: {
      type: String,
      enum: ['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CREDIT', 'OTHER'],
      default: 'CASH'
    },
    notes: { type: String, trim: true },
    billImageUrl: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    clientLocalId: { type: String, index: true, sparse: true },
    syncStatus: { type: String, enum: ['SYNCED', 'PENDING'], default: 'SYNCED' },
    isDeleted: { type: Boolean, default: false, index: true }
  },
  { timestamps: true }
);

// Compound index for ultra-fast aggregation per site
expenseSchema.index({ siteId: 1, isDeleted: 1 });

// Middleware to calculate amount automatically before saving
expenseSchema.pre('save', function (next) {
  if (this.quantity !== undefined && this.rate !== undefined) {
    this.amount = Number((this.quantity * this.rate).toFixed(2));
  }
  next();
});

export const Expense = model<IExpense>('Expense', expenseSchema);
