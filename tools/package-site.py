"""Publish a validated allowlist, not the repository. Python standard library only."""
import hashlib
import json
import re
import shutil
import subprocess
import tempfile
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urljoin, urlsplit
import xml.etree.ElementTree as ET

ORIGIN = 'https://parkbok.com'
PUBLIC_DIRS = {'assets', 'color', 'games', 'guide', 'hwp', 'image', 'pdf', 'text', 'wheel'}
EXTENSIONS = {'.html', '.js', '.css', '.json', '.wasm', '.woff', '.woff2', '.ttf', '.otf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.ico', '.pdf', '.txt'}
ROOT_FILES = {'index.html', 'about.html', 'privacy.html', 'terms.html', '404.html', 'robots.txt', 'ads.txt', 'CNAME', 'manifest.json', 'favicon.svg', 'favicon.ico', 'favicon-32.png', 'icon-180.png', 'icon-192.png', 'icon-512.png', 'og.png', 'og-wheel.png', 'BingSiteAuth.xml'}
RUNTIME = ['assets/hwp-bundle.js', 'assets/app.js', 'image/img-tools.js', 'pdf/pdf-tools.js', 'color/color.js', 'wheel/wheel.js', 'assets/vendor/jszip.min.js', 'assets/vendor/pdf-lib.min.js', 'assets/vendor/pdf.min.js', 'assets/vendor/pdf.worker.min.js', 'assets/vendor/libheif-bundle.js', 'assets/vendor/piexif.js', 'assets/vendor/LICENSES.md']
CSS_URL = re.compile(r'url\(\s*[\"\']?([^\"\')\s]+)', re.I)


def allowed(rel):
    parts = rel.parts
    if len(parts) == 1:
        return (rel.name in ROOT_FILES or re.fullmatch(r'sitemap(?:-[\w-]+)?\.xml', rel.name)
                or re.fullmatch(r'(?:google|naver)[\w-]+\.html', rel.name)
                or re.fullmatch(r'[a-fA-F0-9-]{16,64}\.txt', rel.name))
    # image/tools, pdf/tools and color/tools are browser runtime, not generators.
    return (parts[0] in PUBLIC_DIRS and not any(p == 'src' or p.startswith('.') for p in parts)
            and (rel.suffix.lower() in EXTENSIONS or rel.name in {'LICENSE', 'LICENSES.md', 'NOTICE'}))


class Page(HTMLParser):
    def __init__(self, source):
        super().__init__(convert_charrefs=True)
        self.refs, self.canonicals = [], []
        self.styles = []
        self.in_style = False
        self.titles = self.h1 = 0
        self.noindex = False
        self.feed(source)

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == 'style': self.in_style = True
        if a.get('style'): self.styles.append(a['style'])
        if tag == 'title': self.titles += 1
        if tag == 'h1': self.h1 += 1
        if tag == 'link' and a.get('rel') == 'canonical': self.canonicals.append(a.get('href'))
        if tag == 'meta' and a.get('name', '').lower() in {'robots', 'googlebot'}:
            self.noindex |= 'noindex' in a.get('content', '').lower()
        for key in ('href', 'src', 'poster'):
            if a.get(key): self.refs.append(a[key])
        if a.get('srcset') and not a['srcset'].startswith('data:'):
            self.refs.extend(i.strip().split()[0] for i in a['srcset'].split(',') if i.strip())
        if tag == 'meta' and a.get('property', a.get('name')) in {'og:image', 'twitter:image'}:
            self.refs.append(a.get('content', ''))

    def handle_endtag(self, tag):
        if tag == 'style': self.in_style = False

    def handle_data(self, data):
        if self.in_style: self.styles.append(data)


def local_path(ref, page):
    if not ref or ref.startswith(('#', 'data:', 'blob:', 'mailto:', 'tel:', 'javascript:')): return None
    parsed = urlsplit(urljoin(ORIGIN + '/' + page, ref))
    if parsed.netloc not in {'parkbok.com', 'www.parkbok.com'}: return None
    value = unquote(parsed.path).lstrip('/')
    if not value or value.endswith('/'): value += 'index.html'
    return value


def validate(directory, require_runtime=True):
    files = {p.relative_to(directory).as_posix() for p in directory.rglob('*') if p.is_file()}
    errors, urls, refs = [], {}, 0
    for name in files:
        if not allowed(Path(name)) and name not in {'.nojekyll', 'build-info.json'}: errors.append('Non-public file: ' + name)
    if require_runtime: errors.extend('Missing runtime: ' + n for n in RUNTIME if n not in files)
    maps = {}
    for name in sorted(files):
        if re.fullmatch(r'sitemap(?:-[\w-]+)?\.xml', name):
            locs = [e.text for e in ET.parse(directory / name).iter() if e.tag.endswith('}loc') or e.tag == 'loc']
            maps[name] = len(locs)
            for url in locs:
                target = local_path(url, 'index.html')
                if not url or not url.startswith(ORIGIN + '/') or not target: errors.append('Unexpected sitemap origin: ' + str(url))
                elif target not in files: errors.append('Missing sitemap page: ' + url)
                elif url in urls: errors.append('Duplicate sitemap URL: ' + url)
                else: urls[url] = target
    if not maps: errors.append('No sitemap')
    services = set(urls.values())
    for name in sorted(files):
        if not name.endswith(('.html', '.css')): continue
        source = (directory / name).read_text(encoding='utf-8-sig')
        links = CSS_URL.findall(source) if name.endswith('.css') else []
        if name.endswith('.html'):
            page = Page(source)
            links.extend(page.refs)
            for css in page.styles: links.extend(CSS_URL.findall(css))
            if re.search(r'\{\{[^{}]+\}\}', source): errors.append('Unexpanded template: ' + name)
            if name in services:
                expected = ORIGIN + '/' + name.removesuffix('index.html') if name.endswith('index.html') else ORIGIN + '/' + name
                if page.canonicals != [expected]: errors.append('Canonical mismatch: ' + name)
                if page.noindex: errors.append('Indexed service has noindex: ' + name)
                if page.titles != 1 or page.h1 != 1: errors.append('Title/H1 count: ' + name)
        for ref in links:
            target = local_path(ref, name)
            if target:
                refs += 1
                if target not in files: errors.append(name + ' -> missing ' + target)
    if 'manifest.json' in files:
        manifest = json.loads((directory / 'manifest.json').read_text(encoding='utf-8-sig'))
        for ref in [manifest.get('start_url')] + [i.get('src') for i in manifest.get('icons', [])]:
            target = local_path(ref, 'manifest.json')
            if target and target not in files: errors.append('Manifest missing: ' + target)
    if errors: raise ValueError('\n'.join(errors[:40]) + f'\n({len(errors)} errors)')
    return {'files': len(files), 'sitemaps': maps, 'services': len(services), 'local_references': refs,
            'bytes': sum((directory / p).stat().st_size for p in files)}


def package(root, commit=None, require_runtime=True):
    root = Path(root).resolve(strict=True)
    build = root / '_build'
    if build.is_symlink(): raise ValueError('Build directory must not be a symlink')
    build.mkdir(exist_ok=True)
    output = build / 'pages'
    if output.is_symlink() or output.resolve().parent != build.resolve(): raise ValueError('Unsafe output path')
    stage = Path(tempfile.mkdtemp(prefix='pages-stage-', dir=build)).resolve()
    try:
        copies = []
        for folder in sorted(PUBLIC_DIRS):
            base = root / folder
            if base.is_symlink(): raise ValueError('Public directory symlink: ' + folder)
            if not base.exists(): continue
            for p in base.rglob('*'):
                if p.is_symlink(): raise ValueError('Public symlink: ' + str(p.relative_to(root)))
                if p.is_file() and allowed(p.relative_to(root)):
                    copies.append(p)
        for p in root.iterdir():
            if p.is_file() and allowed(Path(p.name)):
                if p.is_symlink(): raise ValueError('Root file symlink: ' + p.name)
                copies.append(p)
        def copy_public(p):
            dest = stage / p.relative_to(root)
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(p, dest)
        with ThreadPoolExecutor(max_workers=8) as pool:
            list(pool.map(copy_public, copies))
        (stage / '.nojekyll').write_text('', encoding='utf-8')
        report = validate(stage, require_runtime)
        if commit is None: commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip()
        (stage / 'build-info.json').write_text(json.dumps({'commit': commit, 'services': report['services']}) + '\n', encoding='utf-8')
        report['files'] += 1
        report['bytes'] += (stage / 'build-info.json').stat().st_size
        # These are the only recursive delete targets; both were resolved inside root/_build.
        if output.exists(): shutil.rmtree(output)
        stage.rename(output)
        report['commit'] = commit
        report['runtime_sha256'] = {p: hashlib.sha256((output / p).read_bytes()).hexdigest() for p in RUNTIME if (output / p).is_file()}
        (build / 'pages-manifest.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
        return report
    finally:
        if stage.exists():
            if stage.parent != build.resolve() or not stage.name.startswith('pages-stage-'): raise ValueError('Unsafe stage cleanup')
            shutil.rmtree(stage)


if __name__ == '__main__': print(json.dumps(package(Path(__file__).resolve().parent.parent), indent=2))
