import { NS } from '@ns';
import { allHosts } from '@/lib/traverse';

export async function main(ns: NS) {
	const hacks = [
		['SQLInject.exe', ns.sqlinject],
		['HTTPWorm.exe', ns.httpworm],
		['relaySMTP.exe', ns.relaysmtp],
		['FTPCrack.exe', ns.ftpcrack],
		['BruteSSH.exe', ns.brutessh],
	] as const;

	let allRooted = false;
	while (!allRooted) {
		allRooted = true;
		const hacksAvail = hacks.filter(([file]) => ns.fileExists(file));
		for (const host of allHosts(ns)) {
			if (ns.hasRootAccess(host)) continue;
			allRooted = false;
			if (ns.getServerNumPortsRequired(host) > hacksAvail.length) continue;
			for (let [, fn] of hacksAvail) {
				fn(host);
			}
			ns.print(`Rooting ${host}`);
			ns.nuke(host);
		}
		await ns.sleep(1000);
	}
	ns.print(`All hosts rooted.`);
}
