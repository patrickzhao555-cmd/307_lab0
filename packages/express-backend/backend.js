import express from "express";

const app = express();
const port = 8000;
app.use(express.json());

// In-memory data (not persisted)
const users = {
  users_list: [
    { id: "xyz789", name: "Charlie", job: "Janitor" },
    { id: "abc123", name: "Mac",     job: "Bouncer" },
    { id: "ppp222", name: "Mac",     job: "Professor" },
    { id: "yat999", name: "Dee",     job: "Aspring actress" },
    { id: "zap555", name: "Dennis",  job: "Bartender" }
  ]
};

app.get("/", (req, res) => {
  res.send("Hello World!");
});

// GET /users  (all users)
// helper
const findUserByName = (name) =>
  users["users_list"].filter((u) => u["name"] === name);

// GET /users and /users?name=Mac (and step 7 will add job filter too)
app.get("/users", (req, res) => {
  const { name, job } = req.query;

  let result = users["users_list"];

  if (name !== undefined) {
    result = result.filter((u) => u.name === name);
  }
  if (job !== undefined) {
    result = result.filter((u) => u.job === job);
  }

  res.send({ users_list: result });
});

const findUserById = (id) =>
  users["users_list"].find((u) => u["id"] === id);

app.get("/users/:id", (req, res) => {
  const id = req.params.id;
  const result = findUserById(id);
  if (result === undefined) {
    res.status(404).send("Resource not found.");
  } else {
    res.send(result);
  }
});

const addUser = (user) => {
  users["users_list"].push(user);
  return user;
};

app.post("/users", (req, res) => {
  const userToAdd = req.body;
  addUser(userToAdd);
  // 200 OK (empty body). You could also send back the user or 201 Created.
  res.send();
});


app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`);
});
