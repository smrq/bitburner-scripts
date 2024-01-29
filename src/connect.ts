import { NS } from '@ns';
import { allPaths } from './lib/traverse';

export async function main(ns: NS) {
	const [target] = ns.args as [string];
	const paths = allPaths(ns);
	const path = paths[target];
	if (path) {
		for (const hostname of path) {
			ns.singularity.connect(hostname);
		}
	}
}
