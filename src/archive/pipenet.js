import { traverseRooted } from './lib.js';

const skewTime = 250;
const batchSkewTime = 1500;
const hackScript = 'hack/hackOnce.js';
const growScript = 'hack/growOnce.js';
const weakenScript = 'hack/weakenOnce.js';

/** @param {NS} ns */
export async function main(ns) {
	ns.disableLog('ALL');

	const args = ns.flags([
		['home', false],
		['once', false],
	]);
	const [target] = args._;
	if (target == null) {
		ns.tprint('ERROR usage: pipenet.js [--home] [--once] [...targets]');
		ns.exit();
	}

	const maxMoney = ns.getServerMaxMoney(target);
	const minSec = ns.getServerMinSecurityLevel(target);

	while (true) {
		const { totalSlots, hostSlots } = calculateSlots(ns, args.home);
		const sec = ns.getServerSecurityLevel(target);
		const money = ns.getServerMoneyAvailable(target);

		ns.print(`INFO\nSlots: ${totalSlots}  SecLvl: ${sec.toFixed(3)} / ${minSec}  Money: ${(100 * money / maxMoney).toFixed(2)}%`);

		if (sec > minSec) {
			const stages = maximizeWThreads(ns, target, totalSlots);
			const [allocation] = allocateThreads(ns, hostSlots, stages);
			await runWBatch(ns, target, stages, allocation);
		} else if (money < maxMoney) {
			const stages = maximizeGWThreads(ns, target, totalSlots);
			const [allocation] = allocateThreads(ns, hostSlots, stages);
			await runGWBatch(ns, target, stages, allocation);
		} else {
			const stages = maximizeHWGWThreads(ns, target, totalSlots);

			const slotsPerBatch = Object.values(stages).reduce((a, b) => a + b);
			const batchCount = Math.floor(totalSlots / slotsPerBatch);
			ns.print(`Slots/batch: ${slotsPerBatch}  Batch count: ${batchCount}`);

			const allocations = allocateThreads(ns, hostSlots, stages, batchCount);

			const batchPromises = [];
			for (let i = 0; i < allocations.length; ++i) {
				batchPromises.push(runHWGWBatch(ns, target, stages, allocations[i], batchSkewTime * i));
			}
			await Promise.all(batchPromises);
		}
		if (args.once) break;
	}
}

/** @param {NS} ns */
function calculateSlots(ns, includeHome) {
	const hackRam = ns.getScriptRam(hackScript);
	const growRam = ns.getScriptRam(growScript);
	const weakenRam = ns.getScriptRam(weakenScript);
	const ramPerSlot = Math.max(hackRam, growRam, weakenRam);

	ns.print(`Script RAM usage\nH ${hackRam}  G ${growRam}  W ${weakenRam}`);

	const hostSlots = [];
	traverseRooted(ns, host => {
		const maxRam = ns.getServerMaxRam(host);
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
function invertWeaken(ns, dSec) {
	let w = Math.floor(dSec / 0.05);
	while (ns.weakenAnalyze(w) < dSec) {
		++w;
	}
	return w;
}

/** @param {NS} ns */
function maximizeHWGWThreads(ns, target, totalSlots) {
	const stealMultiplier = ns.hackAnalyze(target);
	const maxMoney = ns.getServerMaxMoney(target);
	const maxSteal = target === 'n00dles' ? 0.95 : 0.25;

	let result;
	for (let h = 1; h * stealMultiplier <= maxSteal; ++h) {
		const money = (1 - (h * stealMultiplier)) * maxMoney;
		const multiplier = maxMoney / money;
		const g = Math.ceil(ns.growthAnalyze(target, multiplier));
		const hw = invertWeaken(ns, ns.hackAnalyzeSecurity(h));
		const gw = invertWeaken(ns, ns.growthAnalyzeSecurity(g));
		if (h + hw + g + gw <= totalSlots) {
			result = { h, hw, g, gw };
		} else {
			break;
		}
	}
	return result;
}

/** @param {NS} ns */
function maximizeGWThreads(ns, target, totalSlots) {
	const maxMoney = ns.getServerMaxMoney(target);
	const money = ns.getServerMoneyAvailable(target);

	let result;
	for (let g = Math.ceil(ns.growthAnalyze(target, maxMoney / money)); g > 0; --g) {
		const w = invertWeaken(ns, ns.growthAnalyzeSecurity(g, target));
		if (g + w <= totalSlots) {
			result = { g, w };
			break;
		}
	}
	return result;
}

/** @param {NS} ns */
function maximizeWThreads(ns, target, totalSlots) {
	const minSec = ns.getServerMinSecurityLevel(target);
	const sec = ns.getServerSecurityLevel(target);
	const w = Math.min(totalSlots, invertWeaken(ns, sec - minSec));
	return { w };
}

/** @param {NS} ns */
function allocateThreads(ns, hostSlots, stages, batchCount = 1) {
	let i = 0, used = 0;
	const result = [];
	for (let b = 0; b < batchCount; ++b) {
		const batch = {};
		for (let stage of Object.keys(stages)) {
			batch[stage] = [];
			let unallocated = stages[stage];
			while (unallocated > 0) {
				const [host, total] = hostSlots[i];
				const avail = total - used;
				if (avail > unallocated) {
					batch[stage].push([host, unallocated]);
					used += unallocated;
					unallocated = 0;
				} else {
					batch[stage].push([host, avail]);
					unallocated -= avail;
					i += 1;
					used = 0;
				}
			}
		}
		result.push(batch);
	}
	return result;
}

/** @param {NS} ns */
async function runHWGWBatch(ns, target, stages, allocation, delay) {
	const t0 = Date.now() + delay;
	const duration = Math.max(
		ns.getHackTime(target) + 3*skewTime,
		ns.getWeakenTime(target) + 2*skewTime,
		ns.getGrowTime(target) + skewTime,
	);
	const tEnd = t0 + duration;

	const maxMoney = ns.getServerMaxMoney(target);

	if (!delay) { // lol hack
		ns.print(`INFO running HWGW batch <${stages.h}/${stages.hw}/${stages.g}/${stages.gw}> (${(duration/1000).toFixed(3)}s)`);
	}

	await Promise.all([
		runAllocatedScript(ns, allocation.h, tEnd - 3*skewTime, () => ns.getHackTime(target), hackScript, target)
			.then(() => {
				const money = ns.getServerMoneyAvailable(target);
				const sec = ns.getServerSecurityLevel(target);
				ns.print(`1/4 H done: money ${(money / maxMoney * 100).toFixed(2)}%, sec ${sec.toFixed(3)}`);
			}),
		runAllocatedScript(ns, allocation.hw, tEnd - 2*skewTime, () => ns.getWeakenTime(target), weakenScript, target)
			.then(() => {
				const sec = ns.getServerSecurityLevel(target);
				ns.print(`2/4 HW done: sec ${sec.toFixed(3)}`);
			}),
		runAllocatedScript(ns, allocation.g, tEnd - skewTime, () => ns.getGrowTime(target), growScript, target)
			.then(() => {
				const money = ns.getServerMoneyAvailable(target);
				const sec = ns.getServerSecurityLevel(target);
				ns.print(`3/4 G done: money ${(money / maxMoney * 100).toFixed(2)}%, sec ${sec.toFixed(3)}`);
			}),
		runAllocatedScript(ns, allocation.gw, tEnd, () => ns.getWeakenTime(target), weakenScript, target)
			.then(() => {
				const sec = ns.getServerSecurityLevel(target);
				ns.print(`4/4 GW done: sec ${sec.toFixed(3)}`);
			}),
	]);
}

/** @param {NS} ns */
async function runGWBatch(ns, target, stages, allocation) {
	const t0 = Date.now();
	const duration = Math.max(
		ns.getGrowTime(target) + skewTime,
		ns.getWeakenTime(target),
	);
	const tEnd = t0 + duration;

	const maxMoney = ns.getServerMaxMoney(target);

	ns.print(`INFO running GW batch <${stages.g}/${stages.w}> (${(duration/1000).toFixed(3)}s)`);

	await Promise.all([
		runAllocatedScript(ns, allocation.g, tEnd - skewTime, () => ns.getGrowTime(target), growScript, target)
			.then(() => {
				const money = ns.getServerMoneyAvailable(target);
				const sec = ns.getServerSecurityLevel(target);
				ns.print(`1/2 G done: money ${(money / maxMoney * 100).toFixed(2)}%, sec ${sec.toFixed(3)}`);
			}),
		runAllocatedScript(ns, allocation.w, tEnd, () => ns.getWeakenTime(target), weakenScript, target)
			.then(() => {
				const sec = ns.getServerSecurityLevel(target);
				ns.print(`2/2 W done: sec ${sec.toFixed(3)}`);
			}),
	]);
}

/** @param {NS} ns */
async function runWBatch(ns, target, stages, allocation) {
	const t0 = Date.now();
	const duration = ns.getWeakenTime(target);
	const tEnd = t0 + duration;

	ns.print(`INFO running W batch <${stages.w}> (${(duration/1000).toFixed(3)}s)`);

	await runAllocatedScript(ns, allocation.w, tEnd, () => ns.getWeakenTime(target), weakenScript, target)
		.then(() => {
			const sec = ns.getServerSecurityLevel(target);
			ns.print(`1/1 W done: sec ${sec.toFixed(3)}`);
		});
}

/** @param {NS} ns */
async function runAllocatedScript(ns, allocation, tEnd, getRuntime, script, ...args) {
	let runtime;
	while (true) {
		runtime = getRuntime();
		const tStart = tEnd - runtime;
		const delay = tStart - Date.now();
		if (delay > 0) {
			await ns.asleep(delay);
		} else {
			break;
		}
	}
	const pids = allocation.map(([host, threads]) => {
		ns.scp(script, host);
		const pid = ns.exec(script, host, threads, ...args);
		if (pid === 0) {
			ns.print(`ERROR process failed: ${[script, ...args].join(' ')} @ ${host} x${threads}`);
		}
		return pid;
	});
	await ns.asleep(runtime);
	while (pids.some(pid => ns.isRunning(pid))) {
		await ns.asleep(100);
	}
}
