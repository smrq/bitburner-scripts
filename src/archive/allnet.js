import { thalloc, thown, thfree, thavail, thupdate } from './thalloc.js';

/**
 * @typedef {object} Operation
 * @property {"h"|"g"|"w"} type
 * @property {number} threads
 * @property {number} tExec
 * @property {Allocation[]} allocations
 *
 * @typedef {object} Allocation
 * @property {string} id
 * @property {string} hostname
 * @property {number} pid
 * @property {number} ram
 * @property {number} threads
 */

const STEAL_PERCENTAGE = 0.75;
const SKEW_TIME = 500;
const BATCH_SKEW_TIME = 200;

const START_TIME_DELAY = 150; // time from now until when the scheduler is allowed to schedule an operation
const EXEC_TIME_WINDOW = 250; // the runner can run an operation up to this amount before its scheduled time
const EXEC_TIME_FALLOFF = 0.5; // the runner will delay by (the time until start * this value)

const GROW_SCRIPT = 'hack/grow.js';
const HACK_SCRIPT = 'hack/hack.js';
const WEAKEN_SCRIPT = 'hack/weaken.js';
const SCRIPT_SIZE = 1.75; // TODO optimize hack

/** @param {NS} ns */
export async function main(ns) {
	ns.disableLog('ALL');

	const args = ns.flags([
		['home', false],
		['prep', false],
		['single', false],
		['execDebug', false],
	]);
	const [target] = args._;
	if (target == null) {
		ns.tprint('ERROR usage: allnet.js [--home] [--prep] [target]');
		ns.exit();
	}
	if (args.execDebug) {
		ns.enableLog('exec');
	}

	thupdate(ns);

	let tExec = 0;
	let batchId = 1;
	let showRamWarning = true;

	let planComplete = false;
	while (!planComplete) {
		/** @type Operation[] */
		let ops;
		[ops, planComplete] = calculatePrepOperations(ns, target);
		if (ops.length) {
			setOperationSchedule(ns, target, ops, tExec);
			if (!allocateOperations(ns, ops)) {
				ns.print(`ERROR failed to allocate ram (${ops.reduce((acc, { threads }) => acc + threads, 0)} blocks requested)`);
				ns.exit();
			}
			const batchPromise = runOperations(ns, target, ops, batchId++);
			tExec = ops.at(-1).tExec + BATCH_SKEW_TIME;

			if (args.single || args.prep || !planComplete) {
				await batchPromise;
			} else {
				await ns.asleep(tExec - Date.now() - ns.getWeakenTime(target));
			}

			if (args.prep) {
				ns.exit();
			}
		}
	}

	while (true) {
		let ops = calculateBatchOperations(ns, target);
		let batchPromise;
		if (ops.length) {
			setOperationSchedule(ns, target, ops, tExec);
			if (!allocateOperations(ns, ops, args.home)) {
				if (showRamWarning) {
					ns.print(`WARN failed to allocate ram (${ops.reduce((acc, { threads }) => acc + threads, 0)} blocks requested): ${e.message}`);
					showRamWarning = false;
				}
			} else {
				batchPromise = runOperations(ns, target, ops, batchId++);
				showRamWarning = true;
			}
			tExec = ops.at(-1).tExec + BATCH_SKEW_TIME;
		}

		if (args.single && batchPromise) {
			await batchPromise;
		} else {
			await ns.asleep(tExec - Date.now() - ns.getWeakenTime(target));
		}
	}
}

/**
 * @param {NS} ns
 * @param {string} target
 * @returns {[Operation[], boolean]}
 */
function calculatePrepOperations(ns, target) {
	const ops = [];
	const server = ns.getServer(target);
	let maxThreads = thavail(ns, SCRIPT_SIZE);
	let planComplete = true;

	ns.print(`INFO | Sec ${server.hackDifficulty}/${server.minDifficulty} | \$${(server.moneyAvailable / server.moneyMax * 100).toFixed(2)}% | ${maxThreads} blocks free`);

	if (server.hackDifficulty > server.minDifficulty) {
		let w = Math.ceil((server.hackDifficulty - server.minDifficulty) / 0.05);
		if (w > maxThreads) {
			w = maxThreads;
			planComplete = false;
		}
		maxThreads -= w;
		ops.push({ type: 'w', threads: w });
	}

	if (server.moneyAvailable < server.moneyMax) {
		let g, w;
		for (g = Math.ceil(ns.growthAnalyze(target, server.moneyMax / server.moneyAvailable)); g > 0; --g) {
			w = Math.ceil(ns.growthAnalyzeSecurity(g) / 0.05);
			if (g + w <= maxThreads) {
				break;
			} else {
				planComplete = false;
			}
		}
		if (g > 0) {
			ops.push({ type: 'g', threads: g });
			ops.push({ type: 'w', threads: w });
		} else {
			planComplete = false;
		}
	}

	return [ops, planComplete];
}

/** @param {NS} ns */
function calculateBatchOperations(ns, target) {
	const maxThreads = thavail(ns, SCRIPT_SIZE);
	const ops = [];
	let h, hw, g, gw;
	for (h = Math.floor((1 - STEAL_PERCENTAGE) / ns.hackAnalyze(target)); h > 0; --h) {
		hw = Math.ceil(ns.hackAnalyzeSecurity(h) / 0.05);
		g = Math.ceil(ns.growthAnalyze(target, 1 / STEAL_PERCENTAGE));
		gw = Math.ceil(ns.growthAnalyzeSecurity(g) / 0.05);
		if (h + hw + g + gw <= maxThreads) {
			break;
		}
	}
	if (h > 0) {
		ops.push({ type: 'h', threads: h });
		ops.push({ type: 'w', threads: hw });
		ops.push({ type: 'g', threads: g });
		ops.push({ type: 'w', threads: gw });
	}
	return ops;
}

/** @param {NS} ns */
function setOperationSchedule(ns, target, ops, tExec) {
	for (let i = 0; i < ops.length; ++i) {
		ops[i].tExec = tExec + i * SKEW_TIME;
	}
	const tStart = Math.min(...ops.map(op => op.tExec - getOperationTime(ns, target, op)));
	const minStartTime = Date.now() + START_TIME_DELAY;
	if (tStart < minStartTime) {
		const delay = minStartTime - tStart;
		for (let op of ops) {
			op.tExec += delay;
		}
	}
}

/** @param {NS} ns */
function allocateOperations(ns, ops) {
	try {
		for (let op of ops) {
			const allocations = thalloc(ns, SCRIPT_SIZE, op.threads);
			if (!allocations) throw new Error('insufficient RAM');
			op.allocations = allocations;
		}
		return true;
	} catch (e) {
		for (let op of ops) {
			if (op.allocations) {
				for (let allocation of op.allocations) {
					thfree(ns, allocation.id);
				}
			}
		}
		return false;
	}
}

/** @param {NS} ns */
async function runOperations(ns, target, ops, batchId) {
	ns.print(`Running batch ${batchId}: ${ops.map(op => op.type).join('')} ${ops.map(op => op.threads).join('/')} until ${new Date(ops.at(-1).tExec).toLocaleTimeString()}`);

	let executedOrder = '';
	let executedTypes = '';

	return Promise.all(ops.map((op, i) =>
		runOperation(ns, target, op, batchId, i + 1).then(() => {
			executedOrder += String(i + 1);
			executedTypes += op.type;
		})
	)).then(() => {
		const server = ns.getServer(target);
		ns.print(`Batch ${batchId} done | ${executedTypes} (${executedOrder}) | Sec ${server.hackDifficulty}/${server.minDifficulty} | \$${(server.moneyAvailable / server.moneyMax * 100).toFixed(2)}%`);
	});
}

/** @param {NS} ns */
function getOperationTime(ns, target, op) {
	switch (op.type) {
		case 'g': return ns.getGrowTime(target);
		case 'h': return ns.getHackTime(target);
		case 'w': return ns.getWeakenTime(target);
		default: throw new Error('invalid op type');
	}
}

function getOperationScript(op) {
	switch (op.type) {
		case 'g': return GROW_SCRIPT;
		case 'h': return HACK_SCRIPT;
		case 'w': return WEAKEN_SCRIPT;
		default: throw new Error('invalid op type');
	}
}

/** @param {NS} ns */
async function runOperation(ns, target, op, batchId, opIndex) {
	let runtime;
	while (true) {
		runtime = getOperationTime(ns, target, op);
		const tStart = op.tExec - runtime;
		const delay = tStart - Date.now();
		if (delay > EXEC_TIME_WINDOW) {
			await ns.asleep(Math.floor((delay - EXEC_TIME_WINDOW) * EXEC_TIME_FALLOFF));
		} else if (delay < 0 && op.type === 'h') {
			ns.print(`WARN prevented late execution of ${batchId}.${opIndex} ${op.type} (${delay}ms)`);
			return;
		} else if (delay < 0) {
			ns.print(`WARN late execution of ${batchId}.${opIndex} ${op.type} (${delay}ms)`);
			break;
		} else {
			break;
		}
	}

	const script = getOperationScript(op);
	const pids = op.allocations.map(({ id, hostname, threads }) => {
		ns.scp(script, hostname);
		const pid = ns.exec(script, hostname, threads, target);
		if (pid === 0) {
			ns.print(`ERROR exec failed: ${script} ${target} with t=${threads} on ${hostname}`);
		}
		thown(ns, id, pid);
		return pid;
	});

	await ns.asleep(runtime);

	while (pids.some(pid => ns.isRunning(pid))) {
		await ns.asleep(100);
	}

	for (let allocation of op.allocations) {
		thfree(ns, allocation.id);
	}
}
