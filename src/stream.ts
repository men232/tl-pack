import { Transform, type TransformCallback, type TransformOptions } from 'stream';
import { BinaryWriter } from './BinaryWriter.js';
import { BinaryReader } from './BinaryReader.js';

export class TLEncode extends Transform {
	private writer: BinaryWriter;

	constructor(options?: TransformOptions) {
		if (!options) options = {};
		options.writableObjectMode = true;
		super(options);

		this.writer = new BinaryWriter();
	}

	_transform(chunk: any, encoding: BufferEncoding, callback: TransformCallback) {
		const buff = this.writer.encode(chunk);
		this.push(buff);
		callback();
	}
}

export class TLDecode extends Transform {
	private reader: BinaryReader;
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
