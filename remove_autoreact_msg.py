with open('index.js','r',encoding='utf-8') as f:
    lines = f.read().split('\n')
with open('index.js','w',encoding='utf-8') as f:
    for i, line in enumerate(lines):
        if 'Autoreact activo' in line:
            continue
        f.write(line + '\n')
print('line removed')
