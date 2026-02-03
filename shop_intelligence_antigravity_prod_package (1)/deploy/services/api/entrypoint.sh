#!/usr/bin/env sh
set -e

# If the repo expects an npm start script, use it; otherwise fall back to node src/server.js
if npm run | grep -qE '^  start'; then
  exec npm run start
fi

if [ -f "src/server.js" ]; then
  exec node src/server.js
fi

echo "ERROR: Could not determine how to start the API. Please check package.json scripts or entrypoint."
exit 1
