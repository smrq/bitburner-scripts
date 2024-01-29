import { NS } from '@ns';

export async function main(ns: NS) {
	const args = ns.flags([
		['loop', true],
	]);
	ns.atExit(() => globalThis['document'].__pstermTerminated?.(ns.pid));
	do {
		await ns.share();
	} while (args['loop']);
}
