import pako from 'pako';
import { CORE_TYPES } from './constants.js';
import { Dictionary } from './dictionary.js';
import { TLExtension } from './extension.js';
import { bytesToUtf8, float32, float64, int32 } from './helpers.js';

export interface BinaryReaderOptions {
	dictionary?: string[] | Dictionary;
	extensions?: TLExtension[];
}

export class BinaryReader {
	private target: Buffer | Uint8Array;
	private _last?: any;
	private _lastObject?: any;
	private dictionary?: Dictionary;
	private dictionaryExtended: Dictionary;
	private extensions: Map<number, TLExtension>;
	private _repeat?: { pool: number; value: any };
	offset: number;
	length: number;

	/**
	 * Small utility class to read binary data.
	 * @param data {Buffer}
	 */
	constructor(data: Buffer | Uint8Array, options?: BinaryReaderOptions) {
		this.target = data;
		this.offset = 0;
		this.length = data.length;
		this.extensions = new Map();

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

	readByte() {
		this.assertRead(1);
		this._last = this.target[this.offset++];

		return this._last as number;
	}

	readInt32(signed = true) {
		this.assertRead(4);

		this._last =
			this.target[this.offset++] |
			(this.target[this.offset++] << 8) |
			(this.target[this.offset++] << 16) |
			(this.target[this.offset++] << 24);

		if (!signed) {
			this._last = this._last >>> 0;
		}

		return this._last as number;
	}

	readInt16(signed = true) {
		this.assertRead(2);

		this._last = this.target[this.offset++] | (this.target[this.offset++] << 8);

		if (signed) {
			this._last = (this._last << 16) >> 16;
		}

		return this._last as number;
	}

	readInt8(signed = true) {
		this.assertRead(1);

		this._last = this.target[this.offset++];

		if (signed) {
			this._last = (this._last << 24) >> 24;
		}

		return this._last as number;
	}

	/**
	 * Reads a real floating point (4 bytes) value.
	 * @returns {number}
	 */
	readFloat() {
		this.assertRead(4);

		int32[0] = this.readInt32();
		this._last = float32[0];

		return this._last as number;
	}

	/**
	 * Reads a real floating point (8 bytes) value.
	 * @returns {BigInteger}
	 */
	readDouble() {
		this.assertRead(8);

		int32[0] = this.readInt32();
		int32[1] = this.readInt32();
		this._last = float64[0];

		return this._last as number;
	}

	/**
	 * Read the given amount of bytes, or -1 to read all remaining.
	 * @param length {number}
	 */
	assertRead(length: number) {
		if (this.length < this.offset + +length) {
			const left = this.target.length - this.offset;
			const result = this.target.subarray(this.offset, this.offset + left);

			const err = new Error(
				`No more data left to read (need ${length}, got ${left}: ${result}); last read ${this._last}`,
			);

			(err as any).incomplete = true;

			Error.captureStackTrace(err, this.assertRead);

			throw err;
		}
	}

	assertConstructor(constructorId: CORE_TYPES) {
		const byte = this.readByte();

		if (byte !== constructorId) {
			throw new Error(
				`Invalid constructor code, expected = ${CORE_TYPES[constructorId]}, got = ${
					CORE_TYPES[byte] || byte
				}, offset = ${this.offset - 1}`,
			);
		}
	}

	/**
	 * Gets the byte array representing the current buffer as a whole.
	 * @returns {Buffer}
	 */
	getBuffer() {
		return this.target;
	}

	readNull() {
		const value = this.readByte();

		if (value === CORE_TYPES.Null) {
			return null;
		}

		throw new Error(`Invalid boolean code ${value.toString(16)}`);
	}

	readLength() {
		const firstByte = this.readByte();

		if (firstByte === 254) {
			return this.readByte() | (this.readByte() << 8) | (this.readByte() << 16);
		}

		return firstByte;
	}

	readAll() {
		const result: any[] = [];

		while (this.length > this.offset) {
			result.push(this.readObject());
		}

		return result;
	}

	/**
	 * @returns {Uint8Array | Buffer}
	 */
	readBytes() {
		const length = this.readLength();

		this.assertRead(length);

		const bytes = this.target.subarray(this.offset, this.offset + length);

		this.offset += bytes.length;

		this._last = bytes;

		return bytes;
	}

	/**
	 * Reads encoded string.
	 * @returns {string}
	 */
	readString() {
		const length = this.readLength();

		this.assertRead(length);

		const bytes = this.target.subarray(this.offset, this.offset + length);

		this.offset += bytes.length;

		// return pako.inflateRaw(bytes, { to: 'string' });

		const result = bytesToUtf8(bytes);

		this._last = result;

		return result;
	}

	/**
	 * Reads a boolean value.
	 * @returns {boolean}
	 */
	readBool() {
		const value = this.readByte();

		if (value === CORE_TYPES.BoolTrue) {
			return true;
		} else if (value === CORE_TYPES.BoolFalse) {
			return false;
		} else {
			throw new Error(`Invalid boolean code ${value.toString(16)}`);
		}
	}

	/**
	 * Reads and converts Unix time
	 * into a Javascript {Date} object.
	 * @returns {Date}
	 */
	readDate() {
		const value = this.readDouble();

		return new Date(value);
	}

	/**
	 * Reads a object.
	 */
	readObject(): any {
		if (this._repeat) {
			if (this._repeat.pool > 0) {
				--this._repeat.pool;
				return this._repeat.value;
			} else {
				this._repeat = undefined;
			}
		}

		const constructorId = this.readByte();
		const ext = this.extensions.get(constructorId);

		let value: any;

		if (ext) {
			value = ext.decode.call(this);
		} else {
			value = this._lastObject = this.readCore(constructorId);
		}

		return value;
	}

	readObjectGzip() {
		const bytes = this.readGzip();
		const reader = new BinaryReader(bytes);

		reader.extensions = this.extensions;
		reader.dictionary = this.dictionary;
		reader.dictionaryExtended = this.dictionaryExtended;

		return reader.readObject();
	}

	readGzip() {
		return pako.inflateRaw(this.readBytes());
	}

	private readCore(constructorId: CORE_TYPES) {
		switch (constructorId) {
			case CORE_TYPES.None:
				return this.readObject();
			case CORE_TYPES.GZIP:
				return this.readObjectGzip();
			case CORE_TYPES.BoolTrue:
				return true;
			case CORE_TYPES.BoolFalse:
				return false;
			case CORE_TYPES.Vector:
				return this.readVector(false);
			case CORE_TYPES.VectorDynamic:
				return this.readVectorDynamic(false);
			case CORE_TYPES.Null:
				return null;
			case CORE_TYPES.Binary:
				return this.readBytes();
			case CORE_TYPES.String:
				return this.readString();
			case CORE_TYPES.Date:
				return this.readDate();
			case CORE_TYPES.Int32:
				return this.readInt32();
			case CORE_TYPES.Int16:
				return this.readInt16();
			case CORE_TYPES.Int8:
				return this.readInt8();
			case CORE_TYPES.UInt32:
				return this.readInt32(false);
			case CORE_TYPES.UInt16:
				return this.readInt16(false);
			case CORE_TYPES.UInt8:
				return this.readInt8(false);
			case CORE_TYPES.Float:
				return this.readFloat();
			case CORE_TYPES.Double:
				return this.readDouble();
			case CORE_TYPES.Map:
				return this.readMap(false);
			case CORE_TYPES.Repeat: {
				const size = this.readLength();
				this._repeat = { pool: size - 1, value: this._lastObject };
				return this._lastObject;
			}
		}

		throw new Error(
			`Invalid constructor = ${CORE_TYPES[constructorId] || constructorId}, offset = ${
				this.offset - 1
			}`,
		);
	}

	getDictionaryValue(index: number) {
		let value;

		if (this.dictionary) {
			value = this.dictionary.getValue(index);
		}

		if (value === undefined) {
			value = this.dictionaryExtended.getValue(index);
		}

		return value;
	}

	readDictionary() {
		const constructorId = this.readByte();

		let key = null;

		switch (constructorId) {
			case CORE_TYPES.DictIndex: {
				const idx = this.readLength();
				key = this.getDictionaryValue(idx)!;
				break;
			}
			case CORE_TYPES.DictValue: {
				key = this.readString();
				this.dictionaryExtended.maybeInsert(key);
				break;
			}
			case CORE_TYPES.None: {
				key = null;
				break;
			}
			default: {
				this.seek(-1);
			}
		}

		return key;
	}

	readMap(checkConstructor = true) {
		if (checkConstructor) {
			this.assertConstructor(CORE_TYPES.Map);
		}

		const temp: Record<string, any> = {};

		let key = this.readDictionary();

		while (key !== null) {
			temp[key] = this.readObject();
			key = this.readDictionary();
		}

		return temp;
	}

	decode(value: Buffer | Uint8Array) {
		this.target = value;
		this._last = undefined;
		this._lastObject = undefined;
		this._repeat = undefined;
		this.offset = 0;
		this.length = value.length;

		return this.readObject();
	}

	/**
	 * Reads a vector (a list) of objects.
	 * @returns {any[]}
	 */
	readVector(checkConstructor = true) {
		if (checkConstructor) {
			this.assertConstructor(CORE_TYPES.Vector);
		}

		const count = this.readLength();
		const temp = [];

		for (let i = 0; i < count; i++) {
			temp.push(this.readObject());
		}

		return temp;
	}

	/**
	 * Reads a vector (a list) of objects.
	 * @returns {any[]}
	 */
	readVectorDynamic(checkConstructor = true) {
		if (checkConstructor) {
			this.assertConstructor(CORE_TYPES.VectorDynamic);
		}

		const temp = [];

		let complete = false;

		while (this.length > this.offset) {
			const constructorId = this.readByte();

			if (constructorId === CORE_TYPES.None) {
				complete = true;
				break;
			}

			const ext = this.extensions.get(constructorId);

			let value: any;

			if (ext) {
				value = ext.decode.call(this);
			} else {
				value = this.readCore(constructorId);
			}

			temp.push(value);
		}

		if (!complete) {
			const err = new Error(`DynamicVector incomplete.`);
			(err as any).incomplete = true;
			Error.captureStackTrace(err, this.readDictionary);

			throw err;
		}

		this._last = temp;

		return temp;
	}

	/**
	 * Tells the current position on the stream.
	 * @returns {number}
	 */
	tellPosition() {
		return this.offset;
	}

	/**
	 * Sets the current position on the stream.
	 * @param position
	 */
	setPosition(position: number) {
		this.offset = position;
	}

	/**
	 * Seeks the stream position given an offset from the current position.
	 * The offset may be negative.
	 * @param offset
	 */
	seek(offset: number) {
		this.offset += offset;
	}
}
