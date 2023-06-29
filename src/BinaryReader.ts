import { CORE_TYPES } from './constants.js';
import { bytesToUtf8 } from './helpers.js';

export class BinaryReader {
	private target: Buffer | Uint8Array;
	private targetView: DataView;
	private _last?: any;
	private _dict: Map<number, string>;
	offset: number;
	length: number;

	/**
	 * Small utility class to read binary data.
	 * @param data {Buffer}
	 */
	constructor(data: Buffer | Uint8Array) {
		this.target = data;
		this.targetView = new DataView(data.buffer, 0, data.length);
		this._last = undefined;
		this._dict = new Map();
		this.offset = 0;
		this.length = data.length;
	}

	readByte() {
		this.assertRead(1);
		this._last = this.target[this.offset++];

		return this._last as number;
	}

	readInt32(signed = true) {
		this.assertRead(4);

		if (signed) {
			this._last = this.targetView.getInt32(this.offset, true);
		} else {
			this._last = this.targetView.getUint32(this.offset, true);
		}

		this.offset += 4;
		return this._last as number;
	}

	readInt16(signed = true) {
		this.assertRead(2);

		if (signed) {
			this._last = this.targetView.getInt16(this.offset, true);
		} else {
			this._last = this.targetView.getUint16(this.offset);
		}
		this.offset += 2;
		return this._last as number;
	}

	readInt8(signed = true) {
		this.assertRead(1);

		if (signed) {
			this._last = this.targetView.getInt8(this.offset);
		} else {
			this._last = this.targetView.getInt8(this.offset);
		}
		this.offset += 1;
		return this._last as number;
	}

	/**
	 * Reads a real floating point (4 bytes) value.
	 * @returns {number}
	 */
	readFloat() {
		this.assertRead(4);
		this._last = this.targetView.getFloat32(this.offset, true);
		this.offset += 4;

		return this._last as number;
	}

	/**
	 * Reads a real floating point (8 bytes) value.
	 * @returns {BigInteger}
	 */
	readDouble() {
		this.assertRead(8);
		this._last = this.targetView.getFloat64(this.offset, true);
		this.offset += 8;

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

	/**
	 * @returns {Uint8Array | Buffer}
	 */
	readBytes() {
		const length = this.readLength();

		this.assertRead(length);

		const bytes = this.target.subarray(this.offset, this.offset + length);

		this.offset += bytes.length;

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

		return bytesToUtf8(bytes);
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
		return new Date(value * 1000);
	}

	/**
	 * Reads a object.
	 */
	readObject(): any {
		const constructorId = this.readByte();

		switch (constructorId) {
			case CORE_TYPES.None:
				return this.readObject();
			case CORE_TYPES.BoolTrue:
				return true;
			case CORE_TYPES.BoolFalse:
				return false;
			case CORE_TYPES.Vector:
				return this.readVector(false);
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
		}

		throw new Error(
			`Invalid constructor = ${CORE_TYPES[constructorId] || constructorId}, offset = ${
				this.offset - 1
			}`,
		);
	}

	readDictionary() {
		const constructorId = this.readByte();

		switch (constructorId) {
			case CORE_TYPES.DictIndex: {
				const idx = this.readLength();
				return this._dict.get(idx)!;
			}
			case CORE_TYPES.DictValue: {
				const key = this.readString();
				this._dict.set(this._dict.size + 1, key);

				return key;
			}
			case CORE_TYPES.None: {
				return null;
			}
		}

		this.seek(-1);

		return null;
	}

	readMap(checkConstructor = true) {
		if (checkConstructor && this.readByte() !== CORE_TYPES.Map) {
			throw new Error('Invalid constructor code, map was expected');
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
		this.targetView = new DataView(value.buffer, 0, value.length);
		this._last = undefined;
		this.offset = 0;
		this.length = value.length;

		return this.readObject();
	}

	/**
	 * Reads a vector (a list) of objects.
	 * @returns {any[]}
	 */
	readVector(checkConstructor = true) {
		if (checkConstructor && this.readByte() !== CORE_TYPES.Vector) {
			throw new Error('Invalid constructor code, vector was expected');
		}
		const count = this.readLength();
		const temp = [];

		for (let i = 0; i < count; i++) {
			temp.push(this.readObject());
		}
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
