with open('index.js','r',encoding='utf-8') as f: s=f.read()
s = s.replace('\0','')
# Find last good closing pattern and cut garbage
last_good = s.rfind('  })\n}')
if last_good != -1:
    s = s[:last_good+6]
open('index.js','w',encoding='utf-8').write(s)
print('Fixed index.js length:', len(s))
