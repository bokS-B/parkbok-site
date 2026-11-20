(() => {
  'use strict';
  const get = id => document.getElementById(id);
  const requests = get('requests');
  const create = get('create');
  const save = get('save');
  const progress = get('progress');
  const imageExtension = /\.(?:jpe?g|png|heic|heif|webp|avif|tiff?|gif|bmp|dng|cr[23]|nef|arw|raf|orf|rw2|pef|srw)$/i;
  const normalize = name => name.normalize('NFC').toLowerCase();
  const numberKey = text => text.replace(/^0+(?=\d)/, '');
  const maxBytes = 128 * 1024 * 1024;
  const choices = new Map();
  let byName, byStem, byNumber;
  let selected = [], sourceSize = 0, version = 0, busy = false;
  function index(map, key, file) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(file);
  }
  function loadFiles(files) {
    byName = new Map();
    byStem = new Map();
    byNumber = new Map();
    sourceSize = 0;
    choices.clear();
    for (const file of files) {
      const name = normalize(file.name);
      if (!imageExtension.test(name)) continue;
      const stem = name.replace(imageExtension, '');
      index(byName, name, file);
      index(byStem, stem, file);
      const digits = stem.match(/\d+$/);
      if (digits) index(byNumber, numberKey(digits[0]), file);
      sourceSize++;
    }
    get('source-count').textContent = sourceSize ? '원본 사진 ' + sourceSize + '장 선택됨' : '선택한 항목에서 지원하는 사진을 찾지 못했어요.';
    render();
  }
  function matches(token) {
    const number = token.match(/^(\d+)\s*번?$/);
    if (number) return byNumber.get(numberKey(number[1])) || [];
    if (imageExtension.test(token)) return byName.get(token) || [];
    return byStem.get(token) || [];
  }
  function render() {
    version++;
    if (save.href && !save.hidden) URL.revokeObjectURL(save.href);
    save.hidden = true;
    save.removeAttribute('href');
    create.hidden = false;
    progress.textContent = '';
    const issues = get('issues');
    issues.replaceChildren();
    const tokens = [...new Set(requests.value.split(/[,;\t\r\n]+/).map(s => normalize(s.trim())).filter(Boolean))];
    const files = new Set(), missing = [];
    let conflicts = 0;
    for (const token of sourceSize ? tokens : []) {
      const candidates = matches(token);
      if (!candidates.length) { missing.push(token); continue; }
      if (candidates.length === 1) { files.add(candidates[0]); continue; }
      const label = document.createElement('label');
      label.textContent = token + ' · 같은 이름 또는 번호 ' + candidates.length + '장';
      const select = document.createElement('select');
      select.add(new Option('담을 원본 선택', ''));
      candidates.forEach((file, i) => {
        const size = Math.ceil(file.size / 1024).toLocaleString('ko-KR') + 'KB';
        const date = new Date(file.lastModified).toLocaleString('ko-KR');
        const title = (file.webkitRelativePath || file.name) + ' · ' + size + ' · ' + date + ' (#' + (i + 1) + ')';
        select.add(new Option(title, String(i)));
      });
      const choice = choices.get(token);
      if (choice !== undefined) { select.value = String(choice); files.add(candidates[choice]); }
      else conflicts++;
      select.onchange = () => {
        if (select.value === '') choices.delete(token);
        else choices.set(token, Number(select.value));
        render();
        [...issues.querySelectorAll('select')].find(s => s.dataset.token === token)?.focus();
      };
      select.dataset.token = token;
      label.append(select);
      issues.append(label);
    }
    if (missing.length) {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = '못 찾은 항목 ' + missing.length + '개 보기';
      details.append(summary, document.createTextNode(missing.join(', ')));
      issues.prepend(details);
    }
    selected = [...files];
    const tooBig = selected.reduce((total, f) => total + f.size, 0) > maxBytes;
    const count = selected.length;
    get('count').textContent = tokens.length && sourceSize ?
      '담을 사진 ' + count + '장' + (conflicts ? ' · 선택 필요 ' + conflicts + '개' : '') + (missing.length ? ' · 못 찾음 ' + missing.length + '개' : '') : '';
    create.textContent = count ? (missing.length ? '찾은 ' + count + '장만' : count + '장') + ' ZIP 만들기' : 'ZIP 만들기';
    create.disabled = busy || !count || conflicts > 0 || tooBig;
    if (tooBig) progress.textContent = '한 번에 128MB까지 담을 수 있어요. 셀렉 목록을 나눠 주세요.';
  }
  async function makeZip() {
    const at = version;
    busy = true;
    create.disabled = true;
    progress.textContent = '원본을 ZIP에 담고 있어요…';
    try {
      const archive = new JSZip();
      const used = new Set();
      for (const [i, file] of selected.entries()) {
        if (at !== version) return;
        const name = file.name.replace(/[\\/]/g, '_');
        const path = used.has(normalize(name)) ? '동일이름-' + (i + 1) + '/' + name : name;
        used.add(normalize(name));
        archive.file(path, await file.arrayBuffer());
      }
      const blob = await archive.generateAsync({type: 'blob', compression: 'STORE'});
      if (at !== version) return;
      save.href = URL.createObjectURL(blob);
      create.hidden = true;
      save.hidden = false;
      progress.textContent = '준비됐어요. ZIP 저장을 눌러 주세요.';
      save.focus();
    } catch {
      if (at === version) progress.textContent = '파일을 읽지 못했어요. 원본을 기기에 내려받거나 목록을 나눠 다시 시도해 주세요.';
    } finally {
      busy = false;
      if (at !== version) render();
      else create.disabled = false;
    }
  }
  requests.addEventListener('input', render);
  for (const id of ['files', 'folder']) {
    const input = get(id);
    const button = get('pick-' + id);
    button.onclick = () => input.click();
    input.onchange = () => {
      if (input.files.length) loadFiles(input.files);
      input.value = '';
    };
  }
  get('pick-folder').hidden = !('webkitdirectory' in get('folder'));
  create.onclick = makeZip;
})();
