const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const db = new sqlite3.Database('prices.db');

// Paste your CSV data here as a string
const csvData = `SKU,ID,company,Tour,Adult Net,Child Net,Remark
HKT0001,194613P7,PSSS,"Premium Bamboo Rafting, Elephant Trekking & ATV Adventure","฿1,300.00","฿1,200.00",
HKT0002,,,Phuket Elephant Swims in Sea Tour,฿600.00,฿600.00,
HKT0003,5503058P10,SPBA,Half Day Phuket City Tour,฿500.00,฿400.00,Morning and Afternoon
HKT0003,5503058P10,SPBA,Half Day Phuket City Tour + ATV,฿700.00,฿500.00,Morning and Afternoon
HKT0004,,,One day Phuket City Tour & Cooking Class,"฿1,550.00",฿880.00,
HKT0005,5503058P14,See Sea Sky,Half day Khai Island by Speed boat,฿550.00,฿400.00,Morning and Afternoon
HKT0006,194613P6,BJ,James Bond Island By Speedboat,"฿1,100.00","฿1,000.00",
HKT0007,194613P13,BJ,James Bond Island By Big Boat,฿900.00,฿800.00,
HKT0008,,,"Phi Phi, Green and Khai Islands by Speedboat",,,
HKT0009,,PFAN,Phuket FantaSea Show Only,"฿1,350.00","฿1,350.00",Transfer 250 per Person
HKT0009,,PFAN,Phuket FantaSea Show + Gold seat,"฿1,650.00","฿1,650.00",Transfer 250 per Person
HKT0009,,PFAN,Phuket FantaSea Show + Dinner,"฿1,650.00","฿1,650.00",Transfer 250 per Person
HKT0009,,PFAN,Phuket FantaSea Show + Dinner + Gold seat,"฿1,950.00","฿1,950.00",Transfer 250 per Person
HKT0010,194613P12,PNIK,Coral Island and Racha Island by Speedboat,฿899.00,฿799.00,
HKT0011,194613P26,PLOV,Premium Similan Island by Speedboat,"฿1,700.00","฿1,400.00", +100 Khaolak / +300 Phuket Transfer
HKT0011,194613P26,PLOV,Premium Similan Island by Speedboat From Phuket,"฿2,000.00","฿1,700.00", +100 Khaolak / +300 Phuket Transfer
HKT0011,194613P26,PLOV,Premium Similan Island by Speedboat From Khao Lak,"฿1,800.00","฿1,500.00", +100 Khaolak / +300 Phuket Transfer
HKT0012,,PLOV,Premium Surin Island by Speedboat,"฿2,000.00","฿1,600.00", +100 Khaolak / +300 Phuket Transfer
HKT0012,,PLOV,Premium Surin Island by Speedboat from Phuket,"฿2,300.00","฿1,900.00", +100 Khaolak / +300 Phuket Transfer
HKT0012,,PLOV,Premium Surin Island by Speedboat from Khaolak,"฿2,100.00","฿1,700.00", +100 Khaolak / +300 Phuket Transfer
HKT0013,,,Daytrip Rok & Haa Island by Speedboat,"฿2,300.00","฿1,700.00",
HKT0014,,,Tiger Kingdom and Half day city tour,"฿1,100.00",฿900.00,
HKT0015,194613P44,,Hype Luxury Boat Club,"฿2,700.00","฿1,500.00",Transfer 400THB/Person
HKT0015,194613P44,,Hype Luxury Boat Club w/ Transfer,"฿2,900.00","฿1,600.00",
HKT0016,194613P11,PSSS,"White Water Rafting 5 km, Flying Fox, ATV","฿1,200.00","฿1,100.00",
HKT0017,,,Day trip to Maiton Island by Speedboat,,,
HKT0018,,,Hong Island by Starlight John Gray’s Sea Canoe ,"฿2,960.00","฿1,480.00",
HKT0019,,,Bangla Boxing stadium Real fight,,,
HKT0020,194613P21,Nikorn,Phuket Coral Island by Speed boat,฿950.00,฿650.00,
HKT0021,194613P8,PATV,ATV or Buggy to Jungle Phuket & Big Buddha Adventure - 1H ATV,฿700.00,฿500.00,
HKT0021,194613P8,PATV,ATV or Buggy to Jungle Phuket & Big Buddha Adventure - 1.5H ATV,"฿1,000.00",฿800.00,
HKT0021,194613P8,PATV,ATV or Buggy to Jungle Phuket & Big Buddha Adventure - 2H ATV,"฿1,200.00","฿1,000.00",
HKT0021,194613P8,PATV,ATV or Buggy to Jungle Phuket & Big Buddha Adventure - 1H Buggy,"฿1,200.00",฿800.00,
HKT0021,194613P8,PATV,ATV or Buggy to Jungle Phuket & Big Buddha Adventure - 1.5H Buggy,"฿1,800.00","฿1,200.00",
`;

function parseBaht(value) {
  if (!value) return null;
  // Remove Thai Baht symbol, commas, and whitespace
  return parseFloat(value.replace(/[^\d.\-]/g, '')) || null;
}

function parseCSV(data) {
  const lines = data.split(/\r?\n/).filter(line => line.trim());
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    // Handle quoted fields with commas
    const regex = /(?:"([^"]*)")|([^,]+)/g;
    const row = [];
    let match;
    let lastIndex = 0;
    while ((match = regex.exec(line)) !== null) {
      if (match[1] !== undefined) {
        row.push(match[1]);
      } else if (match[2] !== undefined) {
        row.push(match[2]);
      }
      lastIndex = regex.lastIndex;
    }
    // Fill missing columns
    while (row.length < headers.length) row.push('');
    return headers.reduce((obj, h, i) => {
      obj[h] = row[i] || '';
      return obj;
    }, {});
  });
}

const rows = parseCSV(csvData);

db.serialize(() => {
  const stmt = db.prepare(`INSERT INTO prices (SKU, tour_id, company, tour, adult_net, child_net, remark) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  rows.forEach(row => {
    stmt.run(
      row['SKU'] || null,
      row['ID'] || null,
      row['company'] || null,
      row['Tour'] || null,
      parseBaht(row['Adult Net']),
      parseBaht(row['Child Net']),
      row['Remark'] || null
    );
  });
  stmt.finalize();
  console.log('Imported', rows.length, 'rows into prices.db');
  db.close();
});

// Usage: node import-prices.js 