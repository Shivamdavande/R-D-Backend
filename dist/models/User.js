"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const mongoose_1 = require("mongoose");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const userSchema = new mongoose_1.Schema({
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
}, { timestamps: true });
userSchema.pre('save', async function (next) {
    if (!this.isModified('password'))
        return next();
    try {
        const salt = await bcryptjs_1.default.genSalt(10);
        this.password = await bcryptjs_1.default.hash(this.password, salt);
        next();
    }
    catch (err) {
        next(err);
    }
});
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcryptjs_1.default.compare(candidatePassword, this.password);
};
exports.User = (0, mongoose_1.model)('User', userSchema);
