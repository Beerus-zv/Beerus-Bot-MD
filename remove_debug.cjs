const fs = require('fs');
let c = fs.readFileSync('index.js', 'utf8');

const pattern = '      console.log("[DEBUG] Mensaje recibido:", { jid: msg.key.remoteJid, id: msg.key.id, fromMe: msg.key.fromMe, participant: msg.key.participant, hasMessage: !!msg.message });\r\n';

if (c.includes(pattern)) {
  c = c.replace(pattern, '');
  fs.writeFileSync('index.js', c);
  console.log('Debug removed OK');
} else {
  console.log('Pattern not found');
  // Try without \r
  const pattern2 = '      console.log("[DEBUG] Mensaje recibido:", { jid: msg.key.remoteJid, id: msg.key.id, fromMe: msg.key.fromMe, participant: msg.key.participant, hasMessage: !!msg.message });\n';
  if (c.includes(pattern2)) {
    c = c.replace(pattern2, '');
    fs.writeFileSync('index.js', c);
    console.log('Debug removed OK (LF)');
  } else {
    console.log('Pattern2 not found either');
  }
}