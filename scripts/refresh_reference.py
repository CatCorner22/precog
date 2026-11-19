#!/usr/bin/env python3
"""Regenerate the maintained blocks of a living-reference Markdown file.

Maintained blocks are delimited by HTML comments and are rewritten in place:
  <!-- toc:start --> ... <!-- toc:end -->            table of contents (from headings with IDs)
  <!-- sources:start --> ... <!-- sources:end -->    sources table (from the ## Sources ledger entries)
  <!-- authorities:start --> ... <!-- authorities:end -->  cite index: every [S#] with the section IDs where it appears
  <!-- index:start --> ... <!-- index:end -->        subject index (from {{index: term | alias; alias}} tags)
  <!-- health:start --> ... <!-- health:end -->      stale sections, undefined cite keys, orphan sources, broken IDs

Conventions the script relies on:
  * Headings carry a stable ID in square brackets:  ## [12.04] Duty of care — elements
  * A section may end with a line:  Last verified: YYYY-MM-DD
  * Sources ledger lines look like:  - [S12] Full citation. URL. Accessed YYYY-MM-DD. Grade: A.
  * Short cites in the body:  [S12] or [S12 at 4]
  * Index tags anywhere in a section:  {{index: preferred term | alias one; alias two}}
    A tag may use "see also": {{index: negligence | see also: duty of care}}
Usage: refresh_reference.py FILE.md [--stale-days 90] [--check]  (--check exits 1 if health has findings)
"""
import re, sys, datetime, collections

HEAD = re.compile(r'^(#{1,6})\s+\[([A-Za-z0-9][\w.\-]*)\]\s+(.*?)\s*$')
SRC = re.compile(r'^- \[(S\d+)\]\s+(.*)$')
CITE = re.compile(r'\[(S\d+)(?: at [^\]]+)?\]')
TAG = re.compile(r'\{\{index:\s*([^|}]+?)\s*(?:\|\s*([^}]*?))?\s*\}\}')
VERIFIED = re.compile(r'^Last verified:\s*(\d{4}-\d{2}-\d{2})', re.M)
ACCESSED = re.compile(r'Accessed (\d{4}-\d{2}-\d{2})')

def slug(text):
    t = re.sub(r'[^\w\- ]', '', text.lower()).strip().replace(' ', '-')
    return re.sub(r'-+', '-', t)

def parse(lines):
    sections = []  # dict(id, level, title, start, end, text)
    cur = None
    in_code = False
    in_block = False
    masked = []
    for ln in lines:  # blank out generated blocks so they are never re-scanned as content
        st = ln.strip()
        if re.fullmatch(r'<!-- \w+:start -->', st): in_block = True; masked.append(ln); continue
        if re.fullmatch(r'<!-- \w+:end -->', st): in_block = False
        masked.append('' if in_block else ln)
    for i, ln in enumerate(lines):
        if ln.startswith('```'):
            in_code = not in_code
        if in_code:
            continue
        m = HEAD.match(ln)
        if m:
            if cur: cur['end'] = i
            cur = dict(level=len(m.group(1)), id=m.group(2), title=m.group(3), start=i, end=len(lines))
            sections.append(cur)
    for s in sections:
        s['text'] = '\n'.join(lines[s['start']:s['end']])
        raw = '\n'.join(masked[s['start']:s['end']])
        s['scan'] = re.sub(r'`[^`\n]*`', '', re.sub(r'<!--.*?-->', '', raw, flags=re.S))
    return sections, masked

def replace_block(lines, name, body):
    start = f'<!-- {name}:start -->'; end = f'<!-- {name}:end -->'
    try:
        a = next(i for i, l in enumerate(lines) if l.strip() == start)
        b = next(i for i, l in enumerate(lines) if l.strip() == end and i > a)
    except StopIteration:
        return lines, False
    return lines[:a + 1] + body + lines[b:], True

def main():
    args = sys.argv[1:]
    if not args or args[0].startswith('-'):
        print(__doc__); sys.exit(2)
    path = args[0]
    stale_days = int(args[args.index('--stale-days') + 1]) if '--stale-days' in args else 90
    check = '--check' in args
    text = open(path, encoding='utf-8').read()
    lines = text.split('\n')
    sections, masked = parse(lines)
    today = datetime.date.today()

    # --- TOC
    toc = []
    for s in sections:
        if s['title'].lower() in ('contents', 'table of contents'): continue
        anchor = slug(f"{s['id']} {s['title']}")
        toc.append(f"{'  ' * (s['level'] - 2 if s['level'] > 1 else 0)}- [{s['id']} {s['title']}](#{anchor})")

    # --- Sources ledger
    sources = collections.OrderedDict()
    for ln in masked:
        m = SRC.match(ln)
        if m: sources[m.group(1)] = m.group(2)

    # --- Cite index (which sections cite which source)
    cited_in = collections.defaultdict(list)
    undefined = collections.defaultdict(list)
    for s in sections:
        body = s['scan']
        if s['title'].lower().startswith(('sources', 'cite index', 'authorities')):
            continue
        for key in sorted(set(CITE.findall(body)), key=lambda k: int(k[1:])):
            (cited_in if key in sources else undefined)[key].append(s['id'])
    auth = []
    for key in sorted(sources, key=lambda k: int(k[1:])):
        where = ', '.join(cited_in.get(key, [])) or '— (uncited)'
        short = sources[key].split('. ')[0][:90]
        auth.append(f"- [{key}] {short} → §{where}")

    # --- Subject index
    index = collections.defaultdict(set)      # term -> section ids
    see = {}                                  # alias -> preferred
    see_also = collections.defaultdict(set)   # term -> related terms
    for s in sections:
        for m in TAG.finditer(s['scan']):
            term = m.group(1).strip()
            index[term].add(s['id'])
            rest = m.group(2) or ''
            for part in [p.strip() for p in rest.split(';') if p.strip()]:
                if part.lower().startswith('see also:'):
                    for r in part[9:].split(','):
                        if r.strip(): see_also[term].add(r.strip())
                else:
                    see[part] = term
    idx_lines = []
    entries = sorted(set(index) | set(see), key=str.lower)
    letter = ''
    for term in entries:
        if term[0].upper() != letter:
            letter = term[0].upper(); idx_lines.append(f"\n**{letter}**")
        if term in see and term not in index:
            idx_lines.append(f"- {term} — *see* {see[term]}")
            continue
        locs = sorted(index[term])
        line = f"- **{term}** — " + ', '.join(f"§{l}" for l in locs)
        if see_also.get(term):
            line += f" · *see also* " + ', '.join(sorted(see_also[term]))
        if len(locs) > 7:
            line += "  ⚠ >7 locators: split into subentries"
        idx_lines.append(line)

    # --- Health
    health = []
    for s in sections:
        v = VERIFIED.search(s['text'])
        is_rule = s['level'] >= 3 or '**Rule.**' in s['text']
        if is_rule and not v:
            health.append(f"- §{s['id']} {s['title']}: no 'Last verified' line")
        if is_rule and '[cite needed]' in s['scan']:
            health.append(f"- §{s['id']} {s['title']}: [cite needed]")
        elif v:
            d = datetime.date.fromisoformat(v.group(1))
            if (today - d).days > stale_days:
                health.append(f"- §{s['id']} {s['title']}: last verified {v.group(1)} ({(today - d).days} days ago)")
    for key, secs in undefined.items():
        health.append(f"- Undefined cite key [{key}] used in §{', '.join(secs)}")
    for key in sources:
        if key not in cited_in:
            health.append(f"- Source [{key}] is never cited (orphan)")
    ids = [s['id'] for s in sections]
    for dup, n in collections.Counter(ids).items():
        if n > 1: health.append(f"- Duplicate section ID [{dup}] ×{n}")
    scan_all = '\n'.join(s['scan'] for s in sections)
    for ref in sorted(set(m.group(1).rstrip('.') for m in re.finditer(r'§([A-Za-z0-9][\w.\-]*)', scan_all))):
        if ref and ref not in ids and ref.upper() != 'ID':
            health.append(f"- Cross-reference to missing section §{ref}")
    if not health:
        health = ["- No findings."]
    stamp = f"_Refreshed {today.isoformat()}: {len(sections)} sections, {len(sources)} sources, {len(index)} index terms._"

    out, hits = lines, []
    for name, body in [('toc', toc), ('authorities', auth), ('index', idx_lines), ('health', [stamp] + health)]:
        out, ok = replace_block(out, name, body)
        hits.append((name, ok))
    new = '\n'.join(out)
    if new != text:
        open(path, 'w', encoding='utf-8').write(new)
    print(stamp)
    for name, ok in hits:
        print(f"  {name}: {'updated' if ok else 'no block found (add <!-- %s:start --> / <!-- %s:end -->)' % (name, name)}")
    if health != ["- No findings."]:
        print("  health findings:"); print('\n'.join('   ' + h for h in health))
        if check: sys.exit(1)

if __name__ == '__main__':
    main()
