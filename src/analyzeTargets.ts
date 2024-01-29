import { NS } from '@ns';
import { allRootedHosts } from './lib/traverse';
const HACK_SEC_INCREASE = 0.002;
const GROW_SEC_INCREASE = 0.004;
const WEAKEN_SEC_DECREASE = 0.05;
export async function main(ns: NS) {
	const args = ns.flags([
		['sort', 'efficiency']
	]);
	let targets = [] as any[];
	for (const host of allRootedHosts(ns)) {
		const player = ns.getPlayer();
		const server = ns.getServer(host);
		if (server.purchasedByPlayer) {
			continue;
		}
		const money = server.moneyAvailable ?? 0;
		const moneyMax = server.moneyMax ?? 0;
		const sec = server.hackDifficulty ?? Infinity;
		const secMin = server.minDifficulty ?? Infinity;
		const requiredSkill = server.requiredHackingSkill;
		server.moneyAvailable = server.moneyMax;
		server.hackDifficulty = server.minDifficulty;
		const chance = ns.formulas.hacking.hackChance(server, player);
		const weakenTime = ns.formulas.hacking.weakenTime(server, player);
		const hackPercent = ns.formulas.hacking.hackPercent(server, player);
		const xpPerThread = ns.formulas.hacking.hackExp(server, player);
		const xpPerThreadSec = xpPerThread / (weakenTime / 1000);
		const row = {
			host,
			money: (money / moneyMax * 100).toFixed(2) + '%',
			moneyMax,
			sec: sec.toFixed(3),
			secMin,
			skill: requiredSkill,
			chance: chance.toFixed(2),
			time: (weakenTime / 1000).toFixed(2),
			'hack%': (hackPercent * 100).toFixed(4) + '%',
			'xp/thr-s': xpPerThreadSec.toFixed(3),
			h: '' as string | number,
			wh: '' as string | number,
			g: '' as string | number,
			wg: '' as string | number,
			threads: '' as string | number,
			'$/thr-s': '',
		};
		if (hackPercent > 0 && moneyMax > 0) {
			const h = Math.floor(0.25 / hackPercent);
			const stolen = h * hackPercent * moneyMax;
			const wh = Math.ceil(h * HACK_SEC_INCREASE / WEAKEN_SEC_DECREASE);
			server.moneyAvailable = moneyMax * (1 - (h * hackPercent));
			const g = ns.formulas.hacking.growThreads(server, player, moneyMax);
			const wg = Math.ceil(g * GROW_SEC_INCREASE / WEAKEN_SEC_DECREASE);
			const threads = h + wh + g + wg;
			const profitPerThread = stolen / threads;
			const profitPerThreadSec = profitPerThread / (weakenTime / 1000);
			row.h = h;
			row.wh = wh;
			row.g = g;
			row.wg = wg;
			row.threads = threads;
			row['$/thr-s'] = profitPerThreadSec.toFixed(3);
		}
		targets.push(row);
	}
	switch (args.sort) {
		case 'efficiency':
			targets.sort((a, b) => (b['$/thr-s'] ?? 0) - (a['$/thr-s'] ?? 0));
			break;
		case 'exp':
			targets.sort((a, b) => b['xp/thr-s'] - a['xp/thr-s']);
			break;
		case 'money':
			targets.sort((a, b) => b.moneyMax - a.moneyMax);
			break;
	}
	ns.tprint('\n' + table(targets));
	ns.tprint('Finished.');
	function table(arr: any[]) {
		const columns = Object.keys(arr[0]);
		const values = arr.map(row => columns.map(col => String(row[col])));
		const widths = columns.map((col, i) => Math.max(col.length, ...values.map(row => row[i].length)));
		const result = [
			columns.map((col, i) => col.padEnd(widths[i], ' ')).join('|'),
			...values.map(row =>
				columns.map((_, i) => row[i].padEnd(widths[i], ' ')).join('|')
			),
		].join('\n');
		return result;
	}
}
