const sqlite3 = require('sqlite3').verbose();

const db = new sqlite3.Database('prices.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      SKU TEXT,
      tour_id TEXT,
      company TEXT,
      tour TEXT,
      adult_net REAL,
      child_net REAL,
      remark TEXT
    )
  `, (err) => {
    if (err) {
      console.error('Error creating table:', err.message);
    } else {
      console.log('Table "prices" created or already exists.');
    }
    db.close();
  });
});

// Usage: node prices-init.js 