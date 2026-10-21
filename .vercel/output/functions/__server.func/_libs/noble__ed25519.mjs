//#region node_modules/@noble/ed25519/index.js
/*! noble-ed25519 - MIT License (c) 2019 Paul Miller (paulmillr.com) */
/**
* 5KB JS implementation of ed25519 EdDSA signatures.
* Targets RFC8032, FIPS 186-5, and ZIP215 behavior.
* @module
* @example
* ```js
import * as ed from '@noble/ed25519';
(async () => {
const secretKey = ed.utils.randomSecretKey();
const message = Uint8Array.from([0xab, 0xbc, 0xcd, 0xde]);
const pubKey = await ed.getPublicKeyAsync(secretKey); // Sync methods are also present
const signature = await ed.signAsync(message, secretKey);
const isValid = await ed.verifyAsync(signature, message, pubKey);
})();
```
*/
/**
* Curve params. edwards25519 uses the RFC equation `-x² + y² = 1 + dx²y²`.
* The stored `a` literal below is `p - 1`, i.e. the field-element encoding of RFC `a = -1`.
* * P = `2n**255n - 19n` // field over which calculations are done
* * N = `2n**252n + 27742317777372353535851937790883648493n` // prime-order subgroup order
* * h = 8 // cofactor
* * a = `Fp.create(BigInt(-1))` // equation param, stored here as `p - 1`
* * d = -121665/121666 a.k.a. `Fp.neg(121665 * Fp.inv(121666))` // equation param
* * Gx, Gy are coordinates of Generator / base point
*
* Mirror noble-curves: Point.CURVE() exposes shared params, but callers must not be able to mutate
* that shared view and desynchronize it from the arithmetic constants captured below.
*/
var freeze = Object.freeze;
var P = 57896044618658097711785492504343953926634992332820282019728792003956564819949n;
var N = 7237005577332262213973186563042994240857116359379907606001950938285454250989n;
var _d = 37095705934669439343138083508754565189542113879843219016388785533085940283555n;
var Gx = 15112221349535400772501151409588531511454012693041857206046113283949847762202n;
var Gy = 46316835694926478169428394003475163141307993866256225615783033603165251855960n;
var _a = P - 1n;
var ed25519_CURVE = freeze({
	p: P,
	n: N,
	h: 8n,
	a: _a,
	d: _d,
	Gx,
	Gy
});
var LEN = 32;
/** Checks if something is Uint8Array. Be careful: nodejs Buffer will return true. */
var isBytes = (a) => {
	return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array" && a.BYTES_PER_ELEMENT === 1;
};
/** Asserts something is Bytes. */
var abytes = (value, length, title = "") => {
	if (isBytes(value) && (length === void 0 || value.length === length)) return value;
	const bytes = isBytes(value);
	const ofLen = length !== void 0 ? ` of length ${length}` : "";
	const got = bytes ? `length=${value.length}` : `type=${typeof value}`;
	const message = (title ? `"${title}" ` : "") + "expected Uint8Array" + ofLen + ", got " + got;
	if (!bytes) throw new TypeError(message);
	throw new RangeError(message);
};
var snapshotBytes = (value, title = "", length) => Uint8Array.from(abytes(value, length, title));
var padh = (n, pad) => n.toString(16).padStart(pad, "0");
/** Convert byte array to hex string. */
var bytesToHex = (bytes) => {
	let hex = "";
	for (const byte of abytes(bytes)) hex += padh(byte, 2);
	return hex;
};
/** Convert hex string to byte array. */
var hexToBytes = (hex) => {
	const e = "hex invalid";
	if (typeof hex !== "string") throw new TypeError(e);
	if (hex.length % 2 || !/^[\da-f]*$/i.test(hex)) throw new RangeError(e);
	const array = new Uint8Array(hex.length / 2);
	for (let ai = 0, hi = 0; ai < array.length; ai++, hi += 2) {
		const n1 = hex.charCodeAt(hi);
		const n2 = hex.charCodeAt(hi + 1);
		array[ai] = ((n1 & 15) + (n1 >> 6) * 9) * 16 + (n2 & 15) + (n2 >> 6) * 9;
	}
	return array;
};
/** Copies several Uint8Arrays into one. */
var concatBytes = (...arrays) => {
	let sum = 0;
	for (const a of arrays) sum += abytes(a).length;
	const res = new Uint8Array(sum);
	let pad = 0;
	for (const a of arrays) {
		res.set(a, pad);
		pad += a.length;
	}
	return res;
};
/** Inclusive-lower, exclusive-upper bigint range assertion. */
var arange = (n, min, max, msg = "bad number: out of range") => {
	if (typeof n !== "bigint") throw new TypeError(msg);
	if (min <= n && n < max) return n;
	throw new RangeError(msg);
};
/** Canonical modular reduction. Callers must provide a positive modulus. */
var mod = (a, b = P) => (a %= b) >= 0n ? a : b + a;
var P_MASK = (1n << 255n) - 1n;
var modP = (num) => {
	if (num < 0n) throw new RangeError("negative coordinate");
	let r = (num >> 255n) * 19n + (num & P_MASK);
	r = (r >> 255n) * 19n + (r & P_MASK);
	return r % P;
};
var modN = (a) => mod(a, N);
/** Modular inversion using extended euclidean GCD. Variable-time (non-CT). */
var invert = (number, modulo) => {
	if (number === 0n) throw new Error("invert: expected non-zero number");
	if (modulo <= 1n) throw new Error("invert: expected modulus > 1, got " + modulo);
	let a = mod(number, modulo);
	let b = modulo;
	let x = 0n, u = 1n;
	while (a !== 0n) {
		const q = b / a;
		const r = b - a * q;
		const m = x - u * q;
		b = a, a = r, x = u, u = m;
	}
	if (b !== 1n) throw new Error("invert: does not exist");
	return mod(x, modulo);
};
var _hash = (name) => {
	const fn = hashes[name];
	if (typeof fn !== "function") throw new Error("hashes." + name + " not set");
	return fn;
};
var callHashAsync = async (name, ...m) => abytes(await _hash(name)(concatBytes(...m)), 64, "digest");
var apoint = (p) => {
	if (p instanceof Point) return p;
	throw new TypeError("Point expected");
};
var B256 = 2n ** 256n;
/**
* Point in XYZT extended coordinates.
* @param X - X coordinate.
* @param Y - Y coordinate.
* @param Z - Projective Z coordinate.
* @param T - Cached cross-product term.
* @example
* Do point arithmetic with the built-in base point and encode the result as hex.
*
* ```ts
* const hex = Point.BASE.double().toHex();
* ```
*/
var Point = class Point {
	static BASE;
	static ZERO;
	X;
	Y;
	Z;
	T;
	constructor(X, Y, Z, T) {
		const max = B256;
		this.X = arange(X, 0n, max);
		this.Y = arange(Y, 0n, max);
		this.Z = arange(Z, 1n, max);
		this.T = arange(T, 0n, max);
		freeze(this);
	}
	static CURVE() {
		return ed25519_CURVE;
	}
	static fromAffine(p) {
		return new Point(p.x, p.y, 1n, modP(p.x * p.y));
	}
	/** RFC8032 5.1.3: Uint8Array to Point. */
	static fromBytes(bytes, zip215 = false) {
		const normed = snapshotBytes(bytes, "point", LEN);
		const lastByte = normed[31];
		normed[31] = lastByte & -129;
		const y = bytesToNumberLE(normed);
		if (!zip215) arange(y, 0n, P);
		const y2 = modP(y * y);
		let { isValid, value: x } = uvRatio(mod(y2 - 1n), modP(_d * y2 + 1n));
		if (!isValid) throw new Error("bad point: y not sqrt");
		const isLastByteOdd = !!(lastByte & 128);
		if (!zip215 && x === 0n && isLastByteOdd) throw new Error("bad point: x==0, isLastByteOdd");
		if (isLastByteOdd !== !!(x & 1n)) x = mod(-x);
		return new Point(x, y, 1n, modP(x * y));
	}
	static fromHex(hex, zip215) {
		return Point.fromBytes(hexToBytes(hex), zip215);
	}
	get x() {
		return this.toAffine().x;
	}
	get y() {
		return this.toAffine().y;
	}
	/** Checks if the point is valid and on-curve. */
	assertValidity() {
		const a = _a;
		const d = _d;
		const p = this;
		if (p.is0()) throw new Error("bad point: ZERO");
		const { X, Y, Z, T } = p;
		const X2 = modP(X * X);
		const Y2 = modP(Y * Y);
		const Z2 = modP(Z * Z);
		const Z4 = modP(Z2 * Z2);
		if (modP(Z2 * (modP(X2 * a) + Y2)) !== mod(Z4 + modP(d * modP(X2 * Y2)))) throw new Error("bad point: equation left != right (1)");
		if (modP(X * Y) !== modP(Z * T)) throw new Error("bad point: equation left != right (2)");
		return this;
	}
	/** Equality check: compare points P&Q. */
	equals(other) {
		const { X: X1, Y: Y1, Z: Z1 } = this;
		const { X: X2, Y: Y2, Z: Z2 } = apoint(other);
		return modP(X1 * Z2) === modP(X2 * Z1) && modP(Y1 * Z2) === modP(Y2 * Z1);
	}
	is0() {
		return this.equals(I);
	}
	/** Flip point over y coordinate. */
	negate() {
		return new Point(mod(-this.X), this.Y, this.Z, mod(-this.T));
	}
	/** Point doubling. Complete formula. Cost: `4M + 4S + 1*a + 6add + 1*2`. */
	double() {
		const { X: X1, Y: Y1, Z: Z1 } = this;
		const a = _a;
		const A = modP(X1 * X1);
		const B = modP(Y1 * Y1);
		const C = modP(2n * Z1 * Z1);
		const D = modP(a * A);
		const x1y1 = mod(X1 + Y1);
		const E = mod(modP(x1y1 * x1y1) - A - B);
		const G = mod(D + B);
		const F = mod(G - C);
		const H = mod(D - B);
		const X3 = modP(E * F);
		const Y3 = modP(G * H);
		const T3 = modP(E * H);
		const Z3 = modP(F * G);
		return new Point(X3, Y3, Z3, T3);
	}
	/** Point addition. Complete formula. Cost: `9M + 1*a + 1*d + 7add`. */
	add(other) {
		const { X: X1, Y: Y1, Z: Z1, T: T1 } = this;
		const { X: X2, Y: Y2, Z: Z2, T: T2 } = apoint(other);
		const a = _a;
		const d = _d;
		const A = modP(X1 * X2);
		const B = modP(Y1 * Y2);
		const C = modP(modP(T1 * d) * T2);
		const D = modP(Z1 * Z2);
		const E = mod(modP(mod(X1 + Y1) * mod(X2 + Y2)) - A - B);
		const F = mod(D - C);
		const G = mod(D + C);
		const H = mod(B - modP(a * A));
		const X3 = modP(E * F);
		const Y3 = modP(G * H);
		const T3 = modP(E * H);
		const Z3 = modP(F * G);
		return new Point(X3, Y3, Z3, T3);
	}
	subtract(other) {
		return this.add(apoint(other).negate());
	}
	/**
	* Point-by-scalar multiplication. Safe mode requires `1 <= n < CURVE.n`.
	* Unsafe mode additionally permits `n = 0` and returns the identity point for that case.
	* Uses {@link wNAF} for base point.
	* Uses fake point to mitigate side-channel leakage.
	* @param n - scalar by which point is multiplied
	* @param safe - safe mode guards against timing attacks; unsafe mode is faster
	*/
	multiply(n, safe = true) {
		if (!safe && n === 0n) return I;
		arange(n, 1n, N);
		if (!safe && this.is0()) return I;
		if (n === 1n) return this;
		if (this.equals(G)) return wNAF(n).p;
		let p = I;
		let f = G;
		let d = this;
		for (let i = 0; safe ? i < 256 : n > 0n; i++) {
			if (n & 1n) p = p.add(d);
			else if (safe) f = f.add(d);
			d = d.double();
			n >>= 1n;
		}
		return p;
	}
	multiplyUnsafe(scalar) {
		return this.multiply(scalar, false);
	}
	/** Convert point to 2d xy affine point. (X, Y, Z) ∋ (x=X/Z, y=Y/Z) */
	toAffine() {
		const { X, Y, Z } = this;
		if (this.equals(I)) return {
			x: 0n,
			y: 1n
		};
		const iz = invert(Z, P);
		if (modP(Z * iz) !== 1n) throw new Error("invalid inverse");
		return {
			x: modP(X * iz),
			y: modP(Y * iz)
		};
	}
	toBytes() {
		const { x, y } = this.toAffine();
		const b = numTo32bLE(y);
		b[31] |= x & 1n ? 128 : 0;
		return b;
	}
	toHex() {
		return bytesToHex(this.toBytes());
	}
	clearCofactor() {
		return this.multiply(8n, false);
	}
	isSmallOrder() {
		return this.clearCofactor().is0();
	}
	isTorsionFree() {
		return this.multiply(N / 2n, false).double().add(this).is0();
	}
};
/** Generator / base point */
var G = new Point(Gx, Gy, 1n, mod(Gx * Gy));
/** Identity / zero point */
var I = new Point(0n, 1n, 1n, 0n);
Point.BASE = G;
Point.ZERO = I;
var numTo32bLE = (num) => hexToBytes(padh(arange(num, 0n, B256), 64)).reverse();
var bytesToNumberLE = (b) => BigInt("0x" + bytesToHex(Uint8Array.from(abytes(b)).reverse()));
var pow2 = (x, power) => {
	let r = x;
	while (power-- > 0) r = modP(r * r);
	return r;
};
var pow_2_252_3 = (x) => {
	const b2 = modP(modP(x * x) * x);
	const b5 = modP(pow2(modP(pow2(b2, 2) * b2), 1) * x);
	const b10 = modP(pow2(b5, 5) * b5);
	const b20 = modP(pow2(b10, 10) * b10);
	const b40 = modP(pow2(b20, 20) * b20);
	const b80 = modP(pow2(b40, 40) * b40);
	return modP(pow2(modP(pow2(modP(pow2(modP(pow2(b80, 80) * b80), 80) * b80), 10) * b10), 2) * x);
};
var RM1 = 19681161376707505956807079304988542015446066515923890162744021073123829784752n;
var uvRatio = (u, v) => {
	const v3 = modP(v * modP(v * v));
	let x = modP(u * modP(v3 * pow_2_252_3(modP(u * modP(modP(v3 * v3) * v)))));
	const vx2 = modP(v * modP(x * x));
	const root1 = x;
	const root2 = modP(x * RM1);
	const useRoot1 = vx2 === u;
	const useRoot2 = vx2 === mod(-u);
	const noRoot = vx2 === mod(-u * RM1);
	if (useRoot1) x = root1;
	if (useRoot2 || noRoot) x = root2;
	if ((mod(x) & 1n) === 1n) x = mod(-x);
	return {
		isValid: useRoot1 || useRoot2,
		value: x
	};
};
var modL_LE = (hash) => modN(bytesToNumberLE(hash));
var hashedToExtK = (hashed) => {
	const copy = snapshotBytes(hashed);
	const head = copy.slice(0, 32);
	head[0] &= 248;
	head[31] &= 127;
	head[31] |= 64;
	const prefix = copy.slice(32);
	const scalar = modL_LE(head);
	const point = G.multiply(scalar);
	return {
		head,
		prefix,
		scalar,
		point,
		pointBytes: point.toBytes()
	};
};
var getExtendedPublicKeyAsync = (secretKey) => callHashAsync("sha512Async", abytes(secretKey, LEN, "secretKey")).then(hashedToExtK);
var hashFinishAsync = async (res) => res[1](await callHashAsync("sha512Async", res[0]));
var _sign = (e, rBytes, msg) => {
	const { pointBytes: A, scalar: s } = e;
	const r = modL_LE(rBytes);
	const R = G.multiply(r).toBytes();
	const hashable = concatBytes(R, A, msg);
	const finish = (hashed) => {
		const S = modN(r + modL_LE(hashed) * s);
		return abytes(concatBytes(R, numTo32bLE(S)), 64);
	};
	return [hashable, finish];
};
/**
* Signs message using secret key. Async.
* Follows RFC8032 5.1.6.
* @param message - Message bytes to sign.
* @param secretKey - 32-byte RFC 8032 secret-key seed, not a 64-byte expanded secret key.
* @returns 64-byte Ed25519 signature.
* @throws On wrong argument types. {@link TypeError}
* @throws On wrong argument ranges or values. {@link RangeError}
* @example
* Sign an arbitrary message with a fresh Ed25519 secret key.
*
* ```ts
* import * as ed from '@noble/ed25519';
*
* const secretKey = ed.utils.randomSecretKey();
* const message = new Uint8Array([1, 2, 3]);
* const signature = await ed.signAsync(message, secretKey);
* ```
*/
var signAsync = async (message, secretKey) => {
	const m = snapshotBytes(message, "message");
	const e = await getExtendedPublicKeyAsync(secretKey);
	return hashFinishAsync(_sign(e, await callHashAsync("sha512Async", e.prefix, m), m));
};
/**
* Hash implementations used by the synchronous API plus the default async WebCrypto provider.
* Both slots are configurable API surface; wrapper helpers revalidate that providers still return
* 64-byte SHA-512 digests.
* @example
* Provide a SHA-512 implementation before calling synchronous helpers.
*
* ```ts
* import * as ed from '@noble/ed25519';
* import { sha512 } from '@noble/hashes/sha2.js';
*
* ed.hashes.sha512 = sha512;
* const { publicKey } = ed.keygen();
* ```
*/
var hashes = {
	sha512Async: async (message) => {
		const s = globalThis?.crypto?.subtle;
		if (!s) throw new Error("crypto.subtle must be defined, consider polyfill");
		return new Uint8Array(await s.digest("SHA-512", concatBytes(message)));
	},
	sha512: void 0
};
var precompute = () => {
	const points = [];
	let p = G;
	let b;
	for (let w = 0; w < 33; w++) {
		b = p;
		points.push(b);
		for (let i = 1; i < 128; i++) {
			b = b.add(p);
			points.push(b);
		}
		p = b.double();
	}
	return points;
};
var Gpows = void 0;
var ctneg = (cnd, p) => {
	const n = p.negate();
	return cnd ? n : p;
};
/**
* Precomputes give 12x faster getPublicKey(), 10x sign(), 2x verify() by
* caching multiples of G (base point). Cache is stored in 32MB of RAM.
* Any time `G.multiply` is done, precomputes are used.
* Not used for getSharedSecret, which instead multiplies random pubkey `P.multiply`.
*
* w-ary non-adjacent form (wNAF) precomputation method is 10% slower than windowed method,
* but takes 2x less RAM. RAM reduction is possible by utilizing `.subtract`.
* Returns the real accumulator `p` plus a fake accumulator `f`; callers only care about `p`, while
* `f` exists to keep similar work in zero-digit branches as a JS/JIT side-channel mitigation.
*
* !! Precomputes can be disabled by commenting-out call of the wNAF() inside Point#multiply().
*/
var wNAF = (n) => {
	const comp = Gpows || (Gpows = precompute());
	let p = I;
	let f = G;
	for (let w = 0; w < 33; w++) {
		let wbits = Number(n & 255n);
		n >>= 8n;
		if (wbits > 128) {
			wbits -= 256;
			n += 1n;
		}
		const off = w * 128;
		const offP = off + Math.abs(wbits) - 1;
		const isOddW = w % 2 !== 0;
		const isNeg = wbits < 0;
		if (wbits === 0) f = f.add(ctneg(isOddW, comp[off]));
		else p = p.add(ctneg(isNeg, comp[offP]));
	}
	if (n !== 0n) throw new Error("invalid wnaf");
	return {
		p,
		f
	};
};
//#endregion
export { signAsync as t };
