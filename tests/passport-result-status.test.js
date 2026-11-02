'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const tool = require('../image/tools/passport-photo.js');

// The canvas encoder is replaced, but the real tool still crops, encodes,
// writes density metadata, constructs the final Blob, and validates it.
function jpegBytes(size, withJfif = false) {
  assert.ok(size >= 22);
  const bytes = new Uint8Array(size);
  bytes.set(withJfif
    ? [0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 72, 0, 72, 0, 0]
    : [0xff, 0xd8, 0xff, 0xda]);
  bytes.set([0xff, 0xd9], size - 2);
  return bytes;
}

function pngBytes(size) {
  assert.ok(size >= 45);
  const bytes = new Uint8Array(size);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10]);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12); // IHDR ends at byte 33.
  view.setUint32(16, 600);
  view.setUint32(20, 600);
  bytes[24] = 8;
  bytes[25] = 2;
  bytes.set([0x49, 0x45, 0x4e, 0x44], size - 8);
  return bytes;
}

function fixture(encode) {
  const calls = { load: 0, encode: [], progress: [], released: [] };
  const ctx = {
    async loadImage() {
      calls.load++;
      return { naturalWidth: 1600, naturalHeight: 2000 };
    },
    canvas(width, height) {
      return {
        width,
        height,
        getContext(type) {
          assert.equal(type, '2d');
          return { drawImage() {}, fillRect() {} };
        }
      };
    },
    async toBlob(canvas, type, quality) {
      calls.encode.push({ width: canvas.width, height: canvas.height, type, quality });
      return new Blob([encode(type, quality)], { type });
    },
    release(image) { calls.released.push(image); },
    progress(value) { calls.progress.push(value); },
    human(value) { return `${value} B`; },
    t(key, values) {
      if (key === 'errors') return { custom: 'Invalid custom dimensions', rect: 'Invalid crop' };
      return key + (values ? ` ${JSON.stringify(values)}` : '');
    }
  };
  const file = new Blob([new Uint8Array(8192)], { type: 'image/jpeg' });
  Object.defineProperty(file, 'name', { value: 'portrait.original.jpg' });
  return { ctx, calls, file };
}

function assertSizeResult(result, actualBytes, limitBytes, status) {
  assert.equal(result.outputs.length, 1);
  assert.equal(result.outputs[0].blob.size, actualBytes);
  assert.equal(result.outputs[0].srcSize, 8192);
  assert.equal(typeof result.note, 'string');
  assert.deepEqual(result.validation.size, {
    status, actualBytes, limitBytes, unitBytes: 1024
  });
  if (status === 'failed') {
    assert.equal(typeof result.warning.message, 'string');
    assert.ok(result.warning.message.trim(), 'an oversized result needs an explicit warning');
    assert.equal(typeof result.warning.downloadText, 'string');
    assert.ok(result.warning.downloadText.trim(), 'an oversized result needs a distinct download label');
  } else {
    assert.equal(result.warning, null);
  }
}

test('validateSize uses an inclusive 1024-byte KB boundary', async (t) => {
  for (const [actualBytes, status] of [[1023, 'passed'], [1024, 'passed'], [1025, 'failed']]) {
    await t.test(`${actualBytes} bytes`, () => {
      const blob = new Blob([new Uint8Array(actualBytes)]);
      assert.deepEqual(tool.validateSize(blob, 1), {
        status, actualBytes, limitBytes: 1024, unitBytes: 1024
      });
    });
  }
});

test('zero cap is not_requested, rather than a passed size check', () => {
  assert.deepEqual(tool.validateSize(new Blob([new Uint8Array(1025)]), 0), {
    status: 'not_requested', actualBytes: 1025, limitBytes: null, unitBytes: 1024
  });
});

test('JPG run validates the final Blob including an inserted 18-byte JFIF segment', async (t) => {
  for (const [finalBytes, status] of [[1023, 'passed'], [1024, 'passed'], [1025, 'failed']]) {
    await t.test(`${finalBytes} final bytes`, async () => {
      const { ctx, calls, file } = fixture(() => jpegBytes(finalBytes - 18));
      const result = await tool.run([file], { preset: 'us_passport', format: 'jpg', maxKb: 1 }, ctx);
      assertSizeResult(result, finalBytes, 1024, status);
      assert.equal(result.outputs[0].blob.type, 'image/jpeg');
      assert.equal(result.outputs[0].name, 'portrait.original-passport-600x600.jpg');
      const bytes = new Uint8Array(await result.outputs[0].blob.arrayBuffer());
      assert.deepEqual(Array.from(bytes.slice(6, 11)), [0x4a, 0x46, 0x49, 0x46, 0]);
      assert.equal(calls.released.length, 1);
      assert.equal(calls.progress.at(-1), 1);
    });
  }
});

test('JPG with an existing JFIF segment stays at the byte limit after updating dpi', async () => {
  const { ctx, file } = fixture(() => jpegBytes(1024, true));
  const result = await tool.run([file], { preset: 'us_passport', format: 'jpg', maxKb: 1 }, ctx);
  assertSizeResult(result, 1024, 1024, 'passed');
  const bytes = new Uint8Array(await result.outputs[0].blob.arrayBuffer());
  assert.deepEqual(Array.from(bytes.slice(13, 18)), [1, 1, 44, 1, 44]); // 300 dpi.
});

test('JPG quality search can produce a final file that meets the requested cap', async () => {
  const { ctx, calls, file } = fixture((_type, quality) => jpegBytes(quality > 0.7 ? 1400 : 1006));
  const result = await tool.run([file], { preset: 'us_passport', format: 'jpg', maxKb: 1 }, ctx);
  assertSizeResult(result, 1024, 1024, 'passed');
  assert.ok(calls.encode.length > 1, 'the initial oversized encoding must be retried at lower quality');
  assert.ok(calls.encode.some(({ quality }) => quality < 0.92));
});

test('PNG run validates after adding the 21-byte pHYs chunk', async (t) => {
  for (const [finalBytes, status] of [[1023, 'passed'], [1024, 'passed'], [1025, 'failed']]) {
    await t.test(`${finalBytes} final bytes`, async () => {
      const { ctx, calls, file } = fixture((type) => {
        assert.equal(type, 'image/png');
        return pngBytes(finalBytes - 21);
      });
      const result = await tool.run([file], { preset: 'us_passport', format: 'png', maxKb: 1 }, ctx);
      assertSizeResult(result, finalBytes, 1024, status);
      assert.equal(result.outputs[0].blob.type, 'image/png');
      assert.match(result.outputs[0].name, /\.png$/);
      assert.equal(calls.encode.length, 1, 'PNG must report failure without a fake JPEG quality search');
      const bytes = new Uint8Array(await result.outputs[0].blob.arrayBuffer());
      assert.deepEqual(Array.from(bytes.slice(37, 41)), [0x70, 0x48, 0x59, 0x73]);
    });
  }
});

test('selecting PNG does not bypass the preset file-size requirement', async () => {
  const rawBytes = 500 * 1024;
  const { ctx, file } = fixture(() => pngBytes(rawBytes));
  const result = await tool.run([file], { preset: 'kr_passport', format: 'png' }, ctx);
  assertSizeResult(result, rawBytes + 21, 500 * 1024, 'failed');
});

test('a zero limit leaves both JPG and PNG outputs downloadable without a size warning', async (t) => {
  for (const format of ['jpg', 'png']) {
    await t.test(format, async () => {
      const { ctx, calls, file } = fixture((type) => type === 'image/png' ? pngBytes(2000) : jpegBytes(2000));
      const result = await tool.run([file], { preset: 'kr_passport', format, maxKb: 0 }, ctx);
      assertSizeResult(result, format === 'png' ? 2021 : 2018, null, 'not_requested');
      assert.equal(calls.encode.length, 1, 'no size cap should trigger no compression search');
    });
  }
});

test('invalid custom dimensions reject before image loading or encoding', async (t) => {
  for (const custom of [
    { unit: 'px', w: 0, h: 600, dpi: 300 },
    { unit: 'px', w: 15, h: 600, dpi: 300 },
    { unit: 'px', w: 6001, h: 600, dpi: 300 },
    { unit: 'mm', w: -35, h: 45, dpi: 300 }
  ]) {
    await t.test(JSON.stringify(custom), async () => {
      const { ctx, calls, file } = fixture(() => jpegBytes(100));
      await assert.rejects(tool.run([file], { preset: 'custom', custom, maxKb: 1 }, ctx), /custom/);
      assert.equal(calls.load, 0);
      assert.equal(calls.encode.length, 0);
    });
  }
});
