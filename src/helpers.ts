import { CORE_TYPES } from './constants.js';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const int32 = new Int32Array(2);
export const float32 = new Float32Array(int32.buffer);
export const float64 = new Float64Array(int32.buffer);

export function bytesToUtf8(bytes: Buffer | Uint8Array) {
	return textDecoder.decode(bytes);
}

export function utf8ToBytes(string: string) {
	const buff = new Uint8Array(string.length << 2);

	const length = textEncoder.encodeInto(string, buff).written;

	return buff.subarray(0, length);
}

export function coreType(value: any): CORE_TYPES {
	switch (typeof value) {
		case 'string': {
			return CORE_TYPES.String;
		}

		case 'boolean': {
			return value ? CORE_TYPES.BoolTrue : CORE_TYPES.BoolFalse;
		}

		case 'number': {
			if (value >> 0 === value) {
				if (value >= 0 && value <= 0xff) {
					return CORE_TYPES.UInt8;
				} else if (value >= 0 && value <= 0xffff) {
					return CORE_TYPES.UInt16;
				} else if (value >= 0 && value <= 0xffffffff) {
					return CORE_TYPES.UInt32;
				} else if (value >= -0x80 && value <= 0x7f) {
					return CORE_TYPES.Int8;
				} else if (value >= -0x8000 && value <= 0x7fff) {
					return CORE_TYPES.Int16;
				} else if (value >= -0x80000000 && value <= 0x7fffffff) {
					return CORE_TYPES.Int32;
				}
			}

			return CORE_TYPES.Double;
		}

		case 'object': {
			if (value === null) return CORE_TYPES.Null;

			if (value instanceof Date) {
				return CORE_TYPES.Date;
			}

			if (Array.isArray(value)) {
				return CORE_TYPES.Vector;
			}

			if (isPlainObject(value)) {
				return CORE_TYPES.Map;
			}
		}
	}

	return CORE_TYPES.None;
}

/** @ts-ignore */
const isObject = (val: any): val is object => toString.call(val) === '[object Object]';

function isPlainObject(value: any): value is object {
	let ctor, prot;

	if (!isObject(value)) return false;

	// If it has modified constructor
	ctor = value.constructor;
	if (ctor === undefined) return true;

	// If it has modified prototype
	prot = ctor.prototype;
	if (isObject(prot) === false) return false;

	// If constructor does not have an Object-specific method
	// eslint-disable-next-line no-prototype-builtins
	if (prot.hasOwnProperty('isPrototypeOf') === false) {
		return false;
	}

	// Most likely a plain Object
	return true;
}
