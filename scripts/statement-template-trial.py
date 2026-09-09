"""Private offline trial for the two owner-provided RTF templates, not a general XDO engine.

Keeps original page, table, picture and static text RTF; expands the known Invoice row
and materializes only the explicitly supported form-field expressions with synthetic data.
Never uploads, changes OPERA, or silently substitutes this output for a native PDF.
"""
from pathlib import Path
from decimal import Decimal
import argparse
import json
import re


def fields(text, group_pattern=r"\{\s*\\field\b"):
    stack, result = [], []
    i = 0
    while i < len(text):
        c = text[i]
        if c == "\\":
            if i + 1 < len(text) and text[i + 1] in "{}\\":
                i += 2
                continue
            if text.startswith("\\bin", i):
                m = re.match(r"\\bin(\d+) ?", text[i:i + 35])
                if m:
                    i += len(m[0]) + int(m[1])
                    continue
        elif c == "{":
            stack.append(i)
        elif c == "}":
            if not stack:
                raise ValueError("Unbalanced RTF")
            start = stack.pop()
            if re.match(group_pattern, text[start:start + 35]):
                result.append((start, i + 1))
        i += 1
    if stack:
        raise ValueError("Unbalanced RTF")
    return sorted(result)


def escape(value):
    out = []
    for c in str(value):
        if c in "{}\\":
            out.append("\\" + c)
        elif c == "\n":
            out.append("\\line ")
        elif ord(c) < 128:
            out.append(c)
        else:
            for offset in range(0, len(c.encode('utf-16-le')), 2):
                u = int.from_bytes(c.encode('utf-16-le')[offset:offset + 2], 'little')
                out.append(f"\\u{u if u < 32768 else u - 65536}?")
    return "".join(out)


def materialize(text, values):
    edits = []
    for start, end in fields(text):
        field = text[start:end]
        expressions = re.findall(r"<\?(.{1,700}?)\?>", field)
        if not expressions:
            continue  # Keep native PAGE/NUMPAGES fields for the converter.
        expr = re.sub(r"\\'([0-9a-fA-F]{2})", lambda m: chr(int(m[1], 16)), expressions[0])
        if expr.startswith(('param@', 'xdoxslt:', 'for-each:', 'if@', 'end ')):
            rendered = ''
        elif "xdoxslt:get_variable" in expr:
            rendered = ''  # Template's explicit if@inlines:1=0 branch.
        elif expr == 'sum(OPEN_BALANCE)':
            rendered = values['TOTAL']
        elif '/G_RANGES/' in expr:
            seq = re.search(r'SEQ=(\d+)', expr)
            if not seq:
                raise ValueError('Unknown aging selector')
            n = int(seq[1]) - 1
            rendered = values['AGING_AMOUNTS' if 'SUM_AGING_AMOUNT' in expr else 'AGING_LABELS'][n]
        elif expr.startswith(('format-number:', 'format-date:')):
            key = expr.split(':', 1)[1].split(';', 1)[0]
            rendered = values[key]
        elif expr in values:
            rendered = values[expr]
        else:
            raise ValueError(f'Unsupported template expression: {expr}')
        if rendered == '':
            edits.append((start, end, ''))
            continue
        result = field.split('{\\fldrslt', 1)[1]
        fonts, sizes = re.findall(r'\\f(\d+)\b', result), re.findall(r'\\fs(\d+)\b', result)
        bold = re.findall(r'\\b(\d*)(?![A-Za-z0-9])', result)
        italic = re.findall(r'\\i(\d*)(?![A-Za-z0-9])', result)
        style = f"\\f{fonts[-1] if fonts else '41'}\\fs{sizes[-1] if sizes else '16'}"
        style += '\\b' if bold and bold[-1] != '0' else '\\b0'
        style += '\\i' if italic and italic[-1] != '0' else '\\i0'
        edits.append((start, end, '{' + style + '\\cf0\\scaps0 ' + escape(rendered) + '}'))
    for start, end, replacement in reversed(edits):
        text = text[:start] + replacement + text[end:]
    return text


def fixture(hotel, count):
    rows = []
    guests = ['Alex Morgan', 'Jamie Parker', 'Robin Lee']
    total = Decimal('0')
    for i in range(count):
        amount = Decimal('21600') + Decimal(i % 3) * 1250
        paid = Decimal('0')
        open_amount = amount - paid
        total += open_amount
        rows.append(dict(BILLING_DATE='28/08/26', BILL_NO_CHAR=str(88001 + i),
                         GUEST_NAME=guests[i % 3] if i % 7 != 6 else 'Alexandra Montgomery-Wellington',
                         ARRIVAL_DATE='25/08/26', DEPARTURE_DATE='28/08/26',
                         REFERENCE=f'VCH-{i + 1:06d}', INVOICE_AMOUNT=f'{amount:,.2f}',
                         PAID='' if paid == 0 else f'{paid:,.2f}', OPEN_BALANCE=f'{open_amount:,.2f}'))
    common = dict(FULL_ADDRESS_AR='EXAMPLE TRAVEL CO., LTD.\n29 Example Building, Tower B,\nRoom 15C, Floor 15,\nExample Road,\nPathumwan, Bangkok\n10330',
                  ACCOUNT_NUMBER=hotel + '001', SYSTEM_DATE='09/09/26', P_CURRENCY='THB',
                  TOTAL=f'{total:,.2f}', AGING_LABELS=['Up to 30', '31 - 60', '61 - 90', '91 - 120', '121 - 150', '151 and Over'],
                  AGING_AMOUNTS=[f'{total:,.2f}', '0.00', '0.00', '0.00', '0.00', '0.00'])
    return common, rows


def generate(template, output, hotel, count):
    source = template.read_text(encoding='latin1')
    # XDO consumes these directive-only paragraphs. Leaving their paragraph breaks
    # in ordinary RTF adds blank lines that do not exist in the OPERA output.
    breaks = set()
    for marker in ['<?param@begin:IMAGES_PATH', '<?start']:
        marker_at = source.index(marker)
        paragraph = re.search(r'\\par\b', source[marker_at:])
        if not paragraph:
            raise ValueError('Directive paragraph boundary missing')
        breaks.add((marker_at + paragraph.start(), marker_at + paragraph.end()))
    for a, b in sorted(breaks, reverse=True):
        source = source[:a] + source[b:]
    # OPERA's XDO start:body region leaves the title/account preamble repeating
    # on every page. Ordinary RTF does not interpret that boundary, so materialize
    # the preamble into the existing repeating header alongside the original logo.
    preamble_start = source.rfind('\\pard', 0, source.index('<?param@begin:IMAGES_PATH'))
    preamble_end = source.index('\\trowd', source.index('<?start'))
    preamble = source[preamble_start:preamble_end]
    fields(preamble)
    headers = fields(source, r'\{\s*\\headerr\b')
    if len(headers) != 1 or headers[0][1] > preamble_start:
        raise ValueError('Unsupported repeating-header structure')
    header_end = headers[0][1] - 1
    source = source[:header_end] + preamble + source[header_end:preamble_start] + source[preamble_end:]
    start_marker = source.index('<?for-each:G_INVOICES?>')
    start = source.rfind('\\trowd', 0, start_marker)
    row_end_match = re.search(r'\\row\b', source[start_marker:])
    if start < 0 or not row_end_match:
        raise ValueError('Invoice repeat row missing')
    end = source.index('\\trowd', start_marker + row_end_match.end())
    row = source[start:end]
    fields(row)  # Require a balanced standalone RTF row before copying it.
    common, rows = fixture(hotel, count)
    expanded = ''.join(materialize(row, common | item) for item in rows)
    rendered = materialize(source[:start] + expanded + source[end:], common)
    # A standalone closing XDO marker is literal text rather than a Word form field.
    rendered = rendered.replace('<?end body?>', '')
    # Word splits the XDO start:body marker across styled runs in these templates.
    # Remove only its literal characters, retaining intervening balanced RTF groups.
    rendered = re.sub(r'<\?start(.*?)body\?>', lambda m: m[1].replace(':', ''), rendered, flags=re.S)
    # The reference OPERA PDF prints these captions in normal mixed case, while
    # LibreOffice honors Word's placeholder small-caps attribute literally.
    rendered = re.sub(r'\\scaps(?![A-Za-z0-9])', r'\\scaps0', rendered)
    # Keep the closing summary, banking details, terms and signature together.
    # If insufficient space remains, move this section instead of leaving a lone
    # signature on another page. This affects only the generated trial copy.
    closing_heading = rendered.index('Aging')
    closing_start = rendered.rfind('\\pard', 0, closing_heading)
    if closing_start < 0:
        raise ValueError('Closing section missing')
    rendered = rendered[:closing_start] + re.sub(r'\\pard\b', r'\\pard\\keepn\\keep', rendered[closing_start:])
    fields(rendered)
    if '<?' in rendered:
        raise ValueError('Unresolved XDO expression remains')
    output.write_text(rendered, encoding='latin1', newline='')
    return {'hotel': hotel, 'rows': count, 'total': common['TOTAL'], 'output': str(output)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--templates', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    results = []
    for hotel in ['KAT', 'TSK']:
        for count, suffix in [(1, 'single'), (45, 'multipage')]:
            results.append(generate(args.templates / (hotel.lower() + '_statement.rtf'),
                                    args.output / (hotel.lower() + '-statement-' + suffix + '.rtf'), hotel, count))
    print(json.dumps(results, indent=2))
