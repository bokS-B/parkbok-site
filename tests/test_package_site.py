import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('package_site', Path(__file__).resolve().parents[1] / 'tools/package-site.py')
site = importlib.util.module_from_spec(spec)
spec.loader.exec_module(site)


class PackageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.write('index.html', '<title>Test</title><link rel="canonical" href="https://parkbok.com/"><h1>Test</h1><script src="/image/tools/a.js"></script>')
        self.write('image/tools/a.js', '// browser module')
        self.write('sitemap.xml', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://parkbok.com/</loc></url></urlset>')

    def write(self, name, text):
        p = self.root / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(text, encoding='utf-8')

    def run_package(self): return site.package(self.root, 'test-commit', require_runtime=False)

    def external_directory(self):
        external = tempfile.TemporaryDirectory()
        self.addCleanup(external.cleanup)
        return Path(external.name)

    def directory_link(self, link, target):
        link.parent.mkdir(parents=True, exist_ok=True)
        try:
            if os.name == 'nt':
                result = subprocess.run(['cmd', '/c', 'mklink', '/J', str(link), str(target)],
                                        capture_output=True, text=True)
                if result.returncode:
                    self.skipTest('Cannot create Windows junction: ' + result.stderr.strip())
            else:
                link.symlink_to(target, target_is_directory=True)
        except OSError as error:
            self.skipTest('Cannot create directory link: ' + str(error))

        def remove_link():
            # Remove the link before TemporaryDirectory walks either fixture tree.
            if link.is_symlink() or link.exists():
                if os.name == 'nt': link.rmdir()
                else: link.unlink()
        self.addCleanup(remove_link)

    def test_build_directory_link_rejected_before_external_data_changes(self):
        external = self.external_directory()
        (external / 'pages').mkdir()
        marker = external / 'pages/keep.txt'
        marker.write_text('external data', encoding='utf-8')
        self.directory_link(self.root / '_build', external)
        with self.assertRaisesRegex(ValueError, 'Build directory'):
            self.run_package()
        self.assertEqual(marker.read_text(encoding='utf-8'), 'external data')
        self.assertEqual(sorted(p.name for p in external.iterdir()), ['pages'])

    def test_output_directory_link_rejected_without_external_data_changes(self):
        external = self.external_directory()
        marker = external / 'keep.txt'
        marker.write_text('external data', encoding='utf-8')
        self.directory_link(self.root / '_build/pages', external)
        with self.assertRaisesRegex(ValueError, 'Unsafe output path'):
            self.run_package()
        self.assertEqual(marker.read_text(encoding='utf-8'), 'external data')
        self.assertEqual(sorted(p.name for p in external.iterdir()), ['keep.txt'])

    def test_output_directory_link_to_sibling_build_directory_is_rejected(self):
        target = self.root / '_build/previous'
        target.mkdir(parents=True)
        marker = target / 'keep.txt'
        marker.write_text('previous output', encoding='utf-8')
        self.directory_link(self.root / '_build/pages', target)
        with self.assertRaisesRegex(ValueError, 'Unsafe output path'):
            self.run_package()
        self.assertEqual(marker.read_text(encoding='utf-8'), 'previous output')

    def test_public_directory_link_rejected_without_copying_external_files(self):
        self.run_package()
        external = self.external_directory()
        marker = external / 'private.txt'
        marker.write_text('external data', encoding='utf-8')
        self.directory_link(self.root / 'assets', external)
        with self.assertRaisesRegex(ValueError, 'Public directory'):
            self.run_package()
        self.assertEqual(marker.read_text(encoding='utf-8'), 'external data')
        self.assertFalse((self.root / '_build/pages/assets/private.txt').exists())
        self.assertIn('<h1>Test</h1>', (self.root / '_build/pages/index.html').read_text())

    def test_nested_public_directory_link_rejected_without_copying_external_files(self):
        self.run_package()
        external = self.external_directory()
        marker = external / 'private.txt'
        marker.write_text('external data', encoding='utf-8')
        self.directory_link(self.root / 'assets/nested', external)
        with self.assertRaisesRegex(ValueError, 'Public symlink or junction'):
            self.run_package()
        self.assertEqual(marker.read_text(encoding='utf-8'), 'external data')
        self.assertFalse((self.root / '_build/pages/assets/nested/private.txt').exists())
        self.assertIn('<h1>Test</h1>', (self.root / '_build/pages/index.html').read_text())

    def test_runtime_retained_sources_excluded(self):
        for name in ['image/src/template.html', 'color/src/hex-template.html', 'tools/dev.js', 'docs/private.html', 'src/config.json', 'tests/a.js']:
            self.write(name, 'not public')
        self.write('assets/vendor/LICENSES.md', 'license')
        self.write('_build/keep.txt', 'keep')
        result = self.run_package()
        self.assertEqual(result['services'], 1)
        self.assertTrue((self.root / '_build/pages/image/tools/a.js').is_file())
        self.assertTrue((self.root / '_build/pages/assets/vendor/LICENSES.md').is_file())
        self.assertEqual((self.root / '_build/keep.txt').read_text(), 'keep')
        self.assertFalse((self.root / '_build/pages/image/src').exists())
        self.assertFalse((self.root / '_build/pages/tools').exists())

    def test_failed_build_preserves_previous(self):
        self.run_package()
        self.write('index.html', '<a href="/missing/">bad</a>')
        with self.assertRaisesRegex(ValueError, 'missing'): self.run_package()
        self.assertIn('<h1>Test</h1>', (self.root / '_build/pages/index.html').read_text())

    def test_missing_sitemap_page_fails(self):
        self.write('sitemap.xml', '<urlset><url><loc>https://parkbok.com/missing/</loc></url></urlset>')
        with self.assertRaisesRegex(ValueError, 'Missing sitemap'): self.run_package()

    def test_noindex_and_template_fail(self):
        for extra, message in [('<meta name="robots" content="noindex">', 'noindex'), ('{{TITLE}}', 'Unexpanded')]:
            self.write('index.html', '<title>T</title><h1>T</h1><link rel="canonical" href="https://parkbok.com/">' + extra)
            with self.assertRaisesRegex(ValueError, message): self.run_package()

    def test_relative_links_query_and_fragment(self):
        self.write('color/hex/ff5733/index.html', '<a href="../ff6347/?a=1#value">next</a><img src="/og.png?v=2">')
        self.write('color/hex/ff6347/index.html', '<a href="#local">local</a>')
        self.write('og.png', 'fixture')
        self.run_package()
        self.assertEqual(site.local_path('../ff6347/#x', 'color/hex/ff5733/index.html'), 'color/hex/ff6347/index.html')

    def test_required_vendor_cannot_be_omitted(self):
        with self.assertRaisesRegex(ValueError, 'Missing runtime'): site.package(self.root, 'test', True)

    def test_javascript_url_constructor_is_not_a_css_asset(self):
        with (self.root / 'index.html').open('a') as f: f.write('<script>new URL(location.href)</script>')
        self.run_package()

    def test_inline_css_missing_asset_is_rejected(self):
        with (self.root / 'index.html').open('a') as f: f.write('<style>.a{background:url(/missing.png)}</style>')
        with self.assertRaisesRegex(ValueError, 'missing.png'): self.run_package()

    def test_sitemap_index(self):
        self.write('sitemap-core.xml', (self.root / 'sitemap.xml').read_text())
        self.write('sitemap.xml', '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://parkbok.com/sitemap-core.xml</loc></sitemap></sitemapindex>')
        self.assertEqual(self.run_package()['sitemaps'], {'sitemap-core.xml': 1, 'sitemap.xml': 1})
        self.write('sitemap.xml', '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>https://parkbok.com/sitemap-missing.xml</loc></sitemap></sitemapindex>')
        with self.assertRaisesRegex(ValueError, 'Missing child sitemap'): self.run_package()

    def test_duplicate_sitemap_rejected(self):
        self.write('sitemap-other.xml', (self.root / 'sitemap.xml').read_text())
        with self.assertRaisesRegex(ValueError, 'Duplicate sitemap'): self.run_package()


if __name__ == '__main__': unittest.main()
