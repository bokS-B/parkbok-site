(function () {
  'use strict';

  const maxArchive = 10 * 1024 * 1024;
  const maxExpanded = 64 * 1024 * 1024;
  const maxEntries = 1024;
  const maxText = 80;
  const sectionPath = /^Contents\/section\d+\.xml$/;
  const previewTextPath = 'Preview/PrvText.txt';
  const previewImagePath = 'Preview/PrvImage.png';
  const blankPreview = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';
  const requiredXml = new Map([
    ['version.xml', 'HCFVersion'], ['settings.xml', 'HWPApplicationSetting'],
    ['META-INF/container.xml', 'container'], ['META-INF/manifest.xml', 'manifest'],
    ['Contents/content.hpf', 'package'], ['Contents/header.xml', 'head']
  ]);
  const paragraphNamespaces = new Map([
    ['http://www.hancom.co.kr/hwpml/2011/section', 'http://www.hancom.co.kr/hwpml/2011/paragraph'],
    ['http://www.owpml.org/owpml/2021/section', 'http://www.owpml.org/owpml/2021/paragraph']
  ]);
  const unsupported = '이 HWPX 문서는 안전하게 편집할 수 없습니다.';
  const protectedDocument = '암호·배포용 보호·수정 제한·서명이 있는 문서는 편집할 수 없습니다.';
  const invalidText = '줄바꿈과 탭 없이 80자 이하의 글자를 입력하세요.';
  const xmlCharacters = /^[\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]*$/u;
  const xmlPreamble = /^\uFEFF?(?:<\?xml\s[^?]*\?>)?/;
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const encoder = new TextEncoder();
  let zipLoader;

  function reject(message = unsupported) {
    throw new Error(message);
  }

  function indexEntries(bytes, entries) {
    if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length > maxArchive ||
      !Array.isArray(entries) || !entries.length || entries.length > maxEntries) reject();
    const byName = new Map();
    const foldedNames = new Set();
    let expanded = 0;
    for (const entry of entries) {
      if (!entry || typeof entry.name !== 'string') reject();
      const { name, size, originalSize, compression } = entry;
      const segments = name.replace(/\/$/, '').split('/');
      const folded = segments.join('/').normalize('NFC').toLowerCase();
      if (!name || /[\\:\u0000-\u001f\u007f]/.test(name) ||
        segments.some(part => !part || /[. ]$/.test(part)) ||
        foldedNames.has(folded) || !Number.isSafeInteger(size) || size < 0 || size > bytes.length ||
        !Number.isSafeInteger(originalSize) || originalSize < 0 || (compression !== 0 && compression !== 8) ||
        (compression === 0 && size !== originalSize) || (name.endsWith('/') && (compression || size))) reject();
      if (/^meta-inf\/(?:.*signatur|.*drm|.*encrypt)|^(?:doc(?:ument)?)?history\//.test(folded)) reject(protectedDocument);
      if (folded.startsWith('preview/') && name !== previewTextPath && name !== previewImagePath) reject();
      expanded += originalSize;
      if (expanded > maxExpanded) reject();
      foldedNames.add(folded);
      byName.set(name, entry);
    }
    if (!byName.has('mimetype') || Array.from(requiredXml.keys()).some(name => !byName.has(name)) ||
      !Array.from(byName.keys()).some(name => sectionPath.test(name))) reject();
    const mimetype = byName.get('mimetype');
    if (mimetype.compression !== 0 || mimetype.originalSize !== 19) reject();
    return byName;
  }

  function canEdit(bytes, entries) {
    try {
      indexEntries(bytes, entries);
      return true;
    } catch (_) {
      return false;
    }
  }

  function verifyArchive(bytes, byName) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u16 = offset => view.getUint16(offset, true);
    const u32 = offset => view.getUint32(offset, true);
    const end = bytes.length - 22;
    let footer = end;
    for (; footer >= Math.max(0, end - 65535); footer--) {
      if (u32(footer) === 0x06054b50 && footer + 22 + u16(footer + 20) === bytes.length) break;
    }
    if (footer < Math.max(0, end - 65535) || u16(footer + 4) || u16(footer + 6) ||
      u16(footer + 8) !== byName.size || u16(footer + 10) !== byName.size) reject();
    const start = u32(footer + 16);
    if (start + u32(footer + 12) !== footer) reject();
    let cursor = start;
    const checked = new Set();
    const ranges = [];
    for (let i = 0; i < byName.size; i++) {
      if (cursor + 46 > footer || u32(cursor) !== 0x02014b50) reject();
      const flags = u16(cursor + 8);
      if (flags & 0x2041) reject(protectedDocument);
      const method = u16(cursor + 10);
      const compressed = u32(cursor + 20);
      const expanded = u32(cursor + 24);
      const nameSize = u16(cursor + 28);
      const nameEnd = cursor + 46 + nameSize;
      const local = u32(cursor + 42);
      if (nameEnd > footer || local + 30 > start || u16(cursor + 34)) reject();
      const name = decoder.decode(bytes.subarray(cursor + 46, nameEnd));
      const entry = byName.get(name);
      if (!entry || checked.has(name) || entry.compression !== method || entry.size !== compressed ||
        entry.originalSize !== expanded || u32(local) !== 0x04034b50 || u16(local + 6) !== flags ||
        u16(local + 8) !== method || u16(local + 26) !== nameSize) reject();
      const data = local + 30 + nameSize + u16(local + 28);
      if (data + compressed > start || decoder.decode(bytes.subarray(local + 30, local + 30 + nameSize)) !== name) reject();
      if (!i && (name !== 'mimetype' || local !== 0 ||
        decoder.decode(bytes.subarray(data, data + compressed)) !== 'application/hwp+zip')) reject();
      checked.add(name);
      ranges.push([local, data + compressed]);
      cursor = nameEnd + u16(cursor + 30) + u16(cursor + 32);
    }
    ranges.sort((a, b) => a[0] - b[0]);
    if (cursor !== footer || ranges.some((range, i) => i && range[0] < ranges[i - 1][1])) reject();
  }

  function loadZipLibrary() {
    if (window.JSZip) return Promise.resolve(window.JSZip);
    if (!zipLoader) {
      zipLoader = new Promise((resolve, rejectLoad) => {
        const script = document.createElement('script');
        script.src = '/assets/vendor/jszip.min.js';
        script.onload = () => {
          if (window.JSZip) resolve(window.JSZip);
          else rejectLoad(new Error('HWPX 저장 모듈을 불러오지 못했습니다.'));
        };
        script.onerror = () => rejectLoad(new Error('HWPX 저장 모듈을 불러오지 못했습니다.'));
        document.head.appendChild(script);
      }).catch(error => {
        zipLoader = null;
        throw error;
      });
    }
    return zipLoader;
  }

  function parseXml(text) {
    const declaration = xmlPreamble.exec(text)[0];
    const encoding = /\bencoding\s*=\s*["']([^"']+)["']/i.exec(declaration);
    if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(text) || (encoding && !/^utf-8$/i.test(encoding[1]))) reject();
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    if (!doc.documentElement || doc.getElementsByTagName('parsererror').length || doc.doctype) reject();
    return { doc, declaration };
  }

  function checkProtection(doc) {
    const protection = /^(?:encryptiondata|signature|signatures|modify(?:password|protection)(?:info)?|password(?:info|protect(?:ion|ed)?)?|drm(?:info|protect(?:ion|ed)?)?|distribute(?:doc|document|password)?|distribution(?:password|protected)?|readonly(?:recommended)?|documentprotection)$/;
    const revision = /^(?:insertbegin|insertend|deletebegin|deleteend|trackchange|trackchanges|trackchangeinfo)$/;
    const normalized = name => name.replace(/[-_]/g, '').toLowerCase();
    for (const el of doc.getElementsByTagName('*')) {
      const name = normalized(el.localName);
      if (protection.test(name) || protection.test(normalized(el.getAttribute('name') || '')) ||
        revision.test(name) || Array.from(el.attributes).some(attr =>
          protection.test(normalized(attr.localName)) && !/^(?:|0|false|none)$/i.test(attr.value.trim()))) reject(protectedDocument);
      if (name === 'trackchangeconfig' && !/^(?:|0)$/.test(el.getAttribute('flags') || '')) reject();
    }
  }

  async function checkParts(zip, byName, sections) {
    if (Object.keys(zip.files).length !== byName.size) reject();
    for (const name of byName.keys()) {
      const file = zip.files[name];
      if (!file || file.dir !== name.endsWith('/') ||
        (file.unsafeOriginalName !== undefined && file.unsafeOriginalName !== name) ||
        (file.unixPermissions & 0o170000) === 0o120000) reject();
    }
    const names = Array.from(byName.keys()).filter(name => sectionPath.test(name));
    if (!Array.isArray(sections) || sections.length !== names.length ||
      new Set(sections.map(section => section.name)).size !== names.length) reject();
    for (const [name, root] of requiredXml) {
      const xml = parseXml(decoder.decode(await zip.file(name).async('uint8array'))).doc;
      if (xml.documentElement.localName !== root) reject();
      checkProtection(xml);
    }
    const verified = [];
    for (const section of sections) {
      if (!names.includes(section.name) || !section.xml || !section.xml.documentElement) reject();
      const { doc, declaration } = parseXml(decoder.decode(await zip.file(section.name).async('uint8array')));
      const root = section.xml.documentElement;
      const namespace = paragraphNamespaces.get(root.namespaceURI);
      if (!namespace || root.localName !== 'sec' || !doc.documentElement.isEqualNode(root)) reject();
      checkProtection(doc);
      verified.push({ name: section.name, xml: section.xml, namespace, declaration });
    }
    return verified;
  }

  function allowedText(value, allowEmpty) {
    return typeof value === 'string' && value.length <= 2 * maxText && (allowEmpty || !!value.trim()) &&
      Array.from(value).length <= maxText && !/[\t\r\n\u0085\u2028\u2029]/.test(value) && xmlCharacters.test(value);
  }

  function locked(element, attribute) {
    const value = element.getAttribute(attribute);
    return value !== null && !/^(?:0|false)$/i.test(value.trim());
  }

  function locationFor(text, section) {
    const is = (node, name) => !!node && node.namespaceURI === section.namespace && node.localName === name;
    if (!is(text, 't')) return null;
    const run = text.parentElement;
    if (!is(run, 'run') || run.children.length !== 1 || text.childNodes.length !== 1 ||
      text.firstChild.nodeType !== 3) return null;
    const paragraph = run.parentElement;
    if (!is(paragraph, 'p')) return null;
    const root = section.xml.documentElement;
    const paragraphNumber = p => Array.prototype.indexOf.call(root.children, p) + 1;
    if (paragraph.parentElement === root) return '본문 ' + paragraphNumber(paragraph) + '문단';
    const list = paragraph.parentElement;
    const cell = list && list.parentElement;
    const row = cell && cell.parentElement;
    const table = row && row.parentElement;
    const tableRun = table && table.parentElement;
    const tableParagraph = tableRun && tableRun.parentElement;
    if (!is(list, 'subList') || !is(cell, 'tc') || !is(row, 'tr') || !is(table, 'tbl') ||
      !is(tableRun, 'run') || !is(tableParagraph, 'p') || tableParagraph.parentElement !== root ||
      cell.getAttribute('name') || locked(cell, 'protect') || locked(table, 'lock')) return null;
    const rowNumber = Array.from(table.children).filter(child => is(child, 'tr')).indexOf(row) + 1;
    const cellNumber = Array.from(row.children).filter(child => is(child, 'tc')).indexOf(cell) + 1;
    return paragraphNumber(tableParagraph) + '문단 표 ' + rowNumber + '행 ' + cellNumber + '셀';
  }

  function createEditor(zip, byName, sections) {
    const dirty = new Set();
    const issued = new WeakMap();
    let saving = false;

    function* textNodes() {
      let fieldDepth = 0;
      for (const section of sections) {
        for (const el of section.xml.getElementsByTagName('*')) {
          if (el.namespaceURI !== section.namespace) continue;
          if (el.localName === 'fieldBegin') fieldDepth++;
          if (el.localName === 'fieldEnd') fieldDepth = Math.max(0, fieldDepth - 1);
          if (fieldDepth || el.localName !== 't') continue;
          const node = el.firstChild;
          if (node && node.nodeType === 3) yield { section, node };
        }
      }
    }

    function issueMatch(section, node, query, offset, location) {
      const text = node.data;
      const left = Math.max(0, offset - 24);
      const right = Math.min(text.length, offset + query.length + 24);
      const context = (left ? '…' : '') + text.slice(left, right) + (right < text.length ? '…' : '');
      const match = { sectionName: section.name, node, offset, context, location };
      issued.set(match, { section, node, offset, text, query });
      return match;
    }

    function find(query) {
      const matches = [];
      if (!allowedText(query, false)) return matches;
      for (const { section, node } of textNodes()) {
        const text = node.data;
        const firstOffset = text.indexOf(query);
        if (firstOffset === -1) continue;
        const location = locationFor(node.parentElement, section);
        if (!location) continue;
        for (let offset = firstOffset; offset !== -1; offset = text.indexOf(query, offset + query.length)) {
          matches.push(issueMatch(section, node, query, offset, location));
          if (matches.length === 100) return matches;
        }
      }
      return matches;
    }

    function findCell(cell) {
      const section = cell && sections.find(item => item.xml === cell.ownerDocument);
      if (!section) return null;
      const is = (node, name) => !!node && node.namespaceURI === section.namespace && node.localName === name;
      if (!is(cell, 'tc')) return null;
      const lists = Array.from(cell.children).filter(child => is(child, 'subList'));
      if (lists.length !== 1 || lists[0].children.length !== 1 ||
        cell.getElementsByTagNameNS(section.namespace, 'tbl').length) return null;
      const paragraph = lists[0].firstElementChild;
      if (!is(paragraph, 'p')) return null;
      const children = Array.from(paragraph.children);
      const runs = children.filter(child => is(child, 'run'));
      if (runs.length !== 1 || children.some(child => child !== runs[0] && !is(child, 'linesegarray')) ||
        runs[0].children.length !== 1) return null;
      const text = runs[0].firstElementChild;
      const location = locationFor(text, section);
      if (!location) return null;
      const node = text.firstChild;
      const query = node.data;
      if (!allowedText(query, false)) return null;

      // Use the document-order scan because a field can begin outside the tapped cell.
      for (const entry of textNodes()) {
        if (entry.node === node) return { query, match: issueMatch(section, node, query, 0, location) };
      }
      return null;
    }

    function replace(match, query, value) {
      if (saving) reject('파일을 저장하는 중입니다.');
      if (!allowedText(query, false) || !allowedText(value, true)) reject(invalidText);
      const target = issued.get(match);
      if (!target || target.query !== query || target.node.data !== target.text ||
        !locationFor(target.node.parentElement, target.section)) reject('검색 결과가 바뀌었습니다. 다시 검색해 주세요.');
      if (query === value) return false;
      const { section, node, offset, text } = target;
      node.data = text.slice(0, offset) + value + text.slice(offset + query.length);
      dirty.add(section);
      issued.delete(match);
      return true;
    }

    function writePart(archive, name, content) {
      const original = zip.files[name];
      archive.file(name, content, {
        createFolders: false,
        date: original.date,
        comment: original.comment,
        unixPermissions: original.unixPermissions,
        dosPermissions: original.dosPermissions,
        compression: byName.get(name).compression === 0 ? 'STORE' : 'DEFLATE'
      });
    }

    async function save(previewText) {
      if (!dirty.size) reject('편집한 내용이 없습니다.');
      if (saving) reject('파일을 저장하는 중입니다.');
      saving = true;
      try {
        const archive = zip.clone();
        // JSZip clones its outer object. Keep its entry map separate for failed saves and retries.
        archive.files = Object.assign(Object.create(null), zip.files);
        const serializer = new XMLSerializer();
        for (const section of dirty) {
          // Some browsers serialize the declaration with the document. Keep only the original preamble.
          const content = section.declaration + serializer.serializeToString(section.xml).replace(xmlPreamble, '');
          parseXml(content);
          writePart(archive, section.name, encoder.encode(content));
        }
        if (byName.has(previewTextPath)) {
          let preview = (typeof previewText === 'string' ? previewText : '').slice(0, 1000);
          if (!xmlCharacters.test(preview)) preview = '';
          writePart(archive, previewTextPath, encoder.encode(preview));
        }
        if (byName.has(previewImagePath)) {
          writePart(archive, previewImagePath, Uint8Array.from(atob(blankPreview), char => char.charCodeAt(0)));
        }
        for (const [name, entry] of byName) {
          // Keep stored parts stored, including the first mimetype entry.
          if (entry.compression === 0 && !entry.name.endsWith('/') && !archive.files[name].options.compression) {
            writePart(archive, name, await zip.files[name].async('uint8array'));
          }
        }
        const bytes = await archive.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
        if (bytes.length > maxArchive) reject();
        return bytes;
      } catch (_) {
        reject('편집한 HWPX 사본을 저장하지 못했습니다.');
      } finally {
        saving = false;
      }
    }

    return { find, findCell, replace, save };
  }

  async function load(bytes, entries, sections) {
    try {
      const byName = indexEntries(bytes, entries);
      verifyArchive(bytes, byName);
      const JSZip = await loadZipLibrary();
      const zip = await JSZip.loadAsync(bytes, { createFolders: false });
      const verified = await checkParts(zip, byName, sections);
      return createEditor(zip, byName, verified);
    } catch (error) {
      if (error && [unsupported, protectedDocument, 'HWPX 저장 모듈을 불러오지 못했습니다.'].includes(error.message)) throw error;
      reject();
    }
  }

  window.PBHWPXEditor = { canEdit, load };
})();
