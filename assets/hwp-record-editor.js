(function () {
  'use strict';

  // Hancom HWP 5.0 rev. 1.3, sections 3.2.2 and 4.3.
  const PARA_HEADER = 66;
  const PARA_TEXT = 67;
  const PARA_CHAR_SHAPE = 68;
  const PARA_LINE_SEG = 69;
  const CTRL_HEADER = 71;
  const LIST_HEADER = 72;
  const TABLE = 77;
  const TABLE_ID = 0x74626c20;
  const maxText = 80;
  const maxMatches = 100;
  const maxRecords = 200000;
  const maxRuns = 200000;
  const maxSectionSize = 32 * 1024 * 1024;
  const plainText = /^[^\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}\ufffe\uffff]+$/u;
  const characterControls = new Set([10, 13, 24, 30, 31]);
  const objectControls = new Set([2, 9, 11]);
  const sections = new WeakMap();
  const matches = new WeakMap();

  function unsupported() {
    throw new Error('이 HWP 본문의 구조는 안전하게 편집할 수 없습니다.');
  }

  function records(view) {
    const result = [];
    let offset = 0;
    let lastLevel = -1;
    while (offset < view.byteLength) {
      if (result.length >= maxRecords || offset + 4 > view.byteLength) unsupported();
      const header = view.getUint32(offset, true);
      const tag = header & 0x3ff;
      const level = (header >>> 10) & 0x3ff;
      let size = header >>> 20;
      offset += 4;
      if (size === 0xfff) {
        if (offset + 4 > view.byteLength) unsupported();
        size = view.getUint32(offset, true);
        offset += 4;
      }
      if (level > lastLevel + 1 || offset + size > view.byteLength) unsupported();
      result.push({ tag, level, offset, size });
      offset += size;
      lastLevel = level;
    }
    return result;
  }

  function readUnits(view, offset, length) {
    const chunks = [];
    for (let start = 0; start < length; start += 4096) {
      const units = [];
      for (let index = start; index < Math.min(length, start + 4096); index++) {
        units.push(view.getUint16(offset + index * 2, true));
      }
      chunks.push(String.fromCharCode(...units));
    }
    return chunks.join('');
  }

  function verifyFieldBoundaries(view, entries) {
    for (const record of entries) {
      if (record.tag !== PARA_TEXT) continue;
      const end = record.offset + record.size;
      let depth = 0;
      if (record.size % 2) unsupported();
      for (let at = record.offset; at < end;) {
        const unit = view.getUint16(at, true);
        // HWP uses eight UTF-16 units for extended and inline controls.
        const extended = (unit >= 1 && unit <= 9) || unit === 11 || unit === 12 || (unit >= 14 && unit <= 23);
        if (extended && (at + 16 > end || view.getUint16(at + 14, true) !== unit)) unsupported();
        if (unit === 3) depth++;
        if (unit === 4) {
          if (!depth) unsupported();
          depth--;
        }
        at += extended ? 16 : 2;
      }
      // A field that continues across paragraphs makes those paragraphs read-only.
      if (depth) unsupported();
    }
  }

  function readBoundaries(view, record, count, stride, length) {
    if (!record || record.size !== count * stride || !count) return null;
    const positions = [];
    for (let index = 0; index < count; index++) {
      const position = view.getUint32(record.offset + index * stride, true);
      if ((!index && position !== 0) || position >= length ||
          (index && position < positions[index - 1])) return null;
      positions.push(position);
    }
    return positions;
  }

  function paragraphRuns(view, entries, index, location) {
    const paragraph = entries[index];
    const text = entries[index + 1];
    const shapes = entries[index + 2];
    const lines = entries[index + 3];
    if (![22, 24].includes(paragraph.size) || !text || !shapes ||
        text.level !== paragraph.level + 1 || text.tag !== PARA_TEXT ||
        shapes.level !== text.level || shapes.tag !== PARA_CHAR_SHAPE ||
        view.getUint16(paragraph.offset + 14, true) ||
        (paragraph.size === 24 && view.getUint16(paragraph.offset + 22, true))) return [];

    const length = view.getUint32(paragraph.offset, true) & 0x7fffffff;
    if (length < 2 || text.size !== length * 2 ||
        view.getUint16(text.offset + text.size - 2, true) !== 13) return [];

    const shapePositions = readBoundaries(view, shapes, view.getUint16(paragraph.offset + 12, true), 8, length);
    const lineCount = view.getUint16(paragraph.offset + 16, true);
    const linePositions = lineCount && lines && lines.level === text.level && lines.tag === PARA_LINE_SEG
      ? readBoundaries(view, lines, lineCount, 36, length) : null;
    if (!shapePositions || !linePositions) return [];
    const boundaries = new Set([...shapePositions, ...linePositions]);
    const runs = [];
    let start = 0;

    function addRun(end) {
      if (end <= start) return;
      if (runs.length === maxRuns) unsupported();
      runs.push({ offset: text.offset + start * 2, length: end - start, location });
    }

    for (let at = 0; at < length;) {
      if (boundaries.has(at)) {
        addRun(at);
        start = at;
      }
      const unit = view.getUint16(text.offset + at * 2, true);
      if (unit >= 32) {
        at++;
        continue;
      }
      addRun(at);
      if (characterControls.has(unit)) {
        at++;
      } else if (objectControls.has(unit) && at + 8 < length &&
          view.getUint16(text.offset + (at + 7) * 2, true) === unit) {
        at += 8;
      } else {
        // Field spans, notes, and unrecognized controls can change which text is editable.
        return [];
      }
      start = at;
    }
    return runs;
  }

  function tableControl(view, record) {
    if (record.tag !== CTRL_HEADER || record.size < 46 ||
        view.getUint32(record.offset, true) !== TABLE_ID) return null;
    const properties = view.getUint32(record.offset + 4, true);
    const descriptionLength = view.getUint16(record.offset + 44, true);
    if (record.size !== 46 + descriptionLength * 2 || (properties & 0xe0100000)) return null;
    return { rows: 0, columns: 0, cell: null };
  }

  function readCell(view, record, table) {
    if (record.size < 38 || !table.rows || !table.columns) return null;
    const offset = record.offset;
    const paragraphCount = view.getUint32(offset, true);
    // The actual 8-byte cell list header stores protection in bit 17 of its attributes.
    const properties = view.getUint32(offset + 4, true);
    const column = view.getUint16(offset + 8, true);
    const row = view.getUint16(offset + 10, true);
    const columnSpan = view.getUint16(offset + 12, true);
    const rowSpan = view.getUint16(offset + 14, true);
    if (!paragraphCount || paragraphCount > maxRecords || (properties & 0x000a0000) ||
        !columnSpan || !rowSpan || column + columnSpan > table.columns || row + rowSpan > table.rows) return null;
    // The observed extended cell header encodes a named field after its text-width field.
    for (let at = offset + 38; at < offset + record.size; at++) {
      if (view.getUint8(at) !== 0) return null;
    }
    return { paragraphCount, row, column };
  }

  function read(bytes, sectionName) {
    if (!ArrayBuffer.isView(bytes) || bytes.BYTES_PER_ELEMENT !== 1 ||
        !bytes.byteLength || bytes.byteLength > maxSectionSize) unsupported();
    const name = String(sectionName);
    const number = /Section(\d+)$/i.exec(name);
    if (!number) unsupported();
    const label = (Number(number[1]) + 1) + '구역 ';
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const entries = records(view);
    if (entries[0].tag !== PARA_HEADER) unsupported();
    verifyFieldBoundaries(view, entries);

    const runs = [];
    function addParagraph(index, location) {
      const next = paragraphRuns(view, entries, index, location);
      if (runs.length + next.length > maxRuns) unsupported();
      for (const run of next) runs.push(run);
    }

    let paragraphNumber = 0;
    let mainParagraph = false;
    let tableNumber = 0;
    let table = null;
    entries.forEach((record, index) => {
      if (record.level === 0) {
        table = null;
        tableNumber = 0;
        mainParagraph = record.tag === PARA_HEADER;
        if (mainParagraph) {
          paragraphNumber++;
          addParagraph(index, label + paragraphNumber + '문단');
        }
      } else if (record.level === 1) {
        table = mainParagraph ? tableControl(view, record) : null;
        if (table) tableNumber++;
      } else if (record.level === 2 && table) {
        if (record.tag === TABLE) {
          if (record.size < 20 || table.rows) {
            table = null;
          } else {
            table.rows = view.getUint16(record.offset + 4, true);
            table.columns = view.getUint16(record.offset + 6, true);
          }
        } else if (record.tag === LIST_HEADER) {
          table.cell = readCell(view, record, table);
        } else if (record.tag === PARA_HEADER && table.cell && table.cell.paragraphCount > 0) {
          const cell = table.cell;
          cell.paragraphCount--;
          const location = label + paragraphNumber + '문단 표 ' + tableNumber +
            ' · ' + (cell.row + 1) + '행 ' + (cell.column + 1) + '열';
          addParagraph(index, location);
        } else {
          table.cell = null;
        }
      }
    });
    const section = Object.freeze({ bytes, name, runCount: runs.length });
    sections.set(section, { runs, view, revision: 0 });
    return section;
  }

  function validText(value) {
    return typeof value === 'string' && value.length <= maxText && plainText.test(value);
  }

  function find(section, query) {
    const state = sections.get(section);
    if (!state || !validText(query)) return [];
    const result = [];
    for (const run of state.runs) {
      const text = readUnits(state.view, run.offset, run.length);
      let at = text.indexOf(query);
      while (at !== -1) {
        const offset = run.offset + at * 2;
        const begin = Math.max(0, at - 24);
        const end = Math.min(text.length, at + query.length + 24);
        const context = (begin ? '…' : '') + text.slice(begin, end) + (end < text.length ? '…' : '');
        const match = Object.freeze({ offset, location: run.location, context });
        matches.set(match, { section, query, revision: state.revision });
        result.push(match);
        if (result.length === maxMatches) return result;
        at = text.indexOf(query, at + query.length);
      }
    }
    return result;
  }

  function replace(section, match, query, replacement) {
    const state = sections.get(section);
    const candidate = matches.get(match);
    if (!state || !candidate || candidate.section !== section || candidate.query !== query ||
        candidate.revision !== state.revision || readUnits(state.view, match.offset, query.length) !== query) {
      throw new Error('문구를 다시 찾은 뒤 변경할 위치를 선택하세요.');
    }
    if (!validText(replacement) || replacement.length !== query.length) {
      throw new Error('줄바꿈 없이 찾은 문구와 길이가 같은 문구를 입력하세요.');
    }
    if (replacement === query) return false;
    for (let index = 0; index < replacement.length; index++) {
      state.view.setUint16(match.offset + index * 2, replacement.charCodeAt(index), true);
    }
    state.revision++;
    return true;
  }

  window.PBHwpRecords = { read, find, replace };
})();
