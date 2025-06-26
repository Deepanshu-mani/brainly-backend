"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const zod_1 = require("zod");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const mongoose_1 = __importDefault(require("mongoose"));
const dotenv_1 = require("dotenv");
const db_1 = require("./db");
const bcrypt_1 = __importDefault(require("bcrypt"));
const middleware_1 = require("./middleware");
const utils_1 = require("./utils");
const cors_1 = __importDefault(require("cors"));
(0, dotenv_1.config)();
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((0, cors_1.default)());
//db connection
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        const MongoUrl = process.env.MONGODB_URL;
        if (!MongoUrl) {
            throw new Error("MONGODB_URL is not defined");
        }
        yield mongoose_1.default.connect(MongoUrl);
        console.log("DB connected successfully");
        app.listen(process.env.PORT, () => {
            console.log(`http://localhost:${process.env.PORT}`);
        });
    });
}
main();
app.get('/', (req, res) => {
    res.send("Server is up and Running");
});
// schema
const SignUpSchema = zod_1.z.object({
    username: zod_1.z.string().min(1),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
});
// Sign up 
app.post('/api/v1/signup', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { username, email, password } = SignUpSchema.parse(req.body);
        const existing = yield db_1.UserModel.findOne({
            email: email
        });
        if (existing) {
            res.status(400).json({
                message: "User already exists with this email"
            });
            return;
        }
        const hashedPassword = yield bcrypt_1.default.hash(password, 10);
        yield db_1.UserModel.create({
            username: username,
            email: email,
            password: hashedPassword,
        });
        res.status(200).json({
            message: "Sign Up successfully",
            username,
            email,
        });
    }
    catch (e) {
        res.status(411).json({
            message: "Error processing sign up",
            error: e
        });
    }
}));
// sign in
app.post('/api/v1/signin', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password } = req.body;
        const user = yield db_1.UserModel.findOne({ email });
        if (!user) {
            res.status(403).json({ message: "User not found" });
            return;
        }
        const isPasswordCorrect = yield bcrypt_1.default.compare(password, user.password);
        if (!isPasswordCorrect) {
            res.status(403).json({ message: "Invalid password" });
            return;
        }
        const token = jsonwebtoken_1.default.sign({ id: user._id }, process.env.JWT_SECRET);
        res.status(200).json({
            message: "Signin successful",
            token
        });
    }
    catch (e) {
        res.status(500).json({
            message: "Error processing sign in",
            error: e
        });
    }
}));
//add content
app.post('/api/v1/content', middleware_1.userMiddleware, (req, res) => {
    const link = req.body.link;
    const type = req.body.type;
    const title = req.body.title;
    db_1.ContentModel.create({
        link,
        title,
        type,
        userId: req.userId,
        tags: [],
    });
    res.json({
        message: "content added"
    });
});
// get content
app.get('/api/v1/content', middleware_1.userMiddleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const userId = req.userId;
    const content = yield db_1.ContentModel.find({
        userId: userId
    }).populate("userId", "username");
    res.json({
        content
    });
}));
// delete content
app.delete('/api/v1/content', middleware_1.userMiddleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const contentId = req.body.contentId;
    yield db_1.ContentModel.deleteMany({
        _id: contentId,
        userId: req.userId,
    });
    res.json({
        message: "Content deleted"
    });
}));
// delete content all 
app.delete('/api/v1/content/all', middleware_1.userMiddleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    yield db_1.ContentModel.deleteMany({
        userId: req.userId,
    });
    res.json({
        message: "All content deleted"
    });
}));
//sharing link
app.post('/api/v1/brain/share', middleware_1.userMiddleware, (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const share = req.body.share;
    if (share) {
        const existingLink = yield db_1.LinkModel.findOne({
            userId: req.userId,
        });
        if (existingLink) {
            res.json({
                hash: existingLink.hash
            });
            return;
        }
        const hash = (0, utils_1.random)(10);
        yield db_1.LinkModel.create({
            userId: req.userId,
            hash: hash
        });
        res.json({
            message: "Link created",
            hash
        });
    }
    else {
        yield db_1.LinkModel.deleteOne({
            userId: req.userId,
        });
        res.json({
            message: "Removed sharable link",
        });
    }
}));
// access share link
app.get('/api/v1/brain/:shareLink', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const hash = req.params.shareLink;
    const link = yield db_1.LinkModel.findOne({
        hash
    });
    if (!link) {
        res.status(411).json({
            message: "Incorrect link"
        });
        return;
    }
    const content = yield db_1.ContentModel.find({
        userId: link.userId
    });
    const user = yield db_1.UserModel.findOne({
        _id: link.userId
    });
    if (!user) {
        res.status(411).json({
            message: "User not found, error should ideally not happen"
        });
        return;
    }
    res.json({
        username: user.username,
        content
    });
}));
