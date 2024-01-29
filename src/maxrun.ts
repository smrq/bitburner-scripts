import { NS } from '@ns';
import { allRootedHosts } from './lib/traverse';

export async function main(ns: NS) {
	ns.disableLog('ALL');

	let script: string, args: string[], flags: string[];
	const index = ns.args.findIndex(arg => !(typeof arg === 'string' && arg.startsWith('-')));
	if (index === -1) {
		flags = [];
		script = ns.args[0] as string;
		args = ns.args.slice(1) as string[];
	} else {
		flags = ns.args.slice(0, index) as string[];
		script = ns.args[index] as string;
		args = ns.args.slice(index + 1) as string[];
	}

	const ram = ns.getScriptRam(script);
	for (const hostname of allRootedHosts(ns)) {
		if (hostname === 'home' && !flags.includes('--home')) continue;
		const avail = ns.getServerMaxRam(hostname) - ns.getServerUsedRam(hostname);
		const threads = Math.floor(avail / ram);
		if (threads > 0) {
			ns.scp(script, hostname);
			ns.exec(script, hostname, threads, ...args);
		}
	}
}
