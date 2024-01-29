import { malloc, mavail } from './malloc.js';
import { pstermWait, pstermUpdate } from '../lib/psterm';

const DEBUG = false;

const red = "\u001b[31m";
const green = "\u001b[32m";
const yellow = "\u001b[33m";
const reset = "\u001b[0m";

const H_SEC_INCREASE = 0.002;
const G_SEC_INCREASE = 0.004;
const W_SEC_DECREASE = 0.05;

const GW_RATIO = G_SEC_INCREASE / W_SEC_DECREASE;
const HW_RATIO = H_SEC_INCREASE / W_SEC_DECREASE;

const HACK_SCRIPT = 'hack/hack.js';
const GROW_SCRIPT = 'hack/grow.js';
const WEAKEN_SCRIPT = 'hack/weaken.js';
const H_SCRIPT_SIZE = 1.7;
const GW_SCRIPT_SIZE = 1.75;
const SCRIPT_SIZE = 1.75;

const W_SKEW_TIME = 750;
const HG_SKEW_TIME = 25;
const OOM_DELAY_TIME = 5000;

const TARGET_HACK_PERCENT = 0.25;

/**
 * @typedef {object} Context
 * @property {NS} ns
 * @property {string} target
 * @property {Server} server
 * @property {number} lastExecTime
 * @property {number} maxSecIncrease
 * @property {number} nextBatchId
 * @property {boolean} showedOomMessage
 * @property {Record<number, string>} debugLogs
 * @property {Set<number>} allocatedPids
 * @property {Set<number>} execPids
 * 
 * @typedef {object} Allocation
 * @property {string} hostname
 * @property {number} pid
 * @property {number} ram
 * @property {number} threads
 */

/** @param {NS} ns */
export async function main(ns) {
	ns.disableLog('ALL');
	const args = ns.flags([
		['execDebug', false],
		['force', false],
	]);

	const [target] = args['_'];
	if (target == null) {
		ns.tprint('ERROR usage: allnet.js [target]');
		ns.exit();
	}
	if (args['execDebug']) {
		ns.enableLog('exec');
	}

	const ctx = {
		ns,
		target,
		server: ns.getServer(target),
		lastExecTime: null,
		maxSecIncrease: 0,
		nextBatchId: 1,
		debugLogs: {},
		allocatedPids: new Set(),
		execPids: new Set(),
		metrics: {
			batches: {
				queued: 0,
				total: 0,
				success: 0,
				partial: 0,
				outOfOrder: 0,
			},
			deferred: {
				hOk: 0,
				hLate: 0,
				gOk: 0,
				gLate: 0,
			}
		}
	};
	ctx.lastExecTime = performance.now() + getCurrentRuntime(ctx, 'w') - W_SKEW_TIME;

	pstermUpdate(ns);
	
	checkRamAvailability(ctx, args['force']);

	ns.rm('log/schednet.txt');

	ns.atExit(() => {
		for (const pid of ctx.allocatedPids) {
			ns.kill(pid);
		}
		for (const pid of ctx.execPids) {
			ns.kill(pid);
		}
		for (const log of Object.values(ctx.debugLogs)) {
			ns.write('log/schednet.txt', log + '\n');
		}
		ns.print(`
------------------------------------------------------------
Results for ${target}
------------------------------------------------------------
Queued batches: ${ctx.metrics.batches.queued}
Finished batches: ${ctx.metrics.batches.total}
	${green}${ctx.metrics.batches.success} successful${reset}, ${yellow}${ctx.metrics.batches.partial} partial${reset}, ${red}${ctx.metrics.batches.outOfOrder} out of order${reset}
Deferred events:
	Hack: ${green}${ctx.metrics.deferred.hOk} ok${reset}, ${yellow}${ctx.metrics.deferred.hLate} late${reset}
	Grow: ${green}${ctx.metrics.deferred.gOk} ok${reset}, ${yellow}${ctx.metrics.deferred.gLate} late${reset}
------------------------------------------------------------`);
	});

	await loop(ctx);
}

/** @param {Context} ctx */
async function loop(ctx) {
	const { ns, server } = ctx;
	ns.print(`INFO ${ctx.target} | Sec ${server.hackDifficulty.toFixed(3)}/${server.minDifficulty} | \$${(server.moneyAvailable / server.moneyMax * 100).toFixed(1)}%`);

	let showedOomMessage = false;
	while (true) {
		const execTimeMin = ctx.lastExecTime + W_SKEW_TIME;
		const startTimeMin = execTimeMin - getCurrentRuntime(ctx, 'w');

		if (performance.now() < startTimeMin) {
			const delay = startTimeMin - performance.now();
			await ns.asleep(delay);
		} else {
			let oom = false;
			const avail = mavail(ns, SCRIPT_SIZE);
			if (server.hackDifficulty > server.minDifficulty) {
				const threads = calculateWBatchThreads(ctx, avail);
				if (threads) { scheduleWBatch(ctx, threads); }
				else { oom = true; }
			} else if (server.moneyAvailable < server.moneyMax) {
				const threads = calculateGWBatchThreads(ctx, avail);
				if (threads) { scheduleGWBatch(ctx, threads); }
				else { oom = true; }
			} else {
				const threads = calculateHWGWBatchThreads(ctx, avail);
				if (threads) { await scheduleHWGWBatch(ctx, threads); }
				else { oom = true; }
			}

			if (oom) {
				if (!showedOomMessage) {
					ns.print('Not enough RAM to schedule batch');
					showedOomMessage = true;
				}
				await ns.asleep(OOM_DELAY_TIME);
			} else {
				showedOomMessage = false;
			}
		}
	}
}

function checkRamAvailability(ctx, force) {
	const { ns } = ctx;
	const threads = calculateHWGWBatchThreads(ctx, Infinity);
	const total = threads.h + threads.wh + threads.g + threads.wg;
	const avail = mavail(ns, SCRIPT_SIZE);

	if (total > avail) {
		if (force) {
			ns.print(`WARN Not enough RAM available to run a full batch (${total} requested, ${avail} available)`);
		} else {
			const msg = `ERROR Not enough RAM available to run a full batch (${total} requested, ${avail} available); run with --force to continue`;
			ns.print(msg);
			ns.tprint(msg);
			ns.exit();
		}
	}
}

/**
 * @param {Context} ctx
 * @param {number} avail
 */
function calculateWBatchThreads(ctx, avail) {
	const { server } = ctx;
	let w = Math.ceil((server.hackDifficulty - server.minDifficulty) / W_SEC_DECREASE);
	if (w > avail) {
		w = avail;
	}
	if (w === 0) return false;
	return { w };
}

/**
 * @param {Context} ctx
 * @param {number} avail
 */
function calculateGWBatchThreads(ctx, avail) {
	const { ns, server } = ctx;
	const player = ns.getPlayer();
	let g = ns.formulas.hacking.growThreads(server, player, server.moneyMax);
	if (g * (1 + GW_RATIO) > avail) {
		g = Math.floor(avail / (1 + GW_RATIO));
	}
	const w = Math.ceil(g * GW_RATIO);
	if (g === 0) return false;
	return { g, w };
}

/**
 * @param {Context} ctx
 * @param {number} avail
 */
function calculateHWGWBatchThreads(ctx, avail) {
	const { ns, server } = ctx;
	const moneyInit = server.moneyAvailable;
	const player = ns.getPlayer();
	const hackPercent = ns.formulas.hacking.hackPercent(server, player);
	let h = Math.floor(TARGET_HACK_PERCENT / hackPercent);
	let wh, g, wg;
	while (h > 0) {
		wh = Math.ceil(h * HW_RATIO);
		server.moneyAvailable = server.moneyMax * (1 - (hackPercent * h));
		g = ns.formulas.hacking.growThreads(server, player, server.moneyMax);
		wg = Math.ceil(g * GW_RATIO);
		if (h + wh + g + wg <= avail) break;
		--h;
	}
	server.moneyAvailable = moneyInit;
	if (h === 0) return false;
	return { h, wh, g, wg };
}

/**
 * @param {Context} ctx
 * @param {{ w: number }} threads
 */
function scheduleWBatch(ctx, threads) {
	const { ns, target, server } = ctx;
	const { w } = threads;
	const batchId = ctx.nextBatchId++;
	const allocations = mallocScript(ctx, GW_SCRIPT_SIZE, w, [target, batchId, 'w']);
	ns.print(`Scheduling batch ${batchId}: w`);

	const wInvocation = execScriptImmediate(ctx, allocations, batchId, 'w');

	wInvocation.promise.then(() => {
		ns.print(`${green}Batch ${batchId} finished: w (1) @ t=${performance.now()}${reset}`);
		++ctx.metrics.batches.total;
		++ctx.metrics.batches.success;
	});

	++ctx.metrics.batches.queued;
	ctx.lastExecTime = wInvocation.execTime;
	server.hackDifficulty = Math.max(server.minDifficulty, server.hackDifficulty - w * W_SEC_DECREASE);
}

/**
 * @param {Context} ctx
 * @param {{ g: number; w: number }} threads
 */
function scheduleGWBatch(ctx, threads) {
	const { ns, target, server } = ctx;
	const { g, w } = threads;
	ctx.maxSecIncrease = Math.max(ctx.maxSecIncrease, g * G_SEC_INCREASE);
	const batchId = ctx.nextBatchId++;
	const gAllocations = mallocScript(ctx, GW_SCRIPT_SIZE, g, [target, batchId, 'g']);
	const wAllocations = mallocScript(ctx, GW_SCRIPT_SIZE, w, [target, batchId, 'w']);
	ns.print(`Scheduling batch ${batchId}: gw`);

	let orderType = '';
	let orderNum = '';

	const wInvocation = execScriptImmediate(ctx, wAllocations, batchId, 'w');
	wInvocation.promise.then(() => {
		orderType += 'w';
		orderNum += '2';
	});
	const gExecWindow = [ctx.lastExecTime + HG_SKEW_TIME, wInvocation.execTime - HG_SKEW_TIME];

	execScriptDeferred(ctx, gAllocations, batchId, 'g', gExecWindow).then(gInvocation => {
		++ctx.metrics.deferred.gOk;
		gInvocation.promise.then(() => {
			orderType += 'g';
			orderNum += '1';
		});

		Promise.all([gInvocation.promise, wInvocation.promise]).then(() => {
			const inOrder = orderNum === '12';
			ns.print(`${inOrder ? green : red}Batch ${batchId} finished: ${orderType} (${orderNum}) @ t=${performance.now()}${reset}`);
			++ctx.metrics.batches.total;
			if (inOrder) {
				++ctx.metrics.batches.success;
			} else {
				++ctx.metrics.batches.outOfOrder;
			}
		});
	}).catch(() => {
		++ctx.metrics.deferred.gLate;
		wInvocation.promise.then(() => {
			ns.print(`${yellow}Batch ${batchId} partially finished: ${orderType} (${orderNum}) @ t=${performance.now()}${reset}`);
			++ctx.metrics.batches.total;
			++ctx.metrics.batches.partial;
		});
	});

	++ctx.metrics.batches.queued;
	ctx.lastExecTime = wInvocation.execTime;
	const player = ns.getPlayer();
	server.moneyAvailable = Math.min(server.moneyMax, server.moneyAvailable * ns.formulas.hacking.growPercent(server, g, player));
}

/**
 * @param {Context} ctx
 * @param {{ h: number; wh: number; g: number; wg: number; }} threads
 */
async function scheduleHWGWBatch(ctx, threads) {
	const { ns, target, allocatedPids } = ctx;
	const { h, wh, g, wg } = threads;
	ctx.maxSecIncrease = Math.max(ctx.maxSecIncrease, h * H_SEC_INCREASE, g * G_SEC_INCREASE);
	const batchId = ctx.nextBatchId++;
	const hAllocations = mallocScript(ctx, H_SCRIPT_SIZE, h, [target, batchId, 'h']);
	const whAllocations = mallocScript(ctx, GW_SCRIPT_SIZE, wh, [target, batchId, 'wh']);
	const gAllocations = mallocScript(ctx, GW_SCRIPT_SIZE, g, [target, batchId, 'g']);
	const wgAllocations = mallocScript(ctx, GW_SCRIPT_SIZE, wg, [target, batchId, 'wg']);
	ns.print(`Scheduling batch ${batchId}: hwgw`);

	let orderType = '';
	let orderNum = '';

	const whInvocation = execScriptImmediate(ctx, whAllocations, batchId, 'w');
	whInvocation.promise.then(() => {
		orderType += 'w';
		orderNum += '2';
	});
	const hExecWindow = [ctx.lastExecTime + HG_SKEW_TIME, whInvocation.execTime - HG_SKEW_TIME];

	await ns.asleep(W_SKEW_TIME);

	const wgInvocation = execScriptImmediate(ctx, wgAllocations, batchId, 'w');
	wgInvocation.promise.then(() => {
		orderType += 'w';
		orderNum += '4';
	});
	const gExecWindow = [whInvocation.execTime + HG_SKEW_TIME, wgInvocation.execTime - HG_SKEW_TIME];
	batchLog(ctx, batchId, `hExecWindow: ${hExecWindow.join('-')}`);
	batchLog(ctx, batchId, `whExec: ${whInvocation.execTime}`);
	batchLog(ctx, batchId, `gExecWindow: ${gExecWindow.join('-')}`);
	batchLog(ctx, batchId, `wgExec: ${wgInvocation.execTime}`);

	execScriptDeferred(ctx, gAllocations, batchId, 'g', gExecWindow).then(gInvocation => {
		++ctx.metrics.deferred.gOk;
		gInvocation.promise.then(() => {
			orderType += 'g';
			orderNum += '3';
		});

		execScriptDeferred(ctx, hAllocations, batchId, 'h', hExecWindow).then(hInvocation => {
			++ctx.metrics.deferred.hOk;
			hInvocation.promise.then(() => {
				orderType += 'h';
				orderNum += '1';
			});

			Promise.all([hInvocation.promise, whInvocation.promise, gInvocation.promise, wgInvocation.promise]).then(() => {
				const inOrder = orderNum === '1234';
				ns.print(`${inOrder ? green : red}Batch ${batchId} finished: ${orderType} (${orderNum}) @ t=${performance.now()}${reset}`);
				++ctx.metrics.batches.total;
				if (inOrder) {
					++ctx.metrics.batches.success;
				} else {
					++ctx.metrics.batches.outOfOrder;
				}
			});
		}).catch(() => {
			++ctx.metrics.deferred.hLate;
			for (const allocation of hAllocations) {
				ns.kill(allocation.pid);
				allocatedPids.delete(allocation.pid);
			}
			Promise.all([whInvocation.promise, gInvocation.promise, wgInvocation.promise]).then(() => {
				const inOrder = orderNum === '234';
				ns.print(`${inOrder ? yellow : red}Batch ${batchId} partially finished: ${orderType} (${orderNum}) @ t=${performance.now()}${reset}`);
				++ctx.metrics.batches.total;
				++ctx.metrics.batches.partial;
			});
		});
	}).catch(() => {
		++ctx.metrics.deferred.gLate;
		for (const allocation of hAllocations) {
			ns.kill(allocation.pid);
			allocatedPids.delete(allocation.pid);
		}
		for (const allocation of gAllocations) {
			ns.kill(allocation.pid);
			allocatedPids.delete(allocation.pid);
		}
		Promise.all([whInvocation.promise, wgInvocation.promise]).then(() => {
			const inOrder = orderNum === '24';
			ns.print(`${inOrder ? yellow : red}Batch ${batchId} partially finished: ${orderType} (${orderNum}) @ t=${performance.now()}${reset}`);
			++ctx.metrics.batches.total;
			++ctx.metrics.batches.partial;
		});
	});

	++ctx.metrics.batches.queued;
	ctx.lastExecTime = wgInvocation.execTime;
}

/**
 * @param {Context} ctx
 * @param {number} ram
 * @param {number} threads
 * @param {any[]} noopArgs
 * @returns {Allocation[]}
 */
function mallocScript(ctx, ram, threads, noopArgs) {
	const { ns, allocatedPids } = ctx;
	/** @type Allocation[] */
	const allocations = malloc(ns, ram, threads, noopArgs);
	if (allocations) {
		for (const allocation of allocations) {
			allocatedPids.add(allocation.pid);
		}
	}
	return allocations;
}

/**
 * @param {Context} ctx
 * @param {Allocation[]} allocations
 * @param {string} script
 * @param {string} target
 * @returns {Promise<void>}
 */
function execScript(ctx, allocations, script) {
	const { ns, target, allocatedPids, execPids } = ctx;
	const execResults = allocations.map(allocation => {
		ns.kill(allocation.pid);
		allocatedPids.delete(allocation.pid);

		ns.scp(script, allocation.hostname);
		const pid = ns.exec(script, allocation.hostname, allocation.threads, target);

		if (pid > 0) {
			execPids.add(pid);
			const promise = pstermWait(pid).then(() => {
				execPids.delete(pid);
			});
			return promise;
		} else {
			ns.print(`WARN: exec failed (hostname=${allocation.hostname}, script=${script}, threads=${allocation.threads})`);
			return Promise.reject();
		}
	});
	return Promise.allSettled(execResults);
}

/**
 * @param {Context} ctx
 * @param {Allocation[]} allocations
 * @param {number} batchId
 * @param {"h"|"g"|"w"} type
 * @returns {{ promise: Promise<void>, execTime: number }}
 */
function execScriptImmediate(ctx, allocations, batchId, type) {
	const runtime = getCurrentRuntime(ctx, type);
	const script = getScript(type);
	const promise = execScript(ctx, allocations, script).then(() => {
		batchLog(ctx, batchId, `${type} finished @ endTime=${performance.now()}`);
	});
	const execTime = performance.now() + runtime;
	batchLog(ctx, batchId, `started ${type} thread @ startTime=${performance.now()} until execTime≈${execTime}, current runtime=${runtime})`);
	return { promise, execTime };
}

/**
 * @param {Context} ctx
 * @param {Allocation[]} allocations
 * @param {number} batchId
 * @param {"h"|"g"|"w"} type
 * @param {[number, number]} execWindow
 * @returns {Promise<{ promise: Promise<void>, execTime: number }>}
 */
async function execScriptDeferred(ctx, allocations, batchId, type, execWindow) {
	const { ns, allocatedPids } = ctx;

	let lastEstimatedStart = 0;

	while (true) {
		const maxPotentialRuntime = getMaxPotentialRuntime(ctx, type);
		const minPotentialStart = execWindow[0] - maxPotentialRuntime;
		if (performance.now() < minPotentialStart) {
			lastEstimatedStart = minPotentialStart;
			const delay = minPotentialStart - performance.now();
			batchLog(ctx, batchId, `${type} waiting to exec (t=${performance.now()} < min=${minPotentialStart}, ${delay} ms, potential runtime=${maxPotentialRuntime})`);
			await ns.asleep(delay);
		} else {
			const runtime = getCurrentRuntime(ctx, type);
			const minStart = execWindow[0] - runtime;
			const maxStart = execWindow[1] - runtime;
			if (performance.now() < minStart) {
				const delay = minStart - performance.now();
				batchLog(ctx, batchId, `${type} waiting to exec (t=${performance.now()} < min=${minStart}, ${delay} ms, current runtime=${runtime})`);
				await ns.asleep(delay);
			} else if (performance.now() > maxStart) {
				const late = performance.now() - maxStart;
				const msg = `${type} exec aborted due to late start (t=${performance.now()} > max=${maxStart}, ${late} ms, current runtime=${runtime})`;
				batchLog(ctx, batchId, msg);
				ns.print(`WARN Batch ${batchId}: ${msg}`);
				for (const allocation of allocations) {
					ns.kill(allocation.pid);
					allocatedPids.delete(allocation.pid);
				}
				throw new Error();
			} else {
				const script = getScript(type);
				const promise = execScript(ctx, allocations, script).then(() => {
					batchLog(ctx, batchId, `${type} finished @ endTime=${performance.now()}`);
				});
				const execTime = performance.now() + runtime;
				batchLog(ctx, batchId, `started ${type} thread @ startTime=${performance.now()} until execTime≈${execTime} (${execWindow[0]} <= t <= ${execWindow[1]}), current runtime=${runtime}`);
				return { promise, execTime };
			}
		}
	}
}


/**
 * @param {Context} ctx
 * @param {"h"|"g"|"w"} type
 * @returns {number}
 */
function getCurrentRuntime(ctx, type) {
	const { ns, target } = ctx;
	switch (type) {
		case 'h': return Math.ceil(ns.getHackTime(target));
		case 'g': return Math.ceil(ns.getGrowTime(target));
		case 'w': return Math.ceil(ns.getWeakenTime(target));
		default: throw new Error(`invalid operation type ${type}`);
	}
}

/**
 * @param {Context} ctx
 * @param {"h"|"g"|"w"} type
 * @returns {number}
 */
function getMaxPotentialRuntime(ctx, type) {
	const { ns, server, maxSecIncrease } = ctx;
	const player = ns.getPlayer();

	const secInit = server.hackDifficulty;
	server.hackDifficulty += maxSecIncrease;

	let result;
	switch (type) {
		case 'h':
			result = Math.ceil(ns.formulas.hacking.hackTime(server, player));
			break;
		case 'g':
			result = Math.ceil(ns.formulas.hacking.growTime(server, player));
			break;
		case 'w':
			result = Math.ceil(ns.formulas.hacking.weakenTime(server, player));
			break;
		default: throw new Error(`invalid operation type ${type}`);
	}

	server.hackDifficulty = secInit;
	return result;
}

/**
 * @param {"h"|"g"|"w"} type
 * @returns {string}
 */
function getScript(type) {
	switch (type) {
		case 'h': return HACK_SCRIPT;
		case 'g': return GROW_SCRIPT;
		case 'w': return WEAKEN_SCRIPT;
		default: throw new Error(`invalid operation type ${type}`);
	}
}

/**
 * @param {Context} ctx
 * @param {number} batchId
 * @param {string} message
 */
function batchLog(ctx, batchId, message) {
	if (DEBUG) {
		message = `[${batchId}] ${message}`;
		if (!ctx.debugLogs[batchId]) {
			ctx.debugLogs[batchId] = message + '\n';
		} else {
			ctx.debugLogs[batchId] += message + '\n';
		}
		ctx.ns.print(message);
	}
}
