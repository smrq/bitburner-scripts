import { NS } from '@ns';

export const solutions: Record<string, (ns: NS, input: any) => any> = {
	'Find Largest Prime Factor': largestPrimeFactor,
	'Subarray with Maximum Sum': subarrayWithMaximumSum,
	'Total Ways to Sum': totalWaysToSum1,
	'Total Ways to Sum II': totalWaysToSum2,
	'Spiralize Matrix': spiralizeMatrix,
	'Array Jumping Game': arrayJumping1,
	'Array Jumping Game II': arrayJumping2,
	'Merge Overlapping Intervals': mergeOverlappingIntervals,
	'Generate IP Addresses': generateIpAddresses,
	'Algorithmic Stock Trader I': algorithmicStock1,
	'Algorithmic Stock Trader II': algorithmicStock2,
	'Algorithmic Stock Trader III': algorithmicStock3,
	'Algorithmic Stock Trader IV': algorithmicStock4,
	'Minimum Path Sum in a Triangle': minimumPathSumTriangle,
	'Unique Paths in a Grid I': uniquePaths1,
	'Unique Paths in a Grid II': uniquePaths2,
	'Shortest Path in a Grid': shortestPath,
	'Sanitize Parentheses in Expression': sanitizeParens,
	'Find All Valid Math Expressions': findMathExpressions,
	'HammingCodes: Integer to Encoded Binary': hammingEncode,
	'HammingCodes: Encoded Binary to Integer': hammingDecode,
	'Proper 2-Coloring of a Graph': coloring,
	'Compression I: RLE Compression': compression1,
	'Compression II: LZ Decompression': compression2,
	'Compression III: LZ Compression': compression3,
	'Encryption I: Caesar Cipher': encryption1,
	'Encryption II: Vigenère Cipher': encryption2,
};

export async function solveFile(ns: NS, file: string, hostname: string) {
	const type = ns.codingcontract.getContractType(file, hostname);
	const data = ns.codingcontract.getData(file, hostname);
	return solveType(ns, type, data);
}

export async function solveType(ns: NS, type: string, data: any) {
	if (solutions[type]) {
		return solutions[type](ns, data);
	} else {
		throw new Error(`unimplemented contract type: ${type}`);
	}
}

/**
 * Find Largest Prime Factor
 */
function largestPrimeFactor(ns: NS, input: number): number {
	const factors = [];
	let n = input, divisor = 2;
	while (n > 1) {
		if (n % divisor === 0) {
			factors.push(divisor);
			n = n / divisor;
		} else {
			++divisor;
		}
	}
	return factors.at(-1)!;
}


/**
 * Subarray with Maximum Sum
 */
function subarrayWithMaximumSum(ns: NS, input: number[]): number {
	let max = -Infinity;
	for (let len = 1; len <= input.length; ++len) {
		for (let i = 0; i < input.length - len + 1; ++i) {
			max = Math.max(max, input.slice(i, i + len).reduce((a, b) => a + b));
		}
	}
	return max;
}

/**
 * Total Ways to Sum
 * https://en.wikipedia.org/wiki/Partition_function_(number_theory)
 */
function totalWaysToSum1(ns: NS, input: number): number {
	const _calc = memo(calc);
	return _calc(input, input - 1);

	function calc(n: number, max: number) {
		if (n === 0) return 1;
		let result = 0;
		for (let x = max; x >= 1; --x) {
			result += _calc(n - x, Math.min(x, n - x));
		}
		return result;
	}
}

/**
 * Total Ways to Sum II
 */
function totalWaysToSum2(ns: NS, input: [number, number[]]): number {
	const [target, list] = input;
	const _calc = memo(calc);
	return _calc(target, 0);

	function calc(target: number, index: number) {
		if (target === 0) return 1;
		if (index === list.length) return 0;

		let result = 0;
		for (let times = 0; times <= Math.floor(target / list[index]); ++times) {
			result += _calc(target - list[index] * times, index + 1);
		}
		return result;
	}
}

/**
 * Spiralize Matrix
 */
function spiralizeMatrix(ns: NS, input: number[][]): number[] {
	const rows = input.length;
	const cols = input[0].length;

	let minX = 0;
	let maxX = cols - 1;
	let minY = 0;
	let maxY = rows - 1;

	const result = [input[0][0]];
	let x = 0, y = 0;
	while (1) {
		// Top ->
		while (x < maxX) {
			++x;
			result.push(input[y][x]);
		}
		++minY;
		if (minY > maxY) break;

		// Right v
		while (y < maxY) {
			++y;
			result.push(input[y][x]);
		}
		--maxX;
		if (minX > maxX) break;

		// Bottom <-
		while (x > minX) {
			--x;
			result.push(input[y][x]);
		}
		--maxY;
		if (minY > maxY) break;

		// Left ^
		while (y > minY) {
			--y;
			result.push(input[y][x]);
		}
		++minX;
		if (minX > maxX) break;
	}

	return result;
}

/**
 * Array Jumping Game
 */
function arrayJumping1(ns: NS, input: number[]): number {
	return arrayJumping2(ns, input) ? 1 : 0;
}

/**
 * Array Jumping Game II
 */
function arrayJumping2(ns: NS, input: number[]): number {
	let jump = 0;
	let range = 0;
	while (true) {
		++jump;
		let nextRange = 0;
		for (let index = 0; index <= range; ++index) {
			nextRange = Math.max(nextRange, index + input[index]);
		}
		if (nextRange >= input.length - 1) {
			return jump;
		}
		if (nextRange === range) {
			return 0;
		}
		range = nextRange;
	}
}

/**
 * Merge Overlapping Intervals
 */
function mergeOverlappingIntervals(ns: NS, input: [number, number][]): [number, number][] {
	const resultIntervals = [] as [number, number][];
	for (let [start, end] of input) {
		let i = 0;
		while (1) {
			if (i >= resultIntervals.length) {
				resultIntervals.push([start, end]);
				break;
			}
			if (end < resultIntervals[i][0]) {
				resultIntervals.splice(i, 0, [start, end]);
				break;
			}
			if (start > resultIntervals[i][1]) {
				++i;
				continue;
			}
			start = Math.min(start, resultIntervals[i][0]);
			end = Math.max(end, resultIntervals[i][1]);
			resultIntervals.splice(i, 1);
		}
	}
	return resultIntervals;
}

/**
 * Generate IP Addresses
 */
function generateIpAddresses(ns: NS, input: string): string[] {
	let working = [{ octets: [] as number[], remaining: input }];
	for (let i = 0; i < 4; ++i) {
		const next = [];
		for (const { octets, remaining } of working) {
			if (!remaining.length) continue;
			if (remaining[0] === '0') {
				next.push({ octets: [...octets, 0], remaining: remaining.slice(1) });
				continue;
			}
			for (let length = 1; length <= Math.min(3, remaining.length); ++length) {
				const octet = parseInt(remaining.slice(0, length), 10);
				if (octet > 255) break;
				next.push({ octets: [...octets, octet], remaining: remaining.slice(length) });
			}
		}
		working = next;
	}

	return working
		.filter(({ remaining }) => remaining.length === 0)
		.map(({ octets }) => octets.join('.'));
}

/**
 * Algorithmic Stock Trader I
 */
function algorithmicStock1(ns: NS, input: number[]): number {
	return algorithmicStock4(ns, [1, input]);
}

/**
 * Algorithmic Stock Trader II
 */
function algorithmicStock2(ns: NS, input: number[]): number {
	return algorithmicStock4(ns, [Infinity, input]);
}

/**
 * Algorithmic Stock Trader III
 */
function algorithmicStock3(ns: NS, input: number[]): number {
	return algorithmicStock4(ns, [2, input]);
}

/**
 * Algorithmic Stock Trader IV
 */
function algorithmicStock4(ns: NS, input: [number, number[]]): number {
	interface StateKey {
		holding: boolean;
		transactions: number;
	}
	interface State extends StateKey {
		profit: number;
	}

	const [maxTransactions, prices] = input;

	function key(state: StateKey) {
		return `${state.holding},${state.transactions}`;
	}
	function getState(map: Map<string, State>, state: StateKey) {
		return map.get(key(state));
	}
	function setState(map: Map<string, State>, state: State) {
		map.set(key(state), state);
	}

	let states = new Map();
	setState(states, { holding: false, transactions: maxTransactions, profit: 0 });

	for (let index = 0; index < prices.length; ++index) {
		const next = new Map();
		for (const { holding, transactions, profit } of states.values()) {
			if (holding) {
				const currentHolding = getState(next, { holding: true, transactions });
				setState(next, {
					holding: true,
					transactions,
					profit: Math.max(currentHolding?.profit ?? -Infinity, profit),
				});

				const currentSelling = getState(next, { holding: false, transactions });
				setState(next, {
					holding: false,
					transactions,
					profit: Math.max(currentSelling?.profit ?? -Infinity, profit + prices[index]),
				});
			} else {
				const currentNotHolding = getState(next, { holding: false, transactions });
				setState(next, {
					holding: false,
					transactions,
					profit: Math.max(currentNotHolding?.profit ?? -Infinity, profit),
				});

				if (transactions > 0) {
					const currentBuying = getState(next, { holding: true, transactions: transactions - 1 });
					setState(next, {
						holding: true,
						transactions: transactions - 1,
						profit: Math.max(currentBuying?.profit ?? -Infinity, profit - prices[index]),
					});
				}
			}
		}
		states = next;
	}

	return Math.max(...[...states.values()].map(state => state.profit));
}

/**
 * Minimum Path Sum in a Triangle
 */
function minimumPathSumTriangle(ns: NS, input: number[][]): number {
	const _calc = memo(calc);
	return _calc(0, 0);

	function calc(x: number, y: number): number {
		if (y === input.length - 1) {
			return input[y][x];
		}
		return input[y][x] + Math.min(_calc(x, y + 1), _calc(x + 1, y + 1));
	}
}

/**
 * Unique Paths in a Grid I
 */
function uniquePaths1(ns: NS, input: [number, number]): number {
	const _calc = memo(calc);
	return _calc(...input);

	function calc(rows: number, cols: number): number {
		if (cols === 1 || rows === 1) return 1;
		return _calc(rows - 1, cols) + _calc(rows, cols - 1);
	}
}

/**
 * Unique Paths in a Grid II
 * @param {NS} ns
 */
function uniquePaths2(ns: NS, input: number[][]): number {
	const rows = input.length;
	const cols = input[0].length;

	const _calc = memo(calc);
	return _calc(0, 0);

	function calc(x: number, y: number): number {
		if (input[y][x] === 1) return 0;
		if (x === cols - 1 && y === rows - 1) return 1;
		if (x === cols - 1) return _calc(x, y + 1);
		if (y === rows - 1) return _calc(x + 1, y);
		return _calc(x + 1, y) + _calc(x, y + 1);
	}
}

/**
 * Shortest Path in a Grid
 * @param {NS} ns
 * @param {number[][]} input
 * @returns {Promise<string>}
 */
async function shortestPath(ns: NS, input: number[][]): Promise<string> {
	const rows = input.length;
	const cols = input[0].length;
	const { found, path } = await astar(ns, {
		start: [0, 0],
		isGoal: ([x, y]) => x === cols - 1 && y === rows - 1,
		key: (coords) => coords.join(','),
		neighbors: function* ([x, y]) {
			for (const [x2, y2, direction] of [
				[x + 1, y, 'R'],
				[x, y + 1, 'D'],
				[x - 1, y, 'L'],
				[x, y - 1, 'U'],
			] as const) {
				if (input[y2]?.[x2] === 0) {
					yield [[x2, y2], 1, direction];
				}
			}
		},
		heuristic: ([x, y]) => (cols - 1 - x) + (rows - 1 - y)
	});
	return found ? path!.join('') : '';
}

/**
 * Sanitize Parentheses in Expression
 * @param {NS} ns
 * @param {string} input
 * @returns {string[]}
 */
function sanitizeParens(ns: NS, input: string): string[] {
	let working = new Set<string>([input]);
	while (true) {
		let next = new Set<string>();
		for (const str of working) {
			if (isSanitized(str)) {
				return [...working].filter(isSanitized);
			}
			for (let i = 0; i < str.length; ++i) {
				if (str[i] !== '(' && str[i] !== ')') continue;
				next.add(str.slice(0, i) + str.slice(i + 1));
			}
		}
		working = next;
	}

	function isSanitized(str: string) {
		let nesting = 0;
		for (const char of str) {
			switch (char) {
				case '(': ++nesting; break;
				case ')': --nesting; break;
			}
			if (nesting < 0) {
				return false;
			}
		}
		return nesting === 0;
	}
}

/**
 * Find All Valid Math Expressions
 * @param {NS} ns
 * @param {[string, number]} input
 * @returns {Promise<string[]>}
 */
async function findMathExpressions(ns: NS, input: [string, number]): Promise<string[]> {
	const [str, target] = input;
	let working = [{
		value: 0,
		output: str[0],
		current: parseInt(str[0], 10),
		multiplier: 1,
	}];
	let t = performance.now();
	for (let i = 1; i < str.length; ++i) {
		const digit = parseInt(str[i], 10);
		let next = [];
		for (const state of working) {
			if (state.current != null && state.current !== 0) {
				next.push({
					value: state.value,
					output: state.output + str[i],
					current: state.current * 10 + digit,
					multiplier: state.multiplier,
				});
			}
			next.push({
				value: state.value + state.current * state.multiplier,
				output: state.output + '+' + str[i],
				current: digit,
				multiplier: 1,
			});
			next.push({
				value: state.value + state.current * state.multiplier,
				output: state.output + '-' + str[i],
				current: digit,
				multiplier: -1,
			});
			next.push({
				value: state.value,
				output: state.output + '*' + str[i],
				current: digit,
				multiplier: state.multiplier * state.current,
			});

			if (performance.now() - t > 10) {
				await new Promise(resolve => requestAnimationFrame(resolve));
				t = performance.now();
			}
		}
		working = next;
	}
	return working.filter(state => state.value + state.multiplier * state.current === target)
		.map(state => state.output);
}

/**
 * HammingCodes: Integer to Encoded Binary
 * @param {NS} ns
 * @param {number} input
 * @returns {string}
 */
function hammingEncode(ns: NS, input: number): string {
	const bits = input.toString(2).split('').map(n => parseInt(n, 2));
	const output = [] as number[];
	
	let parityBitCount = 1;
	while (2**parityBitCount < bits.length + parityBitCount + 1) {
		++parityBitCount;
	}

	output[0] = 0;
	for (let i = 0; i < parityBitCount; ++i) {
		output[2**i] = 0;
	}

	for (let i = 1; bits.length; ++i) {
		if (i & (i - 1)) { // not power of 2
			output[i] = bits.shift()!;
		}
	}

	for (let p = 0; p < parityBitCount; ++p) {
		for (let i = 0; i < output.length; ++i) {
			if (i & 1<<p) {
				output[2**p] ^= output[i];
			}
		}
	}

	for (let i = 1; i < output.length; ++i) {
		output[0] ^= output[i];
	}

	return output.join('');
}

/**
 * HammingCodes: Encoded Binary to Integer
 * @param {NS} ns
 * @param {string} input
 * @returns number
 */
function hammingDecode(ns: NS, input: string): number {
	const bits = input.split('').map(n => parseInt(n, 2));
	let error = 0;
	for (let p = 0; 2**p < input.length; ++p) {
		let parity = 0;
		for (let i = 0; i < input.length; ++i) {
			if (i & 1<<p) {
				parity ^= bits[i];
			}
		}
		if (parity !== 0) {
			error |= 1<<p;
		}
	}
	if (error) {
		bits[error] ^= 1;
	}

	let result = 0;
	for (let i = 1; i < input.length; ++i) {
		if (i & (i - 1)) { // not power of 2
			result = result * 2 + bits[i];
		}
	}
	return result;
}

/**
 * Proper 2-Coloring of a Graph
 * @param {NS} ns
 * @param {[number, number[]]} input
 * @returns {number[]}
 */
function coloring(ns: NS, input: [number, [number, number][]]): number[] {
	const [count, edges] = input;
	const graph = new Map();
	for (let i = 0; i < count; ++i) {
		graph.set(i, []);
	}
	for (const edge of edges) {
		graph.get(edge[0]).push(edge[1]);
		graph.get(edge[1]).push(edge[0]);
	}
	const colors = Array.from({ length: count }).map(() => null as number | null);

	function fill(n: number, color: number) {
		const opposite = 1 - color;
		if (colors[n] === color) {
			return true;
		} else if (colors[n] === opposite) {
			return false;
		}
		colors[n] = color;
		for (const neighbor of graph.get(n)) {
			if (!fill(neighbor, opposite)) {
				return false;
			}
		}
		return true;
	}

	for (let i = 0; i < count; ++i) {
		if (colors[i] == null) {
			if (!fill(i, 0)) {
				return [];
			}
		}
	}

	return colors as number[];
}

/**
 * Compression I: RLE Compression
 * @param {NS} ns
 * @param {string} input
 * @returns {string}
 */
function compression1(ns: NS, input: string): string {
	let result = '';
	let currentChar = input[0];
	let currentCount = 0;
	for (let i = 0; i < input.length + 1; ++i) {
		if (input[i] === currentChar) {
			++currentCount;
			if (currentCount > 9) {
				result += `9${currentChar}`;
				currentCount -= 9;
			}
		} else {
			result += `${currentCount}${currentChar}`;
			currentChar = input[i];
			currentCount = 1;
		}
	}
	return result;
}

/**
 * Compression II: LZ Decompression
 * @param {NS} ns
 * @param {string} input
 * @returns {string}
 */
function compression2(ns: NS, input: string): string {
	let i = 0;
	let result = '';
	let literal = true;
	while (i < input.length) {
		const L = parseInt(input[i], 10);
		if (L === 0) {
			i += 1;
		} else if (literal) {
			const chunk = input.slice(i + 1, i + 1 + L);
			result += chunk;
			i += 1 + L;
		} else {
			const distance = parseInt(input[i + 1], 10);
			for (let n = 0; n < L; ++n) {
				result += result.at(-distance);
			}
			i += 2;
		}
		literal = !literal;
	}
	return result;
}

/**
 * Compression III: LZ Compression
 */
async function compression3(ns: NS, input: string): Promise<string> {
	const { found, path } = await astar(ns, {
		start: { index: 0, literal: true, output: '', lastChunk: null as string | null },
		isGoal: state => state.index === input.length,
		key: state => `${state.index},${state.literal}`,
		neighbors: function* (state) {
			if (state.literal) {
				for (let L = 1; L <= 9; ++L) {
					if (state.index + L > input.length) break;
					const chunk = `${L}${input.slice(state.index, state.index + L)}`;
					yield [{ index: state.index + L, literal: !state.literal, output: state.output + chunk, lastChunk: chunk }, chunk.length, chunk];
				}
			} else {
				outer: for (let L = 9; L >= 1; --L) {
					if (state.index + L > input.length) continue;
					dist: for (let distance = 1; distance <= 9; ++distance) {
						if (distance > state.index) break;
						for (let i = 0; i < L; ++i) {
							if (input[state.index - distance + (i % distance)] !== input[state.index + i]) {
								continue dist; 
							}
						}
						const chunk = `${L}${distance}`;
						yield [{ index: state.index + L, literal: !state.literal, output: state.output + chunk, lastChunk: chunk }, chunk.length, chunk];
						break outer;
					}
				}
			}
			if (state.lastChunk !== '0') {
				const chunk = '0';
				yield [{ index: state.index, literal: !state.literal, output: state.output + chunk, lastChunk: chunk }, chunk.length, chunk];
			}
		},
		heuristic: (state) => 2 * Math.ceil((input.length - state.index) / 9)
	});
	if (!found) { return ''; }
	return path!.join('');
}

/**
 * Encryption I: Caesar Cipher
 */
function encryption1(ns: NS, input: [string, number]): string {
	let [str, shift] = input;
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	return str.split('').map(char => {
		let n = alphabet.indexOf(char);
		if (n === -1) return char;
		n = (n + 26 - shift) % 26;
		return alphabet[n];
	}).join('');
}

/** 
 * Encryption II: Vigenère Cipher
 */
function encryption2(ns: NS, input: [string, string]): string {
	let [str, keyword] = input;
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	return str.split('').map((char, i) => {
		let n = alphabet.indexOf(char);
		if (n === -1) return char;
		const keyChar = keyword[i % keyword.length];
		const k = alphabet.indexOf(keyChar);
		n = (n + k) % 26;
		return alphabet[n];
	}).join('');
}


function memo<TArgs extends any[], TResult>(fn: (...args: TArgs) => TResult): (...args: TArgs) => TResult {
	const map = new Map();
	return (...args: TArgs) => {
		const key = JSON.stringify(args);
		if (map.has(key)) {
			return map.get(key);
		} else {
			const result = fn(...args);
			map.set(key, result);
			return result;
		}
	};
}

async function astar<TNode, TEdge>(ns: NS, options: {
	start: TNode,
	isGoal: (node: TNode) => boolean,
	key?: (node: TNode) => string,
	heuristic?: (node: TNode) => number,
	neighbors: (node: TNode) => Iterable<[TNode, number, TEdge]>
}): Promise<({ found: boolean, cost?: number, path?: TEdge[] })> {
	let { start, isGoal, key, heuristic, neighbors } = options;

	if (!key) key = x => String(x);
	if (!heuristic) heuristic = () => 0;

	const keyStart = key(start);

	const scores = new Map();
	scores.set(keyStart, 0);

	const parents = new Map();
	const edges = new Map();

	const openSet = new PriorityQueue<TNode>();
	openSet.push(start, heuristic(start));

	let t = performance.now();

	while (openSet.length) {
		const current = openSet.pop()!;
		const keyCurrent = key(current);
		if (isGoal(current)) {
			const path = [];
			for (let k = keyCurrent; k !== keyStart; k = parents.get(k)) {
				const edge = edges.get(k);
				path.unshift(edge);
			}
			return {
				found: true,
				cost: scores.get(keyCurrent),
				path,
			};
		}
		const scoreCurrent = scores.get(keyCurrent);
		for (const [neighbor, cost, edge] of neighbors(current)) {
			const keyNeighbor = key(neighbor);
			const scoreNeighbor = scoreCurrent + cost;
			if (!scores.has(keyNeighbor) ||
				scores.get(keyNeighbor) > scoreNeighbor
			) {
				scores.set(keyNeighbor, scoreNeighbor);
				parents.set(keyNeighbor, keyCurrent);
				edges.set(keyNeighbor, edge);
				openSet.push(neighbor, scoreNeighbor + heuristic(neighbor));
			}
		}

		if (performance.now() - t > 10) {
			await new Promise(resolve => requestAnimationFrame(resolve));
			t = performance.now();
		}
	}
	return { found: false };
}

class PriorityQueue<T> {
	data: T[];
	priorities: number[];
	length: number;

	constructor() {
		this.data = [];
		this.priorities = [];
		this.length = this.data.length;
	}

	push(item: T, priority: number): void {
		let index = this.priorities.findIndex(p => p > priority);
		if (index === -1) {
			index = this.priorities.length;
		}
		this.data.splice(index, 0, item);
		this.priorities.splice(index, 0, priority);
		this.length = this.data.length;
	}

	pop(): T | undefined {
		const result = this.data.shift();
		this.priorities.shift();
		this.length = this.data.length;
		return result;
	}
}
