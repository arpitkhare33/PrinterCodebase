import os
import shutil
import requests
import zipfile
from datetime import datetime

# ========== CONFIG ==========

SERVER_URL = "http://142.93.218.85:3000/download?dir=v1"
ZIP_FILE = "update.zip"

BUILD_FOLDER = "build"
BACKUP_FOLDER = "backup"

# ========== UTILS ==========

def log(msg):
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {msg}")

# ========== MAIN ==========

try:
    # 1. Download ZIP
    log("Downloading zip file...")
    response = requests.get(SERVER_URL, stream=True)
    response.raise_for_status()

    with open(ZIP_FILE, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            f.write(chunk)

    log("ZIP file downloaded.")

    # 2. Create backup folder if not exists
    if not os.path.exists(BACKUP_FOLDER):
        os.makedirs(BACKUP_FOLDER)
        log("Created 'backup' folder.")

    # 3. Move all files from build to backup
    if os.path.exists(BUILD_FOLDER):
        for filename in os.listdir(BUILD_FOLDER):
            src = os.path.join(BUILD_FOLDER, filename)
            dst = os.path.join(BACKUP_FOLDER, filename)
            shutil.move(src, dst)
            log(f"Moved {filename} to backup folder.")
    else:
        os.makedirs(BUILD_FOLDER)
        log("Created 'build' folder.")

    # 4. Extract zip into build folder
    with zipfile.ZipFile(ZIP_FILE, 'r') as zip_ref:
        zip_ref.extractall(BUILD_FOLDER)
        log(f"Extracted zip contents to '{BUILD_FOLDER}'.")

    # 5. Clean up zip file
    os.remove(ZIP_FILE)
    log("Deleted downloaded zip file.")

    log("✅ Update complete.")

except Exception as e:
    log(f"❌ ERROR: {str(e)}")
