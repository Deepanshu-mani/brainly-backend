
import express, { Request, Response } from 'express';

import mongoose from 'mongoose';
import { config } from 'dotenv';
import cors from 'cors';
import { startSelfPing } from './utils/intro';
import { userRouter } from './routes/user';
import { brainRouter } from './routes/brain';
import { contentRouter } from './routes/content';

config();

// Log environment variables for debugging
// console.log('Environment check:');
// console.log('MONGODB_URL:', process.env.MONGODB_URL ? '✓ Set' : '✗ Missing');
// console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✓ Set' : '✗ Missing');
// console.log('JINA_API_KEY:', process.env.JINA_API_KEY ? '✓ Set' : '✗ Missing');
// console.log('JWT_SECRET:', process.env.JWT_SECRET ? '✓ Set' : '✗ Missing');

startSelfPing();

const app = express();
app.use(express.json());

app.use(cors());

//db connection
async function main() {
    const MongoUrl = process.env.MONGODB_URL;
    if (!MongoUrl) {
        throw new Error("MONGODB_URL is not defined");
    }
    await mongoose.connect(MongoUrl);
    console.log("DB connected successfully");
    app.listen(process.env.PORT, () => {
        console.log(`http://localhost:${process.env.PORT}`)
    })
}
main();

app.use('/api/v1/user', userRouter);
app.use('/api/v1/content', contentRouter);
app.use("/api/v1/brain",  brainRouter);

app.get('/', (req, res) => {
    res.send("Server is up and Running"); 
});




