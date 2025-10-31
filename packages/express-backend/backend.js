import express from "express";
import "dotenv/config";
import cors from "cors";

import {
  connectDB,
  getAllUsers,
  findByName,
  findByJob,
  findByNameAndJob,
  findById,
  createUser,
  deleteById,
} from "./user-services.js";

const app = express();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());

app.get("/", (_req, res) => res.send("Hello World!"));

// GET /users  (+ ?name=... &/or ?job=...)
app.get("/users", async (req, res) => {
  try {
    const { name, job } = req.query;
    let result;
    if (name && job) result = await findByNameAndJob(name, job);
    else if (name) result = await findByName(name);
    else if (job) result = await findByJob(job);
    else result = await getAllUsers();

    res.send({ users_list: result });
  } catch (err) {
    res.status(500).send(String(err));
  }
});

// GET /users/:id
app.get("/users/:id", async (req, res) => {
  try {
    const doc = await findById(req.params.id);
    if (!doc) return res.status(404).send("Resource not found.");
    res.send(doc);
  } catch (err) {
    if (err?.name === "CastError") return res.status(400).send("Invalid id.");
    res.status(500).send(String(err));
  }
});

// POST /users -> 201 Created + return created doc (with _id)
app.post("/users", async (req, res) => {
  try {
    const { name, job } = req.body || {};
    if (!name || !job) return res.status(400).send("name and job are required");
    const created = await createUser({ name, job });
    res.status(201).send(created);
  } catch (err) {
    res.status(400).send(String(err));
  }
});

// DELETE /users/:id -> 204 or 404
app.delete("/users/:id", async (req, res) => {
  try {
    const deleted = await deleteById(req.params.id);
    if (!deleted) return res.status(404).send("Resource not found.");
    res.status(204).send();
  } catch (err) {
    if (err?.name === "CastError") return res.status(400).send("Invalid id.");
    res.status(500).send(String(err));
  }
});

// Start only after DB connects
connectDB()
  .then(() => {
    app.listen(port, () =>
      console.log(`Example app listening at http://localhost:${port}`)
    );
  })
  .catch((e) => {
    console.error("Mongo connect error:", e);
    process.exit(1);
  });
