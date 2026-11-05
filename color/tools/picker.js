// 이미지 드롭/선택/붙여넣기 → 자동 주요 색 최대 5개, 담은 색 최대 12개, 템플릿에 쓸 5색은 명시적으로 선택.
// 파일은 브라우저 안에서만 읽는다. 계산은 /color/color.js, 조각은 /color/color-ui.js. 도구 전용 스타일은 여기서 넣는다.
(function(){
  'use strict';
  var C = window.COLOR, U = window.COLOR_UI, PC = window.PB_PICKER;
  var app = document.getElementById('app');
  if (!C || !U || !PC || !app) return;
  var t = U.t, el = U.el;
  var MAX_PICKS = 12, MAX_SIDE = 1600, LOUPE_PX = 15, ZOOM = 8, LOUPE = LOUPE_PX * ZOOM, K = 5;
  var picks = [], templatePicks = [], cur = null, img = null, dominant = [], selectedPoint = null;
  var sourceWidth = 0, sourceHeight = 0, chosenTemplate = 'website', previewPromise = null, previewVersion = 0;
  var probe = el('canvas'); probe.width = probe.height = 1;
  var probeCtx = probe.getContext('2d', {willReadFrequently:true});
  var sampleCard = document.getElementById('pk-sample'), sampleButton = document.getElementById('pk-try-sample'), loadId = 0;

  // ---------- 스타일 ----------
  var css = [
    '#app [hidden]{display:none!important}',
    '.pk-drop{display:flex;flex-direction:column;align-items:center;gap:12px;padding:40px 24px;border:2px dashed var(--muted);border-radius:var(--r-card);background:var(--card);text-align:center;cursor:pointer;transition:var(--t-btn)}',
    '.pk-drop:focus-visible{outline:3px solid var(--accent);outline-offset:2px}',
    '.pk-drop.on{border-color:var(--accent);background:var(--accent-tint)}',
    '.pk-drop strong{font-size:17px}.pk-drop .muted{font-size:var(--fs-small)}',
    '.pk-sample{display:flex;align-items:center;gap:20px;margin-top:16px;padding:16px;border:1px solid var(--line);border-radius:var(--r-card);background:var(--card)}',
    '.pk-sample img{width:144px;height:96px;object-fit:cover;border-radius:12px;flex:none}',
    '.pk-sample-copy{flex:1;min-width:0}.pk-sample-copy strong{font-size:16px}.pk-sample-copy p{margin:4px 0 10px;color:var(--muted);font-size:14px;line-height:1.5}',
    '.pk-sample-colors{display:flex;flex-wrap:wrap;gap:8px 12px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}',
    '.pk-sample-colors span{display:inline-flex;align-items:center;gap:5px}.pk-sample-colors span:before{content:"";width:12px;height:12px;border-radius:50%;background:var(--swatch);border:1px solid var(--line)}',
    '#pk-try-sample{min-height:44px;flex:none}',
    '#pk-template-main,#pk-template-picks{min-height:44px;text-decoration:none}',
    '#pk-template-main{min-height:60px}',
    '.pk-template[aria-disabled="true"]{opacity:.55;cursor:not-allowed}',
    '.pk-template-note{font-size:13px;line-height:1.5;margin:8px 0 0}',
    '.pk-template-choice{display:flex;align-items:center;justify-content:center;width:44px;height:44px;cursor:pointer}',
    '.pk-template-choice input{width:20px;height:20px;accent-color:var(--accent);cursor:pointer}',
    '.pk-template-choice:focus-within{outline:2px solid var(--accent);border-radius:8px}',
    '.pk-main-colors{grid-area:palette;min-width:0;margin:0}.pk-stage .row{gap:8px}',
    '.pk-stage .btn,.pk-items~.row .btn{min-height:44px}',
    '@media(max-width:767.98px){.pk-sample{display:grid;grid-template-columns:88px minmax(0,1fr);gap:12px;padding:12px}.pk-sample img{width:88px;height:88px}.pk-sample-copy p{font-size:13px}.pk-sample-colors{font-size:11px;gap:4px 8px}#pk-try-sample{grid-column:1/-1;width:100%}}',
    '.pk-stage{display:grid;grid-template-columns:minmax(0,3fr) minmax(0,2fr);grid-template-areas:"image current" "image palette";grid-template-rows:auto 1fr;gap:16px;align-items:start}',
    '.pk-left{grid-area:image;display:flex;flex-direction:column;gap:10px;min-width:0}',
    '.pk-wrap{position:relative;align-self:center;width:100%;overflow:hidden;border:1px solid var(--line);border-radius:var(--r-card);background:#fff;line-height:0}',
    '.pk-wrap canvas.pk-cv{display:block;width:100%;height:auto;cursor:crosshair;touch-action:none;-webkit-user-select:none;user-select:none}',
    '.pk-wrap:focus-within{outline:3px solid var(--accent);outline-offset:2px}',
    '.pk-pin{position:absolute;width:16px;height:16px;border:2px solid #fff;outline:2px solid #111;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:1;box-shadow:0 0 0 1px #111 inset}',
    '.pk-location{margin:0;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--muted);overflow-wrap:anywhere}',
    '.pk-help{margin:0;font-size:12px;line-height:1.5;color:var(--muted)}',
    '.pk-current-kind{margin:0;font-size:12px;line-height:1.5;color:var(--muted)}',
    '.pk-previews{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:12px}',
    '.pk-mini{min-width:0;padding:4px;border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--ink);cursor:pointer;overflow:hidden;text-align:left}',
    '.pk-mini[aria-pressed=true]{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}',
    '.pk-mini:focus-visible{outline:3px solid var(--accent);outline-offset:2px}',
    '.pk-mini-art{display:block;position:relative;aspect-ratio:8/5;overflow:hidden;border-radius:8px;pointer-events:none}',
    '.pk-mini-inner{position:absolute;left:0;top:0;width:800px;transform-origin:0 0;pointer-events:none}',
    '.pk-mini-name{display:block;padding:6px 3px 2px;font-size:12px;line-height:1.4;font-weight:600;overflow-wrap:anywhere}',
    '.pk-export{margin-top:12px;border:1px solid var(--line);border-radius:12px;padding:0 12px}',
    '.pk-export summary{min-height:44px;display:flex;align-items:center;cursor:pointer;font-size:14px;font-weight:600}',
    '.pk-export .row{padding-bottom:10px}.pk-export select{min-height:44px;min-width:100px;background:var(--card);color:var(--ink);border:1px solid var(--line);border-radius:8px;padding:8px}',
    '.pk-export textarea{display:block;width:100%;height:160px;resize:vertical;margin-bottom:12px;padding:10px;background:var(--bg);color:var(--ink);border:1px solid var(--line);border-radius:8px;font:12px/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;box-sizing:border-box}',
    '.pk-sample-options{display:flex;gap:6px;flex-wrap:wrap}.pk-sample-options .btn{min-height:44px}',
    '.pk-sample-credit{font-size:11px;color:var(--muted);margin:4px 0 0}',
    '.pk-loupe{position:absolute;left:0;top:0;width:' + LOUPE + 'px;pointer-events:none;display:none;z-index:2}',
    '.pk-loupe.show{display:block}',
    '.pk-loupe canvas{display:block;width:' + LOUPE + 'px;height:' + LOUPE + 'px;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 10px rgba(0,0,0,.45);background:#fff}',
    '.pk-loupe .pk-lh{position:absolute;left:50%;bottom:-26px;transform:translateX(-50%);padding:3px 10px;border-radius:var(--r-pill);background:rgba(0,0,0,.78);color:#fff;font:600 12px/1.3 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.03em;white-space:nowrap}',
    '.pk-side{grid-area:current;display:flex;flex-direction:column;gap:10px;min-width:0}',
    '.pk-side .c-preview{min-height:110px;padding:18px}',
    '.pk-side .c-preview .c-hex{font-size:30px}',
    '.pk-items{display:flex;flex-direction:column;gap:6px}',
    '.pk-item{display:grid;grid-template-columns:44px minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:6px;border:1px solid var(--line);border-radius:var(--r-btn);background:var(--bg)}',
    '.pk-sw{width:44px;height:44px;padding:0;border:1px solid rgba(0,0,0,.12);border-radius:8px;cursor:pointer;transition:transform .12s}',
    '.pk-sw:hover,.pk-sw:focus-visible{transform:scale(1.08);outline:2px solid var(--ink);outline-offset:1px}',
    '.pk-codes{display:flex;flex-direction:column;gap:2px;min-width:0}',
    '.pk-code{display:block;width:100%;min-height:44px;padding:0;border:0;background:none;text-align:left;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--ink);cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.pk-code.hex{font-size:15px;font-weight:var(--fw-semibold)}.pk-code.rgb{font-size:12px;color:var(--muted)}',
    '.pk-code:hover,.pk-code:focus-visible{color:var(--accent);outline:none}',
    '.pk-x{width:44px;height:44px;padding:0;border:0;border-radius:50%;background:none;color:var(--muted);font-size:20px;line-height:1;cursor:pointer}',
    '.pk-x:hover,.pk-x:focus-visible{background:var(--line);color:var(--ink);outline:none}',
    '.pk-empty{margin:0;padding:14px;border:1px dashed var(--line);border-radius:var(--r-btn);color:var(--muted);font-size:var(--fs-small);text-align:center}',
    '.pk-pal.cpal{gap:8px}.pk-pal .cswatch.lg{min-height:96px}',
    '@media (max-width:767.98px){.pk-stage{grid-template-columns:minmax(0,1fr);grid-template-areas:"image" "palette" "current";grid-template-rows:auto}.pk-side .c-preview{min-height:120px}.pk-side .c-preview .c-hex{font-size:26px}.pk-pal.cpal{gap:4px}.pk-pal .cswatch.lg{min-height:64px}.pk-pal .cswatch.lg .cl{font-size:11px;letter-spacing:0}#pk-template-main{width:100%;min-height:56px;justify-content:center}.pk-item{gap:6px}.pk-code.rgb{font-size:11px}}'
  ].join('\n');
  var st = el('style'); st.textContent = css; document.head.appendChild(st);

  // ---------- 드롭 ----------
  var drop = el('div', 'pk-drop'); drop.tabIndex = 0; drop.setAttribute('role', 'button');
  drop.appendChild(el('strong', null, t('dropTitle')));
  var btnSel = el('button', 'btn btn-big', t('select')); btnSel.type = 'button';
  drop.appendChild(btnSel);
  drop.appendChild(el('span', 'muted', t('dropHint')));
  var input = el('input'); input.type = 'file'; input.accept = 'image/*'; input.hidden = true; input.setAttribute('aria-label', t('select'));
  drop.appendChild(input);
  app.insertBefore(drop, app.firstChild);

  // ---------- 무대: 캔버스 + 루페 | 현재 색 ----------
  var stage = el('div', 'pk-stage'); stage.hidden = true;
  var left = el('div', 'pk-left');
  var wrap = el('div', 'pk-wrap');
  var cv = el('canvas', 'pk-cv'); cv.tabIndex = 0; cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', t('canvas')); cv.setAttribute('aria-describedby','pk-keyboard-help pk-location');
  var ctx = cv.getContext('2d', { willReadFrequently: true });
  var loupe = el('div', 'pk-loupe'); loupe.setAttribute('aria-hidden', 'true');
  var lcv = el('canvas'); lcv.width = LOUPE; lcv.height = LOUPE;
  var lctx = lcv.getContext('2d');
  var lhex = el('span', 'pk-lh');
  loupe.appendChild(lcv); loupe.appendChild(lhex);
  var pin = el('span','pk-pin'); pin.hidden = true; pin.setAttribute('aria-hidden','true');
  wrap.appendChild(cv); wrap.appendChild(pin); wrap.appendChild(loupe);
  var bar = el('div', 'row');
  var btnChange = el('button', 'btn ghost sm', t('change')); btnChange.type = 'button';
  bar.appendChild(btnChange);
  var locationNote = el('p','pk-location'); locationNote.id = 'pk-location';
  var imageCredit=el('p','pk-sample-credit');imageCredit.hidden=true;
  var nasaCredit=el('a',null,'NASA / Apollo 8');nasaCredit.href='https://images.nasa.gov/details/as08-14-2383';nasaCredit.target='_blank';nasaCredit.rel='noopener';imageCredit.appendChild(nasaCredit);
  var keyboardHelp = el('p','pk-help',t('keyboardHelp')); keyboardHelp.id = 'pk-keyboard-help';
  left.appendChild(wrap); left.appendChild(locationNote); left.appendChild(imageCredit); left.appendChild(bar); left.appendChild(keyboardHelp);

  var side = el('div', 'pk-side');
  var prev = el('button', 'c-preview'); prev.type = 'button'; prev.setAttribute('aria-label', t('copy') + ' HEX');
  var prevHex = el('div', 'c-hex'), prevName = el('div', 'c-nm'), prevCopy = el('span', 'c-copy', t('copy'));
  prev.appendChild(prevHex); prev.appendChild(prevName); prev.appendChild(prevCopy);
  prev.addEventListener('click', function(){ if (cur) U.copy(cur); });
  var rows = el('div', 'vrows');
  var R = { hex: U.valueRow(t('hex'), ''), rgb: U.valueRow(t('rgb'), ''), hsl: U.valueRow(t('hsl'), '') };
  rows.appendChild(R.hex.el); rows.appendChild(R.rgb.el); rows.appendChild(R.hsl.el);
  var currentKind = el('p','pk-current-kind'); currentKind.setAttribute('aria-live','polite');
  side.appendChild(prev); side.appendChild(currentKind); side.appendChild(rows);
  stage.appendChild(left); stage.appendChild(side);
  app.appendChild(stage);

  var status = el('p', 'status'); status.setAttribute('aria-live', 'polite');
  app.appendChild(status);

  // ---------- 주요 색 ----------
  var domPal = el('div', 'cpal pk-pal'); domPal.style.setProperty('--cols', String(K));
  var domBar = el('div', 'row');
  var btnCopyAll = el('button', 'btn ghost sm', t('copyAll')); btnCopyAll.type = 'button';
  var btnSave = el('button', 'btn ghost sm', t('save')); btnSave.type = 'button';
  domBar.appendChild(btnCopyAll); domBar.appendChild(btnSave);
  var domTemplate = el('a', 'btn sm pk-template', t('templateButton')); domTemplate.id = 'pk-template-main';
  domBar.appendChild(domTemplate);
  var domBox = el('div'); domBox.appendChild(domPal); domBox.appendChild(domBar);
  var domHint = el('p', 'muted pk-template-note'); domBox.appendChild(domHint);
  var domSec = U.section(t('dominant'), domBox); domSec.classList.add('pk-main-colors'); domSec.hidden = true;
  stage.insertBefore(domSec, side);
  var previews = el('div','pk-previews'); previews.hidden = true; previews.setAttribute('role','group'); previews.setAttribute('aria-label',t('templatePreviews')); domBox.appendChild(previews);
  var previewMessage = el('p','pk-help'); previewMessage.hidden = true; domBox.appendChild(previewMessage);
  var autoExport = exportPanel(function(){return dominant;}); domBox.appendChild(autoExport.el);

  // ---------- 담은 색 ----------
  var list = el('div', 'pk-items');
  var empty = el('p', 'pk-empty', t('empty'));
  var listBar = el('div', 'row');
  var btnCopyPicks = el('button', 'btn ghost sm', t('copyAll')); btnCopyPicks.type = 'button';
  var btnClear = el('button', 'btn ghost sm', t('clear')); btnClear.type = 'button';
  listBar.appendChild(btnCopyPicks); listBar.appendChild(btnClear);
  var picksTemplate = el('a', 'btn sm pk-template', t('templateButton')); picksTemplate.id = 'pk-template-picks'; listBar.appendChild(picksTemplate);
  var listBox = el('div'); listBox.appendChild(empty); listBox.appendChild(list); listBox.appendChild(listBar);
  var picksHint = el('p', 'muted pk-template-note'); picksHint.setAttribute('aria-live', 'polite'); listBox.appendChild(picksHint);
  var picksSec = U.section(t('picks'), listBox, t('picksMax')); picksSec.hidden = true;
  app.appendChild(picksSec);
  var picksExport = exportPanel(function(){return picks.filter(function(c){return templatePicks.indexOf(c)>=0;});}); listBox.appendChild(picksExport.el);

  // ---------- 상태 ----------
  function say(msg, err){ status.textContent = msg || ''; status.className = 'status' + (err ? ' err' : ''); }
  function countText(key, n){ return t(key).replace('{n}', String(n)); }
  function updateTemplate(link, values, hint, manual){
    var ready = values.length === K && !!window.PB_PALETTE_IMPORT;
    link.setAttribute('aria-disabled', String(!ready));
    if (ready) link.href = window.PB_PALETTE_IMPORT.href(values, window.COLOR_TOOL.lang, chosenTemplate);
    else link.removeAttribute('href');
    hint.textContent = manual ? countText('templateSelection', values.length) : ready ? t('templateHint') : countText('templateNeed', values.length);
  }
  [domTemplate, picksTemplate].forEach(function(link){
    link.setAttribute('role', 'link'); link.tabIndex = 0;
    link.addEventListener('click', function(e){ if (link.getAttribute('aria-disabled') === 'true') e.preventDefault(); });
  });

  function exportPanel(getValues){
    var box=el('details','pk-export'),summary=el('summary',null,t('exportCode')),row=el('div','row');
    var format=el('select');format.setAttribute('aria-label',t('exportFormat'));
    [['css','CSS'],['json','JSON'],['hex','HEX']].forEach(function(o){var option=el('option',null,o[1]);option.value=o[0];format.appendChild(option);});
    var copy=el('button','btn ghost sm',t('copy'));copy.type='button';
    var code=el('textarea');code.readOnly=true;code.spellcheck=false;code.setAttribute('aria-label',t('exportCode'));
    var hint=el('p','pk-help',t('exportHint'));
    row.appendChild(format);row.appendChild(copy);box.appendChild(summary);box.appendChild(row);box.appendChild(code);box.appendChild(hint);
    function update(){var values=getValues();box.hidden=!values.length;code.value=values.length?PC.code(values,format.value):'';}
    format.addEventListener('change',update);box.addEventListener('toggle',update);
    copy.addEventListener('click',function(){U.copy(code.value).then(function(ok){if(!ok){code.focus();code.select();}});});
    return {el:box,update:update};
  }
  function previewAssets(){
    if(previewPromise)return previewPromise;
    previewPromise=(window.PB_PICKER_ASSETS||[]).reduce(function(previous,path){
      return previous.then(function(){return new Promise(function(resolve,reject){var script=el('script');script.src=path;script.onload=resolve;script.onerror=function(){script.remove();reject(new Error('preview'));};document.head.appendChild(script);});});
    },Promise.resolve()).catch(function(err){previewPromise=null;throw err;});
    return previewPromise;
  }
  var miniResize=window.ResizeObserver?new ResizeObserver(function(){sizePreviews();}):null;
  function sizePreviews(){
    previews.querySelectorAll('.pk-mini-art').forEach(function(art){art.firstChild.style.transform='scale('+(art.clientWidth/800)+')';});
  }
  function renderPreviews(values){
    var version=++previewVersion;previews.hidden=true;previewMessage.hidden=true;
    if(values.length!==K)return;
    previewAssets().then(function(){
      if(version!==previewVersion)return;
      var P=window.PB_PALETTE,V=window.PB_PALETTE_TEMPLATES,S=window.PB_PALETTE_STRINGS.en;
      if(!P||!V)throw new Error('preview');
      if(!document.getElementById('pk-template-style')){var style=el('style');style.id='pk-template-style';style.textContent=V.css;document.head.appendChild(style);}
      if(miniResize)miniResize.disconnect();previews.textContent='';
      ['website','shop','planner'].forEach(function(id){
        var button=el('button','pk-mini');button.type='button';button.dataset.template=id;button.setAttribute('aria-pressed',String(chosenTemplate===id));
        var art=el('span','pk-mini-art');art.setAttribute('aria-hidden','true');art.setAttribute('inert','');
        var inner=el('span','pk-mini-inner'),state=P.readHash(window.PB_PALETTE_IMPORT.href(values,'en',id).split('#')[1]).state;
        state.motion=false; // Small thumbnails stay still; the actual editor keeps its animation setting.
        inner.innerHTML=V.markup(state,S,'en');inner.querySelectorAll('input,button,summary,a').forEach(function(e){e.tabIndex=-1;});art.appendChild(inner);
        button.appendChild(art);button.appendChild(el('span','pk-mini-name',t('preview_'+id)));
        button.addEventListener('click',function(){chosenTemplate=id;previews.querySelectorAll('button.pk-mini').forEach(function(b){b.setAttribute('aria-pressed',String(b===button));});updateTemplate(domTemplate,dominant,domHint,false);updateTemplate(picksTemplate,templatePicks,picksHint,true);});
        previews.appendChild(button);if(miniResize)miniResize.observe(art);
      });
      previews.hidden=false;sizePreviews();
    }).catch(function(){if(version!==previewVersion)return;previewMessage.textContent=t('previewFail');previewMessage.hidden=false;});
  }
  window.addEventListener('resize',sizePreviews);

  // ---------- 이미지 읽기 (EXIF 회전 반영) ----------
  function viaImg(file){
    return new Promise(function(res, rej){
      var url = URL.createObjectURL(file), im = new Image();
      im.onload = function(){ URL.revokeObjectURL(url); res(im); };
      im.onerror = function(){ URL.revokeObjectURL(url); rej(new Error('decode')); };
      im.src = url;
    });
  }
  function decode(file){
    if (!window.createImageBitmap) return viaImg(file);
    return createImageBitmap(file, { imageOrientation: 'from-image' })
      .catch(function(){ return createImageBitmap(file); })
      .catch(function(){ return viaImg(file); });
  }
  function isImage(file){ return /^image\//.test(file.type || '') || /\.(jpe?g|png|gif|webp|bmp|avif|svg)$/i.test(file.name || ''); }
  function load(file){
    if (!file) return;
    if (!isImage(file)) { say(t('notImage'), true); return; }
    if (file.size > 50 * 1024 * 1024) return loadDecoded(Promise.reject(new Error('limit')), false);
    return loadDecoded(decode(file), false);
  }
  function loadDecoded(source, isSample, credit){
    var id = ++loadId;
    // Invalidate links before decoding, including when a replacement image fails.
    if (img && img.close) img.close();
    img = null; cur = null; dominant = []; picks = []; templatePicks = []; selectedPoint = null; pin.hidden = true;
    previewVersion++; previews.hidden = true; previewMessage.hidden = true; imageCredit.hidden=true; autoExport.update();
    renderPicks(); updateTemplate(domTemplate, dominant, domHint, false);
    domSec.hidden = true; picksSec.hidden = true; stage.hidden = true; drop.hidden = false;
    say(t('extracting'));
    return source.then(function(bmp){
      if (id !== loadId) { if (bmp.close) bmp.close(); return; }
      var w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
      if (!w || !h) throw new Error('empty');
      if (w * h > 64000000 || Math.max(w,h) > 16384) { if(bmp.close)bmp.close(); throw new Error('limit'); }
      sourceWidth = w; sourceHeight = h;
      var s = Math.min(1, MAX_SIDE / Math.max(w, h));
      cv.width = Math.max(1, Math.round(w * s)); cv.height = Math.max(1, Math.round(h * s));
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cv.width, cv.height);   // 투명은 흰색 위에
      ctx.drawImage(bmp, 0, 0, cv.width, cv.height);
      // Retain the decoded source, never allocate a full-resolution pixel canvas.
      // The preview alone is resized; the 1px probe and loupe read this original bitmap.
      img = bmp;
      wrap.style.maxWidth = 'min(100%, calc(60vh * ' + (w/h) + '))';
      locationNote.textContent = t('sourceSize',{w:w,h:h});
      imageCredit.hidden=!credit;
      drop.hidden = true; stage.hidden = false; picksSec.hidden = false;
      if (sampleCard) sampleCard.hidden = true;
      hideLoupe();
      if (isSample) btnChange.focus({preventScroll:true});
      extract(id);
    }).catch(function(err){ if (id === loadId) say(t(err.message==='limit'?'imageLimit':'loadFail'), true); });
  }
  function loadSample(path){
    if (!sampleCard) return;
    var source = new Promise(function(resolve, reject){
      var demo = new Image();
      demo.onload = function(){ resolve(demo); };
      demo.onerror = function(){ reject(new Error('sample')); };
      demo.src = typeof path === 'string' ? path : sampleCard.querySelector('img').src;
    });
    loadDecoded(source, true,typeof path==='string'&&path.indexOf('picker-earthrise.jpg')>=0);
  }

  // ---------- 좌표 → 픽셀 ----------
  function sourcePixel(x,y){probeCtx.clearRect(0,0,1,1);probeCtx.imageSmoothingEnabled=false;probeCtx.drawImage(img,x,y,1,1,0,0,1,1);return probeCtx.getImageData(0,0,1,1).data;}
  function pixel(x,y){return PC.visible(sourcePixel(x,y));}
  function pos(e){
    var r = cv.getBoundingClientRect();
    var p = PC.point(e.clientX,e.clientY,r,sourceWidth,sourceHeight);
    return displayPoint(p);
  }
  function displayPoint(p){
    var r=cv.getBoundingClientRect();
    return {x:p.x,y:p.y,px:(p.x+.5)/sourceWidth*r.width,py:(p.y+.5)/sourceHeight*r.height,w:r.width,h:r.height};
  }
  function selectPoint(p,add){
    selectedPoint={x:p.x,y:p.y};
    pin.style.left=((p.x+.5)/sourceWidth*100)+'%';pin.style.top=((p.y+.5)/sourceHeight*100)+'%';pin.hidden=false;
    var rgba=sourcePixel(p.x,p.y),hex=PC.visible(rgba);
    locationNote.textContent=t('sourceSize',{w:sourceWidth,h:sourceHeight})+' · x '+p.x+' · y '+p.y;
    if(!hex){cur=null;prev.disabled=true;prev.style.background='#fff';prev.style.color='#111';prevHex.textContent='—';prevName.textContent='';R.hex.set('—');R.rgb.set('—');R.hsl.set('—');currentKind.textContent=t('transparentPixel');say(t('transparentPixel'));return;}
    setCurrent(hex,rgba[3]<255?t('alphaPixel',{a:Math.round(rgba[3]/255*100)}):t('originalPixel'));
    if(add)pick(hex,true);
  }
  function showLoupe(p, touch){
    var hex = pixel(p.x, p.y), half = (LOUPE_PX - 1) / 2;
    lctx.imageSmoothingEnabled = false;
    lctx.fillStyle = '#ffffff'; lctx.fillRect(0, 0, LOUPE, LOUPE);
    lctx.drawImage(img, p.x - half, p.y - half, LOUPE_PX, LOUPE_PX, 0, 0, LOUPE, LOUPE);
    var c = half * ZOOM;
    lctx.lineWidth = 2; lctx.strokeStyle = '#000'; lctx.strokeRect(c - 1, c - 1, ZOOM + 2, ZOOM + 2);
    lctx.strokeStyle = '#fff'; lctx.strokeRect(c + 1, c + 1, ZOOM - 2, ZOOM - 2);
    lhex.textContent = hex || t('transparentShort');
    var lift = touch ? LOUPE + 50 : LOUPE / 2 + 24;
    var lx = Math.max(0,Math.min(Math.max(0, p.px - LOUPE / 2), p.w - LOUPE)), ly = p.py - lift;
    if (ly < 0) ly = Math.min(p.py + 24, p.h - LOUPE - 30);
    loupe.style.transform = 'translate(' + Math.round(lx) + 'px,' + Math.round(Math.max(0, ly)) + 'px)';
    loupe.classList.add('show');
    return hex;
  }
  function hideLoupe(){ loupe.classList.remove('show'); }

  // ---------- 현재 색 · 목록 ----------
  function setCurrent(hex,kind){
    if(!hex)return;
    prev.disabled=false;side.hidden=false;
    if(!kind){selectedPoint=null;pin.hidden=true;locationNote.textContent=t('sourceSize',{w:sourceWidth,h:sourceHeight});}
    cur = hex;
    var rgb = C.hexToRgb(hex), near = C.nearestName(hex);
    prev.style.background = hex; prev.style.color = C.textOn(hex);
    prevHex.textContent = hex; prevName.textContent = near.exact ? near.name : '≈ ' + near.name;
    R.hex.set(hex); R.rgb.set(C.rgbString(rgb)); R.hsl.set(C.hslString(C.rgbToHsl(rgb)));
    currentKind.textContent=kind||t('savedColor');
  }
  function item(hex){
    var row = el('div', 'pk-item'); row.setAttribute('data-hex', hex);
    var sw = el('button', 'pk-sw'); sw.type = 'button'; sw.style.background = hex; sw.title = t('use'); sw.setAttribute('aria-label', t('use') + ' ' + hex);
    sw.addEventListener('click', function(){ setCurrent(hex); });
    var codes = el('div', 'pk-codes');
    var bh = el('button', 'pk-code hex', hex); bh.type = 'button'; bh.setAttribute('aria-label', t('copy') + ' ' + hex);
    var rgbs = C.rgbString(C.hexToRgb(hex));
    var br = el('button', 'pk-code rgb', rgbs); br.type = 'button'; br.setAttribute('aria-label', t('copy') + ' ' + rgbs);
    bh.addEventListener('click', function(){ U.copy(hex); }); br.addEventListener('click', function(){ U.copy(rgbs); });
    codes.appendChild(bh); codes.appendChild(br);
    var choice = el('label', 'pk-template-choice');
    var check = el('input'); check.type = 'checkbox'; check.checked = templatePicks.indexOf(hex) >= 0;
    check.setAttribute('aria-label', t('templateChoose') + ' ' + hex);
    check.disabled = !check.checked && templatePicks.length >= K;
    check.addEventListener('change', function(){
      if (check.checked && templatePicks.length < K) templatePicks.push(hex);
      else if (!check.checked) templatePicks = templatePicks.filter(function(c){ return c !== hex; });
      renderPicks(hex);
    });
    choice.appendChild(check);
    var bx = el('button', 'pk-x', '×'); bx.type = 'button'; bx.setAttribute('aria-label', t('remove') + ' ' + hex);
    bx.addEventListener('click', function(){ picks.splice(picks.indexOf(hex), 1); renderPicks(); });
    row.appendChild(sw); row.appendChild(codes); row.appendChild(choice); row.appendChild(bx);
    return row;
  }
  function renderPicks(focusHex){
    templatePicks = templatePicks.filter(function(hex){ return picks.indexOf(hex) >= 0; });
    list.textContent = '';
    for (var i = 0; i < picks.length; i++) list.appendChild(item(picks[i]));
    empty.hidden = picks.length > 0; listBar.hidden = picks.length === 0;
    picksHint.hidden = !picks.length;
    updateTemplate(picksTemplate, templatePicks, picksHint, true);
    if(picksExport)picksExport.update();
    if (focusHex) {
      var focused = Array.prototype.find.call(list.children, function(row){ return row.getAttribute('data-hex') === focusHex; });
      if (focused) focused.querySelector('input').focus({preventScroll:true});
    }
  }
  function pick(hex,keepKind){
    if(!keepKind)setCurrent(hex);
    var i = picks.indexOf(hex);
    if (i >= 0) picks.splice(i, 1);          // 같은 색은 맨 앞으로
    picks.unshift(hex);
    if (picks.length > MAX_PICKS) {
      // Keep explicitly selected colors when the history reaches its limit.
      for (var last = picks.length - 1; last >= 0; last--) {
        if (templatePicks.indexOf(picks[last]) < 0) { picks.splice(last, 1); break; }
      }
    }
    templatePicks = templatePicks.filter(function(c){ return picks.indexOf(c) >= 0; });
    if (i < 0 && templatePicks.length < K) templatePicks.push(hex);
    renderPicks();
  }

  // ---------- 포인터 ----------
  var pressing = false, touch = false;
  cv.addEventListener('pointerdown', function(e){
    if (!img) return;
    e.preventDefault(); pressing = true; touch = e.pointerType !== 'mouse';
    try { cv.setPointerCapture(e.pointerId); } catch (x) {}
    cv.focus({preventScroll:true});showLoupe(pos(e), touch);
  });
  cv.addEventListener('pointermove', function(e){
    if (!img) return;
    if (e.pointerType !== 'mouse' && !pressing) return;
    showLoupe(pos(e), e.pointerType !== 'mouse');
  });
  cv.addEventListener('pointerup', function(e){
    if (!img || !pressing) return;
    pressing = false;
    var p = pos(e); selectPoint(p,true);
    if (touch) hideLoupe(); else showLoupe(p, false);
  });
  cv.addEventListener('pointercancel', function(){ pressing = false; hideLoupe(); });
  cv.addEventListener('pointerleave', function(){ if (!pressing) hideLoupe(); });
  cv.addEventListener('keydown',function(e){
    if(!img||!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','Enter',' '].includes(e.key))return;
    e.preventDefault();
    var p=selectedPoint?{x:selectedPoint.x,y:selectedPoint.y}:{x:Math.floor(sourceWidth/2),y:Math.floor(sourceHeight/2)},step=e.shiftKey?10:1;
    if(e.key==='ArrowLeft')p.x-=step;if(e.key==='ArrowRight')p.x+=step;if(e.key==='ArrowUp')p.y-=step;if(e.key==='ArrowDown')p.y+=step;
    if(e.key==='Home'){p.x=0;p.y=0;}if(e.key==='End'){p.x=sourceWidth-1;p.y=sourceHeight-1;}
    p.x=Math.max(0,Math.min(sourceWidth-1,p.x));p.y=Math.max(0,Math.min(sourceHeight-1,p.y));
    selectPoint(p,e.key==='Enter'||e.key===' ');showLoupe(displayPoint(p),false);
  });
  cv.addEventListener('blur',hideLoupe);

  // ---------- 주요 색: 표본 → k-means (최원점 초기화, 12회) ----------
  function sample(){
    var s = Math.min(1, 100 / Math.max(sourceWidth, sourceHeight));
    var w = Math.max(1, Math.round(sourceWidth * s)), h = Math.max(1, Math.round(sourceHeight * s));
    var sc = el('canvas'); sc.width = w; sc.height = h;
    // Sampling must not invent extra colors along hard edges (e.g. a four-color logo).
    var sx = sc.getContext('2d'); sx.imageSmoothingEnabled = false; sx.drawImage(img, 0, 0, w, h);
    var d = sx.getImageData(0, 0, w, h).data, pts = [];
    for (var i = 0; i < d.length; i += 4) { var hex=PC.visible(d.subarray(i,i+4)); if(hex){var rgb=C.hexToRgb(hex);pts.push([rgb.r,rgb.g,rgb.b]);} }
    return pts;
  }
  function d2(a, b){ var r = a[0] - b[0], g = a[1] - b[1], bl = a[2] - b[2]; return r * r + g * g + bl * bl; }
  function kmeans(pts, k){
    if (!pts.length) return [];
    var cents = [pts[0].slice()], i, j, n, best, bd;
    var minD = pts.map(function(p){ return d2(p, cents[0]); });
    while (cents.length < k) {                                // 가장 먼 점을 다음 중심으로
      var far = 0; for (i = 1; i < pts.length; i++) if (minD[i] > minD[far]) far = i;
      if (minD[far] === 0) break;
      var c = pts[far].slice(); cents.push(c);
      for (i = 0; i < pts.length; i++) { var dd = d2(pts[i], c); if (dd < minD[i]) minD[i] = dd; }
    }
    var assign = new Array(pts.length), counts;
    for (var it = 0; it < 12; it++) {
      var sums = cents.map(function(){ return [0, 0, 0]; }); counts = cents.map(function(){ return 0; });
      var moved = false;
      for (i = 0; i < pts.length; i++) {
        best = 0; bd = Infinity;
        for (j = 0; j < cents.length; j++) { n = d2(pts[i], cents[j]); if (n < bd) { bd = n; best = j; } }
        if (assign[i] !== best) { assign[i] = best; moved = true; }
        sums[best][0] += pts[i][0]; sums[best][1] += pts[i][1]; sums[best][2] += pts[i][2]; counts[best]++;
      }
      for (j = 0; j < cents.length; j++) if (counts[j]) cents[j] = [sums[j][0] / counts[j], sums[j][1] / counts[j], sums[j][2] / counts[j]];
      if (!moved) break;
    }
    var out = [];
    for (j = 0; j < cents.length; j++) if (counts[j]) out.push({ n: counts[j], c: cents[j] });
    out.sort(function(a, b){ return b.n - a.n; });
    return out;
  }
  // 묶음을 넉넉히(2K) 만든 뒤 비슷한 중심은 합치고, 큰 순서로 K 개
  function dominantColors(pts, k){
    var cl = kmeans(pts, k * 2), i, j;
    for (i = 0; i < cl.length; i++) for (j = cl.length - 1; j > i; j--) {
      if (d2(cl[i].c, cl[j].c) > 24 * 24) continue;
      var n = cl[i].n + cl[j].n, a = cl[i].c, b = cl[j].c;
      cl[i].c = [(a[0] * cl[i].n + b[0] * cl[j].n) / n, (a[1] * cl[i].n + b[1] * cl[j].n) / n, (a[2] * cl[i].n + b[2] * cl[j].n) / n]; cl[i].n = n;
      cl.splice(j, 1);
    }
    cl.sort(function(a, b){ return b.n - a.n; });
    return cl.map(function(o){ return C.rgbToHex({ r: o.c[0], g: o.c[1], b: o.c[2] }); }).filter(function(c, i, a){ return a.indexOf(c) === i; }).slice(0, k);
  }
  function extract(id){
    if (!img) return;
    setTimeout(function(){
      if (id !== loadId) return;
      dominant = dominantColors(sample(), K);
      updateTemplate(domTemplate, dominant, domHint, false);
      U.setPalette(domPal, dominant, { large: true });
      domPal.style.setProperty('--cols', String(dominant.length || 1));
      domSec.hidden = false;
      if(!selectedPoint)setCurrent(dominant[0] || cur,t('representativeColor'));
      side.hidden=!dominant.length;
      btnCopyAll.disabled=btnSave.disabled=!dominant.length;
      autoExport.update();renderPreviews(dominant);
      say(countText('paletteReady', dominant.length));
    }, 20);
  }
  // 팔레트 PNG: 칸마다 색 + HEX 글자
  function savePalette(){
    if (!dominant.length) return;
    var W = 160, H = 200, pc = el('canvas'); pc.width = W * dominant.length; pc.height = H;
    var x = pc.getContext('2d');
    x.font = '600 20px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'; x.textAlign = 'center';
    for (var i = 0; i < dominant.length; i++) {
      x.fillStyle = dominant[i]; x.fillRect(i * W, 0, W, H);
      x.fillStyle = C.textOn(dominant[i]); x.fillText(dominant[i], i * W + W / 2, H - 18);
    }
    pc.toBlob(function(blob){
      if (!blob) return;
      var url = URL.createObjectURL(blob), a = el('a'); a.href = url; a.download = 'palette.png';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 2000);
    }, 'image/png');
  }

  // ---------- 이벤트 ----------
  function openPicker(){ input.value = ''; input.click(); }
  drop.addEventListener('click', function(e){ if (e.target !== btnSel && e.target !== input) openPicker(); });
  btnSel.addEventListener('click', openPicker);
  drop.addEventListener('keydown', function(e){ if ((e.key === 'Enter' || e.key === ' ') && e.target === drop) { e.preventDefault(); openPicker(); } });
  input.addEventListener('change', function(){ load(input.files && input.files[0]); });
  btnChange.addEventListener('click', openPicker);
  if (sampleButton) sampleButton.addEventListener('click', function(){loadSample();});
  if(sampleCard)sampleCard.querySelectorAll('[data-sample]').forEach(function(button){button.addEventListener('click',function(){loadSample(button.dataset.sample);});});
  btnCopyAll.addEventListener('click', function(){ if (dominant.length) U.copy(dominant.join('\n')); });
  btnSave.addEventListener('click', savePalette);
  btnCopyPicks.addEventListener('click', function(){ if (picks.length) U.copy(picks.join('\n')); });
  btnClear.addEventListener('click', function(){ picks = []; templatePicks = []; renderPicks(); });
  // 드래그: 문서 어디에 놓아도 받는다
  var depth = 0;
  function hasFiles(e){ var ts = e.dataTransfer && e.dataTransfer.types; return !!ts && Array.prototype.indexOf.call(ts, 'Files') >= 0; }
  document.addEventListener('dragenter', function(e){ if (!hasFiles(e)) return; e.preventDefault(); depth++; drop.classList.add('on'); });
  document.addEventListener('dragover', function(e){ if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  document.addEventListener('dragleave', function(e){ if (!hasFiles(e)) return; depth = Math.max(0, depth - 1); if (!depth) drop.classList.remove('on'); });
  document.addEventListener('drop', function(e){ if (!hasFiles(e)) return; e.preventDefault(); depth = 0; drop.classList.remove('on'); load(e.dataTransfer.files[0]); });
  // 붙여넣기 (Ctrl+V 로 이미지)
  document.addEventListener('paste', function(e){
    var fs = e.clipboardData && e.clipboardData.files;
    if (fs && fs.length && isImage(fs[0])) { e.preventDefault(); load(fs[0]); }
  });

  renderPicks();
})();
