import { thalloc, thown, thavail, thupdate } from './thalloc.js';

/** @param {NS} ns */
export async function main(ns) {
	const [script, ...scriptArgs] = ns.args;
	const ram = ns.getScriptRam(script);
	ns.tprint(ram);
	
	thupdate(ns);
	const avail = thavail(ns, ram);
	ns.tprint(avail);

	const allocations = thalloc(ns, ram, avail);
	ns.tprint(allocations);

	for (const { id, hostname, threads } of allocations) {
		ns.scp(script, hostname);
		const pid = ns.exec(script, hostname, threads, ...scriptArgs);
		thown(ns, id, pid);
	}
}
