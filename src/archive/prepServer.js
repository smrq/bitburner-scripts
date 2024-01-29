import { traverseRooted } from './lib.js';

const skewTime = 1000;
const growScript = 'hack/growOnce.js';
const weakenScript = 'hack/weakenOnce.js';

/** @param {NS} ns */
export async function main(ns) {
	ns.disableLog('ALL');

	const args = ns.flags([
		['home', false],
	]);
	const [target] = args._;
	if (target == null) {
		ns.tprint('ERROR usage: prepServer.js [--home] [target]');
		ns.exit();
	}

	const { totalSlots, hostSlots } = calculateSlots(ns, args.home);

	const server = ns.getServer(target);
	const player = ns.getPlayer();

	const sec = server.hackDifficulty;
	const minSec = server.minDifficulty;
	const money = server.moneyAvailable;
	const maxMoney = server.moneyMax;

	ns.print(`INFO\nSlots: ${totalSlots}  SecLvl: ${sec.toFixed(3)} / ${minSec}  Money: ${(100 * money / maxMoney).toFixed(2)}%`);

	const stages = [];
	if (sec > minSec) {
		const w = Math.ceil((sec - minSec) / 0.05);
		stages.push(['w', w]);
	}
	if (money < maxMoney) {
		let g;
		if (ns.fileExists('Formulas.exe')) {
			g = Math.ceil(ns.formulas.hacking.growThreads(server, player, Infinity));
		} else {
			g = Math.ceil(ns.growthAnalyze(server.hostname, server.moneyMax / server.moneyAvailable));
		}
		const w = Math.ceil(ns.growthAnalyzeSecurity(g) / 0.05);
		stages.push(['g', g]);
		stages.push(['w', w])
	}

	for (let [type, threads] of stages) {
		ns.print(`${type}: ${threads} threads`);
	}

	if (stages.length) {
		const totalThreads = stages.reduce((acc, [, threads]) => acc + threads, 0);
		if (totalThreads > totalSlots) {
			ns.tprint('ERROR not enough RAM available');
		}

		const allocations = allocateThreads(ns, hostSlots, stages);

		await runBatch(ns, target, allocations);
	}
}

/** @param {NS} ns */
function calculateSlots(ns, includeHome) {
	const growRam = ns.getScriptRam(growScript);
	const weakenRam = ns.getScriptRam(weakenScript);
	const ramPerSlot = Math.max(growRam, weakenRam);

	const hostSlots = [];
	traverseRooted(ns, host => {
		const server = ns.getServer(host);
		const maxRam = server.maxRam;
		const slots = Math.floor(maxRam / ramPerSlot);
		if (slots > 0) {
			hostSlots.push([host, slots]);
		}
	}, includeHome);
	hostSlots.sort((a, b) => b[1] - a[1]);
	const totalSlots = hostSlots.reduce((acc, [, slots]) => acc + slots, 0);
	return { totalSlots, hostSlots };
}

/** @param {NS} ns */
function allocateThreads(ns, hostSlots, stages) {
	let i = 0, used = 0;
	const result = [];
	for (let [type, unallocated] of stages) {
		const hosts = [];
		while (unallocated > 0) {
			const [host, total] = hostSlots[i];
			const avail = total - used;
			if (avail > unallocated) {
				hosts.push([host, unallocated]);
				used += unallocated;
				unallocated = 0;
			} else {
				hosts.push([host, avail]);
				unallocated -= avail;
				i += 1;
				used = 0;
			}
		}
		result.push({ type, hosts });
	}
	return result;
}

function getOperationTime(ns, target, allocation) {
	switch (allocation.type) {
		case 'h': return ns.getHackTime(target);
		case 'w': return ns.getWeakenTime(target);
		case 'g': return ns.getGrowTime(target);
		default: throw new Error('invalid allocation type');
	}
}

function getOperationScript(allocation) {
	switch (allocation.type) {
		case 'h': return hackScript;
		case 'w': return weakenScript;
		case 'g': return growScript;
		default: throw new Error('invalid allocation type');
	}
}

/** @param {NS} ns */
async function runBatch(ns, target, allocations) {
	for (let i = 0; i < allocations.length; ++i) {
		allocations.at(-i).skew = i * skewTime;
	}
	
	const duration = Math.max(...allocations.map(allocation => getOperationTime(ns, target, allocation) + allocation.skew));
	ns.print(`Batch duration: ${(duration/1000).toFixed(0)} sec`);

	const t0 = Date.now();
	const tEnd = t0 + duration;

	for (let allocation of allocations) {
		allocation.tEnd = tEnd - allocation.skew;
	}

	const promises = allocations.map((allocation, i) =>
		runAllocatedScript(ns, target, allocation)
			.then(() => {
				const server = ns.getServer(target);
				ns.print(`${i+1}/${allocations.length} ${allocation.type.toUpperCase()} done | Sec ${server.hackDifficulty}/${server.minDifficulty} | \$${(server.moneyAvailable/server.moneyMax*100).toFixed(2)}%`);
			})
	);
	await Promise.all(promises);
}

/** @param {NS} ns */
async function runAllocatedScript(ns, target, allocation) {
	let runtime;
	while (true) {
		runtime = getOperationTime(ns, target, allocation);
		const tStart = allocation.tEnd - runtime;
		const delay = tStart - Date.now();
		if (delay > 0) {
			await ns.asleep(delay);
		} else {
			break;
		}
	}

	const script = getOperationScript(allocation);
	const pids = allocation.hosts.map(([host, threads]) => {
		ns.scp(script, host);
		const pid = ns.exec(script, host, threads, target);
		if (pid === 0) {
			ns.print(`ERROR process failed: ${script} ${target} @ ${host} x${threads}`);
		}
		return pid;
	});
	await ns.asleep(runtime);
	while (pids.some(pid => ns.isRunning(pid))) {
		await ns.asleep(100);
	}
}
