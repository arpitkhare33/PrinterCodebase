const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');
const multer = require("multer");

const app = express();
const PORT = 3000;

app.use(cors());

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
}

// Helper function to log messages
function logToFile(message) {
  const logFile = path.join(logsDir, `${new Date().toISOString().slice(0, 10)}.log`);
  const timestamp = new Date().toISOString();
  fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
}

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

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
}

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    cb(null, `${timestamp}-${file.originalname}`);
  }
});
const upload = multer({ storage });

// Route to handle form upload
app.post("/upload", upload.single("zipFile"), (req, res) => {
  const { build, uploader } = req.body;
  const zipFilePath = req.file ? req.file.path : null;

  if (!zipFilePath) {
    return res.status(400).send("ZIP file is required.");
  }

  // Get upload timestamp
  const uploadDateTime = new Date().toISOString();

  const dataToSave = {
    build,
    uploader,
    zipFilePath,
    uploadDateTime
  };

  // Save to a JSON file
  const jsonFilename = `${build}.json`;
  const jsonPath = path.join(uploadDir, jsonFilename);
  fs.writeFileSync(jsonPath, JSON.stringify(dataToSave, null, 2));

  res.send("Upload successful! Data saved.");
});
// Fallback error handler
app.use((err, req, res, next) => {
  const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const errorMsg = `GLOBAL ERROR: ${err.stack || err.message} from ${clientIP}`;
  logToFile(errorMsg);
  res.status(500).send('Something went wrong globally.');
});

app.listen(PORT, '0.0.0.0', () => {
  const msg = `SERVER STARTED on port ${PORT}`;
  console.log(msg);
  logToFile(msg);
});
