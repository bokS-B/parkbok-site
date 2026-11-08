const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const slots = {
  '/pdf/compress/ko/': '5292267734',
  '/pdf/merge/ko/': '4454662935',
  '/image/image-compress/ko/': '4454662935',
  '/image/png-to-jpg/ko/': '4454662935'
};
const script = fs.readFileSync(path.join(__dirname, '../assets/tool-ads.js'), 'utf8').replace(/\r\n/g, '\n');
const revision = createHash('sha256').update(script).digest('hex').slice(0, 10);
const adCss = `
.pb-tool-ad {
  margin: clamp(1.75rem, 4vw, 3rem) auto 0;
  max-width: 970px;
  background: var(--card);
  border-radius: var(--r-big);
  box-shadow: inset 0 0 0 1px var(--line);
}
.pb-tool-ad__label {
  margin: 0;
  padding: .5rem .75rem;
  border-bottom: 1px solid var(--line);
  color: var(--muted);
  font-size: var(--fs-caption);
  text-align: center;
}
.pb-tool-ad[hidden],
.pb-tool-ad:has(> ins[data-ad-status="unfilled"]) { display: none; }
`;

function toolAds(pagePath, css) {
  const slot = slots[pagePath];
  if (!slot) return { css, adAfterHelp: '', pageScript: '', railProtection: '' };
  return {
    css: css + adCss,
    adAfterHelp: `
  <section class="pb-tool-ad" id="pb-tool-ad" data-page-path="${pagePath}" hidden aria-label="광고">
    <p class="pb-tool-ad__label">광고</p>
    <ins class="adsbygoogle" style="display:block" data-ad-client="ca-pub-1415309581345613" data-ad-slot="${slot}" data-ad-format="auto" data-full-width-responsive="false"></ins>
  </section>`,
    pageScript: '\n<script src="/assets/tool-ads.js?v=' + revision + '" defer></script>',
    railProtection: ' google-side-rail-overlap="false"'
  };
}

module.exports = toolAds;
