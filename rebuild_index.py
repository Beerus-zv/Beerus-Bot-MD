with open('orig_recovered.js','r',encoding='utf-8') as f:
    s = f.read()
# Find start of middleware: '        // ── Autoreact: reacción aleatoria'
start_idx = s.find('        // ── Autoreact: reacción aleatoria')
# Find start of autodetect middleware after it
end_idx = s.find('        if (msg.messageStubType && jid?.endsWith', start_idx)
# Extract before and after, replacing middleware with comment
before = s[:start_idx]
after = s[end_idx:]
new_s = before + '        // ── Autoreact desactivado (solo comando .autoreact) \n        // No reacciona automáticamente; .autoreact muestra estado\n' + after
with open('index.js','w',encoding='utf-8') as f:
    f.write(new_s)
print('Rebuilt index.js from original, removed middleware')
