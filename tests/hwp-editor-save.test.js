'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const vm = require('node:vm');

const maxFileSize = 10 * 1024 * 1024;
const source = fs.readFileSync(require.resolve('../assets/hwp-editor.js'), 'utf8');

function fixture() {
  const file = new Uint8Array(maxFileSize);
  file.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  const header = Buffer.alloc(256);
  header.write('HWP Document File');
  header[35] = 5;
  header[36] = 1;
  const names = ['FileHeader', 'BodyText/Section0', 'BodyText/Section1', 'PrvText'];
  const streams = [header, Buffer.from('first'), Buffer.from('second'), Buffer.from('original', 'utf16le')];
  const original = {
    FullPaths: ['Root Entry/', ...names.map(name => 'Root Entry/' + name)],
    FileIndex: [{ type: 5 }, ...streams.map(content => ({ type: 2, content, size: content.length }))]
  };
  const writes = [];
  const decode = bytes => Buffer.from(bytes).toString('utf8');
  const window = {
    CFB: {
      read() { return original; },
      write(container) {
        const [, , body0, body1, preview] = container.FileIndex;
        const bodies = [decode(body0.content), decode(body1.content)];
        const previewText = Buffer.from(preview.content).toString('utf16le');
        const final = previewText !== 'original';
        const size = final ? maxFileSize + Number(bodies.includes('oversize')) : 128;
        writes.push({ bodies, previewText, size });
        const output = new Uint8Array(size);
        output.set(Buffer.from([...bodies, previewText].join('|')));
        return output;
      }
    },
    CRC32: { buf() { return 0; } },
    pako: {
      Inflate: class {
        push(input) {
          this.onData(input);
          this.strm = { next_in: input.length };
          this.ended = true;
          return true;
        }
      },
      deflateRaw(bytes) { return bytes; }
    },
    PBHwpRecords: {
      read(bytes) { return { bytes, runCount: 1 }; },
      find(section, query) {
        return decode(section.bytes) === query ? [{ location: 'paragraph', context: query }] : [];
      },
      replace(section, match, query, replacement) {
        assert.equal(match.context, query);
        assert.equal(decode(section.bytes), query);
        if (query === replacement) return false;
        section.bytes = Uint8Array.from(Buffer.from(replacement));
        return true;
      },
      restore(section, bytes) { section.bytes = bytes; }
    }
  };
  vm.runInNewContext(source, { window });
  return { file, editor: window.PBHwpEditor, writes, decode };
}

test('a copy over the final size limit leaves the previous HWP edit and download intact', async () => {
  const { file, editor, writes, decode } = fixture();
  const document = await editor.load(file);
  const preview = bytes => decode(bytes.subarray(0, 128)).split('|').slice(0, 2).join(' / ');
  const replace = (query, next) => document.replace(document.find(query)[0], query, next, preview);

  assert.equal(replace('first', 'accepted'), true);
  const first = Buffer.from(document.save());
  assert.equal(first.length, maxFileSize);
  assert.deepEqual(writes.at(-1), {
    bodies: ['accepted', 'second'], previewText: 'accepted / second', size: maxFileSize
  });

  assert.throws(() => replace('second', 'oversize'), /10MB/);
  assert.deepEqual(writes.at(-1), {
    bodies: ['accepted', 'oversize'], previewText: 'accepted / oversize', size: maxFileSize + 1
  });
  assert.equal(document.find('accepted').length, 1);
  assert.equal(document.find('second').length, 1);
  assert.equal(document.find('oversize').length, 0);
  const writeCount = writes.length;
  assert.deepEqual(Buffer.from(document.save()), first);
  assert.equal(writes.length, writeCount);

  assert.equal(replace('second', 'recovered'), true);
  const recovered = Buffer.from(document.save());
  assert.notDeepEqual(recovered, first);
  assert.deepEqual(writes.at(-1), {
    bodies: ['accepted', 'recovered'], previewText: 'accepted / recovered', size: maxFileSize
  });
});
