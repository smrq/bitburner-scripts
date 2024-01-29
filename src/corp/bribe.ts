import { NSP, nsproxy } from "@/lib/nsproxy";

export async function main(ns: NSP) {
	ns = nsproxy(ns);
	ns.disableLog('ALL');
	const player = ns.getPlayer();
	const ownedAugs = await ns.singularity.getOwnedAugmentations_();
	for (const faction of player.factions) {
		const augs = await ns.singularity.getAugmentationsFromFaction_(faction);
		const newAugs = augs.filter(aug => !ownedAugs.includes(aug));
		if (!newAugs.length) continue;

		const maxRep = Math.max(...await Promise.all(newAugs.map(aug => ns.singularity.getAugmentationRepReq_(aug))));
		const currentRep = await ns.singularity.getFactionRep_(faction);
		const rep = maxRep - currentRep;
		if (rep > 0) {
			const cost = rep * 1e9;
			ns.print(`Bribing ${faction} with \$${ns.formatNumber(cost)}`);
			await ns.corporation.bribe_(faction, cost);
		}
	}
}
