import express from "express";
import cors from "cors";
import {
  connectDB,
  getAllUsers,
  findByName,
  findByJob,
  findByNameAndJob,
  findById,
  createUser,
  deleteById
} from "./user-services.js";

const app = express();
const port = 8000;

app.use(cors());
app.use(express.json());

/* connect once on startup (ok to not await: Mongoose buffers commands) */
connectDB().catch((e) => console.error("Mongo connect error:", e));

app.get("/", (_req, res) => res.send("Hello World!"));

/* GET /users  (+ ?name=... &/or ?job=...) */
app.get("/users", (req, res) => {
  const { name, job } = req.query;
  let q;
  if (name && job)      q = findByNameAndJob(name, job);
  else if (name)        q = findByName(name);
  else if (job)         q = findByJob(job);
  else                  q = getAllUsers();

  q.then((list) => res.send({ users_list: list }))
   .catch((err) => res.status(500).send(String(err)));
});

/* GET /users/:id */
app.get("/users/:id", (req, res) => {
  findById(req.params.id)
    .then((doc) => {
      if (!doc) return res.status(404).send("Resource not found.");
      res.send(doc);
    })
    .catch((err) => res.status(500).send(String(err)));
});

/* POST /users -> 201 Created + return created doc (with _id) */
app.post("/users", (req, res) => {
  const { name, job } = req.body || {};
  createUser({ name, job })
    .then((created) => res.status(201).send(created))
    .catch((err) => res.status(400).send(String(err)));
});

/* DELETE /users/:id -> 204 or 404 */
app.delete("/users/:id", (req, res) => {
  deleteById(req.params.id)
    .then((doc) => {
      if (!doc) return res.status(404).send("Resource not found.");
      res.status(204).send();
    })
    .catch((err) => res.status(500).send(String(err)));
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
