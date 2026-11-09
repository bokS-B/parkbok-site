(function () {
  'use strict';

  const maxFileSize = 10 * 1024 * 1024;
  const maxSectionData = 48 * 1024 * 1024;
  const cfbSignature = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];
  const sectionPath = /^BodyText\/Section(\d+)$/;
  const unsupported = '편집을 지원하는 일반 HWP 5 문서가 아닙니다.';
  const blankPreview = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';
  let loading;

  function canEdit(bytes) {
    return bytes.length >= 512 && bytes.length <= maxFileSize &&
      cfbSignature.every((value, index) => bytes[index] === value);
  }

  function loadScript(path, ready) {
    if (ready()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = path;
      script.onload = () => ready() ? resolve() : reject(new Error('HWP 저장 모듈을 불러오지 못했습니다.'));
      script.onerror = () => reject(new Error('HWP 저장 모듈을 불러오지 못했습니다.'));
      document.head.appendChild(script);
    });
  }

  function loadDependencies() {
    if (!loading) {
      loading = Promise.all([
        loadScript('/assets/vendor/cfb.min.js', () => window.CFB && window.CRC32),
        loadScript('/assets/vendor/pako.min.js', () => window.pako)
      ]).catch(error => { loading = null; throw error; });
    }
    return loading;
  }

  function view(bytes) {
    return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  function readSection(input, compressed, remaining) {
    if (!compressed) {
      if (input.length > remaining) throw new Error(unsupported);
      return { data: input, trailer: false };
    }
    const chunks = [];
    let size = 0;
    const inflater = new window.pako.Inflate({ raw: true });
    inflater.onData = chunk => {
      size += chunk.length;
      if (size > remaining) throw new Error(unsupported);
      chunks.push(chunk);
    };
    if (!inflater.push(input, true) || inflater.err || !inflater.ended) throw new Error(unsupported);
    const data = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      data.set(chunk, offset);
      offset += chunk.length;
    }
    // Some HWP files append CRC-32 and uncompressed size after raw DEFLATE.
    const trailer = input.subarray(inflater.strm.next_in);
    if (trailer.length &&
      (trailer.length !== 8 || view(trailer).getUint32(0, true) !== (window.CRC32.buf(data) >>> 0) ||
        view(trailer).getUint32(4, true) !== size)) throw new Error(unsupported);
    return { data, trailer: !!trailer.length };
  }

  function writeSection(bytes, compressed, trailer) {
    if (!compressed) return bytes;
    const deflated = window.pako.deflateRaw(bytes);
    if (!trailer) return deflated;
    const output = new Uint8Array(deflated.length + 8);
    output.set(deflated);
    view(output).setUint32(deflated.length, window.CRC32.buf(bytes) >>> 0, true);
    view(output).setUint32(deflated.length + 4, bytes.length, true);
    return output;
  }

  function previewBytes(text, original) {
    text = text.slice(0, 1022).replace(/[\uD800-\uDBFF]$/, '');
    const bom = original[0] === 255 && original[1] === 254;
    const offset = bom ? 2 : 0;
    const bytes = new Uint8Array(offset + text.length * 2);
    const data = view(bytes);
    if (bom) data.setUint16(0, 0xfeff, true);
    for (let i = 0; i < text.length; i++) data.setUint16(offset + i * 2, text.charCodeAt(i), true);
    return bytes;
  }

  function createEditor(container, entries, sections, compressed) {
    const dirty = new Set();
    let expandedSize = sections.reduce((total, section) => total + section.records.bytes.length, 0);

    function find(query) {
      const matches = [];
      for (const section of sections) {
        for (const match of window.PBHwpRecords.find(section.records, query)) {
          matches.push({ section, match, location: match.location, context: match.context });
          if (matches.length === 100) return matches;
        }
      }
      return matches;
    }

    function copy(previewText) {
      const next = {
        FullPaths: container.FullPaths.slice(),
        FileIndex: container.FileIndex.map(entry => ({ ...entry }))
      };
      function setContent(index, bytes) {
        next.FileIndex[index].content = bytes;
        next.FileIndex[index].size = bytes.length;
      }
      for (const section of dirty) {
        setContent(section.index, writeSection(section.records.bytes, compressed, section.trailer));
      }
      if (typeof previewText === 'string') {
        const text = entries.get('PrvText');
        const image = entries.get('PrvImage');
        if (text !== undefined) setContent(text, previewBytes(previewText, container.FileIndex[text].content));
        if (image !== undefined) setContent(image, Uint8Array.from(atob(blankPreview), ch => ch.charCodeAt(0)));
      }
      return Uint8Array.from(window.CFB.write(next, { type: 'array', fileType: 'cfb' }));
    }

    function replace(item, query, replacement, show) {
      if (!item || !sections.includes(item.section)) throw new Error('문구를 다시 찾아 주세요.');
      const { section, match } = item;
      const before = section.records.bytes;
      const wasDirty = dirty.has(section);
      if (!window.PBHwpRecords.replace(section.records, match, query, replacement)) return false;
      const nextSize = expandedSize - before.length + section.records.bytes.length;
      if (nextSize > maxSectionData) {
        window.PBHwpRecords.restore(section.records, before);
        throw new Error('편집할 수 있는 문서 용량을 넘습니다.');
      }
      dirty.add(section);
      try {
        show(copy());
      } catch (error) {
        window.PBHwpRecords.restore(section.records, before);
        if (!wasDirty) dirty.delete(section);
        throw new Error('수정본을 열 수 없습니다. 문구를 다시 찾아 주세요.');
      }
      expandedSize = nextSize;
      return true;
    }

    function save(previewText) {
      if (!dirty.size) throw new Error('편집한 내용이 없습니다.');
      const result = copy(previewText);
      if (result.length > maxFileSize) throw new Error('사본이 10MB를 넘습니다.');
      return result;
    }

    return { find, replace, save };
  }

  async function load(bytes, charShapes) {
    if (!canEdit(bytes) || !window.PBHwpRecords) throw new Error(unsupported);
    await loadDependencies();
    try {
      const container = window.CFB.read(bytes, { type: 'array' });
      if (container.FileIndex.length > 512 || container.FileIndex[0].type !== 5) throw new Error(unsupported);
      const root = container.FullPaths[0];
      const entries = new Map();
      const seen = new Set();
      for (let i = 1; i < container.FileIndex.length; i++) {
        if (container.FileIndex[i].type !== 2) continue;
        const path = container.FullPaths[i];
        const name = path.slice(root.length);
        if (!path.startsWith(root) || !name || seen.has(name.toLowerCase()) ||
          /^ViewText\/|^(?:Doc)?History\/|signature|DRM/i.test(name)) throw new Error(unsupported);
        seen.add(name.toLowerCase());
        entries.set(name, i);
      }
      const entry = container.FileIndex[entries.get('FileHeader')];
      const header = entry && Uint8Array.from(entry.content);
      const signature = 'HWP Document File';
      if (!header || header.length < 40 ||
        !Array.from(signature).every((ch, i) => header[i] === ch.charCodeAt(0)) || header[35] !== 5 ||
        (view(header).getUint32(36, true) & ~1) !== 0) throw new Error(unsupported);
      const compressed = !!(header[36] & 1);
      const names = [...entries.keys()].filter(name => sectionPath.test(name))
        .sort((a, b) => Number(sectionPath.exec(a)[1]) - Number(sectionPath.exec(b)[1]));
      if (!names.length) throw new Error(unsupported);
      let remaining = maxSectionData;
      const sections = names.map(name => {
        const index = entries.get(name);
        const result = readSection(Uint8Array.from(container.FileIndex[index].content), compressed, remaining);
        remaining -= result.data.length;
        const records = window.PBHwpRecords.read(result.data, name, charShapes);
        return { index, trailer: result.trailer, records };
      });
      if (!sections.some(section => section.records.runCount)) throw new Error(unsupported);
      return createEditor(container, entries, sections, compressed);
    } catch (_) {
      throw new Error(unsupported);
    }
  }

  window.PBHwpEditor = { canEdit, load };
})();
