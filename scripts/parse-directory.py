"""Read public HTML from stdin and extract candidate metadata, never admissions rules."""
import json
import re
import sys
from urllib.parse import urljoin
from lxml import html

payload = json.loads(sys.stdin.buffer.read().decode('utf-8'))
document = html.fromstring(payload['html'])
for node in document.xpath('//script|//style|//noscript'):
    node.drop_tree()

def clean(value):
    return re.sub(r'\s+', ' ', value or '').strip()

pattern = re.compile(r'\b(?:Master|Doctor|Juris|MSc|MEng|MArch|MBA|EMBA|CEMBA|MSocSc|MSSc|MPhil|PhD|MA|MFA|MEd|MTD|LLM|LL\.M\.)\b', re.I)
candidates = []
for node in document.xpath('//a[@href]'):
    title = clean(node.text_content())
    href = urljoin(payload['url'], node.get('href'))
    ancestors = list(node.iterancestors())
    explicit_programme_column = '/programmes/' in href and any(re.search(r'(?:Taught|Research)Programmes', a.get('class', '')) for a in ancestors[:6])
    if (not pattern.search(title) and not explicit_programme_column) or len(title) > 380:
        continue
    row = next((a for a in ancestors if a.tag == 'tr'), None)
    context = clean(row.text_content()) if row is not None else ''
    parent_meta = [{'tag': a.tag, 'class': a.get('class'), 'id': a.get('id'), 'data': {k: v for k, v in a.attrib.items() if k.startswith('data-')}} for a in ancestors[:6]]
    if not context:
        for a in ancestors[:6]:
            candidate_context = clean(a.text_content())
            if len(candidate_context) < 1800 and ('Research Programmes' in candidate_context or 'Taught Programmes' in candidate_context):
                context = candidate_context
                break
    candidates.append({'title': title, 'url': href, 'context': context[:1200], 'element': 'anchor', 'parentMeta': parent_meta})

headings = []
for node in document.xpath('//h1|//h2|//h3|//h4|//h5|//h6'):
    title = clean(node.text_content())
    if not pattern.search(title) or len(title) > 380:
        continue
    parent = node.getparent()
    link = None
    context = ''
    for _ in range(4):
        if parent is None:
            break
        links = parent.xpath('.//a[@href]')
        relevant = [a for a in links if re.search(r'learn\s+more|view\s+details|visit\s+website', clean(a.text_content()), re.I)]
        if len(relevant) == 1:
            link = urljoin(payload['url'], relevant[0].get('href'))
            card_text = clean(parent.text_content())
            marker = re.search(r'Application(?:s)?\s+(?:closes|open)|Programme mode', card_text, re.I)
            context = card_text[marker.start():][:500] if marker else ''
            break
        parent = parent.getparent()
    headings.append({'title': title, 'url': link, 'context': context, 'element': node.tag})

rows = []
for row in document.xpath('//tr'):
    cells = [clean(c.text_content()) for c in row.xpath('./th|./td')]
    if any(pattern.search(c) for c in cells):
        rows.append(cells)
page_title = document.xpath('string(//title)')
all_text = clean(document.text_content())
result_count = re.search(r'(\d+)\s+result\(s\)', all_text, re.I)
sys.stdout.buffer.write(json.dumps({'pageTitle': clean(page_title), 'candidates': candidates, 'headings': headings, 'rows': rows, 'visibleResultCount': int(result_count.group(1)) if result_count else None}, ensure_ascii=False).encode('utf-8'))
