import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    job:  { type: String, required: true }
  },
  { versionKey: false } // hides __v
);

export default mongoose.model("User", userSchema);
