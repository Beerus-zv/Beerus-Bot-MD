with open('orig_recovered.js','r',encoding='utf-8') as f:
    orig = f.read().split('\n')
with open('index.js','r',encoding='utf-8') as f:
    current = f.read().split('\n')
start = None
for i, line in enumerate(orig):
    if 'DEBUG: PASO 6: ANTI-DELETE pasado' in line:
        start = i
        break
if start is not None:
    # Keep everything from start onward in orig but replace autoreact middleware with simple comment
    tail_lines = orig[start:]
    # Find line 'DEBUG: PASO 6: ANTI-DELETE pasado' in tail_lines (first)
    # We need to remove the old autoreact middleware (from start of middleware to before autodetect stub)
    # Find index of first line with 'if (!msg.key.fromMe' after start
    middleware_start = None
    for i, line in enumerate(tail_lines):
        if 'if (!msg.key.fromMe && modoChat(jid' in line:
            middleware_start = i
            break
    # Find the line before autodetect middleware starts: 'if (msg.messageStubType'
    middleware_end = None
    for i, line in enumerate(tail_lines):
        if 'if (msg.messageStubType' in line:
            middleware_end = i
            break
    # Replace middleware block with comment lines only
    new_tail = tail_lines[:middleware_start] if middleware_start is not None else tail_lines
    new_tail += ["        // Autoreact desactivado (solo comando .autoreact)", "        // No reacciona automáticamente; .autoreact muestra estado"]
    if middleware_end is not None:
        new_tail += tail_lines[middleware_end:]
    with open('index.js','w',encoding='utf-8') as f:
        # Write current lines up to 'DEBUG: PASO 6...' line (inclusive maybe)
        for line in current:
            if 'DEBUG: PASO 6: ANTI-DELETE pasado' in line:
                f.write(line + '\n')
        for line in new_tail[new_tail.index('DEBUG: PASO 6: ANTI-DELETE pasado')+1:] if 'DEBUG: PASO 6: ANTI-DELETE pasado' in new_tail else new_tail:
            # We want to keep from middleware_start replaced; simpler approach:
            pass
    # Actually simpler: just append the cleaned tail after the current file's last line, removing duplicate lines at end
    # Let's just append missing tail lines (excluding the broken middleware) to current file
    # Read current file fully
    pass