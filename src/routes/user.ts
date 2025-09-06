import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { Router ,Request, Response } from 'express';
import { UserModel } from '../config/db';
import bcrypt from 'bcrypt'
import { userMiddleware } from '../middleware/authMiddleware';
export const userRouter = Router();
// schema
const SignUpSchema = z.object({
    username: z.string().min(1),
    email: z.string().email(),
    password: z.string().min(6),
});

// Sign up 
userRouter.post('/signup', async (req: Request, res: Response) => {
    try {
        const { username, email, password } = SignUpSchema.parse(req.body);

        const existing = await UserModel.findOne({
            email: email
        });
        if (existing) {
            res.status(400).json({
                message: "User already exists with this email"
            });
            return;
        }


        const hashedPassword = await bcrypt.hash(password, 10);

        await UserModel.create({
            username: username,
            email: email,
            password: hashedPassword,
        });
        res.status(200).json({
            message: "Sign Up successfully",
            username,
            email,
        })
    } catch (e) {
        res.status(411).json({
            message: "Error processing sign up",
            error: e
        })
    }
})

// sign in
userRouter.post('/signin', async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;
        const user = await UserModel.findOne({ email });

        if (!user) {
            res.status(403).json({ message: "User not found" });
            return;
        }

        const isPasswordCorrect = await bcrypt.compare(password, user.password);
        if (!isPasswordCorrect) {
            res.status(403).json({ message: "Invalid password" });
            return;
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET!);
        res.status(200).json({
            message: "Signin successful",
            token
        });
    } catch (e) {
        res.status(500).json({
            message: "Error processing sign in",
            error: e
        })
    }
});

// Get user profile
userRouter.get('/profile', userMiddleware, async (req: Request, res: Response) => {
    try {
        if (!req.userId) {
            res.status(401).json({ message: 'User not authenticated' });
            return;
        }

        const user = await UserModel.findById(req.userId).select('-password');
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        res.status(200).json({
            id: user._id,
            username: user.username,
            email: user.email
        });
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ message: 'Error fetching user profile' });
    }
});

// Logout (client-side token removal, but we can add server-side logic if needed)
userRouter.post('/logout', userMiddleware, async (req: Request, res: Response) => {
    try {
        // For JWT tokens, logout is typically handled client-side by removing the token
        // But we can add server-side logic here if needed (like token blacklisting)
        res.status(200).json({ message: 'Logged out successfully' });
    } catch (error) {
        console.error('Error during logout:', error);
        res.status(500).json({ message: 'Error during logout' });
    }
});