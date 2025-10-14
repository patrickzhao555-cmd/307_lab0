import React, { useState, useEffect } from "react";
import Table from "./Table";
import Form from "./Form";

const BASE_URL = "http://localhost:8000";

export default function MyApp() {
  const [characters, setCharacters] = useState([]);

  function fetchUsers() {
    return fetch(`${BASE_URL}/users`);
  }
  function postUser(person) {
    return fetch(`${BASE_URL}/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(person),
    });
  }
  function deleteUser(id) {
    return fetch(`${BASE_URL}/users/${id}`, { method: "DELETE" });
  }

  useEffect(() => {
    fetchUsers()
      .then((res) => res.json())
      .then((json) => setCharacters(json["users_list"]))
      .catch((err) => console.log(err));
  }, []);

  function updateList(person) {
    postUser(person)
      .then((res) => {
        if (res.status !== 201) throw new Error(`Expected 201, got ${res.status}`);
        return res.json();
      })
      .then((created) => setCharacters((prev) => [...prev, created]))
      .catch((err) => console.log(err));
  }

  function removeOneCharacter(id) {
    deleteUser(id)
      .then((res) => {
        if (res.status === 204)
          setCharacters((prev) => prev.filter((c) => c._id !== id));
        else if (res.status === 404)
          console.log("Not found in backend");
        else
          console.log("Unexpected status:", res.status);
      })
      .catch((err) => console.log(err));
  }

  return (
    <div className="container">
      <Table
        characterData={characters}
        removeCharacter={removeOneCharacter}
      />
      <Form handleSubmit={updateList} />
    </div>
  );
}
