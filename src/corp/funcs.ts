import { CityName, CorpStateName, CorpUpgradeName, CorpUnlockName } from "@ns";
import { NSP } from "@/lib/nsproxy";

export const cities = [
	'Aevum',
	'Chongqing',
	'Sector-12',
	'New Tokyo',
	'Ishima',
	'Volhaven',
] as CityName[];

export async function maximizeWorkerStats(ns: NSP, divisionName: string) {
	while (true) {
		let done = true;
		for (const city of cities) {
			const office = ns.corporation.getOffice(divisionName, city);
			if (office.avgEnergy < 99.5) {
				ns.corporation.buyTea(divisionName, city);
				done = false;
			}
			if (office.avgMorale < 99.5) {
				ns.corporation.throwParty(divisionName, city, 500000);
				done = false;
			}
		}
		if (done) break;
		await ns.corporation.nextUpdate();
	}
}

export function buyUpgrade(ns: NSP, upgradeName: CorpUpgradeName, level: number) {
	for (let i = ns.corporation.getUpgradeLevel(upgradeName); i < level; ++i) {
		ns.corporation.levelUpgrade(upgradeName);
	}
	if (ns.corporation.getUpgradeLevel(upgradeName) < level) {
		ns.print(`ERROR Could not upgrade ${upgradeName} to level ${level}`);
	}
}

export function buyAdvert(ns: NSP, divisionName: string, level: number) {
	for (let i = ns.corporation.getHireAdVertCount(divisionName); i < level; ++i) {
		ns.corporation.hireAdVert(divisionName);
	}
	if (ns.corporation.getHireAdVertCount(divisionName) < level) {
		ns.print(`ERROR Could not upgrade AdVert in ${divisionName} to level ${level}`);
	}
}

export function buyUnlock(ns: NSP, unlockName: CorpUnlockName): void {
	if (!ns.corporation.hasUnlock(unlockName)) {
		ns.corporation.purchaseUnlock(unlockName);
	}
}

export async function waitForState(ns: NSP, state: CorpStateName) {
	let currentState: CorpStateName;
	do {
		currentState = await ns.corporation.nextUpdate();
	} while (currentState !== state);
}
