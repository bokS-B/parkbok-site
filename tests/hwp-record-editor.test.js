'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const window = {};
vm.runInNewContext(fs.readFileSync(require.resolve('../assets/hwp-record-editor.js'), 'utf8'), { window });
const editor = window.PBHwpRecords;

function record(tag, level, body) {
  const header = Buffer.alloc(4);
  header.writeUInt32LE(tag | (level << 10) | (body.length << 20));
  return Buffer.concat([header, body]);
}

function paragraph(text, { level = 0, shapes = [0], lines = [0], ranges = 0 } = {}) {
  const header = Buffer.alloc(24);
  header.writeUInt32LE(text.length);
  header.writeUInt16LE(shapes.length, 12);
  header.writeUInt16LE(ranges, 14);
  header.writeUInt16LE(lines.length, 16);
  const shapeRecord = Buffer.alloc(shapes.length * 8);
  const lineRecord = Buffer.alloc(lines.length * 36);
  shapes.forEach((position, index) => shapeRecord.writeUInt32LE(position, index * 8));
  lines.forEach((position, index) => lineRecord.writeUInt32LE(position, index * 36));
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

function tableCell(column, text, { protectedCell = false, named = false } = {}) {
  const header = Buffer.alloc(47);
  header.writeUInt32LE(1);
  if (protectedCell) header.writeUInt32LE(1 << 17, 4);
  header.writeUInt16LE(column, 8);
  header.writeUInt16LE(1, 12);
  header.writeUInt16LE(1, 14);
  if (named) header[38] = 0xff;
  return [record(72, 2, header), ...paragraph(text + '\r', { level: 2 })];
}

test('writes only the selected same-length occurrence and invalidates stale matches', () => {
  const bytes = Buffer.concat(paragraph('배포 전 · 배포 후\r'));
  const original = Buffer.from(bytes);
  const section = editor.read(bytes, 'BodyText/Section0');
  const matches = editor.find(section, '배포');
  assert.equal(matches.length, 2);
  const selected = matches[1];
  assert.equal(editor.replace(section, selected, '배포', '배포'), false);
  assert.throws(() => editor.replace(section, selected, '배포', '다른 길이'));
  assert.throws(() => editor.replace(section, selected, '배포', '검\n'));
  assert.throws(() => editor.replace(section, { ...selected }, '배포', '검증'));
  assert.deepEqual(bytes, original);

  assert.equal(editor.replace(section, selected, '배포', '검증'), true);
  const expected = Buffer.from(original);
  expected.write('검증', selected.offset, 'utf16le');
  assert.deepEqual(bytes, expected);
  assert.equal(editor.find(section, '배포')[0].offset, matches[0].offset);
  assert.equal(editor.find(section, '검증')[0].offset, selected.offset);
  assert.throws(() => editor.replace(section, matches[0], '배포', '검증'));
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

test('allows ordinary table cells and skips named or protected cells', () => {
  const tableControl = Buffer.alloc(46);
  tableControl.writeUInt32LE(0x74626c20);
  const table = Buffer.alloc(24);
  table.writeUInt16LE(1, 4);
  table.writeUInt16LE(3, 6);
  const bytes = Buffer.concat([
    ...paragraph(control(11) + '\r'),
    record(71, 1, tableControl),
    record(77, 2, table),
    ...tableCell(0, 'ordinary'),
    ...tableCell(1, 'protected', { protectedCell: true }),
    ...tableCell(2, 'named', { named: true }),
  ]);
  const section = editor.read(bytes, 'Section0');
  assert.equal(editor.find(section, 'protected').length, 0);
  assert.equal(editor.find(section, 'named').length, 0);
  const match = editor.find(section, 'ordinary')[0];
  assert.match(match.location, /1행 1열/);
  assert.equal(editor.replace(section, match, 'ordinary', 'editable'), true);
  assert.equal(editor.find(section, 'editable')[0].offset, match.offset);
});
