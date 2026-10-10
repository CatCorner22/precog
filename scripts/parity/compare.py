# Compares the print-only text of every layout the parity harness dumped
# (<id>-L<n>.html, from the base commit) with the branch's (<id>-L<n>.after.html)
# and prints one line per layout: SAME, or DIFF with the first differing text.
# Parts marked print:hidden are removed first, so a screen-only change is not a
# difference. Usage: python3 -I scripts/parity/compare.py <PARITY_DIR>
import re,glob,difflib,sys
def strip_hidden(h):
    out=h
    while True:
        m=re.search(r'<(\w+)[^>]*class="[^"]*print:hidden[^"]*"[^>]*>',out)
        if not m: break
        tag=m.group(1); i=m.end(); depth=1
        pat=re.compile(r'<(/?)'+tag+r'\b[^>]*>')
        while depth:
            n=pat.search(out,i)
            if not n: break
            depth += -1 if n.group(1) else 1
            i=n.end()
        out=out[:m.start()]+out[i:]
    return out
textOf=lambda h: re.sub(r'\|+','|',re.sub(r'<[^>]+>','|',h))
d=sys.argv[1]
for f in sorted(glob.glob(d+'/*.after.html')):
    id=f[:-11]
    b=textOf(strip_hidden(open(id+'.html').read())); a=textOf(strip_hidden(open(f).read()))
    print(id.split('/')[-1], 'SAME' if a==b else 'DIFF')
    if a!=b:
        for l in list(difflib.unified_diff(b.split('|'),a.split('|'),lineterm='',n=1))[2:40]: print('   ',l)
