const express = require('express');
const cors = require('cors');

const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const app = express();
const PORT = 3000;
// ✅ Enable CORS for all routes
app.use(cors());
app.get('/download', (req, res) => {
  const dirName = req.query.dir;

  if (!dirName) {
    return res.status(400).send('Directory name is required. Use ?dir=your_folder_name');
  }

  const dirPath = path.join(__dirname, dirName);

  // Check if directory exists
  if (!fs.existsSync(dirPath)) {
    return res.status(404).send('Directory not found');
  }

  // Set headers for downloading
  res.setHeader('Content-Disposition', `attachment; filename=${dirName}.zip`);
  res.setHeader('Content-Type', 'application/zip');

  // Create zip stream
  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);

  archive.directory(dirPath, false);
  archive.finalize();
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
