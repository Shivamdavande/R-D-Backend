import { Schema, model, Document, Types } from 'mongoose';

export type EmailType = 'REGISTRATION_OTP' | 'SUPERVISOR_SITE_ASSIGNMENT' | 'SITE_FINAL_REPORT' | 'PASSWORD_RESET' | 'DAILY_SITE_SUMMARY';
export type EmailStatus = 'SENT' | 'FAILED' | 'PENDING';

export interface IEmailLog extends Document {
  _id: Types.ObjectId;
  emailType: EmailType;
  recipient: string;
  userId?: Types.ObjectId;
  siteId?: Types.ObjectId;
  status: EmailStatus;
  messageId?: string;
  sentAt?: Date;
  failureReason?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const emailLogSchema = new Schema<IEmailLog>(
  {
    emailType: {
      type: String,
      enum: ['REGISTRATION_OTP', 'SUPERVISOR_SITE_ASSIGNMENT', 'SITE_FINAL_REPORT', 'PASSWORD_RESET', 'DAILY_SITE_SUMMARY'],
      required: true,
      index: true
    },
    recipient: { type: String, required: true, lowercase: true, trim: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    siteId: { type: Schema.Types.ObjectId, ref: 'Site' },
    status: {
      type: String,
      enum: ['SENT', 'FAILED', 'PENDING'],
      default: 'PENDING',
      index: true
    },
    messageId: { type: String },
    sentAt: { type: Date },
    failureReason: { type: String },
    metadata: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

export const EmailLog = model<IEmailLog>('EmailLog', emailLogSchema);
