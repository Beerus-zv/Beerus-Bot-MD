with open('index.js','rb') as f: data=f.read()
data = data.replace(b'\x00', b'')
with open('index.js','wb') as f: f.write(data)
print('Null bytes removed, length:', len(data))
