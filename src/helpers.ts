import { CORE_TYPES } from './constants.js';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export function concatUint8Arrays(arrays: ArrayLike<number>[]) {
	let totalLength = 0;
	for (const array of arrays) {
		totalLength += array.length;
	}
	const result = new Uint8Array(totalLength);
	let offset = 0;
	for (const array of arrays) {
		result.set(array, offset);
		offset += array.length;
	}
	return result;
}

export function bytesToUtf8(bytes: Buffer | Uint8Array) {
	return textDecoder.decode(bytes);
}

export function utf8ToBytes(string: string) {
	const buff = new Uint8Array(string.length << 2);

	const length = textEncoder.encodeInto(string, buff).written;

	return buff.subarray(0, length);
}

export function serializeBytes(value: Buffer | Uint8Array | string | any) {
	let data: Uint8Array | number[];

	if (typeof value === 'string') {
		data = utf8ToBytes(value);
	} else if (value instanceof Buffer) {
		data = value as Uint8Array;
	} else if (value instanceof Uint8Array) {
		data = value;
	} else {
		throw Error(`Bytes or str expected, not ${value.constructor.name}`);
	}

	let length = data.length;
	let header: Uint8Array;

	if (length < 254) {
		header = new Uint8Array(1);
		header[0] = length;
	} else {
		header = new Uint8Array(4);
		header[0] = 254;
		header[1] = length % 256;
		header[2] = (length >> 8) % 256;
		header[3] = (length >> 16) % 256;
	}

	return concatUint8Arrays([header, data]);
}

export function serializeLength(value: number) {
	if (value < 254) {
		return Buffer.from([value]);
	}

	return Buffer.from([254, value % 256, (value >> 8) % 256, (value >> 16) % 256]);
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
			if (value >= 0 && value <= 255) {
				return CORE_TYPES.UInt8;
			} else if (value >= 0 && value <= 65535) {
				return CORE_TYPES.UInt16;
			} else if (value >= 0 && value <= 4294967295) {
				return CORE_TYPES.UInt32;
			} else if (value >= -128 && value <= 127) {
				return CORE_TYPES.Int8;
			} else if (value >= -32768 && value <= 32767) {
				return CORE_TYPES.Int16;
			} else if (value >= -2147483648 && value <= 2147483647) {
				return CORE_TYPES.Int32;
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
