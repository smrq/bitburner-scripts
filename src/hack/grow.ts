import { NS } from '@ns';

export async function main(ns: NS) {
	const args = ns.flags([
		['loop', false],
		['additionalMsec', 0],
		['stock', false],
	]);
	const [hostname] = args['_'] as [string];
	ns.atExit(() => globalThis['document'].__pstermTerminated?.(ns.pid));
	do {
		await ns.grow(hostname, {
			additionalMsec: args['additionalMsec'] as number,
			stock: args['stock'] as boolean,
		});
	} while (args['loop']);
}
