import express from "express";
import cors from "cors";
import sqlite3 from "sqlite3";
import { open } from "sqlite";

const app = express();
const PORT = 4000;

app.use(cors());
app.use(express.json());

// buka database SQLite
const dbPromise = open({
  filename: "./uangjajan.db",
  driver: sqlite3.Database,
});

// buat tabel jika belum ada
(async () => {
  const db = await dbPromise;
  await db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      date TEXT NOT NULL,
      amount INTEGER NOT NULL,
      kind TEXT CHECK(kind IN ('pemasukan', 'pengeluaran')) NOT NULL
    )
  `);
})();

// GET semua entries
app.get("/entries", async (req, res) => {
  const db = await dbPromise;
  const rows = await db.all("SELECT * FROM entries ORDER BY id DESC");
  res.json(rows);
});

// POST tambah entry
app.post("/entries", async (req, res) => {
  const { name, date, amount, kind } = req.body;
  if (!name || !date || !amount || !kind) {
    return res.status(400).json({ error: "Data tidak lengkap" });
  }
  const db = await dbPromise;
  const result = await db.run(
    "INSERT INTO entries (name, date, amount, kind) VALUES (?, ?, ?, ?)",
    [name, date, amount, kind]
  );
  const newEntry = await db.get("SELECT * FROM entries WHERE id = ?", [
    result.lastID,
  ]);
  res.json(newEntry);
});

// DELETE hapus entry
app.delete("/entries/:id", async (req, res) => {
  const db = await dbPromise;
  await db.run("DELETE FROM entries WHERE id = ?", req.params.id);
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`✅ Server jalan di http://localhost:${PORT}`);
});
