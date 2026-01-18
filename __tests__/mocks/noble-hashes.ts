/**
 * Mock for @noble/hashes
 *
 * Provides mock implementations of sha256, sha512, and utils
 * for testing crypto primitives.
 */

// Simple mock hash function
function mockHash(data: Uint8Array, outputLength: number): Uint8Array {
  const result = new Uint8Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    result[i] = data[i % data.length] ^ (i * 17);
  }
  return result;
}

// SHA-256 mock
export function sha256(data: Uint8Array): Uint8Array {
  return mockHash(data, 32);
}

sha256.create = () => ({
  update: function(data: Uint8Array) { this._data = data; return this; },
  digest: function() { return mockHash(this._data || new Uint8Array(0), 32); },
  _data: null as Uint8Array | null,
});

// SHA-512 mock
export function sha512(data: Uint8Array): Uint8Array {
  return mockHash(data, 64);
}

sha512.create = () => ({
  update: function(data: Uint8Array) { this._data = data; return this; },
  digest: function() { return mockHash(this._data || new Uint8Array(0), 64); },
  _data: null as Uint8Array | null,
});

// Utils
export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

export function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

export function utf8ToBytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

export default {
  sha256,
  sha512,
  bytesToHex,
  hexToBytes,
  concatBytes,
  utf8ToBytes,
  randomBytes,
};
