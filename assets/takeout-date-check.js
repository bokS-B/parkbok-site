(() => {
  'use strict';
  const input = document.getElementById('takeout-files');
  const status = document.getElementById('takeout-status');
  const summary = document.getElementById('takeout-summary');
  const issues = document.getElementById('takeout-issues');
  const download = document.getElementById('takeout-download');
  const MiB = 1024 * 1024;
  const photo = /\.(?:jpe?g|png|heic|heif|gif|webp|avif|tiff?|bmp|dng|cr[23]|nef|arw|raf|mp4|mov|m4v|3gp|avi|mkv|wmv|mpg|webm)$/i;
  const formatter = new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',dateStyle:'medium',timeStyle:'medium'});
  let report = [];
  const add = (map,key,value) => {
    if (!map.has(key)) map.set(key,[]);
    map.get(key).push(value);
  };
  const folder = path => path.slice(0,path.lastIndexOf('/') + 1);
  function seconds(field) {
    const value = field?.timestamp;
    if (typeof value !== 'string' && typeof value !== 'number') return null;
    if (!/^-?\d+$/.test(String(value))) return null;
    const ms = Number(value) * 1000;
    return Number.isSafeInteger(ms) && Math.abs(ms) < 8.64e15 ? ms : null;
  }
  function jsonText(entry, maximum) {
    return new Promise((resolve,reject) => {
      let size = 0;
      const chunks = [];
      const decoder = new TextDecoder();
      const stream = entry.internalStream('uint8array');
      stream.on('data',chunk => {
        size += chunk.length;
        if (size > maximum) { stream.pause(); reject(new Error('JSON_SIZE')); return; }
        chunks.push(decoder.decode(chunk,{stream:true}));
      }).on('end',() => resolve({size,text:chunks.join('') + decoder.decode()})).on('error',reject).resume();
    });
  }
  function sidecarKey(path) {
    const stem = path.slice(0,-5);
    if (photo.test(stem)) return stem;
    const suffix = stem.match(/^(.*)\.(supp[a-z-]*)(\(\d+\))?$/i);
    const isSupplemental = suffix && 'supplemental-metadata'.startsWith(suffix[2].toLowerCase());
    const moved = stem.match(/^(.*)(\.[^./]+)(\(\d+\))$/);
    if (!isSupplemental) {
      if (moved && photo.test(moved[1] + moved[2])) return moved[1] + moved[3] + moved[2];
      return null;
    }
    const media = suffix[1];
    if (!photo.test(media)) return null;
    return suffix[3] ? media.replace(photo, ext => suffix[3] + ext) : media;
  }
  async function scan(files) {
    const media = new Map(), sidecars = new Map(), json = [];
    let entries = 0, budget = 32 * MiB;
    for (const file of files) {
      let zip;
      try { zip = await JSZip.loadAsync(file); }
      catch { throw new Error('열 수 없는 ZIP이 있어요. 암호가 없는 테이크아웃 ZIP인지 확인하세요.'); }
      for (const entry of Object.values(zip.files)) {
        if (entry.dir) continue;
        if (++entries > 24000) throw new Error('파일이 24,000개를 넘어요. ZIP을 나눠 검사해 주세요.');
        const path = entry.name.normalize('NFC');
        if (photo.test(path)) add(media,path,entry.name);
        else if (/\.json$/i.test(path)) json.push({path,entry});
      }
    }
    for (const {path,entry} of json) {
      let key = sidecarKey(path);
      const exact = media.has(key);
      // A truncated basename is only a candidate if the JSON title also identifies a local file.
      const partial = path.slice(folder(path).length,-5);
      if (!exact && partial.length < 40) continue;
      if (budget <= 0) throw new Error('JSON 데이터가 너무 커요. ZIP을 나눠 검사해 주세요.');
      try {
        const value = await jsonText(entry,Math.min(budget,256 * 1024));
        budget -= value.size;
        const data = JSON.parse(value.text);
        if (!exact) {
          const title = typeof data?.title === 'string' ? data.title.normalize('NFC') : '';
          if (!title.startsWith(partial) || !media.has(folder(path) + title)) continue;
          key = folder(path) + title;
        }
        add(sidecars,key,{path,partial:!exact,taken:seconds(data?.photoTakenTime),created:seconds(data?.creationTime)});
      } catch {
        budget -= 256 * 1024;
        if (exact) add(sidecars,key,{path,invalid:true});
      }
    }
    const rows = [];
    for (const [path,placements] of media) {
      const candidates = sidecars.get(path) || [];
      const dates = [...new Set(candidates.map(c => c.taken).filter(x => x != null))];
      const uploads = [...new Set(candidates.map(c => c.created).filter(x => x != null))];
      let state = '촬영일 확인';
      if (placements.length > 1) state = '같은 경로의 파일이 여러 개';
      else if (!candidates.length) state = '연결된 JSON 없음';
      else if (dates.length > 1) state = '촬영일 충돌';
      else if (candidates.some(c => c.invalid)) state = '읽을 수 없는 JSON';
      else if (!dates.length) state = uploads.length ? '업로드 날짜만 있음' : 'JSON에 촬영일 없음';
      else if (candidates.every(c => c.partial)) state = '잘린 파일명 대조 필요';
      rows.push({path,state,date:dates.map(d => formatter.format(d)).join(' / '),upload:uploads.map(d => formatter.format(d)).join(' / '),refs:candidates.map(c => c.path).join(' / ')});
    }
    return rows;
  }
  function csvCell(value) {
    const safe = /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/.test(value) ? "'" + value : value;
    return '"' + safe.replace(/"/g,'""') + '"';
  }
  download.onclick = () => {
    const cells = [['파일 경로','검사 결과','촬영일 (한국 시간)','업로드 날짜 (한국 시간)','연결된 JSON'],
      ...report.map(({path,state,date,upload,refs}) => [path,state,date,upload,refs])];
    const url = URL.createObjectURL(new Blob(['\uFEFF',cells.map(row => row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a');
    link.href = url;
    link.download = '박복-테이크아웃-촬영일-검사.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url),30000);
  };
  input.onchange = async () => {
    const files = [...input.files];
    input.value = '';
    download.hidden = true;
    status.textContent = '';
    summary.textContent = '';
    issues.replaceChildren();
    report = [];
    if (!files.length) { status.textContent = '검사할 ZIP을 선택하세요.'; return; }
    if (files.length > 10 || files.some(f => !/\.zip$/i.test(f.name)) || files.reduce((n,f) => n + f.size,0) > 250 * MiB) {
      status.textContent = '총 250MB 이하의 ZIP을 최대 10개까지 선택하세요.';
      return;
    }
    input.disabled = true;
    status.textContent = 'ZIP의 JSON과 사진 경로를 대조하고 있어요…';
    try {
      const rows = await scan(files);
      const problems = rows.filter(r => r.state !== '촬영일 확인');
      report = rows;
      status.textContent = rows.length ? '사진·영상 ' + rows.length + '개 검사 · 확인 필요 ' + problems.length + '개' : 'ZIP에서 지원하는 사진이나 영상을 찾지 못했어요.';
      if (problems.length > 50) summary.textContent = '확인할 항목 50개를 표시해요. 전체 목록은 CSV에서 확인할 수 있어요.';
      for (const row of problems.slice(0,50)) {
        const item = document.createElement('li');
        item.textContent = row.state + ' · ' + row.path + (row.date || row.upload ? ' · ' + (row.date || row.upload) : '');
        issues.append(item);
      }
      download.hidden = !rows.length;
    } catch (error) {
      status.textContent = /^열 수 없는 ZIP|^파일이 24|^JSON 데이터/.test(error.message) ? error.message : 'ZIP을 읽지 못했어요. 다시 내려받은 파일로 시도해 주세요.';
    } finally { input.disabled = false; }
  };
})();
