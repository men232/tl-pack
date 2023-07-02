export function createDictionary(values?: string[]) {
	return new Dictionary(values);
}

export class Dictionary {
	private _count = 0;
	private _map: Map<string, number>;
	private _index: string[];
	private _offset: number;

	constructor(values?: string[], offset = 0) {
		this._index = [];
		this._map = new Map();
		this._offset = offset;

		if (Array.isArray(values) && values.length) {
			values.forEach((word) => {
				if (this._map!.has(word)) return;

				this._map.set(word, this._count++);
				this._index.push(word);
			});
		}
	}

	get size() {
		return this._count;
	}

	/**
	 * Returns inserted index or nothing
	 */
	maybeInsert(word: string) {
		if (this._map.has(word)) return;

		this._map.set(word, this._count++);
		this._index.push(word);

		return this._count + this._offset;
	}

	getValue(index: number): string | undefined {
		return this._index[index - this._offset];
	}

	getIndex(value: string) {
		const idx = this._map.get(value);

		if (idx === undefined) {
			return idx;
		}

		return idx + this._offset;
	}

	hasValue(value: string) {
		return this._map.has(value);
	}

	hasIndex(index: number) {
		return this._index[index - this._offset] !== undefined;
	}
}
