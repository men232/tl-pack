import { Transform, type TransformCallback, type TransformOptions } from 'stream';
import { BinaryWriter, BinaryWriterOptions } from './BinaryWriter.js';
import { BinaryReader } from './BinaryReader.js';

export interface TLEncodeOptions extends BinaryWriterOptions {
	streamOptions?: TransformOptions;
	writeVectorWhenEmpty?: boolean;
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

		this._flush = (callback) => {
			if (this.count === 0 && opts.writeVectorWhenEmpty) {
				this.push(writer.encode([]));
			}

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
