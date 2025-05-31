const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

function logToFile(message) {
  const logFile = path.join(logsDir, `${new Date().toISOString().slice(0, 10)}.log`);
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
}

// SQLite database setup
const dbPath = path.join(__dirname, 'MaxShapez.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) return console.error('DB Connection Error:', err.message);
  console.log('Connected to MaxShapez database.');
});

// Create tables if they don't exist
const createTablesSQL = `
CREATE TABLE IF NOT EXISTS PrinterTypes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT
);

CREATE TABLE IF NOT EXISTS Printers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type_id INTEGER NOT NULL,
  ip_address TEXT,
  location TEXT,
  status TEXT DEFAULT 'offline',
  last_seen DATETIME,
  FOREIGN KEY(type_id) REFERENCES PrinterTypes(id)
);

CREATE TABLE IF NOT EXISTS Builds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  version TEXT,
  description TEXT,
  uploaded_by TEXT,
  upload_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  file_path TEXT,
  printer_type TEXT,
  sub_type TEXT,
  size TEXT,
  make TEXT
);

CREATE TABLE IF NOT EXISTS Downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  printer_id INTEGER,
  build_id INTEGER,
  download_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  status TEXT DEFAULT 'initiated',
  error_message TEXT,
  FOREIGN KEY(printer_id) REFERENCES Printers(id),
  FOREIGN KEY(build_id) REFERENCES Builds(id)
);

CREATE TABLE IF NOT EXISTS Logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  printer_id INTEGER,
  message TEXT,
  level TEXT DEFAULT 'INFO',
  FOREIGN KEY(printer_id) REFERENCES Printers(id)
);
`;

db.exec(createTablesSQL, (err) => {
  if (err) return console.error('Error creating tables:', err.message);
  console.log('Tables ensured.');
});

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({ storage });

app.post('/upload', upload.single('zipFile'), (req, res) => {
  const { build, uploader, version, description, printer_type, sub_type, make } = req.body;
  const zipFilePath = req.file ? req.file.path : null;
  const fileSize = req.file.size;
  const fileSizeInMB = (fileSizeInBytes / (1024 * 1024)).toFixed(2);
  if (!zipFilePath) return res.status(400).send('ZIP file is required.');
  const upload_time = getISTTimestamp();

  const stmt = `INSERT INTO Builds (name, version, description, uploaded_by, file_path, printer_type, sub_type, size, make, upload_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(stmt, [build, version, description, uploader, zipFilePath, printer_type, sub_type, fileSizeInMB, make, upload_time], function(err) {
    if (err) return res.status(500).send('Database insert error.');
    res.send('Upload successful! Build saved.');
  });
});

app.post('/download', (req, res) => {
  const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const { printer_type, sub_type, make , build_number} = req.body;
  if (!printer_type || !sub_type || !make || !build_number) {
    logToFile(`ERROR: Missing parameters for download from ${clientIP}`);
    return res.status(400).send("Missing 'printer_type', 'sub_type' or 'make' or 'build_number");
  }

  const stmt = `SELECT file_path FROM Builds WHERE printer_type = ? AND sub_type = ? AND make = ? AND
                version = ? ORDER BY upload_time DESC LIMIT 1`;
  db.get(stmt, [printer_type, sub_type, make, build_number], (err, row) => {
    if (err) {
      logToFile(`DB ERROR: ${err.message} (${clientIP})`);
      return res.status(500).send('Database error');
    }
    if (!row) {
      logToFile(`NOT FOUND: No build for ${printer_type}/${sub_type}/${make}/ ${build_number} (${clientIP})`);
      return res.status(404).send('No build found');
    }

    const filePath = path.resolve(row.file_path);
    if (!fs.existsSync(filePath)) {
      logToFile(`FILE MISSING: ${filePath} (${clientIP})`);
      return res.status(404).send('File not found');
    }

    res.download(filePath, path.basename(filePath), (err) => {
      if (err) {
        logToFile(`DOWNLOAD ERROR: ${err.message} (${clientIP})`);
        res.status(500).send('Download failed');
      } else {
        logToFile(`DOWNLOAD SUCCESS: ${path.basename(filePath)} (${clientIP})`);
      }
    });
  });
});

app.get('/builds', (req, res) => {
  const stmt = `SELECT * FROM Builds ORDER BY upload_time DESC`;
  db.all(stmt, [], (err, rows) => {
    if (err) return res.status(500).send('Failed to fetch builds.');
    res.json(rows);
  });
});
app.delete('/builds/:id', (req, res) => {
  const buildId = req.params.id;
  const getStmt = `SELECT file_path FROM Builds WHERE id = ?`;

  db.get(getStmt, [buildId], (err, row) => {
    if (err) return res.status(500).send('Database error.');
    if (!row) return res.status(404).send('Build not found.');

    // Delete file from disk
    if (fs.existsSync(row.file_path)) {
      fs.unlinkSync(row.file_path);
    }

    const delStmt = `DELETE FROM Builds WHERE id = ?`;
    db.run(delStmt, [buildId], function (err) {
      if (err) return res.status(500).send('Failed to delete from database.');
      res.send('Build deleted successfully.');
    });
  });
});
function getISTTimestamp() {
  const now = new Date();
  // convert to IST by adding 5.5 hours in ms
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istTime = new Date(now.getTime() + istOffset);
  return istTime.toISOString().replace('T', ' ').slice(0, 19);
}

app.use((err, req, res, next) => {
  const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  logToFile(`GLOBAL ERROR: ${err.stack || err.message} from ${clientIP}`);
  res.status(500).send('Internal Server Error');
});

app.listen(PORT, '0.0.0.0', () => {
  logToFile(`SERVER STARTED on port ${PORT}`);
  console.log(`Server running on port ${PORT}`);
});