import React from "react";

function TableHeader() {
  return (
    <thead>
      <tr>
        <th>ID</th>
        <th>Name</th>
        <th>Job</th>
        <th>Remove</th>
      </tr>
    </thead>
  );
}

function TableBody({ characterData, removeCharacter }) {
  return (
    <tbody>
      {characterData.map((row) => (
        <tr key={row._id ?? `${row.name}-${row.job}`}>
          <td>{row._id}</td>
          <td>{row.name}</td>
          <td>{row.job}</td>
          <td>
            <button onClick={() => removeCharacter(row._id)}>Delete</button>
          </td>
        </tr>
      ))}
    </tbody>
  );
}

export default function Table(props) {
  return (
    <table>
      <TableHeader />
      <TableBody
        characterData={props.characterData}
        removeCharacter={props.removeCharacter}
      />
    </table>
  );
}