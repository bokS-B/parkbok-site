const test = require('node:test');
const assert = require('node:assert/strict');
const tool = require('../image/tools/image-compress.js');

test('shared KB targets accept bounded whole numbers and ignore unsafe input', () => {
  for (const value of [0, 50, 100, 200, 500, 51200]) assert.equal(tool.targetFromSearch('?maxKb=' + value), value);
  for (const query of ['', '?maxKb=-1', '?maxKb=1.5', '?maxKb=Infinity', '?maxKb=51201', '?maxKb=%3Cscript%3E', '?maxKb=1e2']) assert.equal(tool.targetFromSearch(query), 0);
  assert.equal(tool.targetFromSearch('?utm_campaign=first10&maxKb=100&utm_source=test'), 100);
});
