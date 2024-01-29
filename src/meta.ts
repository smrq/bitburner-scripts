import { CrimeType, NS } from '@ns';
import JSON5 from '@/lib/json5';
import { nsproxy, NSP } from '@/lib/nsproxy';
import { allHosts, allPaths } from '@/lib/traverse';

const CONFIG_FILE = 'config/meta.txt';
interface Config {
	updateRate: number;
	modules: {
		autoroot: {
			enable: boolean;
		},
		purchasePrograms: {
			enable: boolean;
			maxSpendRatio: number;
		};
		improveHome: {
			enable: boolean;
			maxSpendRatio: number;
		};
		improvePurchasedServers: {
			enable: boolean;
			maxSpendRatio: number;
		};
		backdoorServers: {
			enable: boolean;
			hostnames: string[];
		};
		joinFactions: {
			enable: boolean;
			factions: string[];
		};
		assignWork: {
			enable: true;
			priority: ({
				type: 'crime';
				crime: CrimeType;
				minimumChance?: number;
				targetKarma?: number;
			} | {
				type: 'faction';
				faction: string;
				targetRep?: number;
				targetFavor?: number;
			})[];
		};
	};
}

const modules = {
	autoroot,
	purchasePrograms,
	improveHome,
	improvePurchasedServers,
	backdoorServers,
	joinFactions,
	assignWork,
};

export async function main(ns: NS) {
	const nsp = nsproxy(ns);

	ns.disableLog('ALL');

	while (true) {
		const config = JSON5.parse(ns.read(CONFIG_FILE)) as Config;
		for (const [name, fn] of Object.entries(modules) as [keyof Config['modules'], Function][]) {
			if (config.modules[name] && config.modules[name].enable) {
				try {
					await fn(nsp, config.modules[name]);
				} catch (e) {
					if (!(e instanceof Error)) throw e;
					ns.print(`ERROR ${e.message}`);
				}
			}
		}
		await ns.asleep(config.updateRate);
	}
}

async function autoroot(ns: NSP, _config: Config['modules']['autoroot']) {
	const hacks = [
		['SQLInject.exe', ns.sqlinject],
		['HTTPWorm.exe', ns.httpworm],
		['relaySMTP.exe', ns.relaysmtp],
		['FTPCrack.exe', ns.ftpcrack],
		['BruteSSH.exe', ns.brutessh],
	] as const;

	const hacksAvail = hacks.filter(([file]) => ns.fileExists(file, 'home'));
	for (const host of allHosts(ns)) {
		if (ns.hasRootAccess(host)) continue;
		if (ns.getServerNumPortsRequired(host) > hacksAvail.length) continue;
		for (let [, fn] of hacksAvail) {
			fn(host);
		}
		ns.nuke(host);
		ns.print(`${host} rooted`);
	}
}

async function purchasePrograms(ns: NSP, config: Config['modules']['purchasePrograms']) {
	const { maxSpendRatio } = config;
	if (await ns.singularity.purchaseTor_()) {
		for (const program of [
			'BruteSSH.exe',
			'FTPCrack.exe',
			'relaySMTP.exe',
			'HTTPWorm.exe',
			'SQLInject.exe',
		]) {
			const cost = await ns.singularity.getDarkwebProgramCost_(program);
			if (cost > 0 && cost / ns.getPlayer().money <= maxSpendRatio) {
				if (await ns.singularity.purchaseProgram_(program)) {
					ns.print(`${program} purchased`);
				}
			}
		}
	}
}

async function improveHome(ns: NSP, config: Config['modules']['improveHome']) {
	const { maxSpendRatio } = config;
	while (1) {
		const cost = await ns.singularity.getUpgradeHomeRamCost_();
		if (!canAfford(ns, cost, maxSpendRatio)) {
			return;
		}
		if (!await ns.singularity.upgradeHomeRam_()) {
			return;
		}
		ns.print(`Upgraded home RAM to ${ns.getServerMaxRam('home')}`);
	}
}

async function improvePurchasedServers(ns: NSP, config: Config['modules']['improvePurchasedServers']) {
	const { maxSpendRatio } = config;

	const purchased = await ns.getPurchasedServers_();
	while (purchased.length < ns.getPurchasedServerLimit()) {
		const ram = 2;

		const cost = ns.getPurchasedServerCost(ram);
		if (!canAfford(ns, cost, 0.05)) {
			return;
		}

		let hostname = `net-${purchased.length}`;
		hostname = await ns.purchaseServer_(hostname, ram);
		if (hostname === '') {
			ns.print(`ERROR Failed to purchase server ${hostname} with ${ram}GB`);
			return;
		}

		ns.print(`Purchased server ${hostname} with ${ram}GB`);
		purchased.push(hostname);
	}

	for (let ram = 4; ram <= ns.getPurchasedServerMaxRam(); ram *= 2) {
		for (let hostname of purchased) {
			const cost = ns.getPurchasedServerUpgradeCost(hostname, ram);
			if (cost <= 0) {
				continue;
			}
			if (!canAfford(ns, cost, maxSpendRatio)) {
				return;
			}
			if (!await ns.upgradePurchasedServer_(hostname, ram)) {
				ns.print(`ERROR Failed to upgrade server ${hostname} to ${ram}GB`);
				return;
			}
			ns.print(`Upgraded server ${hostname} to ${ram}GB`);
		}
	}	
}

async function backdoorServers(ns: NSP, config: Config['modules']['backdoorServers']) {
	const { hostnames } = config;
	const currentHostname = await ns.singularity.getCurrentServer_();
	const hackingLevel = ns.getHackingLevel();
	const paths = allPaths(ns);

	for (const target of hostnames) {
		let server;
		try {
			// This call throws an error for w0r1d_d43m0n if it is not accessible yet.
			// ns.serverExists('w0r1d_d43m0n') still returns true in that case so you can't guard against it.
			server = await ns.getServer_(target);
		} catch (e) {
			continue;
		}
		if (server.hasAdminRights && server.requiredHackingSkill! <= hackingLevel && !server.backdoorInstalled) {
			for (const hostname of paths[target]) {
				await ns.singularity.connect_(hostname);
			}
			ns.print(`Installing backdoor on ${target}...`);
			await ns.singularity.installBackdoor_();
			ns.print(`Installed backdoor on ${target}`);
			for (const hostname of paths[currentHostname]) {
				await ns.singularity.connect_(hostname);
			}
		}
	}
}

async function joinFactions(ns: NSP, config: Config['modules']['joinFactions']) {
	const factions = new Set(config.factions);
	const invitations = await ns.singularity.checkFactionInvitations_();
	for (const faction of invitations.filter(faction => factions.has(faction))) {	
		if (await ns.singularity.joinFaction_(faction)) {
			ns.print(`Joined faction ${faction}`);
		}
	}
}

async function assignWork(ns: NSP, config: Config['modules']['assignWork']) {
	for (const item of config.priority) {
		switch (item.type) {
			case 'crime': {
				const { targetKarma } = item;

				if (targetKarma != null) {
					const karma = ns.heart.break();
					if (karma <= targetKarma) continue;
				}

				const crimes = ['Homicide', 'Mug'] as CrimeType[];
				const crimeStats = await Promise.all(crimes.map(async crime => {
					const chance = await ns.singularity.getCrimeChance_(crime);
					const stats = await ns.singularity.getCrimeStats_(crime);
					const expectedKarma = chance * stats.karma; // positive (higher = more karma loss)
					return {
						crime,
						expectedKarma,
					};
				}));
				crimeStats.sort((a, b) => b.expectedKarma - a.expectedKarma);
				const bestCrime = crimeStats[0];
				assignCrimeWork(ns, bestCrime.crime);
				return;
			}

			case 'faction': {
				const { faction, targetRep, targetFavor } = item;
				const factions = ns.getPlayer().factions;
				if (!factions.includes(faction)) continue;
				if (targetFavor != null) {
					const favor = await ns.singularity.getFactionFavor_(faction);
					const favorGain = await ns.singularity.getFactionFavorGain_(faction)
					if (favor + favorGain >= targetFavor) continue;
				}
				if (targetRep != null) {
					const rep = await ns.singularity.getFactionRep_(faction);
					if (rep >= targetRep) continue;
				}
				assignFactionWork(ns, faction);
				return;
			}
		}
	}
}

async function assignCrimeWork(ns: NSP, crime: CrimeType) {
	const currentWork = await ns.singularity.getCurrentWork_();
	const isAlreadyAssigned = currentWork &&
		currentWork.type === 'CRIME' &&
		currentWork.crimeType === crime;
	if (!isAlreadyAssigned) {
		ns.tprint('CRIME:',crime);
		await ns.singularity.commitCrime_(crime);
	}
}

async function assignFactionWork(ns: NSP, faction: string) {
	const currentWork = await ns.singularity.getCurrentWork_();
	const isAlreadyAssigned = currentWork &&
		currentWork.type === 'FACTION' &&
		currentWork.factionName === faction;
	if (!isAlreadyAssigned) {
		return await ns.singularity.workForFaction_(faction, 'hacking') ||
			await ns.singularity.workForFaction_(faction, 'security') ||
			await ns.singularity.workForFaction_(faction, 'field');
	}
}

function canAfford(ns: NSP, cost: number, maxSpendRatio: number) {
	return cost / ns.getPlayer().money <= maxSpendRatio;
}
