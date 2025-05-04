const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const multer = require("multer");
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

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// SQLite database connection
const dbPath = path.join(__dirname, 'MaxShapez.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) return console.error('Database connection error:', err.message);
  console.log('Connected to the MaxShapez SQLite database.');
});

// Logging function
function logToFile(message) {
  const logFile = path.join(logsDir, `${new Date().toISOString().slice(0, 10)}.log`);
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
}

// Multer setup
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
});
const upload = multer({ storage });

// Upload endpoint
app.post("/upload", upload.single("zipFile"), (req, res) => {
  const { build, uploader } = req.body;
  const zipFilePath = req.file ? req.file.path : null;

  if (!zipFilePath) return res.status(400).send("ZIP file is required.");

  const uploadDateTime = new Date().toISOString();

  db.run(`INSERT INTO builds (build_name, uploader, upload_timestamp, file_path) VALUES (?, ?, ?, ?)`,
    [build, uploader, uploadDateTime, zipFilePath],
    function (err) {
      if (err) {
        logToFile(`DB ERROR: ${err.message}`);
        return res.status(500).send("Failed to save build to database.");
      }

      const dataToSave = {
        build,
        uploader,
        zipFilePath,
        uploadDateTime
      };
      const jsonFilename = `${build}.json`;
      const jsonPath = path.join(uploadDir, jsonFilename);
      fs.writeFileSync(jsonPath, JSON.stringify(dataToSave, null, 2));

      logToFile(`UPLOAD SUCCESS: ${uploader} uploaded build '${build}'`);
      res.send("Upload successful! Data saved.");
    });
});

// Download endpoint
app.get('/download', async (req, res) => {
  const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  try {
    const dirName = req.query.dir;
    if (!dirName) {
      const msg = `Missing 'dir' parameter from ${clientIP}`;
      logToFile(`ERROR: ${msg}`);
      return res.status(400).send('Error: Directory name is required. Use ?dir=your_folder_name');
    }

    const dirPath = path.join(__dirname, dirName);
    if (!fs.existsSync(dirPath) || !fs.lstatSync(dirPath).isDirectory()) {
      const msg = `Directory not found or invalid: ${dirPath} (from ${clientIP})`;
      logToFile(`ERROR: ${msg}`);
      return res.status(404).send('Error: Directory not found');
    }

    const zipFileName = `${dirName}.zip`;
    logToFile(`DOWNLOAD START: ${clientIP} requested '${dirName}'`);

    res.setHeader('Content-Disposition', `attachment; filename=${zipFileName}`);
    res.setHeader('Content-Type', 'application/zip');

    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', (err) => {
      logToFile(`ARCHIVE ERROR: ${err.message} for ${dirName} (from ${clientIP})`);
      res.status(500).send('Error: Failed to create ZIP archive');
    });

    archive.on('end', () => {
      logToFile(`DOWNLOAD COMPLETE: ${clientIP} successfully downloaded '${dirName}'`);
    });

    archive.pipe(res);
    archive.directory(dirPath, false);
    archive.finalize();
  } catch (err) {
    const errorMsg = `UNEXPECTED ERROR: ${err.stack || err.message} from ${clientIP}`;
    logToFile(errorMsg);
    res.status(500).send('Error: Internal Server Error');
  }
});

// API to get all builds
app.get('/builds', (req, res) => {
  db.all('SELECT * FROM builds ORDER BY upload_timestamp DESC', [], (err, rows) => {
    if (err) {
      logToFile(`DB ERROR: ${err.message}`);
      return res.status(500).send("Failed to fetch builds from database.");
    }
    res.json(rows);
  });
});

// Global error handler
app.use((err, req, res, next) => {
  const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const errorMsg = `GLOBAL ERROR: ${err.stack || err.message} from ${clientIP}`;
  logToFile(errorMsg);
  res.status(500).send('Something went wrong globally.');
});

// Start the server
app.listen(PORT, '0.0.0.0', () => {
  const msg = `SERVER STARTED on port ${PORT}`;
  console.log(msg);
  logToFile(msg);
});
