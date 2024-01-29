import { NS } from '@ns';

export async function main(ns: NS) {
	const args = ns.flags([
		['loop', false],
		['additionalMsec', 0],
	]);
	const [hostname] = args['_'] as [string];
	ns.atExit(() => globalThis['document'].__pstermTerminated?.(ns.pid));
	do {
		await ns.weaken(hostname, {
			additionalMsec: args['additionalMsec'] as number,
		});
	} while (args['loop']);
}
