export enum CORE_TYPES {
	None = 0,
	Binary = 1,
	BoolFalse = 2,
	BoolTrue = 3,
	Null = 4,
	Date = 5,
	Vector = 6,
	VectorDynamic = 7,
	Int32 = 8,
	Int16 = 9,
	Int8 = 10,
	UInt32 = 11,
	UInt16 = 12,
	UInt8 = 13,
	Float = 14,
	Double = 15,
	Map = 16,
	DictValue = 17,
	DictIndex = 18,
	String = 19,
	Repeat = 20,
	GZIP = 25,
}

export const HAS_NODE_BUFFER = typeof Buffer !== 'undefined';

export const MAX_BUFFER_SIZE = HAS_NODE_BUFFER ? 0x100000000 : 0x7fd00000;
