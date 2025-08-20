import mongoose from "mongoose";
const Schema = mongoose.Schema;

const UserSchema = new Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
})

const ContentSchema = new Schema({
    title: { type: String, required: true },
    link: { type: String },
    content: { type: String },
    type: { 
        type: String, 
        enum: ['youtube', 'twitter', 'note', 'website'],
        required: true 
    },
    tags: [{ type: String }],
    userId: { type: mongoose.Types.ObjectId, ref: 'User', required: true },
    dueDate: { type: Date },
    isCompleted: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    // AI-enhanced fields
    summary: { type: String },
    keywords: [{ type: String }],
    embedding: { type: [Number] }, // Vector embedding for semantic search
    // Website-specific fields
    websiteMetadata: {
        description: String,
        favicon: String,
        domain: String,
        screenshot: String
    },
    // Content processing status
    processingStatus: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending'
    },
    processingError: String
})

const LinkSchema = new Schema({
    hash : String,
    userId: { type: mongoose.Types.ObjectId, ref: 'User', required: true }
})

// Indexes
ContentSchema.index({ embedding: 1 });
ContentSchema.index({ userId: 1, type: 1 });
ContentSchema.index({ userId: 1, tags: 1 });
ContentSchema.index({ userId: 1, createdAt: -1 });

export const UserModel = mongoose.model("User", UserSchema);
export const ContentModel = mongoose.model("Content", ContentSchema);
export const LinkModel = mongoose.model("Link", LinkSchema);