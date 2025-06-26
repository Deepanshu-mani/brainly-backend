import mongoose, {model} from "mongoose";
const Schema = mongoose.Schema;
const ObjectId = mongoose.Types.ObjectId;


const UserSchema = new Schema({
    username: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
})


const ContentSchema = new Schema({
    title: String,
    link: String,
    type: String,
    tags: [{ type: mongoose.Types.ObjectId, ref: 'Tags' }],
    userId: { type: mongoose.Types.ObjectId, ref: 'User', required: true }
})

const LinkSchema = new Schema({
    hash : String,
    userId: { type: mongoose.Types.ObjectId, ref: 'User', required: true }
})
export const UserModel = mongoose.model("User", UserSchema);
export const ContentModel = mongoose.model("Content", ContentSchema);
export const LinkModel = mongoose.model("Link", LinkSchema);