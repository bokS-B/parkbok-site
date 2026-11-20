(() => {
  'use strict';
  const fileInput = document.getElementById('ledger-file');
  const status = document.getElementById('ledger-status');
  const result = document.getElementById('ledger-result');
  const MiB = 1024 * 1024;
  const nodes = (el, name) => Array.from(el.getElementsByTagNameNS('*', name));
  const relAttr = (el, name) => Array.from(el.attributes).find(a =>
    a.localName === name && a.namespaceURI?.endsWith('/relationships'))?.value;
  function coordinate(anchor) {
    const from = Array.from(anchor.children).find(el => el.localName === 'from');
    if (!from) return '고정 위치';
    const row = nodes(from, 'row')[0]?.textContent;
    const col = nodes(from, 'col')[0]?.textContent;
    if (!/^\d+$/.test(row) || !/^\d+$/.test(col) || +col >= 16384 || +row >= 1048576) return '위치 미상';
    let n = Number(col) + 1, letters = '';
    while (n) {
      n--;
      letters = String.fromCharCode(65 + n % 26) + letters;
      n = Math.floor(n / 26);
    }
    return letters + (Number(row) + 1);
  }
  async function inspect(file) {
    const zip = await JSZip.loadAsync(file);
    let remaining = 180 * MiB;
    async function bytes(path, max) {
      const entry = zip.file(path);
      if (!entry) throw new Error('엑셀 안의 그림 또는 문서 연결을 읽지 못했어요.');
      const chunks = [];
      let length = 0;
      await new Promise((resolve, reject) => {
        const stream = entry.internalStream('uint8array');
        stream.on('data', chunk => {
          length += chunk.length;
          if (length > max || length > remaining) {
            stream.pause();
            reject(new Error('압축을 푼 데이터가 너무 커요. 시트를 나눈 사본으로 검사해 주세요.'));
          } else chunks.push(chunk);
        }).on('end', resolve).on('error', reject).resume();
      });
      remaining -= length;
      const data = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.length; }
      return data;
    }
    async function xml(path) {
      const data = await bytes(path, 10 * MiB);
      const decoder = new TextDecoder(data[0] === 255 ? 'utf-16le' : data[0] === 254 ? 'utf-16be' : 'utf-8');
      const doc = new DOMParser().parseFromString(decoder.decode(data), 'application/xml');
      if (nodes(doc,'parsererror').length) throw new Error('엑셀의 시트 또는 그림 정보를 읽지 못했어요.');
      // Compatibility alternatives represent one placement. Inspect the standard fallback once.
      const alternatives = Array.from(doc.getElementsByTagNameNS('http://schemas.openxmlformats.org/markup-compatibility/2006','AlternateContent')).reverse();
      for (const alt of alternatives) {
        const branches = Array.from(alt.children);
        const branch = branches.find(node => node.localName === 'Fallback') || branches.find(node => node.localName === 'Choice');
        if (branch) alt.replaceWith(...Array.from(branch.children));
        else alt.remove();
      }
      return doc;
    }
    async function relationships(path) {
      const slash = path.lastIndexOf('/') + 1;
      const relFile = path.slice(0,slash) + '_rels/' + path.slice(slash) + '.rels';
      const links = new Map();
      if (!zip.file(relFile)) return links;
      for (const rel of nodes(await xml(relFile), 'Relationship')) {
        if (rel.getAttribute('TargetMode') === 'External') continue;
        const target = rel.getAttribute('Target');
        if (!target) continue;
        const url = new URL(target, 'https://xlsx.invalid/' + path);
        if (url.origin === 'https://xlsx.invalid') links.set(rel.getAttribute('Id'), decodeURIComponent(url.pathname.slice(1)));
      }
      return links;
    }
    const bookLinks = await relationships('');
    const bookPath = [...bookLinks.values()].find(path => /(?:^|\/)workbook\.xml$/i.test(path)) || 'xl/workbook.xml';
    const book = await xml(bookPath);
    const sheets = await relationships(bookPath);
    const hashes = new Map(), groups = new Map();
    let count = 0, skipped = 0;
    for (const sheet of nodes(book,'sheet')) {
      const sheetPath = sheets.get(relAttr(sheet,'id'));
      if (!sheetPath) { skipped++; continue; }
      const sheetDoc = await xml(sheetPath);
      const drawingRefs = nodes(sheetDoc,'drawing');
      if (!drawingRefs.length) continue;
      const drawings = await relationships(sheetPath);
      for (const ref of drawingRefs) {
        const path = drawings.get(relAttr(ref,'id'));
        if (!path) { skipped++; continue; }
        const drawing = await xml(path);
        const media = await relationships(path);
        for (const anchor of drawing.documentElement.children) {
          for (const pic of nodes(anchor,'pic')) {
            const blip = nodes(pic,'blip')[0];
            const image = blip && media.get(relAttr(blip,'embed'));
            if (!image || !zip.file(image)) { skipped++; continue; }
            if (!hashes.has(image)) {
              const digest = await crypto.subtle.digest('SHA-256', await bytes(image, 45 * MiB));
              hashes.set(image, Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2,'0')).join(''));
            }
            const key = hashes.get(image);
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(sheet.getAttribute('name') + ' · ' + coordinate(anchor));
            count++;
          }
        }
      }
    }
    return {count, skipped, duplicates: [...groups.values()].filter(group => group.length > 1)};
  }
  fileInput.onchange = async () => {
    result.replaceChildren();
    const file = fileInput.files[0];
    if (!file) { status.textContent = '검사할 파일을 선택하세요.'; return; }
    if (!/\.xlsx$/i.test(file.name) || file.size > 60 * MiB) {
      status.textContent = '60MB 이하의 .xlsx 파일을 선택하세요.';
      return;
    }
    fileInput.disabled = true;
    status.textContent = '시트별로 그림을 대조하고 있어요…';
    try {
      const {count, skipped, duplicates} = await inspect(file);
      status.textContent = count ? '그림 ' + count + '개 검사 · ' + (duplicates.length ? '중복 ' + duplicates.length + '묶음' : '비교한 그림 중 동일 원본 없음') : '비교할 삽입 그림을 찾지 못했어요.';
      if (skipped) status.textContent += ' · 읽지 못한 연결 ' + skipped + '개';
      for (const locations of duplicates) {
        const item = document.createElement('li');
        item.textContent = '같은 원본 ' + locations.length + '곳 — ' + locations.join(' / ');
        result.append(item);
      }
    } catch (error) {
      status.textContent = /^(엑셀|압축을)/.test(error.message) ? error.message : '파일을 해석하지 못했어요. 암호가 없는 .xlsx 사본으로 다시 시도해 주세요.';
    } finally {
      fileInput.disabled = false;
    }
  };
})();
