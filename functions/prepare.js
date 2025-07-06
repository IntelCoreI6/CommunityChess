const fs = require('fs');
const path = require('path');

// This script ensures the stockfish binary is executable.
const stockfishPath = path.join(__dirname, 'stockfish');

if (fs.existsSync(stockfishPath)) {
  try {
    // Set execute permissions (0o755 is rwxr-xr-x)
    fs.chmodSync(stockfishPath, 0o755);
    console.log('Successfully set execute permissions for Stockfish.');
  } catch (err) {
    console.error('Error setting permissions for Stockfish:', err);
    process.exit(1); // Exit with an error code
  }
} else {
  console.error('Stockfish binary not found at:', stockfishPath);
  process.exit(1); // Exit with an error code
}