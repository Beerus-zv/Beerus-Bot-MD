const fs = require('fs');
let c = fs.readFileSync('index.js', 'utf8');

// Add debug at the beginning of the message handler (after the for loop starts)
// Find: "for (const msg of messages) {" and add debug after it
const pattern = '    for (const msg of messages) {\r\n      try {';
const replacement = '    for (const msg of messages) {\r\n      console.log("[DEBUG] Mensaje recibido:", { jid: msg.key.remoteJid, id: msg.key.id, fromMe: msg.key.fromMe, participant: msg.key.participant, hasMessage: !!msg.message });\r\n      try {';

if (c.includes(pattern)) {
  c = c.replace(pattern, replacement);
  fs.writeFileSync('index.js', c);
  console.log('Debug added OK');
} else {
  console.log('Pattern not found');
  // Try without \r
  const pattern2 = '    for (const msg of messages) {\n      try {';
  if (c.includes(pattern2)) {
    c = c.replace(pattern2, replacement);
    fs.writeFileSync('index.js', c);
    console.log('Debug added OK (LF)');
  } else {
    console.log('Pattern2 not found either');
  }
}