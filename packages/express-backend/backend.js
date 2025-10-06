import express from "express";
import cors from "cors";

const app = express();
const port = 8000;

app.use(cors());

app.use(express.json());

const users = {
  users_list: [
    { id: "xyz789", name: "Charlie", job: "Janitor" },
    { id: "abc123", name: "Mac",     job: "Bouncer" },
    { id: "ppp222", name: "Mac",     job: "Professor" },
    { id: "yat999", name: "Dee",     job: "Aspring actress" },
    { id: "zap555", name: "Dennis",  job: "Bartender" }
  ]
};

function genId() {
  return Math.random().toString(36).slice(2, 8);
}

app.get("/", (req, res) => {
  res.send("Hello World!");
});

app.get("/users", (req, res) => {
  const { name, job } = req.query;
  let result = users.users_list;
  if (name !== undefined) result = result.filter(u => u.name === name);
  if (job  !== undefined) result = result.filter(u => u.job  === job);
  res.send({ users_list: result });
});

app.get("/users/:id", (req, res) => {
  const found = users.users_list.find(u => u.id === req.params.id);
  if (!found) return res.status(404).send("Resource not found.");
  res.send(found);
});

app.post("/users", (req, res) => {
  const incoming = req.body || {};
  const user = {
    id: genId(),
    name: incoming.name ?? "",
    job:  incoming.job  ?? ""
  };
  users.users_list.push(user);
  res.status(201).send(user);
});

app.delete("/users/:id", (req, res) => {
  const before = users.users_list.length;
  users.users_list = users.users_list.filter(u => u.id !== req.params.id);
  if (users.users_list.length === before)
    return res.status(404).send("Resource not found.");
  res.status(204).send();
});

app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
