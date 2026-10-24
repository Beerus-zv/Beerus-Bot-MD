with open('index.js','r',encoding='utf-8') as f: lines=f.read().split('\n')
# Find line with 'Autoreact desactivado' and keep until after next closing braces properly
new_lines = []
i = 0
while i < len(lines):
    line = lines[i]
    # Start removing from autoreact middleware leftover emoji array
    if "'❤️'," in line and i > 1220:
        # Skip this and following array lines until the closing ] and const emoji line and await line and } catch block
        # Instead, just skip until we reach the catch block closing properly
        # We'll jump ahead to the line with 'const emoji = EMOJIS' and then skip through to '}
        # Find index of 'const emoji = EMOJIS'
        j = i
        while j < len(lines) and 'const emoji = EMOJIS' not in lines[j]:
            j += 1
        # Now skip const emoji and await react line and closing braces after it
        # Let's find the next line that starts with '         }' (closing the if math.random block)
        j += 1  # skip const emoji line? Actually keep nothing from middleware
        # Just find the line '         }' that closes if (Math.random)
        while j < len(lines) and not (lines[j].strip() == '}' and lines[j].startswith('         ')):
            j += 1
        # Skip that closing brace too
        j += 1
        # Skip catch block lines: '           } catch (err) { ... }'
        # Find '           } catch (err) {'
        while j < len(lines) and 'catch (err)' not in lines[j]:
            j += 1
        # Skip catch line and its body lines until closing '         }'
        j += 1  # skip catch line
        while j < len(lines) and not (lines[j].strip() == '}' and lines[j].startswith('           ')):
            j += 1
        j += 1  # skip that closing brace
        # Skip final closing braces of middleware
        # The middleware starts with '        if (!msg.key.fromMe...' - we need to skip its closing braces
        # Skip until we find the next if (stub) or similar line
        while j < len(lines) and 'if (msg.messageStubType' not in lines[j]:
            j += 1
        i = j
        new_lines.append('        // ── Autoreact desactivado (solo comando .autoreact) ──')
        new_lines.append('        // No reacciona automáticamente; .autoreact muestra estado')
        continue
    else:
        new_lines.append(line)
    i += 1
with open('index.js','w',encoding='utf-8') as f:
    f.write('\n'.join(new_lines) + '\n')
print('Cleaned middleware leftovers')
