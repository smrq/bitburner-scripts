import { GangMemberInfo, NS } from "@ns";

type GangMemberStat = 'hack' | 'str' | 'def' | 'dex' | 'agi' | 'cha';

const CONFIG_FILE = 'config/gangman.txt';
const ASCEND_AT_RATIO = 1.2;

export async function main(ns: NS) {
	ns.disableLog('disableLog');
	ns.disableLog('gang.setMemberTask');
	ns.disableLog('gang.setTerritoryWarfare');

	const [equipment] = getEquipmentInfo(ns);
	const basicEquipment = equipment.filter(equip => ['Baseball Bat', 'Katana', 'Glock 18C'].includes(equip.name));

	while (true) {
		const config = JSON.parse(ns.read(CONFIG_FILE));

		while (ns.gang.canRecruitMember()) {
			const index = ns.gang.getMemberNames().length;
			ns.gang.recruitMember(config.names[index]);
		}

		const names = ns.gang.getMemberNames();
		const hasAllRecruits = ns.gang.respectForNextRecruit() === Infinity;

		if (config.enableAscension) {
			for (let name of names) {
				const ascResult = ns.gang.getAscensionResult(name);
				if (ascResult) {
					const stats = ['hack', 'str', 'dex', 'def', 'cha'] as const;
					const ascMultipliers = stats.map(stat => ascResult[stat]);
					const maxMultiplier = Math.max(...ascMultipliers);
					if (maxMultiplier >= ASCEND_AT_RATIO) {
						ns.gang.ascendMember(name);
						ns.print(`Ascended ${name}`);
						ns.toast(`Ascended ${name}`, 'success');
					}
				}
			}
		}

		const equipToBuy = [];
		for (let name of names) {
			const memberInfo = ns.gang.getMemberInformation(name);
			const total = totalStats(memberInfo, ['hack', 'str', 'dex', 'def', 'cha']);
			for (let equip of (total > 1000 ? equipment : basicEquipment).filter(equip => !memberInfo.upgrades.includes(equip.name))) {
				equipToBuy.push({ name, equip });
			}
		}
		equipToBuy.sort((a, b) => a.equip.cost - b.equip.cost);
		for (let { name, equip } of equipToBuy) {
			if (!canAfford(ns, equip.cost, config.maxEquipCostPercent)) {
				break;
			}
			if (!ns.gang.purchaseEquipment(name, equip.name)) {
				break;
			}
		}

		const members = names.map(name => ns.gang.getMemberInformation(name))
			.sort((a, b) => {
				const stats = ['hack', 'str', 'def', 'dex', 'cha'] as GangMemberStat[];
				return totalStats(b, stats) - totalStats(a, stats);
			});

		for (let i = 0; i < members.length; /* increment in body */) {
			const memberInfo = members[i];
			const total = totalStats(memberInfo, ['hack', 'str', 'dex', 'def', 'cha']);
			if (total < 300) {
				ns.gang.setMemberTask(memberInfo.name, 'Train Combat');
				members.splice(i, 1);
			} else if (total < 700) {
				ns.gang.setMemberTask(memberInfo.name, 'Train Combat');
				members.splice(i, 1);
			} else if (memberInfo.earnedRespect < config.memberRespectGoal) {
				ns.gang.setMemberTask(memberInfo.name, 'Terrorism');
				++i;
			} else {
				ns.gang.setMemberTask(memberInfo.name, 'Traffick Illegal Arms');
				++i;
			}
		}

		let vigilanteMembers = 0;
		while (calculateWantedLevelIncrease(ns) > 1 && members.length && vigilanteMembers < config.vigilanteMembers) {
			const member = members.pop()!;
			ns.gang.setMemberTask(member.name, 'Vigilante Justice');
		}

		const clashWinChance = getMinChanceToWinClash(ns);
		ns.gang.setTerritoryWarfare(clashWinChance >= 0.55);
		if (hasAllRecruits && clashWinChance < 0.85 && members.length) {
			const member = members.shift();
			if (member) {
				ns.gang.setMemberTask(member.name, 'Territory Warfare');
			}
		}

		const membersToTrain = Math.ceil(members.length * config.trainMemberPercentage);
		for (let i = 0; i < membersToTrain; ++i) {
			const member = members.pop()!;
			ns.gang.setMemberTask(member.name, 'Train Combat');
		}

		await ns.gang.nextUpdate();
	}
}

function totalStats(memberInfo: GangMemberInfo, stats: GangMemberStat[]) {
	return stats.map(stat => memberInfo[stat]).reduce((a, b) => a + b);
}

function getEquipmentInfo(ns: NS) {
	const allEquipNames = ns.gang.getEquipmentNames();
	const allEquip = allEquipNames.map(name => {
		const cost = ns.gang.getEquipmentCost(name);
		const stats = ns.gang.getEquipmentStats(name);
		const type = ns.gang.getEquipmentType(name);
		return { name, cost, stats, type };
	});
	allEquip.sort((a, b) => a.cost - b.cost);
	const equip = allEquip.filter(x => x.type !== 'Augmentation');
	const aug = allEquip.filter(x => x.type === 'Augmentation');
	return [equip, aug];
}

function getMinChanceToWinClash(ns: NS) {
	const gangInfo = ns.gang.getGangInformation();
	const otherGangInfo = ns.gang.getOtherGangInformation();
	let chance = Infinity;
	for (let [name, info] of Object.entries(otherGangInfo)) {
		if (name === gangInfo.faction) continue;
		if (info.territory === 0) continue;
		chance = Math.min(chance, ns.gang.getChanceToWinClash(name));
	}
	return chance;
}

function calculateWantedLevelIncrease(ns: NS) {
	const gangInfo = ns.gang.getGangInformation();
	return ns.gang.getMemberNames().map(name => {
		const memberInfo = ns.gang.getMemberInformation(name);
		const taskStats = ns.gang.getTaskStats(memberInfo.task);
		const wantedLevelGain = ns.formulas.gang.wantedLevelGain(gangInfo, memberInfo, taskStats);
		return wantedLevelGain
	}).reduce((a, b) => a + b, 0);
}

function canAfford(ns: NS, cost: number, maxSpendRatio: number) {
	return cost / ns.getPlayer().money <= maxSpendRatio;
}
