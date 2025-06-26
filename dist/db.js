"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LinkModel = exports.ContentModel = exports.UserModel = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const Schema = mongoose_1.default.Schema;
const ObjectId = mongoose_1.default.Types.ObjectId;
const UserSchema = new Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
});
const ContentSchema = new Schema({
    title: String,
    link: String,
    type: String,
    tags: [{ type: mongoose_1.default.Types.ObjectId, ref: 'Tags' }],
    userId: { type: mongoose_1.default.Types.ObjectId, ref: 'User', required: true }
});
const LinkSchema = new Schema({
    hash: String,
    userId: { type: mongoose_1.default.Types.ObjectId, ref: 'User', required: true }
});
exports.UserModel = mongoose_1.default.model("User", UserSchema);
exports.ContentModel = mongoose_1.default.model("Content", ContentSchema);
exports.LinkModel = mongoose_1.default.model("Link", LinkSchema);
