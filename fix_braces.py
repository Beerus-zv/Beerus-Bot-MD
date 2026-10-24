with open('index.js','r',encoding='utf-8') as f: s=f.read()
open_b = s.count('{')
close_b = s.count('}')
if open_b > close_b:
    s += '\n' + '}'.join([''] * (open_b - close_b))
    open('index.js','w',encoding='utf-8').write(s)
    print('Fixed braces, added', open_b - close_b)
else:
    print('Braces balanced:', open_b)
