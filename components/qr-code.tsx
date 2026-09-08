"use client";

import { useMemo } from "react";

// A small, dependency-free QR encoder for the short join URLs used by the app.
// Version 3-L holds the complete URL and keeps the code readable on a phone.
const SIZE = 29;
const DATA_CODEWORDS = 55;
const ECC_CODEWORDS = 15;

function multiply(a: number, b: number) {
  let result = 0;
  while (b) {
    if (b & 1) result ^= a;
    a <<= 1;
    if (a & 0x100) a ^= 0x11d;
    b >>>= 1;
  }
  return result;
}

function power(exponent: number) {
  let value = 1;
  for (let index = 0; index < exponent; index += 1) value = multiply(value, 2);
  return value;
}

function errorCorrection(data: number[]) {
  const generator = [1];
  for (let index = 0; index < ECC_CODEWORDS; index += 1) {
    const next = Array(generator.length + 1).fill(0) as number[];
    for (let coefficient = 0; coefficient < generator.length; coefficient += 1) {
      next[coefficient] ^= generator[coefficient];
      next[coefficient + 1] ^= multiply(generator[coefficient], power(index));
    }
    generator.splice(0, generator.length, ...next);
  }

  const remainder = Array(ECC_CODEWORDS).fill(0) as number[];
  for (const byte of data) {
    const factor = byte ^ remainder[0];
    remainder.shift();
    remainder.push(0);
    for (let index = 0; index < ECC_CODEWORDS; index += 1) {
      remainder[index] ^= multiply(generator[index + 1], factor);
    }
  }
  return remainder;
}

function bitsToBytes(bits: number[]) {
  const bytes: number[] = [];
  for (let index = 0; index < bits.length; index += 8) {
    let byte = 0;
    for (let bit = 0; bit < 8; bit += 1) byte = (byte << 1) | (bits[index + bit] ?? 0);
    bytes.push(byte);
  }
  return bytes;
}

function encode(text: string) {
  const bytes = Array.from(new TextEncoder().encode(text));
  // Version 3-L has 440 data bits; byte mode uses 12 bits for its header.
  if (bytes.length > 53) throw new Error("QR content is too long");
  const bits: number[] = [];
  const append = (value: number, length: number) => {
    for (let index = length - 1; index >= 0; index -= 1) bits.push((value >>> index) & 1);
  };
  append(0b0100, 4); // byte mode
  append(bytes.length, 8);
  bytes.forEach((byte) => append(byte, 8));
  append(0, Math.min(4, DATA_CODEWORDS * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = bitsToBytes(bits);
  const pads = [0xec, 0x11];
  for (let index = 0; data.length < DATA_CODEWORDS; index += 1) data.push(pads[index % 2]);
  return [...data, ...errorCorrection(data)];
}

function createMatrix(text: string) {
  const matrix = Array.from({ length: SIZE }, () => Array<boolean | null>(SIZE).fill(null));
  const set = (x: number, y: number, value: boolean) => {
    if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) matrix[y][x] = value;
  };

  const finder = (left: number, top: number) => {
    for (let y = -1; y <= 7; y += 1) {
      for (let x = -1; x <= 7; x += 1) {
        const value = x >= 0 && x <= 6 && y >= 0 && y <= 6 &&
          (x === 0 || x === 6 || y === 0 || y === 6 || (x >= 2 && x <= 4 && y >= 2 && y <= 4));
        set(left + x, top + y, value);
      }
    }
  };
  finder(0, 0);
  finder(SIZE - 7, 0);
  finder(0, SIZE - 7);

  for (let index = 8; index < SIZE - 8; index += 1) {
    set(index, 6, index % 2 === 0);
    set(6, index, index % 2 === 0);
  }

  // Version 3 has one alignment pattern at (22, 22).
  for (let y = -2; y <= 2; y += 1) {
    for (let x = -2; x <= 2; x += 1) set(22 + x, 22 + y, Math.max(Math.abs(x), Math.abs(y)) !== 1);
  }

  // Reserve both format-information copies before placing data.
  const formatCoordinates: Array<[number, number]> = [];
  for (let index = 0; index < 15; index += 1) {
    formatCoordinates.push(index < 6 ? [8, index] : index < 8 ? [8, index + 1] : [8, SIZE - 15 + index]);
    formatCoordinates.push(index < 8 ? [SIZE - index - 1, 8] : index < 9 ? [15 - index, 8] : [14 - index, 8]);
  }
  formatCoordinates.forEach(([x, y]) => set(x, y, false));
  set(8, SIZE - 8, true); // fixed dark module

  const codewords = encode(text);
  const dataBits = codewords.flatMap((byte) => Array.from({ length: 8 }, (_, index) => (byte >>> (7 - index)) & 1));
  let bitIndex = 0;
  let upward = true;
  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right -= 1;
    for (let offset = 0; offset < SIZE; offset += 1) {
      const y = upward ? SIZE - 1 - offset : offset;
      for (let side = 0; side < 2; side += 1) {
        const x = right - side;
        if (matrix[y][x] !== null) continue;
        let value = (dataBits[bitIndex] ?? 0) === 1;
        bitIndex += 1;
        if ((x + y) % 2 === 0) value = !value; // mask 0
        matrix[y][x] = value;
      }
    }
    upward = !upward;
  }

  const format = 0x77c4; // error correction L, mask 0
  formatCoordinates.forEach(([x, y], index) => set(x, y, ((format >>> index) & 1) === 1));
  return matrix;
}

export function QrCode({ value, label = "Tournament join QR code" }: { value: string; label?: string }) {
  const matrix = useMemo(() => createMatrix(value), [value]);
  const modules = matrix.flatMap((row, y) => row.map((dark, x) => dark ? (
    <rect key={`${x}-${y}`} x={x + 4} y={y + 4} width="1" height="1" />
  ) : null));
  return (
    <svg className="qr-code" viewBox="0 0 37 37" role="img" aria-label={label} shapeRendering="crispEdges">
      <rect width="37" height="37" fill="white" />
      <g fill="black">{modules}</g>
    </svg>
  );
}
