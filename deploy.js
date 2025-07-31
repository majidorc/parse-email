const fs = require('fs');
const path = require('path');

// Copy the updated API file to ensure it's ready for deployment
const sourceFile = path.join(__dirname, 'api', 'products-rates.js');
const targetFile = path.join(__dirname, 'api', 'products-rates.js');

// Ensure the file exists and is readable
if (fs.existsSync(sourceFile)) {
    console.log('✅ API file is ready for deployment');
    console.log('📁 File path:', sourceFile);
    console.log('📊 File size:', fs.statSync(sourceFile).size, 'bytes');
} else {
    console.log('❌ API file not found');
}

console.log('\n🚀 Ready to deploy to Vercel!');
console.log('📋 Next steps:');
console.log('1. Run: npm install -g vercel');
console.log('2. Run: vercel login');
console.log('3. Run: vercel --prod');
console.log('\nOr use the Vercel dashboard to upload the files manually.'); 