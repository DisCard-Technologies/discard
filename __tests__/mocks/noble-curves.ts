/**
 * Mock for @noble/curves/ed25519
 *
 * Provides mock implementations of RistrettoPoint and Scalar
 * for testing crypto primitives without requiring actual elliptic curve operations.
 */

// Mock Scalar class
class MockScalar {
  private bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  static fromBytes(bytes: Uint8Array): MockScalar {
    return new MockScalar(bytes);
  }

  toBytes(): Uint8Array {
    return this.bytes;
  }

  add(other: MockScalar): MockScalar {
    const result = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      result[i] = (this.bytes[i] + other.bytes[i]) % 256;
    }
    return new MockScalar(result);
  }

  subtract(other: MockScalar): MockScalar {
    const result = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      result[i] = (this.bytes[i] - other.bytes[i] + 256) % 256;
    }
    return new MockScalar(result);
  }

  multiply(other: MockScalar): MockScalar {
    // Simplified mock - just XOR for determinism
    const result = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      result[i] = this.bytes[i] ^ other.bytes[i];
    }
    return new MockScalar(result);
  }

  invert(): MockScalar {
    // Mock invert - just flip bytes
    const result = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      result[i] = 255 - this.bytes[i];
    }
    return new MockScalar(result);
  }

  equals(other: MockScalar): boolean {
    return this.bytes.every((b, i) => b === other.bytes[i]);
  }
}

// Mock RistrettoPoint class
class MockRistrettoPoint {
  private bytes: Uint8Array;

  constructor(bytes?: Uint8Array) {
    this.bytes = bytes || new Uint8Array(32);
  }

  static BASE = new MockRistrettoPoint(
    new Uint8Array([
      0x58, 0x66, 0x66, 0x66, 0x66, 0x66, 0x66, 0x66,
      0x66, 0x66, 0x66, 0x66, 0x66, 0x66, 0x66, 0x66,
      0x66, 0x66, 0x66, 0x66, 0x66, 0x66, 0x66, 0x66,
      0x66, 0x66, 0x66, 0x66, 0x66, 0x66, 0x66, 0x66,
    ])
  );

  static ZERO = new MockRistrettoPoint(new Uint8Array(32));

  static fromBytes(bytes: Uint8Array): MockRistrettoPoint {
    return new MockRistrettoPoint(bytes);
  }

  static fromHex(hex: string): MockRistrettoPoint {
    const bytes = new Uint8Array(hex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    return new MockRistrettoPoint(bytes);
  }

  toBytes(): Uint8Array {
    return this.bytes;
  }

  toHex(): string {
    return Array.from(this.bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  add(other: MockRistrettoPoint): MockRistrettoPoint {
    const result = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      result[i] = (this.bytes[i] + other.bytes[i]) % 256;
    }
    return new MockRistrettoPoint(result);
  }

  subtract(other: MockRistrettoPoint): MockRistrettoPoint {
    const result = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      result[i] = (this.bytes[i] - other.bytes[i] + 256) % 256;
    }
    return new MockRistrettoPoint(result);
  }

  multiply(scalar: MockScalar | bigint): MockRistrettoPoint {
    // Mock multiplication
    const scalarBytes = scalar instanceof MockScalar
      ? scalar.toBytes()
      : new Uint8Array(32);

    const result = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      result[i] = (this.bytes[i] ^ scalarBytes[i]) % 256;
    }
    return new MockRistrettoPoint(result);
  }

  negate(): MockRistrettoPoint {
    const result = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      result[i] = 255 - this.bytes[i];
    }
    return new MockRistrettoPoint(result);
  }

  equals(other: MockRistrettoPoint): boolean {
    return this.bytes.every((b, i) => b === other.bytes[i]);
  }
}

// Export mocks
export const Scalar = MockScalar;
export const RistrettoPoint = MockRistrettoPoint;

// Curve order as a number (for environments that can't handle BigInt in JSON)
const CURVE_ORDER_HEX = '1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed';

// Mock Fn (field) for curve operations
const MockFn = {
  ORDER: BigInt('0x' + CURVE_ORDER_HEX),
  create: (n: bigint) => n,
  mul: (a: bigint, b: bigint) => a * b,
  add: (a: bigint, b: bigint) => a + b,
  sub: (a: bigint, b: bigint) => a - b,
  inv: (a: bigint) => a,
  pow: (a: bigint, b: bigint) => a,
};

// Mock Point with Fn for bulletproofs compatibility
const MockPoint = {
  BASE: MockRistrettoPoint.BASE,
  ZERO: MockRistrettoPoint.ZERO,
  Fn: MockFn,
  fromHex: MockRistrettoPoint.fromHex,
};

// Mock ed25519 curve
export const ed25519 = {
  CURVE: {
    n: BigInt('0x' + CURVE_ORDER_HEX),
    p: BigInt('0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed'),
  },
  Point: MockPoint,
  ExtendedPoint: {
    BASE: MockRistrettoPoint.BASE,
    ZERO: MockRistrettoPoint.ZERO,
    fromHex: MockRistrettoPoint.fromHex,
    Fn: MockFn,
  },
  utils: {
    randomPrivateKey: () => {
      const bytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        bytes[i] = Math.floor(Math.random() * 256);
      }
      return bytes;
    },
    getExtendedPublicKey: (privateKey: Uint8Array) => {
      return {
        head: privateKey.slice(0, 32),
        prefix: privateKey.slice(0, 32),
        scalar: BigInt(1),
        point: MockRistrettoPoint.BASE,
        pointBytes: MockRistrettoPoint.BASE.toBytes(),
      };
    },
  },
  getPublicKey: (privateKey: Uint8Array) => {
    // Return deterministic mock public key
    const result = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      result[i] = privateKey[i] ^ 0x42;
    }
    return result;
  },
  sign: (message: Uint8Array, privateKey: Uint8Array) => {
    // Return deterministic 64-byte signature
    const sig = new Uint8Array(64);
    for (let i = 0; i < 32; i++) {
      sig[i] = message[i % message.length] ^ privateKey[i];
      sig[i + 32] = privateKey[i] ^ 0x55;
    }
    return sig;
  },
  verify: (signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array) => {
    // Always return true for valid-looking signatures
    return signature.length === 64 && publicKey.length === 32;
  },
};

// Mock x25519
export const x25519 = {
  getPublicKey: (privateKey: Uint8Array) => {
    const result = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      result[i] = privateKey[i] ^ 0x33;
    }
    return result;
  },
  getSharedSecret: (privateKey: Uint8Array, publicKey: Uint8Array) => {
    const result = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      result[i] = privateKey[i] ^ publicKey[i];
    }
    return result;
  },
};

// Mock ristretto255
export const ristretto255 = {
  Point: MockRistrettoPoint,
};

export const ristretto255_hasher = {
  hashToCurve: (msg: Uint8Array) => new MockRistrettoPoint(msg.slice(0, 32)),
  hashToScalar: (msg: Uint8Array) => new MockScalar(msg.slice(0, 32)),
};

// Default export
export default {
  Scalar,
  RistrettoPoint,
  ed25519,
  x25519,
  ristretto255,
  ristretto255_hasher,
};
