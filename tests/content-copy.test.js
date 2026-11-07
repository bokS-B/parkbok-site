'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const PDFLib = require('../assets/vendor/pdf-lib.min.js');
const compress = require('../pdf/tools/compress.js');
const definition = require('../pdf/src/tools/compress.json');
const ko = definition.strings.ko;
const root = path.resolve(__dirname, '..');

// Render only the compression definition with the real generator/template. All
// output stays in memory; no generated page or sitemap in the checkout is touched.
function renderCompress() {
  const generator = path.join(root, 'tools', 'build-pdf.js');
  const toolsDirectory = path.join(root, 'pdf', 'src', 'tools');
  const generated = new Map();
  const virtualFs = Object.create(fs);
  virtualFs.readdirSync = directory => {
    assert.equal(directory, toolsDirectory);
    return ['compress.json'];
  };
  virtualFs.mkdirSync = () => {};
  virtualFs.writeFileSync = (file, content) => {
    const relative = path.relative(root, file).replace(/\\/g, '/');
    assert.match(relative, /^pdf\/(?:compress\/)?(?:[a-z]{2}\/)?index\.html$/);
    generated.set(relative, content);
  };
  const localRequire = createRequire(generator);
  vm.runInNewContext(fs.readFileSync(generator, 'utf8'), {
    __dirname: path.dirname(generator),
    require: name => name === 'fs' ? virtualFs : localRequire(name),
    console: { log() {}, warn(message) { assert.fail(message); } },
  }, { filename: generator });
  return generated.get('pdf/compress/ko/index.html');
}

const decode = value => value.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

test('PDF compression description reaches metadata schema and runtime from one source', () => {
  const html = renderCompress();
  const jsonld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const runtimeScript = html.match(/<script>(window\.PDFT_STRINGS=[\s\S]*?)<\/script>/)[1];
  const context = { window: {} };
  vm.runInNewContext(runtimeScript, context);
  const runtime = JSON.parse(JSON.stringify(context.window.PDFT_TOOL));
  assert.deepEqual([
    decode(html.match(/<meta name="description" content="([^"]*)"/)[1]),
    decode(html.match(/<meta property="og:description" content="([^"]*)"/)[1]),
    jsonld.find(item => item['@type'] === 'WebApplication').description,
    runtime.strings.description,
  ], Array(4).fill(ko.description));
  assert.deepEqual(runtime.strings, ko);
  assert.ok(html.includes('<p class="lead">' + ko.line + '</p>'));
  assert.equal(decode(html.match(/<title>([^<]*)<\/title>/)[1]), 'PDF 압축 – PDF 용량 줄이기 무료 온라인');
  assert.ok(html.includes('<link rel="canonical" href="https://parkbok.com/pdf/compress/ko/">'));
  const visibleFaq = [...html.matchAll(/<dt>(.*?)<\/dt><dd>(.*?)<\/dd>/g)].map(match => [decode(match[1]), decode(match[2])]);
  const schemaFaq = jsonld.find(item => item['@type'] === 'FAQPage').mainEntity.map(item => [item.name, item.acceptedAnswer.text]);
  assert.deepEqual(visibleFaq, ko.faq);
  assert.deepEqual(schemaFaq, ko.faq);
  assert.deepEqual(runtime.strings.faq, ko.faq);
});

test('Korean guidance distinguishes text objects scans and the original-file fallback', () => {
  assert.match(ko.options.level.help, /텍스트 객체는 이미지 압축 대상이 아니/);
  assert.match(ko.options.level.help, /스캔 이미지 속 글자는 흐려질 수/);
  assert.match(ko.faq[1][1], /텍스트로 저장된 글자·글꼴·도형은 이미지 압축 대상이 아닙니다/);
  assert.match(ko.faq[1][1], /사진·스캔 이미지 안에 포함된 글자는.*흐려질 수/);
  assert.match(ko.description, /용량이 줄지 않을 수/);
  assert.match(ko.description, /원본보다 크거나 같으면 원본을 돌려/);
  assert.match(ko.description, /목표 용량 지정 없이/);
  assert.match(ko.noteSame, /이 설정에서는 용량이 줄지 않았/);
  assert.match(ko.noteNoImages, /압축할 수 있는 이미지가 없/);
  assert.ok(ko.noteSame.includes('{size}') && ko.noteNoImages.includes('{size}'));
  assert.doesNotMatch(JSON.stringify(ko), /글자는 그대로 선명|아니요\. 이미지만 줄이고|글자만 있는 PDF 는 이미 작|더 줄일 수 없는 PDF/);
});

test('text-only PDF returns identical source bytes with the supported-image notice', async () => {
  const doc = await PDFLib.PDFDocument.create();
  doc.addPage().drawText('Selectable text is not a scan.');
  const bytes = await doc.save();
  const translationKeys = [];
  const result = await compress.run([{ name: 'text.pdf', bytes }], {}, {
    pdfLib: PDFLib,
    encodeJpeg: () => assert.fail('Text-only content must not be JPEG encoded'),
    t: key => { translationKeys.push(key); return ko[key] || key; },
  });
  assert.equal(result.replaced, 0);
  assert.equal(result.after, result.before);
  assert.ok(translationKeys.includes('noteNoImages'));
  assert.equal(result.note, ko.noteNoImages);
  assert.deepEqual(new Uint8Array(await result.outputs[0].blob.arrayBuffer()), bytes);
});

test('equal or larger serialized output returns original bytes and the no-reduction notice', async () => {
  // Inject serialization sizes to verify the copy's fallback claim. Image bytes
  // and the encoder are stubs here; this does not test visual quality or codecs.
  for (const savedSize of [100, 101]) {
    const doc = await PDFLib.PDFDocument.create();
    doc.context.register(doc.context.stream(new Uint8Array(64), {
      Type: 'XObject', Subtype: 'Image', Filter: 'DCTDecode',
      Width: 10, Height: 10, BitsPerComponent: 8, ColorSpace: 'DeviceRGB',
    }));
    doc.save = async () => new Uint8Array(savedSize);
    const bytes = new Uint8Array(100).fill(42);
    const result = await compress.run([{ name: 'fixture.pdf', bytes }], {}, {
      pdfLib: { ...PDFLib, PDFDocument: { load: async () => doc } },
      encodeJpeg: async () => new Uint8Array(8),
      t: key => ko[key] || key,
    });
    assert.equal(result.replaced, 1);
    assert.equal(result.after, bytes.length);
    assert.equal(result.note, ko.noteSame);
    assert.deepEqual(new Uint8Array(await result.outputs[0].blob.arrayBuffer()), bytes);
  }
});

function renderImageLabels() {
  const generator = path.join(root, 'tools', 'build-image.js');
  const toolsDirectory = path.join(root, 'image', 'src', 'tools');
  const generated = new Map();
  const virtualFs = Object.create(fs);
  virtualFs.readdirSync = directory => {
    assert.equal(directory, toolsDirectory);
    return ['image-compress.json', 'image-resize.json'];
  };
  virtualFs.mkdirSync = () => {};
  virtualFs.writeFileSync = (file, content) => {
    const relative = path.relative(root, file).replace(/\\/g, '/');
    assert.match(relative, /^image\/(?:image-(?:compress|resize)\/)?(?:[a-z]{2}\/)?index\.html$/);
    generated.set(relative, content);
  };
  const localRequire = createRequire(generator);
  vm.runInNewContext(fs.readFileSync(generator, 'utf8'), {
    __dirname: path.dirname(generator),
    require: name => name === 'fs' ? virtualFs : localRequire(name),
    console: { log() {}, warn(message) { assert.fail(message); } },
  }, { filename: generator });
  return generated;
}

test('generated Korean compression page uses its specific 100KB title and heading', () => {
  const generated = renderImageLabels(), html = generated.get('image/image-compress/ko/index.html');
  assert.ok(html);
  const title = decode(html.match(/<title>([^<]*)<\/title>/)[1]);
  assert.match(title, /^사진 100KB로 줄이기/);
  assert.equal(decode(html.match(/<h1>([^<]*)<\/h1>/)[1]), '사진 100KB로 줄이기');
  const jsonld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(jsonld.find(item => item['@type'] === 'WebApplication').name, '사진 100KB로 줄이기');
  const runtime = { window: {} };
  vm.runInNewContext(html.match(/<script>(window\.IMGT_STRINGS=[\s\S]*?)<\/script>/)[1], runtime);
  assert.equal(runtime.window.IMGT_TOOL.strings.h1, '사진 100KB로 줄이기');
});

test('generated hub cards and related-tool names retain the generic Korean compression label', () => {
  const generated = renderImageLabels(), hub = generated.get('image/ko/index.html');
  const card = hub.match(/<a class="card" href="\/image\/image-compress\/ko\/">([\s\S]*?)<\/a>/);
  assert.ok(card);
  assert.equal(decode(card[1].match(/<h3>([^<]*)<\/h3>/)[1]), '이미지 압축');
  const jsonld = JSON.parse(hub.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  const collection = jsonld.find(item => item['@type'] === 'CollectionPage');
  assert.equal(collection.hasPart.find(item => item.url === 'https://parkbok.com/image/image-compress/ko/').name, '이미지 압축');
  const related = generated.get('image/image-resize/ko/index.html');
  assert.match(related, /<a class="chip" href="\/image\/image-compress\/ko\/">이미지 압축<\/a>/);
  const runtime = { window: {} };
  vm.runInNewContext(related.match(/<script>(window\.IMGT_STRINGS=[\s\S]*?)<\/script>/)[1], runtime);
  assert.equal(runtime.window.IMGT_TOOL.next.find(item => item.id === 'image-compress').h1, '이미지 압축');
});
