import { NS } from '@ns';

export async function main(ns: NS) {
	const procName = ns.args[0];
	const procs = ns.ps().filter(x => x.filename === procName);

	let x = 0;
	let y = 0;

	const w = 560;
	const h = 192;
	const margin = 8;

	for (const proc of procs) {
		ns.tail(proc.pid);
		ns.moveTail(x, y, proc.pid);
		ns.resizeTail(w, h, proc.pid);
		y += h + margin;
		if (y >= 768) {
			y = 0;
			x += w + margin;
		}
	}
}