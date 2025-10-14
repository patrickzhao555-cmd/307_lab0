import mongoose from "mongoose";
import User from "./models/user.js";

const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/usersdb";

export async function connectDB() {
  if (mongoose.connection.readyState === 1) return;
  await mongoose.connect(MONGO_URI);
  console.log("MongoDB connected:", MONGO_URI);
}

export function getAllUsers() {
  return User.find().exec();
}
export function findByName(name) {
  return User.find({ name }).exec();
}
export function findByJob(job) {
  return User.find({ job }).exec();
}
export function findByNameAndJob(name, job) {
  return User.find({ name, job }).exec();
}
export function findById(id) {
  return User.findById(id).exec();
}
export function createUser({ name, job }) {
  return User.create({ name, job });
}
export function deleteById(id) {
  return User.findByIdAndDelete(id).exec();
}
