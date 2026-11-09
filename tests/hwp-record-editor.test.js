'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(fs.readFileSync(require.resolve('../assets/hwp-record-editor.js'), 'utf8'), { window });
const editor = window.PBHwpRecords;

function record(tag, level, body) {
  const extended = body.length >= 0xfff;
  const header = Buffer.alloc(extended ? 8 : 4);
  const length = extended ? 0xfff : body.length;
  header.writeUInt32LE((tag | (level << 10) | (length << 20)) >>> 0);
  if (extended) header.writeUInt32LE(body.length, 4);
  return Buffer.concat([header, body]);
}

function paragraph(text, { level = 0, shapes = [0], lines = [0], ranges = 0, last = false, lineWidth = 20000 } = {}) {
  const header = Buffer.alloc(24);
  header.writeUInt32LE(text.length + (last ? 0x80000000 : 0));
  header.writeUInt16LE(shapes.length, 12);
  header.writeUInt16LE(ranges, 14);
  header.writeUInt16LE(lines.length, 16);
  const shapeRecord = Buffer.alloc(shapes.length * 8);
  const lineRecord = Buffer.alloc(lines.length * 36);
  shapes.forEach((position, index) => {
    shapeRecord.writeUInt32LE(position, index * 8);
    shapeRecord.writeUInt32LE(index + 1, index * 8 + 4);
  });
  lines.forEach((position, index) => {
    lineRecord.writeUInt32LE(position, index * 36);
    lineRecord.writeUInt32LE(1000 + index * 100, index * 36 + 4);
    lineRecord.writeUInt32LE(lineWidth, index * 36 + 28);
  });
  return [
    record(66, level, header),
    record(67, level + 1, Buffer.from(text, 'utf16le')),
    record(68, level + 1, shapeRecord),
    record(69, level + 1, lineRecord),
  ];
}

function control(code) {
  const marker = String.fromCharCode(code);
  return marker + 'SECRET' + marker;
}

function tableCell(column, text, { protectedCell = false, named = false, properties = 0,
  extraParagraph, ...layout } = {}) {
  const header = Buffer.alloc(47);
  header.writeUInt32LE(extraParagraph === undefined ? 1 : 2);
  header.writeUInt32LE(properties | (protectedCell ? 1 << 17 : 0), 4);
  header.writeUInt16LE(column, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(1, 14);
  if (named) header[38] = 0xff;
  const records = [record(72, 2, header), ...paragraph(text + '\r', { ...layout, level: 2 })];
  if (extraParagraph !== undefined) records.push(...paragraph(extraParagraph + '\r', { ...layout, level: 2 }));
  return records;
}

function table(...cells) {
  const tableControl = Buffer.alloc(46);
  tableControl.writeUInt32LE(0x74626c20);
  const definition = Buffer.alloc(24);
  definition.writeUInt16LE(1, 4);
  definition.writeUInt16LE(cells.length, 6);
  return Buffer.concat([
    ...paragraph(control(11) + '\r'),
    record(71, 1, tableControl),
    record(77, 2, definition),
    ...cells.flat(),
  ]);
}

function metrics({ fontScale = [100, 100], fontSpacing = [0, 0], fontRatio = [100, 100] } = {}) {
  return [null, { fontBaseSize: 1100, fontScale, fontSpacing, fontRatio }];
}

test('writes only the selected same-length occurrence and invalidates stale matches', () => {
  const bytes = Buffer.concat(paragraph('배포 전 · 배포 후\r'));
  const original = Buffer.from(bytes);
  const section = editor.read(bytes, 'BodyText/Section0');
  const matches = editor.find(section, '배포');
  assert.equal(matches.length, 2);
  const selected = matches[1];
  assert.equal(editor.replace(section, selected, '배포', '배포'), false);
  assert.throws(() => editor.replace(section, selected, '배포', 'x'.repeat(81)));
  assert.throws(() => editor.replace(section, selected, '배포', '검\n'));
  assert.throws(() => editor.replace(section, { ...selected }, '배포', '검증'));
  assert.deepEqual(bytes, original);

  assert.equal(editor.replace(section, selected, '배포', '검증'), true);
  const expected = Buffer.from(original);
  expected.write('검증', selected.offset, 'utf16le');
  assert.deepEqual(Buffer.from(section.bytes), expected);
  assert.deepEqual(bytes, original);
  assert.equal(editor.find(section, '배포')[0].offset, matches[0].offset);
  assert.equal(editor.find(section, '검증')[0].offset, selected.offset);
  assert.throws(() => editor.replace(section, matches[0], '배포', '검증'));
});

test('grows and shrinks text while moving later style and line positions', () => {
  const tail = paragraph('unaltered\r');
  const bytes = Buffer.concat([
    ...paragraph('firstSECOND\r', { shapes: [0, 5], lines: [0, 5], last: true }),
    ...tail,
  ]);
  const section = editor.read(bytes, 'Section0');
  const before = section.bytes;
  const first = editor.find(section, 'first')[0];
  const oldTail = editor.find(section, 'unaltered')[0];
  assert.equal(editor.replace(section, first, 'first', 'expanded'), true);
  assert.deepEqual(Buffer.from(section.bytes), Buffer.concat([
    ...paragraph('expandedSECOND\r', { shapes: [0, 8], lines: [0, 8], last: true }),
    ...tail,
  ]));
  assert.equal(editor.find(section, 'unaltered')[0].offset, oldTail.offset + 6);
  assert.throws(() => editor.replace(section, oldTail, 'unaltered', 'change'));

  const grown = editor.find(section, 'expanded')[0];
  assert.throws(() => editor.replace(section, grown, 'expanded', ''));
  assert.equal(editor.replace(section, grown, 'expanded', 'go'), true);
  assert.equal(editor.replace(section, editor.find(section, 'o')[0], 'o', ''), true);
  assert.deepEqual(Buffer.from(section.bytes), Buffer.concat([
    ...paragraph('gSECOND\r', { shapes: [0, 1], lines: [0, 1], last: true }),
    ...tail,
  ]));

  editor.restore(section, before);
  assert.equal(section.bytes, before);
  assert.equal(editor.find(section, 'first')[0].offset, first.offset);
  assert.throws(() => editor.replace(section, first, 'first', 'next'));
});

test('crosses the extended text-record size threshold in both directions', () => {
  const prefix = 'a'.repeat(2045);
  const tail = paragraph('unaltered\r');
  const bytes = Buffer.concat([...paragraph(prefix + 'X\r'), ...tail]);
  const section = editor.read(bytes, 'Section0');
  const original = editor.find(section, 'X')[0];
  assert.equal(editor.replace(section, original, 'X', 'YZ'), true);
  assert.deepEqual(Buffer.from(section.bytes), Buffer.concat([
    ...paragraph(prefix + 'YZ\r'),
    ...tail,
  ]));
  const extended = editor.find(section, 'YZ')[0];
  assert.equal(extended.offset, original.offset + 4);
  assert.equal(editor.replace(section, extended, 'YZ', 'X'), true);
  assert.deepEqual(Buffer.from(section.bytes), bytes);
});

test('keeps matches within one style, line, or visible text span', () => {
  const bytes = Buffer.concat([
    ...paragraph('ab' + control(9) + 'cd\r'),
    ...paragraph('style\r', { shapes: [0, 2] }),
    ...paragraph('newline\r', { lines: [0, 3] }),
    ...paragraph(control(3) + 'field text' + control(4) + '\r'),
    ...paragraph('tagged\r', { ranges: 1 }),
  ]);
  const section = editor.read(bytes, 'Section0');
  for (const query of ['SECRET', 'abcd', 'style', 'newline', 'field text', 'tagged']) {
    assert.equal(editor.find(section, query).length, 0, query);
  }
  for (const query of ['ab', 'cd', 'st', 'yle', 'new', 'line']) {
    assert.equal(editor.find(section, query).length, 1, query);
  }
  assert.throws(() => editor.read(bytes.subarray(0, -1), 'Section0'));
});

test('rejects sections with a field spanning multiple paragraphs', () => {
  const bytes = Buffer.concat([
    ...paragraph(control(3) + 'start\r'),
    ...paragraph('intermediate text\r'),
    ...paragraph('end' + control(4) + '\r'),
  ]);
  assert.throws(() => editor.read(bytes, 'Section0'));
});

test('keeps additional paragraph metadata outside the resize scope', () => {
  const objectHeader = Buffer.alloc(46);
  const bytes = Buffer.concat([
    ...paragraph('text' + control(11) + '\r'),
    record(71, 1, objectHeader),
  ]);
  const section = editor.read(bytes, 'Section0');
  const match = editor.find(section, 'text')[0];
  assert.throws(() => editor.replace(section, match, 'text', 'new text'));
  assert.equal(section.bytes, bytes);
  assert.equal(editor.replace(section, match, 'text', 'same'), true);
});

test('allows ordinary table cells and skips named or protected cells', () => {
  const bytes = table(
    tableCell(0, 'ordinary'),
    tableCell(1, 'protected', { protectedCell: true }),
    tableCell(2, 'named', { named: true })
  );
  const section = editor.read(bytes, 'Section0', metrics());
  assert.equal(editor.find(section, 'protected').length, 0);
  assert.equal(editor.find(section, 'named').length, 0);
  const match = editor.find(section, 'ordinary')[0];
  assert.match(match.location, /1행 1열/);
  assert.equal(editor.replace(section, match, 'ordinary', 'plain'), true);
  assert.equal(editor.find(section, 'plain')[0].offset, match.offset);
  assert.equal(editor.find(section, 'protected').length, 0);
  assert.equal(editor.find(section, 'named').length, 0);
});

test('fits a resized Hangul cell to the stored width and retains metrics on rollback', () => {
  const bytes = table(tableCell(0, '사과', { lineWidth: 3380 }));
  const section = editor.read(bytes, 'Section0', metrics());
  const change = (query, replacement) => editor.replace(section, editor.find(section, query)[0], query, replacement);
  assert.throws(() => change('과', '복숭아'), /폭이 부족/);
  assert.equal(section.bytes, bytes);
  assert.equal(change('사과', '복숭아'), true);
  assert.equal(change('복숭아', '배'), true);
  editor.restore(section, bytes);
  assert.equal(change('사과', '복숭아'), true);
});

test('blocks width-increasing shrink and never credits negative spacing', () => {
  const cases = [
    ['AB', '가', 1500, metrics({ fontScale: [200, 50] })],
    ['사과', '복숭아', 3200, metrics({ fontSpacing: [-50, 0] })],
    ['사과', '복숭아', 3380, metrics({ fontSpacing: [5, 0] })],
    ['사과', '복숭아', 3380, metrics({ fontRatio: [110, 100] })],
  ];
  for (const [query, replacement, lineWidth, charShapes] of cases) {
    const bytes = table(tableCell(0, query, { lineWidth }));
    const section = editor.read(bytes, 'Section0', charShapes);
    assert.throws(() => editor.replace(section, editor.find(section, query)[0], query, replacement), /폭이 부족/);
    assert.equal(section.bytes, bytes);
  }
});

test('requires compatible font data and a simple horizontal cell for a length change', () => {
  const cases = [
    [{}, undefined, /글자 폭을 확인/],
    [{}, metrics({ fontScale: [0, 100] }), /글자 폭을 확인/],
    [{ lineWidth: 0 }, metrics(), /글자 폭을 확인/],
    [{ extraParagraph: '또' }, metrics(), /일반 표 셀/],
    [{ lines: [0, 1] }, metrics(), /일반 표 셀/],
    [{ shapes: [0, 1] }, metrics(), /일반 표 셀/],
    [{ properties: 1 }, metrics(), /일반 표 셀/],
    [{ properties: 8 }, metrics(), /일반 표 셀/],
  ];
  for (const [layout, charShapes, message] of cases) {
    const bytes = table(tableCell(0, '사과', layout));
    const section = editor.read(bytes, 'Section0', charShapes);
    const match = editor.find(section, '사')[0];
    assert.throws(() => editor.replace(section, match, '사', '복숭아'), message);
    assert.equal(section.bytes, bytes);
    assert.equal(editor.replace(section, match, '사', '배'), true);
  }
  const bytes = table(tableCell(0, '사과'));
  const section = editor.read(bytes, 'Section0', metrics());
  const match = editor.find(section, '사과')[0];
  assert.throws(() => editor.replace(section, match, '사과', 'α'), /글자 폭을 확인/);
});
