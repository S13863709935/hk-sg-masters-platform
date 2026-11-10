import {crc32,deflateRawSync} from 'node:zlib';

// Canonical file entries only: no './' root, Unix directory attributes,
// streaming data descriptors or platform-specific extra fields.
export function standardZip(entries, timestamp = new Date()) {
  if (!Array.isArray(entries) || entries.length > 65535) throw new Error('ZIP32 supports at most 65535 entries');
  const year = Math.max(1980, Math.min(2107, timestamp.getUTCFullYear()));
  const date = ((year - 1980) << 9) | ((timestamp.getUTCMonth() + 1) << 5) | timestamp.getUTCDate();
  const time = (timestamp.getUTCHours() << 11) | (timestamp.getUTCMinutes() << 5) | (timestamp.getUTCSeconds() >> 1);
  const local = [], central = [], names = new Set();
  let offset = 0;
  for (const entry of entries) {
    const name = entry.name;
    if (typeof name !== 'string' || !name || name.includes('\\') || name.includes('\0') || name.includes(':') || name.startsWith('/') || name.split('/').some(p => !p || p === '.' || p === '..') || names.has(name)) throw new Error('ZIP entry must be a unique canonical relative file path');
    names.add(name);
    const filename = Buffer.from(name, 'utf8'), data = Buffer.from(entry.data), compressed = deflateRawSync(data);
    if (filename.length > 65535 || data.length > 0xffffffff || compressed.length > 0xffffffff || offset > 0xffffffff) throw new Error('ZIP32 size limit exceeded');
    const checksum = crc32(data), header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0); header.writeUInt16LE(20, 4); header.writeUInt16LE(0x0800, 6); header.writeUInt16LE(8, 8);
    header.writeUInt16LE(time, 10); header.writeUInt16LE(date, 12); header.writeUInt32LE(checksum, 14);
    header.writeUInt32LE(compressed.length, 18); header.writeUInt32LE(data.length, 22); header.writeUInt16LE(filename.length, 26);
    const directory = Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50, 0); directory.writeUInt16LE(20, 4); directory.writeUInt16LE(20, 6);
    directory.writeUInt16LE(0x0800, 8); directory.writeUInt16LE(8, 10); directory.writeUInt16LE(time, 12); directory.writeUInt16LE(date, 14);
    directory.writeUInt32LE(checksum, 16); directory.writeUInt32LE(compressed.length, 20); directory.writeUInt32LE(data.length, 24);
    directory.writeUInt16LE(filename.length, 28); directory.writeUInt32LE(0x20, 38); directory.writeUInt32LE(offset, 42);
    local.push(header, filename, compressed); central.push(directory, filename);
    offset += header.length + filename.length + compressed.length;
  }
  const directory = Buffer.concat(central), end = Buffer.alloc(22);
  if (offset + directory.length > 0xffffffff) throw new Error('ZIP32 size limit exceeded');
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
