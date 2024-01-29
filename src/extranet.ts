import { NS, Server, Player, BitNodeMultipliers } from '@ns';
import { allRootedHosts } from './lib/traverse';

const CONFIG_FILE = 'config/extranet.txt';
const HACK_SCRIPT = 'hack/hack.js';
const GROW_SCRIPT = 'hack/grow.js';
const WEAKEN_SCRIPT = 'hack/weaken.js';

const HACK_SEC_INCREASE = 0.002;
const GROW_SEC_INCREASE = 0.004;
const WEAKEN_SEC_DECREASE = 0.05;
const GW_RATIO = GROW_SEC_INCREASE / WEAKEN_SEC_DECREASE;
const HW_RATIO = HACK_SEC_INCREASE / WEAKEN_SEC_DECREASE;

interface Config {
	target: string;
	hackPercent: number;
	maxBatches: number;
	msPerFrame: number;
	reservedMemory: Record<string, number>;
}

interface Context {
	ns: NS;
	config: Config;
	prep: boolean;
	server: Server;
	player: Player;
	hostsAvail: HostRam[];
	pids: Set<number>;
	scriptSize: {
		hack: number;
		grow: number;
		weaken: number;
	}
	uploadedTo: Set<string>;
	bitnodeMultipliers: BitNodeMultipliers;
}

interface BatchProcess {
	type: 'hack' | 'grow' | 'weaken';
	hostname: string;
	threads: number;
}

interface HostRam {
	hostname: string;
	avail: number;
}

export async function main(ns: NS) {
	ns.disableLog('ALL');

	const args = ns.flags([
		['prep', false],
	]);

	const ctx = {
		ns,
		prep: args['prep'],
		pids: new Set(),
		scriptSize: {
			'hack': ns.getScriptRam(HACK_SCRIPT),
			'grow': ns.getScriptRam(GROW_SCRIPT),
			'weaken': ns.getScriptRam(WEAKEN_SCRIPT),
		},
		uploadedTo: new Set(),
		bitnodeMultipliers: ns.getBitNodeMultipliers(),
	} as Context;

	ns.atExit(() => {
		for (const pid of ctx.pids) {
			ns.kill(pid);
		}
	});

	while (true) {
		ctx.config = JSON.parse(ns.read(CONFIG_FILE));
		ctx.player = ns.getPlayer();
		ctx.hostsAvail = getAvailableRam(ctx);
		const target = ctx.config.target === 'auto' ?
			getOptimalTargetServer(ctx) :
			ctx.config.target;
		ctx.server = ns.getServer(target);
		ns.print(`INFO ${ctx.server.hostname} | Sec ${ctx.server.hackDifficulty!.toFixed(3)}/${ctx.server.minDifficulty} | \$${(ctx.server.moneyAvailable! / ctx.server.moneyMax! * 100).toFixed(1)}%`);
		let batchCount = 0;
		let batchProfit = 0;
		let frameStart = performance.now();
		const batchTime = ns.formulas.hacking.weakenTime(ctx.server, ctx.player);
		ns.print('Scheduling batches...');

		const batchTypes = {
			'weaken': 0,
			'grow': 0,
			'hack': 0,
		};
		while (true) {
			let prepped = true;
			if (ctx.server.hackDifficulty! > ctx.server.minDifficulty!) {
				const batch = calculateWBatch(ctx);
				if (!(batch && runBatch(ctx, batch))) break;
				++batchCount;
				++batchTypes['weaken'];
				prepped = false;
			} else if (ctx.server.moneyAvailable! < ctx.server.moneyMax!) {
				const batch = calculateGWBatch(ctx);
				if (!(batch && runBatch(ctx, batch))) break;
				++batchCount;
				++batchTypes['grow'];
				prepped = false;
			} else if (args['prep'] && prepped) {
				ns.print(`Prep complete.`);
				ns.exit();
			} else {
				const batch = calculateHWGWBatch(ctx);
				if (!batch) break;
				if (!runBatch(ctx, batch.processes)) break;
				++batchCount;
				++batchTypes['hack'];
				batchProfit += batch.estimatedProfit;
			}

			if (batchCount >= ctx.config.maxBatches) {
				break;
			} else if (performance.now() - frameStart > ctx.config.msPerFrame) {
				await new Promise(resolve => { requestAnimationFrame(resolve); });
				frameStart = performance.now();
			}

			if (batchCount % 10000 === 0) {
				ns.print(`Batches scheduled: ${batchCount}, continuing...`);
			}
		}

		if (batchCount > 0) {
			const batchTypeStr = [
				batchTypes['weaken'] > 0 && `W: ${batchTypes.weaken}`,
				batchTypes['grow'] > 0 && `GW: ${batchTypes.grow}`,
				batchTypes['hack'] > 0 && `HWGW: ${batchTypes.hack}`,
			].filter(Boolean).join(', ');
			ns.print(`Batches scheduled: ${batchCount} (${batchTypeStr}), finishing in ${(batchTime/1000).toFixed(1)}s (${new Date(Date.now() + batchTime).toLocaleTimeString()}). Estimated profit: \$${ns.formatNumber(batchProfit)}`);
			await ns.asleep(batchTime + 200);
		} else {
			ns.print(`ERROR No batches were scheduled. Not enough RAM?`);
			await ns.asleep(1000);
		}

		while (true) {
			for (const pid of ctx.pids) {
				if (!ns.isRunning(pid)) {
					ctx.pids.delete(pid);
				}
			}
			if (ctx.pids.size === 0) break;
			await ns.asleep(1000);
		}
	}
}

function getOptimalTargetServer(ctx: Context) {
	const { ns, player } = ctx;
	const servers = [];
	for (const hostname of allRootedHosts(ns)) {		
		const server = ns.getServer(hostname);
		server.moneyAvailable = server.moneyMax;
		server.hackDifficulty = server.minDifficulty;
		const chance = ns.formulas.hacking.hackChance(server, player);
		const weakenTime = ns.formulas.hacking.weakenTime(server, player);
		const hackPercentPerThread = ns.formulas.hacking.hackPercent(server, player);
		if (hackPercentPerThread > 0 && server.moneyMax! > 0) {
			const h = Math.floor(0.25 / hackPercentPerThread);
			const wh = Math.ceil(h * HACK_SEC_INCREASE / WEAKEN_SEC_DECREASE);
			const g = calculateGrowThreadsToReplenish(ns, server, player, h * hackPercentPerThread);
			const wg = Math.ceil(g * GROW_SEC_INCREASE / WEAKEN_SEC_DECREASE);
			const profitPerThread = h * hackPercentPerThread * server.moneyMax! * chance / (h + wh + g + wg);
			const profitPerThreadMs = profitPerThread / weakenTime;
			servers.push({ hostname, profitPerThreadMs });
		}
	}
	servers.sort((a, b) => b.profitPerThreadMs - a.profitPerThreadMs);
	return servers[0].hostname;
}

function calculateWBatch(ctx: Context): BatchProcess[] | false {
	const { ns, server, player } = ctx;
	const maxAvail = Math.max(...ctx.hostsAvail.map(x => x.avail));

	const w = Math.min(
		Math.ceil((server.hackDifficulty! - server.minDifficulty!) / WEAKEN_SEC_DECREASE),
		Math.floor(maxAvail / ctx.scriptSize['weaken']),
	);
	if (w === 0) return false;

	const allocations = allocate(ctx, [
		w * ctx.scriptSize['weaken'],
	]);
	if (!allocations) {
		return false;
	}

	const [wHostname] = allocations;

	server.hackDifficulty = Math.max(
		server.minDifficulty!,
		server.hackDifficulty! - w * WEAKEN_SEC_DECREASE,
	);

	player.exp.hacking += w * ns.formulas.hacking.hackExp(server, player);
	player.skills.hacking = ns.formulas.skills.calculateSkill(player.exp.hacking, player.mults.hacking * ctx.bitnodeMultipliers.HackingLevelMultiplier);
	
	return [
		{ type: 'weaken', hostname: wHostname, threads: w }
	];
}

function calculateGWBatch(ctx: Context): BatchProcess[] | false {
	const { ns, server, player } = ctx;
	const maxAvail = Math.max(...ctx.hostsAvail.map(x => x.avail));
	let g = Math.min(
		ns.formulas.hacking.growThreads(server, player, server.moneyMax!),
		Math.floor(maxAvail / ctx.scriptSize['grow']),
	);
	while (g > 0) {
		const w = Math.ceil(g * GW_RATIO);

		const allocations = allocate(ctx, [
			g * ctx.scriptSize['grow'],
			w * ctx.scriptSize['weaken'],
		]);
		if (!allocations) {
			--g;
			continue;
		}

		const [gHostname, wHostname] = allocations;

		server.moneyAvailable = Math.min(
			server.moneyMax!,
			server.moneyAvailable! * ns.formulas.hacking.growPercent(server, g, player));

		player.exp.hacking += (g + w) * ns.formulas.hacking.hackExp(server, player);
		player.skills.hacking = ns.formulas.skills.calculateSkill(player.exp.hacking, player.mults.hacking * ctx.bitnodeMultipliers.HackingLevelMultiplier);

		return [
			{ type: 'grow', hostname: gHostname, threads: g },
			{ type: 'weaken', hostname: wHostname, threads: w },
		];
	}
	return false;
}

function calculateHWGWBatch(ctx: Context): { processes: BatchProcess[], estimatedProfit: number } | false {
	const { ns, server, player } = ctx;
	const maxAvail = Math.max(...ctx.hostsAvail.map(x => x.avail));
	const hackPercentPerThread = ns.formulas.hacking.hackPercent(server, player);
	let h = Math.min(
		Math.floor(ctx.config.hackPercent / hackPercentPerThread),
		Math.floor(maxAvail / ctx.scriptSize['hack']),
	);
	while (h > 0) {
		const prevHackingExp = player.exp.hacking;
		const prevHackingSkill = player.skills.hacking;

		const wh = Math.ceil(h * HW_RATIO);

		player.exp.hacking += (h + wh) * ns.formulas.hacking.hackExp(server, player);
		player.skills.hacking = ns.formulas.skills.calculateSkill(player.exp.hacking, player.mults.hacking * ctx.bitnodeMultipliers.HackingLevelMultiplier);

		const g = calculateGrowThreadsToReplenish(ns, server, player, hackPercentPerThread * h);
		const wg = Math.ceil(g * GW_RATIO);

		player.exp.hacking += (g + wg) * ns.formulas.hacking.hackExp(server, player);
		player.skills.hacking = ns.formulas.skills.calculateSkill(player.exp.hacking, player.mults.hacking * ctx.bitnodeMultipliers.HackingLevelMultiplier);

		const allocations = allocate(ctx, [
			h * ctx.scriptSize['hack'],
			wh * ctx.scriptSize['weaken'],
			g * ctx.scriptSize['grow'],
			wg * ctx.scriptSize['weaken'],
		]);
		if (!allocations) {
			player.exp.hacking = prevHackingExp;
			player.skills.hacking = prevHackingSkill;
			--h;
			continue;
		}

		const [hHostname, whHostname, gHostname, wgHostname] = allocations;

		return {
			processes: [
				{ type: 'hack', hostname: hHostname, threads: h },
				{ type: 'weaken', hostname: whHostname, threads: wh },
				{ type: 'grow', hostname: gHostname, threads: g },
				{ type: 'weaken', hostname: wgHostname, threads: wg },
			],
			estimatedProfit: h * hackPercentPerThread * server.moneyMax!,
		};
	}
	return false;
}

function getAvailableRam(ctx: Context): HostRam[] {
	const { ns } = ctx;
	const result = [] as HostRam[];
	for (const hostname of allRootedHosts(ns)) {
		const max = ns.getServerMaxRam(hostname);
		const used = ns.getServerUsedRam(hostname);
		const avail = max - used;
		if (avail > 0) {
			result.push({ hostname, avail });
		}
	}
	return result;
}

function allocate(ctx: Context, sizes: number[]) {
	const { hostsAvail } = ctx;
	const allocated = structuredClone(ctx.config.reservedMemory);
	const result = [] as string[];
	const sorted = sizes.map((size, index) => ({ size, index }))
		.sort((a, b) => b.size - a.size);
	for (const { size, index } of sorted) {
		const potentialHosts = hostsAvail.filter(host => host.avail - (allocated[host.hostname] ?? 0) >= size);
		if (!potentialHosts.length) return false;
		potentialHosts.sort((a, b) =>
			(a.avail - (allocated[a.hostname] ?? 0)) -
			(b.avail - (allocated[b.hostname] ?? 0)));
		const bestHost = potentialHosts[0];
		result[index] = bestHost.hostname;
		allocated[bestHost.hostname] = (allocated[bestHost.hostname] ?? 0) + size;
	}

	for (let i = 0; i < sizes.length; ++i) {
		hostsAvail.find(host => host.hostname === result[i])!.avail -= sizes[i];
	}

	return result;
}

function calculateGrowThreadsToReplenish(ns: NS, server: Server, player: Player, stealPercentage: number) {
	const tmp = server.moneyAvailable;
	server.moneyAvailable = server.moneyMax! * (1 - stealPercentage);
	const result = ns.formulas.hacking.growThreads(server, player, server.moneyMax!);
	server.moneyAvailable = tmp;
	return result;
}

function runBatch(ctx: Context, batch: BatchProcess[]) {
	const { ns, server } = ctx;
	const hackTime = ns.getHackTime(server.hostname);
	const growTime = ns.getGrowTime(server.hostname);
	const weakenTime = ns.getWeakenTime(server.hostname);

	const pids = batch.map(proc => {
		updateHostScripts(ctx, proc.hostname);
		switch (proc.type) {
			case 'hack':
				return ns.exec(HACK_SCRIPT, proc.hostname, proc.threads, server.hostname, '--additionalMsec', weakenTime - hackTime);
			case 'grow': 
				return ns.exec(GROW_SCRIPT, proc.hostname, proc.threads, server.hostname, '--additionalMsec', weakenTime - growTime);
			case 'weaken':
				return ns.exec(WEAKEN_SCRIPT, proc.hostname, proc.threads, server.hostname);
			default:
				throw new Error('invalid proc type');
		}
	});

	if (pids.some(pid => pid === 0)) {
		ns.print(`ERROR batch failed to exec`);
		for (const pid of pids) {
			if (pid !== 0) {
				ns.kill(pid);
			}
		}
		return false;
	} else {
		for (const pid of pids) {
			ctx.pids.add(pid);
		}
		return true;
	}
}

function updateHostScripts(ctx: Context, hostname: string) {
	const { ns } = ctx;
	if (!ctx.uploadedTo.has(hostname)) {
		ns.scp(HACK_SCRIPT, hostname);
		ns.scp(GROW_SCRIPT, hostname);
		ns.scp(WEAKEN_SCRIPT, hostname);
		ctx.uploadedTo.add(hostname);
	}
}
