import Database from "better-sqlite3";
const d = new Database("data/research.db");
console.log(d.prepare("SELECT name FROM sqlite_master WHERE type='table'").all());
d.close();
