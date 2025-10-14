import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    job:  { type: String, required: true }
  },
  { versionKey: false } // hide __v
);

const User = mongoose.model("User", userSchema);
export default User;
