// packages/express-backend/user-services.js
import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import User from "./models/user.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from this package no matter where nodemon is run from
dotenv.config({ path: join(__dirname, ".env") });

mongoose.set("strictQuery", true);

export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.DB_NAME || "usersdb";

  if (!uri) {
    throw new Error(
      "MONGODB_URI not set (place it in packages/express-backend/.env)"
    );
  }

  await mongoose.connect(uri, { dbName });
  console.log("✅ MongoDB connected to", dbName);
}

/* --- Query helpers --- */
export function getAllUsers() {
  return User.find({}).lean().exec();
}
export function findByName(name) {
  return User.find({ name }).lean().exec();
}
export function findByJob(job) {
  return User.find({ job }).lean().exec();
}
export function findByNameAndJob(name, job) {
  return User.find({ name, job }).lean().exec();
}
export function findById(id) {
  return User.findById(id).lean().exec();
}
export function createUser({ name, job }) {
  if (!name || !job) {
    return Promise.reject(new Error("name and job are required"));
  }
  return User.create({ name, job }); // returns the created doc with _id
}
export function deleteById(id) {
  return User.findByIdAndDelete(id).exec();
}
