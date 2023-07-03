import pako from 'pako';
import { CORE_TYPES } from './constants.js';
import { Dictionary } from './dictionary.js';
import { TLExtension } from './extension.js';
import { coreType, float32, float64, int32 } from './helpers.js';

const hasNodeBuffer = typeof Buffer !== 'undefined';

const MAX_BUFFER_SIZE = hasNodeBuffer ? 0x100000000 : 0x7fd00000;

const textEncoder = new TextEncoder();

const writeUtf8 = hasNodeBuffer
	? function (target: any, value: string, offset: number) {
			const length = target.utf8Write(value, offset, 0xffffffff) as number;

			return length;
	  }
	: function (target: any, value: string, offset: number) {
			return textEncoder.encodeInto(value, target.subarray(offset)).written;
	  };

function byteArrayAllocate(length: number) {
	if (hasNodeBuffer) {
		return Buffer.allocUnsafeSlow(length);
	}

	return new Uint8Array(length);
}

export interface BinaryWriterOptions {
	gzip?: boolean;
	dictionary?: string[] | Dictionary;
	extensions?: TLExtension[];
}

const NO_CONSTRUCTOR = new Set([CORE_TYPES.BoolFalse, CORE_TYPES.BoolTrue, CORE_TYPES.Null]);

const SUPPORT_COMPRESSION = new Set([CORE_TYPES.String]);

export class BinaryWriter {
	private withGzip: boolean;
	private target: Buffer | Uint8Array;
	private dictionary?: Dictionary;
	private dictionaryExtended: Dictionary;
	private extensions: Map<number, TLExtension>;
	offset: number;

	constructor(options?: BinaryWriterOptions) {
		this.offset = 0;
		this.extensions = new Map();
		this.withGzip = !!options && !!options.gzip;

		this.target = byteArrayAllocate(8192);

		if (options && options.extensions) {
			options.extensions.forEach((ext) => {
				this.extensions.set(ext.token, ext);
			});
		}

		if (!options) {
			this.dictionary = new Dictionary();
		} else if (options.dictionary instanceof Dictionary) {
			this.dictionary = options.dictionary;
		} else if (Array.isArray(options.dictionary)) {
			this.dictionary = new Dictionary(options.dictionary);
		} else {
			this.dictionary = new Dictionary();
		}

		this.dictionaryExtended = new Dictionary(undefined, this.dictionary.size);
	}

	allocate(size: number) {
		const position = this.offset + size;

		if (this.safeEnd < position) {
			this.makeRoom(position);
		}
	}

	private makeRoom(end: number) {
		let start = 0;
		let newSize = 0;
		let target = this.target;

		if (end > 0x1000000) {
			// special handling for really large buffers
			if (end - start > MAX_BUFFER_SIZE)
				throw new Error('Packed buffer would be larger than maximum buffer size');
			newSize = Math.min(
				MAX_BUFFER_SIZE,
				Math.round(Math.max((end - start) * (end > 0x4000000 ? 1.25 : 2), 0x400000) / 0x1000) *
					0x1000,
			);
		} else {
			// faster handling for smaller buffers
			newSize = ((Math.max((end - start) << 2, target.length - 1) >> 12) + 1) << 12;
		}

		const newBuffer = byteArrayAllocate(newSize);
		const newView = new DataView(newBuffer.buffer, 0, newSize);

		end = Math.min(end, target.length);

		if ('copy' in target) {
			target.copy(newBuffer, 0, start, end);
		} else {
			newBuffer.set(target.slice(start, end));
		}

		this.target = newBuffer;
	}

	get safeEnd() {
		return this.target.length - 10;
	}

	getBuffer() {
		return this.target.subarray(0, this.offset);
	}

	writeByte(value: number) {
		this.allocate(1);
		this.target[this.offset++] = value;
	}

	writeBool(value: boolean) {
		if (value) {
			this.writeByte(CORE_TYPES.BoolTrue);
		} else {
			this.writeByte(CORE_TYPES.BoolFalse);
		}
	}

	writeNull() {
		this.writeByte(CORE_TYPES.Null);
	}

	writeInt32(value: number, signed = true) {
		this.allocate(4);

		if (signed) {
			this.target[this.offset++] = value;
			this.target[this.offset++] = value >> 8;
			this.target[this.offset++] = value >> 16;
			this.target[this.offset++] = value >> 24;
		} else {
			this.target[this.offset++] = value;
			this.target[this.offset++] = value >> 8;
			this.target[this.offset++] = value >> 16;
			this.target[this.offset++] = value >> 24;
		}
	}

	writeInt16(value: number, signed = true) {
		this.allocate(2);

		if (signed) {
			this.target[this.offset++] = value;
			this.target[this.offset++] = value >> 8;
		} else {
			this.target[this.offset++] = value;
			this.target[this.offset++] = value >> 8;
		}
	}

	writeInt8(value: number, signed = true) {
		this.allocate(1);

		this.target[this.offset++] = value;
	}

	writeFloat(value: number) {
		this.allocate(4);
		float32[0] = value;
		this.writeInt32(int32[0]);
	}

	writeDouble(value: number) {
		this.allocate(8);

		float64[0] = value;
		this.writeInt32(int32[0], false);
		this.writeInt32(int32[1], false);
	}

	writeDate(value: number | Date) {
		let timestamp = 0;

		if (value instanceof Date) {
			timestamp = Math.floor(value.getTime() / 1000);
		} else if (typeof value === 'number') {
			timestamp = value;
		}

		this.writeDouble(timestamp);
	}

	writeString(value: string) {
		// const compressed = pako.deflateRaw(value, { level: 9 });
		// this.writeBytes(compressed);

		let start = this.offset;
		let require = value.length << 2;

		if (require < 254) {
			require += 1;
			this.offset += 1;
		} else {
			require += 4;
			this.offset += 4;
		}

		this.allocate(require);
		const bytes = writeUtf8(this.target, value, this.offset);

		if (require < 254) {
			this.target[start++] = bytes;
		} else {
			this.target[start++] = 254;
			this.target[start++] = bytes % 256;
			this.target[start++] = (bytes >> 8) % 256;
			this.target[start++] = (bytes >> 16) % 256;
		}

		this.offset += bytes;
	}

	writeBytes(value: Buffer | Uint8Array) {
		const length = value.length;

		this.writeLength(length);
		this.allocate(length);
		this.target.set(value, this.offset);

		this.offset += length;
	}

	writeLength(value: number) {
		if (value < 254) {
			this.allocate(1);
			this.target[this.offset++] = value;
		} else {
			this.allocate(4);
			this.target[this.offset++] = 254;
			this.target[this.offset++] = value % 256;
			this.target[this.offset++] = (value >> 8) % 256;
			this.target[this.offset++] = (value >> 16) % 256;
		}
	}

	writeVector(value: Array<any>) {
		const length = value.length;
		this.writeLength(length);

		for (let i = 0; i < length; i++) {
			if (value[i] === undefined) {
				this.writeNull();
			} else {
				this.writeObject(value[i]);
			}
		}
	}

	writeMap(object: Record<string, any>) {
		for (const key in object) {
			if (object[key] === undefined) continue;

			this.wireDictionary(key);
			this.writeObject(object[key]);
		}

		this.writeByte(CORE_TYPES.None);
	}

	wireDictionary(value: string) {
		let idx;

		if (this.dictionary) {
			idx = this.dictionary.getIndex(value);
		}

		if (idx === undefined) {
			idx = this.dictionaryExtended.getIndex(value);
		}

		if (idx === undefined) {
			this.dictionaryExtended.maybeInsert(value);
			this.writeCore(CORE_TYPES.DictValue, value);
		} else {
			this.writeCore(CORE_TYPES.DictIndex, idx);
		}
	}

	writeGzip(value: any) {
		const compressed = pako.deflateRaw(value, { level: 9 });
		this.writeBytes(compressed);
	}

	encode(value: any) {
		this.offset = 0;
		this.target = byteArrayAllocate(256);

		this.writeObject(value);

		return this.getBuffer();
	}

	startDynamicVector() {
		this.writeByte(CORE_TYPES.VectorDynamic);
	}

	endDynamicVector() {
		this.writeByte(CORE_TYPES.None);
	}

	private _writeCustom(value: any) {
		for (const ext of this.extensions.values()) {
			const result = ext.encode(value);

			if (result !== undefined) {
				const constructorId = coreType(result);

				if (constructorId === CORE_TYPES.None) {
					throw new TypeError(`Invalid encode extension = ${ext.token} type of ${value}`);
				}

				if (ext.token !== -1) {
					this.writeByte(ext.token);
				}

				this.writeCore(constructorId, result);

				return true;
			}
		}

		return false;
	}

	writeObject(value: any) {
		if (value === undefined) return;

		const constructorId = coreType(value);

		// console.log('write', {
		// 	offset: this.offset,
		// 	constructorId: CORE_TYPES[constructorId],
		// 	value: String(value),
		// });

		if (constructorId === CORE_TYPES.None) {
			if (this._writeCustom(value)) {
				return;
			}

			throw new TypeError(`Invalid core type of ${value}`);
		}

		this.writeCore(constructorId, value);
	}

	writeObjectGzip(value: any) {
		const writer = new BinaryWriter();

		writer.extensions = this.extensions;
		writer.dictionary = this.dictionary;
		writer.dictionaryExtended = this.dictionaryExtended;

		writer.writeObject(value);
		this.writeCore(CORE_TYPES.GZIP, writer.getBuffer());
	}

	private writeCore(constructorId: CORE_TYPES, value: any) {
		if (this.withGzip && SUPPORT_COMPRESSION.has(constructorId)) {
			this.writeObjectGzip(value);
			return;
		} else if (!NO_CONSTRUCTOR.has(constructorId)) {
			this.writeByte(constructorId);
		}

		switch (constructorId) {
			case CORE_TYPES.GZIP: {
				return this.writeGzip(value);
			}

			case CORE_TYPES.DictIndex: {
				return this.writeLength(value);
			}

			case CORE_TYPES.DictValue: {
				return this.writeString(value);
			}

			case CORE_TYPES.BoolFalse: {
				return this.writeBool(value);
			}

			case CORE_TYPES.BoolTrue: {
				return this.writeBool(value);
			}

			case CORE_TYPES.Date: {
				return this.writeDate(value);
			}

			case CORE_TYPES.Int32: {
				return this.writeInt32(value);
			}

			case CORE_TYPES.Int16: {
				return this.writeInt16(value);
			}

			case CORE_TYPES.Int8: {
				return this.writeInt8(value);
			}

			case CORE_TYPES.UInt32: {
				return this.writeInt32(value, false);
			}

			case CORE_TYPES.UInt16: {
				return this.writeInt16(value, false);
			}

			case CORE_TYPES.UInt8: {
				return this.writeInt8(value, false);
			}

			case CORE_TYPES.Double: {
				return this.writeDouble(value);
			}

			case CORE_TYPES.Float: {
				return this.writeFloat(value);
			}

			case CORE_TYPES.Null: {
				return this.writeNull();
			}

			case CORE_TYPES.String: {
				return this.writeString(value);
			}

			case CORE_TYPES.Vector: {
				return this.writeVector(value);
			}

			case CORE_TYPES.Map: {
				return this.writeMap(value);
			}
		}
	}
}
