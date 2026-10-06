import { Schema, model, Document, Types } from 'mongoose';
import './User';

export interface ISiteBill extends Document {
  _id: Types.ObjectId;
  siteId: Types.ObjectId;
  fileUrl: string;
  originalName: string;
  fileSize?: number;
  mimeType?: string;
  uploadedBy: Types.ObjectId;
  uploadedAt: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const siteBillSchema = new Schema<ISiteBill>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    fileUrl: { type: String, required: true },
    originalName: { type: String, required: true },
    fileSize: { type: Number },
    mimeType: { type: String },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    uploadedAt: { type: Date, default: Date.now },
    notes: { type: String }
  },
  { timestamps: true }
);

export const SiteBill = model<ISiteBill>('SiteBill', siteBillSchema);
