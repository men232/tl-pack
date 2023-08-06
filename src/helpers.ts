import { CORE_TYPES, HAS_NODE_BUFFER } from './constants.js';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const fromCharCode = String.fromCharCode;

export const int32 = new Int32Array(2);
export const float32 = new Float32Array(int32.buffer);
export const float64 = new Float64Array(int32.buffer);

export function byteArrayAllocate(length: number) {
	if (HAS_NODE_BUFFER) {
		return Buffer.allocUnsafeSlow(length);
	}

	return new Uint8Array(length);
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

export function utf8Read(target: Buffer | Uint8Array, length: number, offset: number) {
	let result;
	if (length < 16) {
		if ((result = utf8ReadShort(target, length, offset))) return result;
	}
	if (length > 64 && decoder) return decoder.decode(target.subarray(offset, (offset += length)));
	const end = offset + length;
	const units = [];
	result = '';
	while (offset < end) {
		const byte1 = target[offset++];
		if ((byte1 & 0x80) === 0) {
			// 1 byte
			units.push(byte1);
		} else if ((byte1 & 0xe0) === 0xc0) {
			// 2 bytes
			const byte2 = target[offset++] & 0x3f;
			units.push(((byte1 & 0x1f) << 6) | byte2);
		} else if ((byte1 & 0xf0) === 0xe0) {
			// 3 bytes
			const byte2 = target[offset++] & 0x3f;
			const byte3 = target[offset++] & 0x3f;
			units.push(((byte1 & 0x1f) << 12) | (byte2 << 6) | byte3);
		} else if ((byte1 & 0xf8) === 0xf0) {
			// 4 bytes
			const byte2 = target[offset++] & 0x3f;
			const byte3 = target[offset++] & 0x3f;
			const byte4 = target[offset++] & 0x3f;
			let unit = ((byte1 & 0x07) << 0x12) | (byte2 << 0x0c) | (byte3 << 0x06) | byte4;
			if (unit > 0xffff) {
				unit -= 0x10000;
				units.push(((unit >>> 10) & 0x3ff) | 0xd800);
				unit = 0xdc00 | (unit & 0x3ff);
			}
			units.push(unit);
		} else {
			units.push(byte1);
		}

		if (units.length >= 0x1000) {
			result += fromCharCode.apply(String, units);
			units.length = 0;
		}
	}

	if (units.length > 0) {
		result += fromCharCode.apply(String, units);
	}

	return result;
}

export function utf8ReadShort(target: Buffer | Uint8Array, length: number, offset: number) {
	if (length < 4) {
		if (length < 2) {
			if (length === 0) return '';
			else {
				let a = target[offset++];
				if ((a & 0x80) > 1) {
					offset -= 1;
					return;
				}
				return fromCharCode(a);
			}
		} else {
			let a = target[offset++];
			let b = target[offset++];
			if ((a & 0x80) > 0 || (b & 0x80) > 0) {
				offset -= 2;
				return;
			}
			if (length < 3) return fromCharCode(a, b);
			let c = target[offset++];
			if ((c & 0x80) > 0) {
				offset -= 3;
				return;
			}
			return fromCharCode(a, b, c);
		}
	} else {
		let a = target[offset++];
		let b = target[offset++];
		let c = target[offset++];
		let d = target[offset++];
		if ((a & 0x80) > 0 || (b & 0x80) > 0 || (c & 0x80) > 0 || (d & 0x80) > 0) {
			offset -= 4;
			return;
		}
		if (length < 6) {
			if (length === 4) return fromCharCode(a, b, c, d);
			else {
				let e = target[offset++];
				if ((e & 0x80) > 0) {
					offset -= 5;
					return;
				}
				return fromCharCode(a, b, c, d, e);
			}
		} else if (length < 8) {
			let e = target[offset++];
			let f = target[offset++];
			if ((e & 0x80) > 0 || (f & 0x80) > 0) {
				offset -= 6;
				return;
			}
			if (length < 7) return fromCharCode(a, b, c, d, e, f);
			let g = target[offset++];
			if ((g & 0x80) > 0) {
				offset -= 7;
				return;
			}
			return fromCharCode(a, b, c, d, e, f, g);
		} else {
			let e = target[offset++];
			let f = target[offset++];
			let g = target[offset++];
			let h = target[offset++];
			if ((e & 0x80) > 0 || (f & 0x80) > 0 || (g & 0x80) > 0 || (h & 0x80) > 0) {
				offset -= 8;
				return;
			}
			if (length < 10) {
				if (length === 8) return fromCharCode(a, b, c, d, e, f, g, h);
				else {
					let i = target[offset++];
					if ((i & 0x80) > 0) {
						offset -= 9;
						return;
					}
					return fromCharCode(a, b, c, d, e, f, g, h, i);
				}
			} else if (length < 12) {
				let i = target[offset++];
				let j = target[offset++];
				if ((i & 0x80) > 0 || (j & 0x80) > 0) {
					offset -= 10;
					return;
				}
				if (length < 11) return fromCharCode(a, b, c, d, e, f, g, h, i, j);
				let k = target[offset++];
				if ((k & 0x80) > 0) {
					offset -= 11;
					return;
				}
				return fromCharCode(a, b, c, d, e, f, g, h, i, j, k);
			} else {
				let i = target[offset++];
				let j = target[offset++];
				let k = target[offset++];
				let l = target[offset++];
				if ((i & 0x80) > 0 || (j & 0x80) > 0 || (k & 0x80) > 0 || (l & 0x80) > 0) {
					offset -= 12;
					return;
				}
				if (length < 14) {
					if (length === 12) return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l);
					else {
						let m = target[offset++];
						if ((m & 0x80) > 0) {
							offset -= 13;
							return;
						}
						return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l, m);
					}
				} else {
					let m = target[offset++];
					let n = target[offset++];
					if ((m & 0x80) > 0 || (n & 0x80) > 0) {
						offset -= 14;
						return;
					}
					if (length < 15) return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l, m, n);
					let o = target[offset++];
					if ((o & 0x80) > 0) {
						offset -= 15;
						return;
					}
					return fromCharCode(a, b, c, d, e, f, g, h, i, j, k, l, m, n, o);
				}
			}
		}
	}
}

export const utf8Write = HAS_NODE_BUFFER
	? function (target: any, value: string, offset: number) {
			return value.length < 0x40
				? utf8WriteShort(target, value, offset)
				: (target.utf8Write(value, offset, 0xffffffff) as number);
	  }
	: function (target: any, value: string, offset: number) {
			return value.length < 0x40
				? utf8WriteShort(target, value, offset)
				: encoder.encodeInto(value, target.subarray(offset)).written;
	  };

export const utf8WriteShort = (target: any, value: string, offset: number) => {
	let i,
		c1,
		c2,
		strPosition = offset;

	const strLength = value.length;

	for (i = 0; i < strLength; i++) {
		c1 = value.charCodeAt(i);
		if (c1 < 0x80) {
			target[strPosition++] = c1;
		} else if (c1 < 0x800) {
			target[strPosition++] = (c1 >> 6) | 0xc0;
			target[strPosition++] = (c1 & 0x3f) | 0x80;
		} else if ((c1 & 0xfc00) === 0xd800 && ((c2 = value.charCodeAt(i + 1)) & 0xfc00) === 0xdc00) {
			c1 = 0x10000 + ((c1 & 0x03ff) << 10) + (c2 & 0x03ff);
			i++;
			target[strPosition++] = (c1 >> 18) | 0xf0;
			target[strPosition++] = ((c1 >> 12) & 0x3f) | 0x80;
			target[strPosition++] = ((c1 >> 6) & 0x3f) | 0x80;
			target[strPosition++] = (c1 & 0x3f) | 0x80;
		} else {
			target[strPosition++] = (c1 >> 12) | 0xe0;
			target[strPosition++] = ((c1 >> 6) & 0x3f) | 0x80;
			target[strPosition++] = (c1 & 0x3f) | 0x80;
		}
	}

	return strPosition - offset;
};

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
