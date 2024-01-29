import { NS } from '@ns';

export async function main(ns: NS) {
	const cmd = ns.args[0] || 'asleep';

	switch (cmd) {
		case 'asleep': {
			ns.tprint('Testing ns.asleep(250)');
			let last = performance.now();
			while (true) {
				await ns.asleep(250);
				const next = performance.now();
				ns.tprint(`${next} - +${next - last}`);
				last = next;
			}
		}

		case 'raf': {
			ns.tprint('Testing requestAnimationFrame()');
			let last = performance.now();
			let i = 0;
			requestAnimationFrame(loop);
			function loop() {
				++i;
				const next = performance.now();
				if (next - last >= 250) {
					ns.tprint(`${next} - +${next - last} - ${i} frames`);
					last = next;
					i = 0;
				}
				requestAnimationFrame(loop);
			}
			await new Promise(() => {});
		}
	}
}
