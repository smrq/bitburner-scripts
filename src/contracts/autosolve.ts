import { NS } from '@ns';
import { allRootedHosts } from '../lib/traverse';
import { solveFile } from './solutions.js';

export async function main(ns: NS) {
	ns.disableLog('ALL');

	const args = ns.flags([
		['watch', false]
	]);

	const skip = [] as { hostname: string, file: string }[];
	while (true) {
		const contracts = [];
		for (const hostname of allRootedHosts(ns)) {
			const files = ns.ls(hostname, '.cct');
			for (const file of files) {
				contracts.push({ file, hostname });
			}
		}
		for (const { file, hostname } of contracts) {	
			if (skip.some(entry => entry.hostname === hostname && entry.file === file)) {
				continue;
			}
			try {
				const answer = await solveFile(ns, file, hostname);
				const reward = ns.codingcontract.attempt(answer, file, hostname);
				if (reward) {
					ns.print(`${hostname} - ${file} - Success! Reward: ${reward}`);
				} else {
					ns.print(`${hostname} - ${file} - Failed!`);
					skip.push({ hostname, file });
				}
			} catch (e) {
				if (!(e instanceof Error)) throw e;
				ns.print(`${hostname} - ${file} - ${e.message}`);	
			}
		}

		if (!args.watch) {
			break;
		}

		await ns.asleep(1000);
	}
}
