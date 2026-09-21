"""Rebuild private Statement footers from blank RTF-derived PDFs without clipping glyphs.

The manifest maps hotel IDs to existing private `assets` and blank `pdf` paths.
Headers/closing blocks are preserved byte-for-byte. No template data enters Git.
"""
from pathlib import Path
import argparse
import base64
import hashlib
import io
import json
import math
import subprocess

import pdfplumber
from PIL import Image, ImageChops

VERSION = 'rtf-20260921-v4'
HOTELS = {'KAT', 'TSK', 'TLKL', 'WAKL', 'TLFO', 'TSAN'}


def rebuild(manifest, output):
    if set(manifest) != HOTELS:
        raise ValueError('Expected all six hotel templates')
    output.mkdir(parents=True, exist_ok=True)
    report = []
    for hotel, paths in manifest.items():
        assets = json.loads(Path(paths['assets']).read_text(encoding='utf-8'))
        if assets['hotel'] != hotel or assets['version'] != 'rtf-20260909-v3':
            raise ValueError('Unexpected source template')
        for name in ['header', 'closing', 'footer']:
            raw = base64.b64decode(assets[name]['png'], validate=True)
            if hashlib.sha256(raw).hexdigest() != assets[name]['sha256']:
                raise ValueError('Source asset checksum mismatch')
        with pdfplumber.open(paths['pdf']) as pdf:
            if len(pdf.pages) != 1 or (pdf.pages[0].width, pdf.pages[0].height) != (612, 792):
                raise ValueError('Expected a one-page blank Letter template')
            chars = [c for c in pdf.pages[0].chars if c['text'].strip() and c['top'] >= 690]
            if not chars or any(c['bottom'] > 792 for c in chars):
                raise ValueError('Footer content missing or outside the source page')
            top = min(715, math.floor(min(c['top'] for c in chars) - 3))
            if top < 690:
                raise ValueError('Footer exceeds the reserved template region')
        target = output / (hotel + '-footer')
        subprocess.run(['pdftoppm', '-r', '288', '-x', '0', '-y', str(top * 4),
                        '-W', '2448', '-H', str((792 - top) * 4), '-png', '-singlefile',
                        str(paths['pdf']), str(target)], check=True, capture_output=True)
        raw = target.with_suffix('.png').read_bytes()
        with Image.open(io.BytesIO(raw)) as new, Image.open(io.BytesIO(base64.b64decode(assets['footer']['png']))) as old:
            old = old.convert('RGB'); new = new.convert('RGB')
            if new.size != (2448, (792 - top) * 4) or old.size != (2448, 77 * 4):
                raise ValueError('Unexpected footer pixel dimensions')
            # Prove source alignment and preserve every previously visible pixel.
            if ImageChops.difference(new.crop((0, (715 - top) * 4, 2448, new.height)), old).getbbox():
                raise ValueError('Blank source does not reproduce the incumbent asset')
            if new.crop((0, 0, new.width, 4)).convert('L').getextrema()[0] < 250:
                raise ValueError('New footer still touches its crop boundary')
        previous = assets['footer']['sha256']
        assets['version'] = VERSION
        assets['footer'] = dict(width=612, height=792-top, png=base64.b64encode(raw).decode(), sha256=hashlib.sha256(raw).hexdigest())
        (output / (hotel + '-assets.json')).write_text(json.dumps(assets), encoding='utf-8')
        report.append(dict(hotel=hotel, top=top, height=792-top, clippedBefore=sum(c['top'] < 715 < c['bottom'] for c in chars), clippedAfter=sum(c['top'] < top < c['bottom'] for c in chars), previousSha=previous, sha256=assets['footer']['sha256']))
    (output / 'validation.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--manifest', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(rebuild(json.loads(args.manifest.read_text(encoding='utf-8-sig')), args.output)))
