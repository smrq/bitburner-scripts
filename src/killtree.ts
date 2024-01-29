import { NS } from '@ns';
import { allRootedHosts } from './lib/traverse';

export async function main(ns: NS) {
	const args = ns.flags([
		['home', false]
	]);
	for (const hostname of allRootedHosts(ns)) {
		if (hostname === 'home' && !args['home']) {
			continue;
		}
		ns.killall(hostname);
	}
}
