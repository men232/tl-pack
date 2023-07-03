import { Transform, type TransformCallback, type TransformOptions } from 'stream';
import { BinaryWriter, BinaryWriterOptions } from './BinaryWriter.js';
import { BinaryReader } from './BinaryReader.js';
import { CORE_TYPES } from './constants.js';

export interface TLEncodeOptions extends BinaryWriterOptions {
	streamOptions?: TransformOptions;
}

export class TLEncode extends Transform {
	writer: BinaryWriter;
	count: number;

	constructor(options?: TLEncodeOptions) {
		const opts = options || {};
		opts.streamOptions = { writableObjectMode: true, ...(opts.streamOptions || {}) };

		super(opts.streamOptions);

		const writer = new BinaryWriter(options);

		const customFlush = opts.streamOptions.flush;

		const VECTOR_TYPES = new Uint8Array(2);

		VECTOR_TYPES[0] = CORE_TYPES.VectorDynamic;
		VECTOR_TYPES[1] = CORE_TYPES.None;

		// push a byte about dynamic vector starting
		this.push(VECTOR_TYPES.subarray(0, 1));

		this._flush = (callback) => {
			// push a byte about dynamic vector ending
			this.push(VECTOR_TYPES.subarray(1, 2));

			if (customFlush) {
				customFlush.call(this, callback);
			} else {
				callback();
			}
		};

		this.writer = writer;
		this.count = 0;
	}

	_transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback) {
		const buff = this.writer.encode(chunk);
		this.push(buff);
		this.count++;
		callback();
	}
}

export class TLDecode extends Transform {
	reader: BinaryReader;
	private incompleteBuffer: Buffer | null;

	constructor(options?: TransformOptions) {
		if (!options) options = {};
		options.objectMode = true;
		super(options);

		this.incompleteBuffer = null;
		this.reader = new BinaryReader(new Uint8Array(8192));
	}

	_transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback) {
		if (this.incompleteBuffer) {
			chunk = Buffer.concat([this.incompleteBuffer, chunk]);
			this.incompleteBuffer = null;
		}

		try {
			const value = this.reader.decode(chunk);
			return callback(null, value);
		} catch (err) {
			if ((err as any)?.incomplete) {
				this.incompleteBuffer = chunk;
				return callback();
			}

			return callback(err as any);
		}
	}
}
