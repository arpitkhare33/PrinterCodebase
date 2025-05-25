const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const multer = require('multer');
const sqlite3 = require('sqlite3').verbose();
const basicAuth = require('express-basic-auth');

const app = express();
const PORT = 3000;

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Basic Authentication Middleware (applies to all routes and static files)
app.use(basicAuth({
  users: {
    'arpitkhare33@gmail.com': 'Admin@123',
    'rahulmehta@gmail.com': 'Admin@123'
  },
  challenge: true
}));

// Create logs directory if not exists
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Logging function
function logToFile(message) {
  const logFile = path.join(logsDir, `${new Date().toISOString().slice(0, 10)}.log`);
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
}

// Initialize SQLite DB
const dbPath = path.join(__dirname, 'MaxShapez.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) return console.error('DB Connection Error:', err.message);
  console.log('Connected to MaxShapez database.');
});

// Ensure tables exist
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
  build_number TEXT,
  description TEXT,
  uploaded_by TEXT,
  upload_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  file_path TEXT,
  printer_type TEXT,
  sub_type TEXT,
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

// Upload setup
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});

const upload = multer({ storage });

// Serve static files (e.g., upload.html) after basicAuth
app.use(express.static(__dirname));

// Upload endpoint
app.post('/upload', upload.single('zipFile'), (req, res) => {
  const { build, uploader, build_number, description, printer_type, sub_type, make } = req.body;
  const zipFilePath = req.file ? req.file.path : null;
  if (!zipFilePath) return res.status(400).send('ZIP file is required.');

  const stmt = `INSERT INTO Builds (name, build_number, description, uploaded_by, file_path, printer_type, sub_type, make) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
  db.run(stmt, [build, build_number, description, uploader, zipFilePath, printer_type, sub_type, make], function(err) {
    if (err) return res.status(500).send('Database insert error.');
    res.send('Upload successful! Build saved.');
  });
});

// Download endpoint
app.post('/download', (req, res) => {
  const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const { printer_id, printer_type, sub_type, make, build_number } = req.body;
  if (!printer_type || !sub_type || !make || !printer_id || !build_number) {
    logToFile(`ERROR: Missing parameters for download from ${clientIP}`);
    return res.status(400).send("Missing required parameters");
  }

  const stmt = `SELECT id, file_path FROM Builds WHERE printer_type = ? AND sub_type = ? AND make = ? AND build_number = ? ORDER BY upload_time DESC LIMIT 1`;
  db.get(stmt, [printer_type, sub_type, make, build_number], (err, row) => {
    if (err) {
      logToFile(`DB ERROR: ${err.message} (${clientIP})`);
      return res.status(500).send('Database error');
    }
    if (!row) {
      logToFile(`NOT FOUND: No build for ${printer_type}/${sub_type}/${make}/${build_number} (${clientIP})`);
      return res.status(404).send('No build found');
    }

    const filePath = path.resolve(row.file_path);
    if (!fs.existsSync(filePath)) {
      logToFile(`FILE MISSING: ${filePath} (${clientIP})`);
      return res.status(404).send('File not found');
    }

    const insertDownload = `INSERT INTO Downloads (printer_id, build_id, status) VALUES (?, ?, 'initiated')`;
    db.run(insertDownload, [printer_id, row.id], function (err) {
      if (err) {
        logToFile(`DOWNLOAD LOGGING ERROR: ${err.message} (${clientIP})`);
      }

      const fileName = path.basename(filePath);
      res.setHeader('Content-Disposition', `attachment; filename=${fileName}`);
      res.setHeader('X-Build-ID', row.id);

      res.download(filePath, fileName, (err) => {
        if (err) {
          logToFile(`DOWNLOAD ERROR: ${err.message} (${clientIP})`);
          res.status(500).send('Download failed');
        } else {
          logToFile(`DOWNLOAD SUCCESS: ${fileName} (${clientIP})`);
        }
      });
    });
  });
});

// Get all builds
app.get('/builds', (req, res) => {
  const stmt = `SELECT * FROM Builds ORDER BY upload_time DESC`;
  db.all(stmt, [], (err, rows) => {
    if (err) return res.status(500).send('Failed to fetch builds.');
    res.json(rows);
  });
});

// Get downloads by printer
app.get('/downloads/:printer_id', (req, res) => {
  const { printer_id } = req.params;
  const stmt = `SELECT * FROM Downloads WHERE printer_id = ? ORDER BY download_time DESC`;
  db.all(stmt, [printer_id], (err, rows) => {
    if (err) return res.status(500).send('Failed to fetch downloads.');
    res.json(rows);
  });
});

// Delete a build by ID
app.delete('/builds/:id', (req, res) => {
  const buildId = req.params.id;

  // First get the file path for the build to delete the file
  const selectStmt = `SELECT file_path FROM Builds WHERE id = ?`;
  db.get(selectStmt, [buildId], (err, row) => {
    if (err) {
      logToFile(`DB ERROR (select for delete): ${err.message}`);
      return res.status(500).send('Database error.');
    }

    if (!row) {
      return res.status(404).send('Build not found.');
    }

    const filePath = row.file_path;

    // Delete the file from the filesystem
    if (filePath && fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (fileErr) {
        logToFile(`FILE DELETE ERROR: ${fileErr.message}`);
        // Continue to delete DB record even if file delete fails
      }
    }

    // Now delete the DB record
    const deleteStmt = `DELETE FROM Builds WHERE id = ?`;
    db.run(deleteStmt, [buildId], function(deleteErr) {
      if (deleteErr) {
        logToFile(`DB ERROR (delete): ${deleteErr.message}`);
        return res.status(500).send('Failed to delete build.');
      }

      res.send('Build deleted successfully.');
    });
  });
});

// Error handling
app.use((err, req, res, next) => {
  const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  logToFile(`GLOBAL ERROR: ${err.stack || err.message} from ${clientIP}`);
  res.status(500).send('Internal Server Error');
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  logToFile(`SERVER STARTED on port ${PORT}`);
  console.log(`Server running on port ${PORT}`);
});
