// 색 라이브러리 (순수 함수, DOM 없음). 브라우저에서는 window.COLOR, Node 에서는 module.exports.
// 값 규칙: hex 는 '#rrggbb' 소문자, rgb 는 {r,g,b} 0~255, hsl/hsv 는 {h 0~360, s 0~100, l|v 0~100}, cmyk 는 {c,m,y,k} 0~100.
(function(){
  'use strict';
  var NAMES = {
    aliceblue:'#f0f8ff',antiquewhite:'#faebd7',aqua:'#00ffff',aquamarine:'#7fffd4',azure:'#f0ffff',beige:'#f5f5dc',bisque:'#ffe4c4',black:'#000000',blanchedalmond:'#ffebcd',blue:'#0000ff',
    blueviolet:'#8a2be2',brown:'#a52a2a',burlywood:'#deb887',cadetblue:'#5f9ea0',chartreuse:'#7fff00',chocolate:'#d2691e',coral:'#ff7f50',cornflowerblue:'#6495ed',cornsilk:'#fff8dc',crimson:'#dc143c',
    cyan:'#00ffff',darkblue:'#00008b',darkcyan:'#008b8b',darkgoldenrod:'#b8860b',darkgray:'#a9a9a9',darkgreen:'#006400',darkgrey:'#a9a9a9',darkkhaki:'#bdb76b',darkmagenta:'#8b008b',darkolivegreen:'#556b2f',
    darkorange:'#ff8c00',darkorchid:'#9932cc',darkred:'#8b0000',darksalmon:'#e9967a',darkseagreen:'#8fbc8f',darkslateblue:'#483d8b',darkslategray:'#2f4f4f',darkslategrey:'#2f4f4f',darkturquoise:'#00ced1',darkviolet:'#9400d3',
    deeppink:'#ff1493',deepskyblue:'#00bfff',dimgray:'#696969',dimgrey:'#696969',dodgerblue:'#1e90ff',firebrick:'#b22222',floralwhite:'#fffaf0',forestgreen:'#228b22',fuchsia:'#ff00ff',gainsboro:'#dcdcdc',
    ghostwhite:'#f8f8ff',gold:'#ffd700',goldenrod:'#daa520',gray:'#808080',green:'#008000',greenyellow:'#adff2f',grey:'#808080',honeydew:'#f0fff0',hotpink:'#ff69b4',indianred:'#cd5c5c',
    indigo:'#4b0082',ivory:'#fffff0',khaki:'#f0e68c',lavender:'#e6e6fa',lavenderblush:'#fff0f5',lawngreen:'#7cfc00',lemonchiffon:'#fffacd',lightblue:'#add8e6',lightcoral:'#f08080',lightcyan:'#e0ffff',
    lightgoldenrodyellow:'#fafad2',lightgray:'#d3d3d3',lightgreen:'#90ee90',lightgrey:'#d3d3d3',lightpink:'#ffb6c1',lightsalmon:'#ffa07a',lightseagreen:'#20b2aa',lightskyblue:'#87cefa',lightslategray:'#778899',lightslategrey:'#778899',
    lightsteelblue:'#b0c4de',lightyellow:'#ffffe0',lime:'#00ff00',limegreen:'#32cd32',linen:'#faf0e6',magenta:'#ff00ff',maroon:'#800000',mediumaquamarine:'#66cdaa',mediumblue:'#0000cd',mediumorchid:'#ba55d3',
    mediumpurple:'#9370db',mediumseagreen:'#3cb371',mediumslateblue:'#7b68ee',mediumspringgreen:'#00fa9a',mediumturquoise:'#48d1cc',mediumvioletred:'#c71585',midnightblue:'#191970',mintcream:'#f5fffa',mistyrose:'#ffe4e1',moccasin:'#ffe4b5',
    navajowhite:'#ffdead',navy:'#000080',oldlace:'#fdf5e6',olive:'#808000',olivedrab:'#6b8e23',orange:'#ffa500',orangered:'#ff4500',orchid:'#da70d6',palegoldenrod:'#eee8aa',palegreen:'#98fb98',
    paleturquoise:'#afeeee',palevioletred:'#db7093',papayawhip:'#ffefd5',peachpuff:'#ffdab9',peru:'#cd853f',pink:'#ffc0cb',plum:'#dda0dd',powderblue:'#b0e0e6',purple:'#800080',rebeccapurple:'#663399',
    red:'#ff0000',rosybrown:'#bc8f8f',royalblue:'#4169e1',saddlebrown:'#8b4513',salmon:'#fa8072',sandybrown:'#f4a460',seagreen:'#2e8b57',seashell:'#fff5ee',sienna:'#a0522d',silver:'#c0c0c0',
    skyblue:'#87ceeb',slateblue:'#6a5acd',slategray:'#708090',slategrey:'#708090',snow:'#fffafa',springgreen:'#00ff7f',steelblue:'#4682b4',tan:'#d2b48c',teal:'#008080',thistle:'#d8bfd8',
    tomato:'#ff6347',turquoise:'#40e0d0',violet:'#ee82ee',wheat:'#f5deb3',white:'#ffffff',whitesmoke:'#f5f5f5',yellow:'#ffff00',yellowgreen:'#9acd32'
  };
  // hex → 이름 (같은 hex 를 가진 이름은 먼저 나온 것이 우선: aqua/cyan, gray/grey …)
  var HEX_NAME = {};
  Object.keys(NAMES).forEach(function(n){ if (!HEX_NAME[NAMES[n]]) HEX_NAME[NAMES[n]] = n; });

  function clamp(v, lo, hi){ v = +v; if (!(v === v)) v = lo; return v < lo ? lo : v > hi ? hi : v; }
  function round(v, d){ var m = Math.pow(10, d || 0); return Math.round(v * m) / m; }
  function pad2(n){ n = Math.round(n).toString(16); return n.length < 2 ? '0' + n : n; }

  // ---------- 변환 ----------
  function hexToRgb(hex){
    var m = /^#?([0-9a-f]{3,8})$/i.exec(String(hex || '').trim());
    if (!m) return null;
    var h = m[1];
    if (h.length === 4 || h.length === 8) h = h.slice(0, h.length === 4 ? 3 : 6);   // 알파 자리 버림
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length !== 6) return null;
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) };
  }
  function rgbToHex(c){ return '#' + pad2(clamp(c.r, 0, 255)) + pad2(clamp(c.g, 0, 255)) + pad2(clamp(c.b, 0, 255)); }
  function rgbToHsl(c){
    var r = clamp(c.r, 0, 255) / 255, g = clamp(c.g, 0, 255) / 255, b = clamp(c.b, 0, 255) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, h = 0, s = 0, l = (max + min) / 2;
    if (d) {
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0); else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
      h *= 60;
    }
    return { h: round(h, 1), s: round(s * 100, 1), l: round(l * 100, 1) };
  }
  function hslToRgb(c){
    var h = ((clamp(c.h, -1e9, 1e9) % 360) + 360) % 360 / 360, s = clamp(c.s, 0, 100) / 100, l = clamp(c.l, 0, 100) / 100;
    function f(p, q, t){ if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; }
    var r, g, b;
    if (!s) { r = g = b = l; }
    else { var q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q; r = f(p, q, h + 1 / 3); g = f(p, q, h); b = f(p, q, h - 1 / 3); }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }
  function rgbToHsv(c){
    var r = clamp(c.r, 0, 255) / 255, g = clamp(c.g, 0, 255) / 255, b = clamp(c.b, 0, 255) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, h = 0, s = max ? d / max : 0;
    if (d) { if (max === r) h = (g - b) / d + (g < b ? 6 : 0); else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; h *= 60; }
    return { h: round(h, 1), s: round(s * 100, 1), v: round(max * 100, 1) };
  }
  function hsvToRgb(c){
    var h = ((clamp(c.h, -1e9, 1e9) % 360) + 360) % 360 / 60, s = clamp(c.s, 0, 100) / 100, v = clamp(c.v, 0, 100) / 100;
    var i = Math.floor(h), f = h - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s), r, g, b;
    switch (i % 6) { case 0: r = v; g = t; b = p; break; case 1: r = q; g = v; b = p; break; case 2: r = p; g = v; b = t; break; case 3: r = p; g = q; b = v; break; case 4: r = t; g = p; b = v; break; default: r = v; g = p; b = q; }
    return { r: Math.round(r * 255), g: Math.round(g * 255), b: Math.round(b * 255) };
  }
  function rgbToCmyk(c){
    var r = clamp(c.r, 0, 255) / 255, g = clamp(c.g, 0, 255) / 255, b = clamp(c.b, 0, 255) / 255, k = 1 - Math.max(r, g, b);
    if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 };
    return { c: round((1 - r - k) / (1 - k) * 100), m: round((1 - g - k) / (1 - k) * 100), y: round((1 - b - k) / (1 - k) * 100), k: round(k * 100) };
  }
  function cmykToRgb(c){
    var k = clamp(c.k, 0, 100) / 100;
    return { r: Math.round(255 * (1 - clamp(c.c, 0, 100) / 100) * (1 - k)), g: Math.round(255 * (1 - clamp(c.m, 0, 100) / 100) * (1 - k)), b: Math.round(255 * (1 - clamp(c.y, 0, 100) / 100) * (1 - k)) };
  }
  var hexToHsl = function(h){ var c = hexToRgb(h); return c && rgbToHsl(c); };
  var hslToHex = function(c){ return rgbToHex(hslToRgb(c)); };
  var hexToHsv = function(h){ var c = hexToRgb(h); return c && rgbToHsv(c); };
  var hsvToHex = function(c){ return rgbToHex(hsvToRgb(c)); };
  var hexToCmyk = function(h){ var c = hexToRgb(h); return c && rgbToCmyk(c); };
  var cmykToHex = function(c){ return rgbToHex(cmykToRgb(c)); };

  // ---------- 문자열 ----------
  function fmtNum(v){ return String(round(v, 1)); }
  function rgbString(c){ return 'rgb(' + Math.round(c.r) + ', ' + Math.round(c.g) + ', ' + Math.round(c.b) + ')'; }
  function hslString(c){ return 'hsl(' + fmtNum(c.h) + ', ' + fmtNum(c.s) + '%, ' + fmtNum(c.l) + '%)'; }
  function hsvString(c){ return 'hsv(' + fmtNum(c.h) + ', ' + fmtNum(c.s) + '%, ' + fmtNum(c.v) + '%)'; }
  function cmykString(c){ return 'cmyk(' + Math.round(c.c) + '%, ' + Math.round(c.m) + '%, ' + Math.round(c.y) + '%, ' + Math.round(c.k) + '%)'; }

  // 아무 표기나 받아 hex 로. 실패하면 null.  '#f53', 'ff5733', 'rgb(255 87 51)', 'hsl(11, 100%, 60%)', 'tomato', '255,87,51'
  function parse(str){
    var s = String(str == null ? '' : str).trim().toLowerCase();
    if (!s) return null;
    if (NAMES[s]) return NAMES[s];
    if (/^#?[0-9a-f]{3}$|^#?[0-9a-f]{4}$|^#?[0-9a-f]{6}$|^#?[0-9a-f]{8}$/.test(s)) { var c = hexToRgb(s); return c && rgbToHex(c); }
    var m = /^(rgba?|hsla?|hsva?|hsb|cmyk)\s*\(\s*([^)]*)\)$/.exec(s);
    var nums, kind;
    if (m) { kind = m[1]; nums = m[2]; }
    else if (/^[\d.\s,%\/-]+$/.test(s)) { kind = 'rgb'; nums = s; }
    else return null;
    var parts = nums.replace(/\//g, ' ').split(/[\s,]+/).filter(Boolean);
    if (parts.length < 3) return null;
    var n = parts.map(function(p){ var pct = /%$/.test(p); var v = parseFloat(p); if (!(v === v)) return null; return { v: v, pct: pct }; });
    if (n.indexOf(null) >= 0) return null;
    if (kind === 'rgb' || kind === 'rgba') {
      var ch = n.slice(0, 3).map(function(x){ return x.pct ? x.v * 2.55 : x.v; });
      if (ch.some(function(v){ return v < 0 || v > 255; })) return null;
      return rgbToHex({ r: ch[0], g: ch[1], b: ch[2] });
    }
    if (kind === 'cmyk') { if (n.length < 4) return null; return cmykToHex({ c: n[0].v, m: n[1].v, y: n[2].v, k: n[3].v }); }
    var hue = n[0].v, a = n[1].v, b = n[2].v;
    if (a < 0 || a > 100 || b < 0 || b > 100) return null;
    if (kind === 'hsl' || kind === 'hsla') return hslToHex({ h: hue, s: a, l: b });
    return hsvToHex({ h: hue, s: a, v: b });
  }
  function isValid(str){ return parse(str) !== null; }

  // ---------- 이름 ----------
  function nameToHex(name){ return NAMES[String(name || '').trim().toLowerCase()] || null; }
  function hexToName(hex){ var c = hexToRgb(hex); return c ? (HEX_NAME[rgbToHex(c)] || null) : null; }
  // 가까운 이름 색: 사람 눈 가중 RGB 거리(redmean)
  function distance(a, b){
    var rm = (a.r + b.r) / 2, dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
    return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
  }
  function nearestName(hex){
    var c = hexToRgb(hex); if (!c) return null;
    var best = null, bd = Infinity, names = Object.keys(HEX_NAME);
    for (var i = 0; i < names.length; i++) { var d = distance(c, hexToRgb(names[i])); if (d < bd) { bd = d; best = names[i]; } }
    return { name: HEX_NAME[best], hex: best, distance: round(bd, 2), exact: bd === 0 };
  }

  // ---------- 대비 ----------
  function luminance(hex){
    var c = hexToRgb(hex); if (!c) return 0;
    function ch(v){ v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }
  function contrast(a, b){
    var la = luminance(a), lb = luminance(b), hi = Math.max(la, lb), lo = Math.min(la, lb);
    return round((hi + 0.05) / (lo + 0.05), 2);
  }
  // WCAG 등급: AAA(7+) · AA(4.5+) · AA-large(3+) · fail
  function contrastLevel(ratio){ return ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'AA-large' : 'fail'; }
  function isLight(hex){ return luminance(hex) > 0.4; }
  function textOn(hex){ return contrast(hex, '#ffffff') >= contrast(hex, '#000000') ? '#ffffff' : '#000000'; }

  // ---------- 조작·배색 ----------
  function mix(a, b, t){
    var x = hexToRgb(a), y = hexToRgb(b); t = clamp(t, 0, 1);
    return rgbToHex({ r: x.r + (y.r - x.r) * t, g: x.g + (y.g - x.g) * t, b: x.b + (y.b - x.b) * t });
  }
  function rotate(hex, deg){ var c = hexToHsl(hex); c.h = ((c.h + deg) % 360 + 360) % 360; return hslToHex(c); }
  function lighten(hex, amt){ var c = hexToHsl(hex); c.l = clamp(c.l + amt, 0, 100); return hslToHex(c); }
  function darken(hex, amt){ return lighten(hex, -amt); }
  function saturate(hex, amt){ var c = hexToHsl(hex); c.s = clamp(c.s + amt, 0, 100); return hslToHex(c); }
  function grayscale(hex){ var c = hexToHsl(hex); c.s = 0; return hslToHex(c); }
  function invert(hex){ var c = hexToRgb(hex); return rgbToHex({ r: 255 - c.r, g: 255 - c.g, b: 255 - c.b }); }
  // 밝기 단계: 원색 → 흰색(tints) / 검정(shades). n 칸, 첫 칸은 원색, 마지막 칸은 흰/검 직전
  function tints(hex, n){ n = n || 10; var out = []; for (var i = 0; i < n; i++) out.push(mix(hex, '#ffffff', i / n)); return out; }
  function shades(hex, n){ n = n || 10; var out = []; for (var i = 0; i < n; i++) out.push(mix(hex, '#000000', i / n)); return out; }
  function scale(hex, n){ n = n || 10; var out = [], c = hexToHsl(hex); for (var i = 0; i < n; i++) out.push(hslToHex({ h: c.h, s: c.s, l: 95 - (90 * i) / (n - 1) })); return out; }
  function complementary(hex){ return [hex, rotate(hex, 180)]; }
  function analogous(hex, deg){ deg = deg || 30; return [rotate(hex, -deg), hex, rotate(hex, deg)]; }
  function triadic(hex){ return [hex, rotate(hex, 120), rotate(hex, 240)]; }
  function tetradic(hex){ return [hex, rotate(hex, 90), rotate(hex, 180), rotate(hex, 270)]; }
  function splitComplementary(hex){ return [hex, rotate(hex, 150), rotate(hex, 210)]; }
  function monochromatic(hex, n){ return scale(hex, n || 5); }
  function random(){ return rgbToHex({ r: Math.random() * 256 | 0, g: Math.random() * 256 | 0, b: Math.random() * 256 | 0 }); }

  var COLOR = {
    NAMES: NAMES, names: Object.keys(NAMES),
    hexToRgb: hexToRgb, rgbToHex: rgbToHex, rgbToHsl: rgbToHsl, hslToRgb: hslToRgb, rgbToHsv: rgbToHsv, hsvToRgb: hsvToRgb, rgbToCmyk: rgbToCmyk, cmykToRgb: cmykToRgb,
    hexToHsl: hexToHsl, hslToHex: hslToHex, hexToHsv: hexToHsv, hsvToHex: hsvToHex, hexToCmyk: hexToCmyk, cmykToHex: cmykToHex,
    rgbString: rgbString, hslString: hslString, hsvString: hsvString, cmykString: cmykString,
    parse: parse, isValid: isValid, nameToHex: nameToHex, hexToName: hexToName, nearestName: nearestName, distance: distance,
    luminance: luminance, contrast: contrast, contrastLevel: contrastLevel, isLight: isLight, textOn: textOn,
    mix: mix, rotate: rotate, lighten: lighten, darken: darken, saturate: saturate, grayscale: grayscale, invert: invert,
    tints: tints, shades: shades, scale: scale, complementary: complementary, analogous: analogous, triadic: triadic, tetradic: tetradic, splitComplementary: splitComplementary, monochromatic: monochromatic, random: random
  };
  if (typeof window !== 'undefined') window.COLOR = COLOR;
  if (typeof module !== 'undefined' && module.exports) module.exports = COLOR;
})();
