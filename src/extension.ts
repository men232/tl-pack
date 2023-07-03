type Primitives = string | number | boolean;

export type EncodeHandler = (value: any) => string | number | undefined;

export type DecodeHandler = (value: string | number) => any;

export interface TLExtension {
	token: number;
	encode: EncodeHandler;
	decode: DecodeHandler;
}

export function createExtension(
	token: number,
	{ encode, decode }: { encode: EncodeHandler; decode: DecodeHandler },
): TLExtension {
	if (token !== -1 && (token > 254 || token < 0 || token << 0 !== token)) {
		throw new TypeError('Token must be a 8 bit number');
	}

	if (token < 35) {
		throw new TypeError('Tokens reserved from 0 to 34');
	}

	return {
		token,
		encode,
		decode,
	};
}
