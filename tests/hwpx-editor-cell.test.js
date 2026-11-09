'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const namespace = 'http://www.hancom.co.kr/hwpml/2011/paragraph';
const source = fs.readFileSync(require.resolve('../assets/hwpx-editor.js'), 'utf8');
const window = {};
// The fixture models the verified XML trees that load hands to the editor.
vm.runInNewContext(source.replace('window.PBHWPXEditor = { canEdit, load };',
  'window.PBHWPXEditor = { createEditor };'), { window, TextEncoder, TextDecoder });
const { createEditor } = window.PBHWPXEditor;

function descendants(node) {
  return node.children.flatMap(child => [child, ...descendants(child)]);
}

function element(localName, childNodes = [], attrs = {}) {
  const node = {
    localName, namespaceURI: namespace, nodeType: 1, childNodes,
    children: childNodes.filter(child => child.nodeType === 1),
    getAttribute(name) { return attrs[name] ?? null; },
    getElementsByTagNameNS(ns, name) {
      return descendants(node).filter(child => child.namespaceURI === ns && child.localName === name);
    }
  };
  node.firstElementChild = node.children[0] ?? null;
  node.firstChild = node.childNodes[0] ?? null;
  for (const child of childNodes) child.parentElement = node;
  return node;
}

const run = data => element('run', [element('t', data === '' ? [] : [{ nodeType: 3, data }])]);
const paragraph = (...children) => element('p', children);
const listCell = (paragraphs, attrs) => element('tc', [
  element('cellAddr'), element('subList', paragraphs), element('cellSpan')
], attrs);
const cell = (data, attrs) => listCell([paragraph(run(data), element('linesegarray'))], attrs);
const table = (cells, attrs) => paragraph(element('run', [element('tbl', [element('tr', cells)], attrs)]));

function section(name, ...paragraphs) {
  const documentElement = element('sec', paragraphs);
  const xml = { documentElement, getElementsByTagName: () => [documentElement, ...descendants(documentElement)] };
  for (const node of xml.getElementsByTagName('*')) node.ownerDocument = xml;
  return { name, xml, namespace };
}

function editor(...sections) {
  return createEditor(null, null, sections);
}

const getText = tc => tc.getElementsByTagNameNS(namespace, 't')[0].firstChild.data;

test('uses exact cell identity even when identical text exists in multiple cells and sections', () => {
  const first = cell(' 같은 문구 ');
  const second = cell(' 같은 문구 ');
  const third = cell(' 같은 문구 ');
  const foreign = cell(' 같은 문구 ');
  section('Contents/section0.xml', table([foreign]));
  const tool = editor(section('Contents/section0.xml', table([first, second])),
    section('Contents/section1.xml', table([third])));

  assert.equal(tool.find('같은 문구').length, 3);
  assert.equal(tool.findCell(foreign), null);
  const chosen = tool.findCell(second);
  assert.equal(chosen.query, ' 같은 문구 ');
  assert.match(chosen.match.location, /2셀$/);
  assert.equal(tool.replace(chosen.match, chosen.query, '여기만 바꿈'), true);
  assert.equal(getText(first), ' 같은 문구 ');
  assert.equal(getText(second), '여기만 바꿈');
  assert.equal(getText(third), ' 같은 문구 ');
  assert.equal(tool.find('같은 문구').length, 2);
  assert.throws(() => tool.replace(chosen.match, chosen.query, '다시 변경'));
});

test('skips blank, protected, named, nested, and structurally mixed cells', () => {
  const blank = cell('');
  const spaces = cell('  ');
  const tooLong = cell('가'.repeat(81));
  const locked = cell('보호 셀', { protect: ' true ' });
  const named = cell('이름 셀', { name: 'form-field' });
  const lockedTable = cell('보호된 표');
  const inner = cell('중첩 표');
  const outer = listCell([paragraph(run('바깥 셀'), table([inner]).firstElementChild)]);
  const multiRun = listCell([paragraph(run('첫 서식'), run('둘째 서식'))]);
  const multiParagraph = listCell([paragraph(run('첫 문단')), paragraph(run('둘째 문단'))]);
  const plain = cell('일반 셀', { protect: ' false ' });
  const tool = editor(section('Contents/section0.xml',
    table([blank, spaces, tooLong, locked, named, outer, multiRun, multiParagraph, plain]),
    table([lockedTable], { lock: '1' })));

  for (const tc of [blank, spaces, tooLong, locked, named, lockedTable, inner, outer, multiRun, multiParagraph]) {
    assert.equal(tool.findCell(tc), null);
  }
  assert.equal(tool.find('첫 서식').length, 1);
  assert.equal(tool.findCell(plain).query, '일반 셀');
});

test('respects fields opened outside the selected cell, including across sections', () => {
  const inside = cell('필드 안');
  const outside = cell('필드 밖');
  const tool = editor(
    section('Contents/section0.xml', paragraph(element('run', [element('fieldBegin')]))),
    section('Contents/section1.xml', table([inside]),
      paragraph(element('run', [element('fieldEnd')])), table([outside]))
  );
  assert.equal(tool.find('필드 안').length, 0);
  assert.equal(tool.findCell(inside), null);
  assert.equal(tool.findCell(outside).query, '필드 밖');
});
