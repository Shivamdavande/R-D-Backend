import { Schema, model, Document, Types } from 'mongoose';
import bcrypt from 'bcryptjs';

export type UserRole = 'OWNER' | 'SUPERVISOR' | 'SUPERWISER' | 'VIEWER';

export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password?: string;
  phone?: string;
  role: UserRole;
  companyName: string;
  isActive: boolean;
  isVerified: boolean;
  otpHash?: string;
  otpExpiresAt?: Date;
  otpResendCooldownAt?: Date;
  otpAttempts?: number;
  resetPasswordOtpHash?: string;
  resetPasswordOtpExpires?: Date;
  resetPasswordOtpAttempts?: number;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    password: { type: String, required: true },
    phone: { type: String, trim: true },
    role: { 
      type: String, 
      enum: ['OWNER', 'SUPERVISOR', 'SUPERWISER', 'VIEWER'], 
      default: 'SUPERVISOR' 
    },
    companyName: { type: String, default: 'R&D CONSTRUCTIONS' },
    isActive: { type: Boolean, default: true },
    isVerified: { type: Boolean, default: true },
    otpHash: { type: String },
    otpExpiresAt: { type: Date },
    otpResendCooldownAt: { type: Date },
    otpAttempts: { type: Number, default: 0 },
    resetPasswordOtpHash: { type: String },
    resetPasswordOtpExpires: { type: Date },
    resetPasswordOtpAttempts: { type: Number, default: 0 }
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password!, salt);
    next();
  } catch (err: any) {
    next(err);
  }
});

userSchema.methods.comparePassword = async function (candidatePassword: string): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export const User = model<IUser>('User', userSchema);
