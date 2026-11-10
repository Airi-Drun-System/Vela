#!/bin/sh
cd "$(dirname "$0")/.."
npx esbuild src/app.js --bundle --format=iife --target=chrome110 --outfile=src/_hbundle.js --alias:firebase/app=./test/fake/app.js --alias:firebase/auth=./test/fake/auth.js --alias:firebase/firestore=./test/fake/firestore.js --log-level=warning
sed 's#<script src="bundle.js"></script>#<script src="_hbundle.js"></script><script src="../test/fake/seed.js"></script>#' src/index.html > src/_h.html
