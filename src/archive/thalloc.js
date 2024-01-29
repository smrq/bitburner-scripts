import { traverseRooted, rpcListen } from './lib.js';

const PORT = 1;
const BLOCK_SIZE = 1.75;
const HOUSEKEEPING_PERIOD = 5000;

/** @param {NS} ns */
export async function main(ns) {
	const args = ns.flags([
		['debug', false],
		['homeReserved', 32],
	]);

	const state = {
		hosts: [],
		pids: new Map(),
		maxBlocks: 0,
		blocksAvailable: 0,
		debug: args.debug,
		homeReserved: args.homeReserved,
	};

	ns.disableLog('ALL');
	ns.clearPort(PORT);

	housekeepingTask(ns, state);

	while (true) {
		await rpcListen(ns, PORT, async req => {
			debugPrint(ns, state, req);
			switch (req.data.type) {
				case 'alloc': {
					const { pid, id, data: { blocks, includeHome }} = req;
					if (state.blocksAvailable < blocks) {
						return null;
					}
					const allocations = allocate(ns, state, id, blocks, includeHome);
					if (allocations) {
						if (!state.pids.has(pid)) {
							state.pids.set(pid, []);
						}
						state.pids.get(pid).push(id);
					}
					return allocations;
				}

				case 'free': {
					const { data: { id }} = req;
					free(ns, state, id);
					return null;
				}

				case 'status': {
					return {
						blocks: { max: state.maxBlocks, available: state.blocksAvailable },
					};
				}
			}
		});
	}
}

/** @param {NS} ns */
async function housekeepingTask(ns, state) {
	while (true) {
		await updateHosts(ns, state);
		await collectGarbage(ns, state);
		await ns.asleep(HOUSEKEEPING_PERIOD);
	}
}

/**
 * @param {NS} ns
 * @param {string} id
 * @param {number} blocks
 */
function allocate(ns, state, id, blocks, includeHome) {
	debugPrint(ns, state, `Allocating ${blocks} blocks (${id})`);

	if (typeof blocks !== 'number' || isNaN(blocks)) {
		return null;
	}

	const result = [];
	for (let hostRecord of state.hosts) {
		if (hostRecord.avail === 0) continue;
		if (hostRecord.host === 'home' && !includeHome) continue;
		const n = Math.min(blocks, hostRecord.avail);
		result.push([hostRecord.host, n]);
		blocks -= n;
		if (blocks === 0) break;
	}

	if (blocks > 0) return null;

	for (let [host, n] of result) {
		const hostRecord = state.hosts.find(hostRecord => hostRecord.host === host);
		state.blocksAvailable -= n;
		hostRecord.avail -= n;
		hostRecord.alloc.set(id, n);
		debugPrint(ns, state, `Allocated ${n} blocks on ${host} (${state.blocksAvailable}/${state.maxBlocks} available) [${id}]`);
	}
	
	return result;
}

/** @param {NS} ns */
function free(ns, state, id) {
	for (let hostRecord of state.hosts) {
		if (hostRecord.alloc.has(id)) {
			const n = hostRecord.alloc.get(id);
			state.blocksAvailable += n;
			hostRecord.avail += n;
			hostRecord.alloc.delete(id);
			debugPrint(ns, state, `Freed ${n} blocks on ${hostRecord.host} (${state.blocksAvailable}/${state.maxBlocks} available) [${id}]`);
		}
	}
}

/** @param {NS} ns */
async function updateHosts(ns, state) {
	debugPrint(ns, state, 'Updating hosts');
	traverseRooted(ns, host => {
		let hostRecord = state.hosts.find(hostRecord => hostRecord.host === host);
		if (!hostRecord) {
			hostRecord = { host, max: 0, avail: 0, alloc: new Map() };
			state.hosts.push(hostRecord);
		}

		let maxRam = ns.getServerMaxRam(host);
		if (host === 'home') {
			maxRam = Math.max(0, maxRam - state.homeReserved);
		}

		const max = Math.floor(maxRam / BLOCK_SIZE);
		if (hostRecord.max !== max) {
			const diff = max - hostRecord.max;
			state.blocksAvailable += diff;
			state.maxBlocks += diff;
			hostRecord.avail += diff;
			hostRecord.max = max;
		}
	}, true);
	state.hosts.sort((a, b) => b.max - a.max);
	debugPrint(ns, state, state.blocksAvailable, ' / ', state.maxBlocks, ' blocks remaining.');
}

/** @param {NS} ns */
async function collectGarbage(ns, state) {
	for (let [pid, ids] of state.pids.entries()) {
		if (ns.isRunning(pid)) continue;
		for (let id of ids) {
			free(ns, state, id);
		}
		state.pids.delete(pid);
	}
	debugPrint(ns, state, state.blocksAvailable, ' / ', state.maxBlocks, ' blocks remaining.');
}

function debugPrint(ns, state, ...msg) {
	if (state.debug) { ns.print(...msg); }
}
