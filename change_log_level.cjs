const fs = require('fs');
let c = fs.readFileSync('index.js', 'utf8');

// Change LOG_LEVEL to 'info' for debugging
const pattern = "export const LOG_LEVEL = 'silent'";
const replacement = "export const LOG_LEVEL = 'info'";

if (c.includes(pattern)) {
  c = c.replace(pattern, replacement);
  fs.writeFileSync('index.js', c);
  console.log('Changed LOG_LEVEL to info');
} else {
  console.log('Pattern not found');
  // Try finding LOG_LEVEL
  const lines = c.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('LOG_LEVEL')) {
      console.log('Found at line', i + 1, ':', lines[i]);
    }
  }
}