import { NS } from '@ns';

const blue = "\u001b[34m";
const red = "\u001b[31m";
const green = "\u001b[32m";
const reset = "\u001b[0m";

const nestBlank = '    ';
const nestLeaf = ' └─ ';
const nestPipe = ' │  ';
const nestFork = ' ├─ ';

export async function main(ns: NS) {
	const args = ns.flags([
		['all', false]
	]);

	const lines = [] as { text: string, nesting: string[] }[];

	(function traverse(hostname: string, path: string[]) {
		const server = ns.getServer(hostname);

		if (args['all'] || !server.purchasedByPlayer) {
			const rooted = server.hasAdminRights;
			const backdoored = server.backdoorInstalled;
			const minSec = server.minDifficulty;
			const sec = server.hackDifficulty;
			const minSkill = server.requiredHackingSkill;
			const money = server.moneyAvailable ?? 0;
			const maxMoney = server.moneyMax ?? 0;
			const ramUsed = server.ramUsed;
			const maxRam = server.maxRam;
			const moneyPercent = maxMoney === 0 ? '--' : (money / maxMoney * 100).toFixed(2);

			const color = backdoored ? green :
				!rooted ? red :
				!maxMoney ? blue :
				'';
			const text = `${color}${hostname}${reset}   ${ramUsed}/${maxRam}GB used · ${minSkill} hack req · ${sec}/${minSec} sec · \$${moneyPercent}%`;
			const nesting = path.map((_, i) => i === path.length - 1 ? nestLeaf : nestBlank);
			for (let i = lines.length-1; i >= 0; --i) {
				if (lines[i].nesting[path.length-1] === nestBlank) {
					lines[i].nesting[path.length-1] = nestPipe;
				} else if (lines[i].nesting[path.length-1] === nestLeaf) {
					lines[i].nesting[path.length-1] = nestFork;
				} else break;
			}
			lines.push({ text, nesting });
		}

		const children = ns.scan(hostname);
		for (let child of children) {
			if (child === path[0]) continue;
			traverse(child, [hostname, ...path]);
		}
	})('home', []);

	ns.tprint('\n' + lines.map(line => line.nesting.join('') + line.text).join('\n'));
}