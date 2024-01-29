import { filterAsync } from '@/lib/async';
import JSON5 from '@/lib/json5';
import { NSP, nsproxy } from '@/lib/nsproxy';
import { CityName, CorpEmployeePosition, CorpIndustryName, CorpMaterialName, CorpResearchName, CorpStateName, CorpUnlockName, CorpUpgradeName } from '@ns';
import { bruteforceStorageUpgrades, bruteforceWilsonAdvertUpgrades } from './bruteforce';
import { CITY_NAMES, CORP_EMPLOYEE_POSITIONS } from './constants';
import { calculateOptimalBoostMaterialAmounts, maxAffordableAdvertLevel, maxAffordableOfficeSize, maxAffordableUpgradeLevel, maxAffordableWarehouseLevel } from './formulas';

const CONFIG_FILE = 'config/corpman.txt';

interface MaterialBudgetRatio {
	warehouse: number;
	office: number;
}

interface ProductBudgetRatio {
	rawProduction: number;
	wilsonAdvert: number;
	mainOffice: number;
	supportOffice: number;
	employeeStatUpgrades: number;
	salesBot: number;
	projectInsight: number;
}

interface Config {
	corporationName: string;
	selfFund: boolean;
	agricultureDivisionName: string;
	chemicalDivisionName: string;
	tobaccoDivisionName: string;
	dummyDivisionNamePrefix: string;
	round1: {
		agriculture: {
			employees: number;
			warehouseLevel: number;
			advertLevel: number;
			boostMaterialPercentage: number;
		}
		smartStorageLevel: number;
		smartFactoriesLevel: number;
	};
	round2: {
		agriculture: {
			employees: number;
			warehouseLevel: number;
			advertLevel: number;
			boostMaterialPercentage: number;
			targetRP: number;
		};
		chemical: {
			employees: number;
			warehouseLevel: number;
			advertLevel: number;
			boostMaterialPercentage: number;
			targetRP: number;
		};
		dummyDivisions: number;
		smartStorageLevel: number;
		smartFactoriesLevel: number;
	};
	round3: {
		agriculture: {
			budget: number;
			boostMaterialPercentage: number;
		};
		chemical: {
			budget: number;
			boostMaterialPercentage: number;
		};
		tobacco: {
			employees: number;
			warehouseLevel: number;
			advertLevel: number;
			boostMaterialPercentage: number;
			mainCity: CityName;
			newProductBudget: number;
			researchAllocation: 'all' | 'most' | 'some';
			productNamePrefix: string;
		};
		materialBudgetRatio: MaterialBudgetRatio;
		materialEmployeeRatio: Record<CorpEmployeePosition, number>;
		productBudgetRatio: ProductBudgetRatio;
		productEmployeeRatio: Record<CorpEmployeePosition, number>;
		research: Record<CorpResearchName, number>,
		productResearch: Record<CorpResearchName, number>,
	};
}

export async function main(ns: NSP) {
	ns = nsproxy(ns);
	ns.disableLog('ALL');

	const config = JSON5.parse(ns.read(CONFIG_FILE)) as Config;

	if (!ns.corporation.hasCorporation()) {
		ns.print('Creating corporation');
		const created = await ns.corporation.createCorporation_(config.corporationName, config.selfFund);
		if (!created) {
			ns.print('ERROR Could not create corporation');
			ns.exit();
		}
	}

	let offer = await ns.corporation.getInvestmentOffer_();

	if (offer.round === 1) {
		await round1(ns, config);
		await takeBestInvestmentOffer(ns, 490e9);
		offer = await ns.corporation.getInvestmentOffer_();
	}
	
	if (offer.round === 2) {
		await round2(ns, config);
		await takeBestInvestmentOffer(ns, 20e12);
		offer = await ns.corporation.getInvestmentOffer_();
	}

	if (offer.round === 3) {
		await round3(ns, config);
	}

	while (true) {
		await loop(ns, config);

		offer = await ns.corporation.getInvestmentOffer_();
		if (offer.round === 3 && offer.funds >= 10e15) {
			await ns.corporation.acceptInvestmentOffer_();
		} else if (offer.round === 4 && offer.funds >= 1e21) {
			await ns.corporation.acceptInvestmentOffer_();
			await ns.corporation.goPublic_(0);
			await ns.corporation.issueDividends_(0.05);
		}
	}
}

async function takeBestInvestmentOffer(ns: NSP, minimumOffer: number = 0) {
	ns.print(`Waiting for the best investment offer`);
	let bestOffer = 0;
	let offer;
	while (true) {
		await waitForState(ns, 'START');
		offer = await ns.corporation.getInvestmentOffer_();
		if (offer.funds > bestOffer) {
			if ((offer.funds > minimumOffer) && (1 - (bestOffer / offer.funds) < 1e-3)) {
				ns.print(`New best offer \$${ns.formatNumber(offer.funds)} similar to previous best \$${ns.formatNumber(bestOffer)}`);
				break;
			} else {
				ns.print(`New best offer: \$${ns.formatNumber(offer.funds)}`);
				bestOffer = offer.funds;
			}
		} else {
			ns.print(`Offer below best: \$${ns.formatNumber(offer.funds)} < \$${ns.formatNumber(bestOffer)}`);
			if (offer.funds > minimumOffer) {
				break;
			}
		}
	}
	ns.print(`Accepting investment offer: \$${ns.formatNumber(offer.funds)}`);
	await ns.corporation.acceptInvestmentOffer_();
}

async function round1(ns: NSP, config: Config) {
	ns.print(`Executing round 1 script.`);

	const { agricultureDivisionName, round1 } = config;

	await setupDivision(ns, {
		divisionName: agricultureDivisionName,
		type: 'Agriculture',
		employees: round1.agriculture.employees,
		warehouseLevel: round1.agriculture.warehouseLevel,
		advertLevel: round1.agriculture.advertLevel,
	});
	await buyUpgrade(ns, 'Smart Storage', round1.smartStorageLevel);
	await buyUpgrade(ns, 'Smart Factories', round1.smartFactoriesLevel);
	await maximizeWorkerStats(ns, agricultureDivisionName);
	for (const city of CITY_NAMES) {
		await assignJobs(ns, agricultureDivisionName, city, {
			Operations: 1,
			Engineer: 1,
			Business: 1,
		});
	}
	await buyBoostMaterials(ns, agricultureDivisionName, round1.agriculture.boostMaterialPercentage, false);
}

async function round2(ns: NSP, config: Config) {
	ns.print(`Executing round 2 script.`);

	const { agricultureDivisionName, chemicalDivisionName, dummyDivisionNamePrefix, round2 } = config;
	
	await buyUnlock(ns, 'Export');
	await setupDivision(ns, {
		divisionName: agricultureDivisionName,
		type: 'Agriculture',
		employees: round2.agriculture.employees,
		warehouseLevel: round2.agriculture.warehouseLevel,
		advertLevel: round2.agriculture.advertLevel,
	});
	await setupDivision(ns, {
		divisionName: chemicalDivisionName,
		type: 'Chemical',
		employees: round2.chemical.employees,
		warehouseLevel: round2.chemical.warehouseLevel,
		advertLevel: round2.chemical.advertLevel,
	});
	await exportMaterials(ns, agricultureDivisionName, [chemicalDivisionName], 'Plants');
	await exportMaterials(ns, chemicalDivisionName, [agricultureDivisionName], 'Chemicals');
	for (let i = 0; i < round2.dummyDivisions; ++i) {
		await createDivision(ns, `${dummyDivisionNamePrefix} ${i}`, 'Restaurant');
	}
	await buyUpgrade(ns, 'Smart Storage', round2.smartStorageLevel);
	await buyUpgrade(ns, 'Smart Factories', round2.smartFactoriesLevel);
	await Promise.all([
		maximizeWorkerStats(ns, agricultureDivisionName),
		maximizeWorkerStats(ns, chemicalDivisionName),
	]);
	await Promise.all([
		waitForRP(ns, agricultureDivisionName, config.round2.agriculture.targetRP),
		waitForRP(ns, chemicalDivisionName, config.round2.chemical.targetRP),
	]);
	for (const city of CITY_NAMES) {
		await assignJobs(ns, agricultureDivisionName, city, {
			Operations: 2,
			Engineer: 1,
			Business: 1,
			Management: 2,
		});
		await assignJobs(ns, chemicalDivisionName, city, {
			Operations: 1,
			Engineer: 1,
			Business: 1,
		});
	}
	await Promise.all([
		buyBoostMaterials(ns, agricultureDivisionName, round2.agriculture.boostMaterialPercentage, false),
		buyBoostMaterials(ns, chemicalDivisionName, round2.chemical.boostMaterialPercentage, false),
	]);
}

async function round3(ns: NSP, config: Config) {
	ns.print(`Executing round 3 script.`);
	const { agricultureDivisionName, chemicalDivisionName, tobaccoDivisionName, round3 } = config;

	buyUnlock(ns, 'Market Research - Demand');
	buyUnlock(ns, 'Market Data - Competition');
	await setupDivision(ns, {
		divisionName: tobaccoDivisionName,
		type: 'Tobacco',
		employees: round3.tobacco.employees,
		warehouseLevel: round3.tobacco.warehouseLevel,
		advertLevel: round3.tobacco.advertLevel,
	});
	await exportMaterials(ns, agricultureDivisionName, [tobaccoDivisionName, chemicalDivisionName], 'Plants');

	while ((await ns.corporation.getDivision_(tobaccoDivisionName)).productionMult === 0) {
		await ns.corporation.nextUpdate_();
	}

	const totalBudget = (await ns.corporation.getCorporation_()).funds * 0.99;
	const tobaccoBudget = totalBudget - round3.agriculture.budget - round3.chemical.budget - round3.tobacco.newProductBudget;
	await improveProductDivision(ns, tobaccoDivisionName, round3.tobacco.mainCity, tobaccoBudget, round3.productBudgetRatio, round3.tobacco.researchAllocation, round3.productEmployeeRatio, true);
	await developNewProduct(ns, tobaccoDivisionName, round3.tobacco.mainCity, round3.tobacco.newProductBudget, round3.tobacco.productNamePrefix);
	await improveMaterialDivision(ns, agricultureDivisionName, round3.agriculture.budget, round3.materialBudgetRatio, round3.materialEmployeeRatio, config.round2.agriculture);
	await improveMaterialDivision(ns, chemicalDivisionName, round3.chemical.budget, round3.materialBudgetRatio, round3.materialEmployeeRatio, config.round2.chemical);

	await Promise.all([
		buyBoostMaterials(ns, agricultureDivisionName, round3.agriculture.boostMaterialPercentage, true),
		buyBoostMaterials(ns, chemicalDivisionName, round3.chemical.boostMaterialPercentage, true),
		buyBoostMaterials(ns, tobaccoDivisionName, round3.tobacco.boostMaterialPercentage, true),
	]);
}

async function loop(ns: NSP, config: Config) {
	const corp = await ns.corporation.getCorporation_();
	const investmentOffer = await ns.corporation.getInvestmentOffer_();
	const profit = corp.revenue - corp.expenses;

	let funds = corp.funds;
	await improveProductDivision(
		ns,
		config.tobaccoDivisionName,
		config.round3.tobacco.mainCity,
		funds * 0.99 - 1e9,
		config.round3.productBudgetRatio,
		config.round3.tobacco.researchAllocation,
		config.round3.productEmployeeRatio,
		false);

	developNewProduct(ns, config.tobaccoDivisionName, config.round3.tobacco.mainCity, 1e9, config.round3.tobacco.productNamePrefix);

	funds = (await ns.corporation.getCorporation_()).funds;
	await improveMaterialDivision(
		ns,
		config.agricultureDivisionName,
		Math.max(0, Math.min(profit * 0.9, funds)),
		config.round3.materialBudgetRatio,
		config.round3.productEmployeeRatio);

	funds = (await ns.corporation.getCorporation_()).funds;
	await improveMaterialDivision(
		ns,
		config.chemicalDivisionName,
		Math.max(0, Math.min(profit * 0.1, funds)),
		config.round3.materialBudgetRatio,
		config.round3.productEmployeeRatio);

	if (investmentOffer.round > 3) {
		const rndResearch = { 'Hi-Tech R&D Laboratory': config.round3['research']['Hi-Tech R&D Laboratory'] } as Record<CorpResearchName, number>;
		await improveResearch(ns, config.tobaccoDivisionName, rndResearch);
		await improveResearch(ns, config.agricultureDivisionName, rndResearch);
		await improveResearch(ns, config.chemicalDivisionName, rndResearch);
	}

	if (investmentOffer.round > 4) {
		const materialResearch = config.round3['research'];
		const productResearch = Object.assign({}, config.round3['research'], config.round3.productResearch);
		await improveResearch(ns, config.tobaccoDivisionName, productResearch);
		await improveResearch(ns, config.agricultureDivisionName, materialResearch);
		await improveResearch(ns, config.chemicalDivisionName, materialResearch);
	}

	await Promise.all([
		buyBoostMaterials(ns, config.agricultureDivisionName, 0.8, true),
		buyBoostMaterials(ns, config.chemicalDivisionName, 0.8, true),
		buyBoostMaterials(ns, config.tobaccoDivisionName, 0.8, true),
	]);

	if ((await ns.corporation.getDivision_(config.tobaccoDivisionName)).awareness < Number.MAX_VALUE) {
		const currentWilsonLevel = await ns.corporation.getUpgradeLevel_('Wilson Analytics');
		const maxWilsonLevel = maxAffordableUpgradeLevel('Wilson Analytics', currentWilsonLevel, profit);
		buyUpgrade(ns, 'Wilson Analytics', maxWilsonLevel);
		if (profit >= 1e18) {
			funds = (await ns.corporation.getCorporation_()).funds;
			const currentAdvertLevel = await ns.corporation.getHireAdVertCount_(config.tobaccoDivisionName);
			const maxAdvertLevel = maxAffordableAdvertLevel(currentAdvertLevel, funds * 0.3);
			buyAdvert(ns, config.tobaccoDivisionName, maxAdvertLevel);
		}
	}

	if (await ns.corporation.hasUnlock_('Smart Supply')) {
		for (const divisionName of corp.divisions) {
			const division = await ns.corporation.getDivision_(divisionName);
			for (const city of division.cities) {
				if (!await ns.corporation.hasWarehouse_(divisionName, city)) continue;
				ns.corporation.setSmartSupply_(divisionName, city, true);
			}
		}
	}

	const state = await ns.corporation.nextUpdate_();
	switch (state) {
		case 'START':
			await Promise.all(corp.divisions.map(divisionName => maximizeWorkerStats(ns, divisionName, false, true)));
			break;

		case 'SALE':
			await updateProductPrices(ns);
			break;
	}
}

async function setupDivision(ns: NSP, options: { divisionName: string, type: CorpIndustryName, employees: number, warehouseLevel: number, advertLevel: number }) {
	const { divisionName, type, employees, warehouseLevel, advertLevel } = options;
	await createDivision(ns, divisionName, type);
	for (const city of CITY_NAMES) {
		await expandDivisionIntoCity(ns, divisionName, city);
		await buyWarehouseInCity(ns, divisionName, city);
		await upgradeWarehouseToLevel(ns, divisionName, city, warehouseLevel);
		await upgradeOfficeToSize(ns, divisionName, city, employees);
		await hireEmployeesInCity(ns, divisionName, city, 'Research & Development');
		await setProducedMaterialSellOrders(ns, divisionName, city);
	}
	await buyAdvert(ns, divisionName, advertLevel);
}

async function createDivision(ns: NSP, divisionName: string, type: CorpIndustryName) {
	const corp = await ns.corporation.getCorporation_();
	if (!corp.divisions.includes(divisionName)) {
		if (corp.divisions.length === 20) {
			ns.print(`${divisionName}: Please delete an existing division to make room for this division.`);
			ns.alert(`${divisionName}: Please delete an existing division to make room for this division.`);
			do {
				await ns.asleep(1000);
			} while ((await ns.corporation.getCorporation_()).divisions.length === 20);
		}
		ns.print(`${divisionName}: Creating division`);
		await ns.corporation.expandIndustry_(type, divisionName);
	}
}

async function expandDivisionIntoCity(ns: NSP, divisionName: string, city: CityName) {
	const division = await ns.corporation.getDivision_(divisionName);
	if (!division.cities.includes(city)) {
		ns.print(`${divisionName}/${city}: Expanding into city`);
		await ns.corporation.expandCity_(divisionName, city);
	}
}

async function buyWarehouseInCity(ns: NSP, divisionName: string, city: CityName) {
	if (!await ns.corporation.hasWarehouse_(divisionName, city)) {
		ns.print(`${divisionName}/${city}: Purchasing warehouse`);
		await ns.corporation.purchaseWarehouse_(divisionName, city);
	}
}

async function upgradeWarehouseToLevel(ns: NSP, divisionName: string, city: CityName, level: number) {
	const warehouse = await ns.corporation.getWarehouse_(divisionName, city);
	const increase = level - warehouse.level;
	if (increase > 0) {
		ns.print(`${divisionName}/${city}: Upgrading warehouse from level ${warehouse.level} to level ${level}`);
		await ns.corporation.upgradeWarehouse_(divisionName, city, increase);
	}
}

async function upgradeOfficeToSize(ns: NSP, divisionName: string, city: CityName, size: number) {
	const office = await ns.corporation.getOffice_(divisionName, city);
	const increase = size - office.size;
	if (increase > 0) {
		if (increase % 3 !== 0) {
			ns.print(`WARN increasing office size by ${increase}, not multiple of 3`);
		}
		ns.print(`${divisionName}/${city}: Upgrading office size from ${office.size} to ${size}`);
		await ns.corporation.upgradeOfficeSize_(divisionName, city, increase);
	}
}

async function hireEmployeesInCity(ns: NSP, divisionName: string, city: CityName, job: CorpEmployeePosition) {
	const office = await ns.corporation.getOffice_(divisionName, city);
	if (office.numEmployees < office.size) {
		ns.print(`${divisionName}/${city}: Hiring employees to ${job}`);
		for (let i = office.numEmployees; i < office.size; ++i) {
			await ns.corporation.hireEmployee_(divisionName, city, job);
		}
	}
}

async function assignJobs(ns: NSP, divisionName: string, city: CityName, jobs: Partial<Record<CorpEmployeePosition, number>>) {
	let done = true;
	const office = await ns.corporation.getOffice_(divisionName, city);
	for (const [job, n] of Object.entries(jobs)) {
		if (office.employeeJobs[job as CorpEmployeePosition] !== n) {
			done = false;
			break;
		}
	}
	if (done) {
		return;
	}

	ns.print(`${divisionName}/${city}: Reassigning jobs`);
	for (const job of CORP_EMPLOYEE_POSITIONS) {
		await ns.corporation.setAutoJobAssignment_(divisionName, city, job, 0);
	}
	for (const [job, n] of Object.entries(jobs)) {
		await ns.corporation.setAutoJobAssignment_(divisionName, city, job, n);
	}
}

async function maximizeWorkerStats(ns: NSP, divisionName: string, loop: boolean = true, quiet: boolean = false) {
	const division = await ns.corporation.getDivision_(divisionName);
	while (true) {
		let done = true;
		for (const city of division.cities) {
			const office = await ns.corporation.getOffice_(divisionName, city);
			if (office.numEmployees === 0) {
				continue;
			}
			if (office.avgEnergy < 99.5) {
				if (!quiet) ns.print(`${divisionName}/${city}: Buying tea`);
				await ns.corporation.buyTea_(divisionName, city);
				done = false;
			}
			if (office.avgMorale < 99.5) {
				if (!quiet) ns.print(`${divisionName}/${city}: Throwing party`);
				await ns.corporation.throwParty_(divisionName, city, 500000);
				done = false;
			}
		}
		if (done) {
			break;
		}
		if (loop) {
			await waitForState(ns, 'START');
		} else {
			break;
		}
	}
}

async function buyUnlock(ns: NSP, upgradeName: CorpUnlockName) {
	if (!await ns.corporation.hasUnlock_(upgradeName)) {
		ns.print(`Purchasing unlock ${upgradeName}`);
		await ns.corporation.purchaseUnlock_(upgradeName);
	}
}

async function buyUpgrade(ns: NSP, upgradeName: CorpUpgradeName, level: number) {
	const currentLevel = await ns.corporation.getUpgradeLevel_(upgradeName);
	if (currentLevel < level) {
		ns.print(`Upgrading ${upgradeName} from level ${currentLevel} to level ${level}`);
		for (let i = currentLevel; i < level; ++i) {
			await ns.corporation.levelUpgrade_(upgradeName);
		}
		if (await ns.corporation.getUpgradeLevel_(upgradeName) < level) {
			ns.print(`ERROR Failed to upgrade ${upgradeName} to level ${level}`);
		}
	}
}

async function buyAdvert(ns: NSP, divisionName: string, level: number) {
	const currentLevel = await ns.corporation.getHireAdVertCount_(divisionName);
	if (currentLevel < level) {
		ns.print(`Upgrading AdVert from level ${currentLevel} to level ${level}`);
		for (let i = currentLevel; i < level; ++i) {
			await ns.corporation.hireAdVert_(divisionName);
		}
		if (await ns.corporation.getHireAdVertCount_(divisionName) < level) {
			ns.print(`ERROR Could not upgrade AdVert in ${divisionName} to level ${level}`);
		}
	}
}

async function setProducedMaterialSellOrders(ns: NSP, divisionName: string, city: CityName) {
	const division = await ns.corporation.getDivision_(divisionName);
	const industryData = await ns.corporation.getIndustryData_(division.type);
	if (industryData.makesMaterials) {
		for (const materialName of industryData.producedMaterials!) {
			const material = await ns.corporation.getMaterial_(divisionName, city, materialName);
			if (material.desiredSellAmount !== 'MAX' || material.desiredSellPrice !== 'MP') {
				ns.print(`${divisionName}/${city}: Setting sell order for ${materialName}`);
				await ns.corporation.sellMaterial_(divisionName, city, materialName, 'MAX', 'MP');
			}
		}
	}
}

async function buyBoostMaterials(ns: NSP, divisionName: string, boostMaterialPercentage: number, bulk: boolean) {
	const division = await ns.corporation.getDivision_(divisionName);
	const warehouse = await ns.corporation.getWarehouse_(divisionName, CITY_NAMES[0]);
	const space = warehouse.size * boostMaterialPercentage;

	const industryData = await ns.corporation.getIndustryData_(division.type);
	const factors = [industryData.aiCoreFactor!, industryData.hardwareFactor!, industryData.realEstateFactor!, industryData.robotFactor!];

	const materials = ['AI Cores', 'Hardware', 'Real Estate', 'Robots'] as CorpMaterialName[];
	const sizes = await Promise.all(materials.map(async materialName => {
		const materialData = await ns.corporation.getMaterialData_(materialName);
		return materialData.size;
	}));

	const amounts = calculateOptimalBoostMaterialAmounts(sizes, factors, space);

	let setBuyOrder = false;
	for (let i = 0; i < materials.length; ++i) {
		const materialName = materials[i];
		const amount = amounts[i];
		for (const city of CITY_NAMES) {
			const material = await ns.corporation.getMaterial_(divisionName, city, materialName);
			const dAmount = amount - material.stored;
			if (dAmount > 0) {
				if (bulk) {
					ns.print(`${divisionName}/${city}: Bulk purchasing ${dAmount} of ${materialName}`);
					await ns.corporation.bulkPurchase_(divisionName, city, materialName, dAmount);
				} else {
					ns.print(`${divisionName}/${city}: Setting buy orders for ${dAmount} of ${materialName}`);
					await ns.corporation.buyMaterial_(divisionName, city, materialName, dAmount / 10);
					setBuyOrder = true;
				}
			}
		}
	}

	if (!setBuyOrder) {
		return;
	}

	await waitForState(ns, 'PURCHASE');

	ns.print(`${divisionName}: Canceling buy orders for boost materials`);
	for (const materialName of materials) {
		for (const city of CITY_NAMES) {
			await ns.corporation.buyMaterial_(divisionName, city, materialName, 0);
		}
	}
}

async function exportMaterials(ns: NSP, sourceDivisionName: string, targetDivisionNames: string[], materialName: CorpMaterialName) {
	for (const city of CITY_NAMES) {
		const material = await ns.corporation.getMaterial_(sourceDivisionName, city, materialName);
		if (
			(material.exports.length !== targetDivisionNames.length) ||
			(material.exports.some((exp, i) => exp.division !== targetDivisionNames[i] || exp.city !== city))
		) {
			ns.print(`${sourceDivisionName}/${city}: Setting export orders for ${materialName}`);
			for (const exp of material.exports) {
				await ns.corporation.cancelExportMaterial_(sourceDivisionName, city, exp.division, exp.city, materialName);
			}
			for (const targetDivisionName of targetDivisionNames) {
				await ns.corporation.exportMaterial_(sourceDivisionName, city, targetDivisionName, city, materialName, '(IPROD+IINV/10)*(-1)');
			}
		}
	}
}

async function improveProductDivision(
	ns: NSP,
	divisionName: string,
	mainCity: CityName,
	budget: number,
	budgetRatio: ProductBudgetRatio,
	researchAllocation: 'all' | 'most' | 'some',
	employeeRatio: Record<CorpEmployeePosition, number>,
	initialImprovement: boolean,
) {
	const corp = await ns.corporation.getCorporation_();
	const division = await ns.corporation.getDivision_(divisionName);
	const industryData = await ns.corporation.getIndustryData_(division.type);

	const profit = corp.revenue - corp.expenses;
	if (profit > 1e18) {
		budgetRatio = structuredClone(budgetRatio);
		budgetRatio.wilsonAdvert = 0;
	}

	const budgetDivisor = (Object.values(budgetRatio) as number[]).reduce((a, b) => a + b, 0);
	const rawProductionBudget = budget * budgetRatio.rawProduction / budgetDivisor;
	const wilsonAdvertBudget = budget * budgetRatio.wilsonAdvert / budgetDivisor;
	const mainOfficeBudget = budget * budgetRatio.mainOffice / budgetDivisor;
	const supportOfficeBudget = budget * budgetRatio.supportOffice / budgetDivisor;
	const employeeStatUpgradesBudget = budget * budgetRatio.employeeStatUpgrades / budgetDivisor;
	const salesBotBudget = budget * budgetRatio.salesBot / budgetDivisor;
	const projectInsightBudget = budget * budgetRatio.projectInsight / budgetDivisor;

	const employeeStatUpgrades = [
		'Nuoptimal Nootropic Injector Implants',
		'Speech Processor Implants',
		'Neural Accelerators',
		'FocusWires',
	] as CorpUpgradeName[];
	for (const upgradeName of employeeStatUpgrades) {
		if (!initialImprovement || await ns.corporation.getUpgradeLevel_(upgradeName) === 0) {
			await improveUpgradeLevel(ns, upgradeName, employeeStatUpgradesBudget / employeeStatUpgrades.length);
		}
	}

	if (!initialImprovement || await ns.corporation.getUpgradeLevel_('ABC SalesBots') === 0) {
		await improveUpgradeLevel(ns, 'ABC SalesBots', salesBotBudget);
	}

	if (!initialImprovement || await ns.corporation.getUpgradeLevel_('Project Insight') === 0) {
		await improveUpgradeLevel(ns, 'Project Insight', projectInsightBudget);
	}

	const currentWarehouseLevel = (await ns.corporation.getWarehouse_(divisionName, CITY_NAMES[0])).level;
	if (!initialImprovement || currentWarehouseLevel === 1) {
		const currentSmartStorageLevel = await ns.corporation.getUpgradeLevel_('Smart Storage');
		const currentSmartFactoriesLevel = await ns.corporation.getUpgradeLevel_('Smart Factories');
		const boostMaterials = ['AI Cores', 'Hardware', 'Real Estate', 'Robots'] as CorpMaterialName[];
		const boostMaterialData = new Map(await Promise.all(
			boostMaterials.map(async materialName =>
				[materialName, await ns.corporation.getMaterialData_(materialName)] as const
			)
		));
		const storageResearch = new Set(await filterAsync(
			['Drones - Transport'] as CorpResearchName[],
			upgradeName => ns.corporation.hasResearched_(divisionName, upgradeName)));
		const boostMaterialPercentage = 0.8;

		const levels = await bruteforceStorageUpgrades(
			{
				warehouse: currentWarehouseLevel,
				smartStorage: currentSmartStorageLevel,
				smartFactories: currentSmartFactoriesLevel,
			},
			industryData,
			boostMaterialData,
			storageResearch,
			rawProductionBudget,
			boostMaterialPercentage);

		for (const city of CITY_NAMES) {
			await upgradeWarehouseToLevel(ns, divisionName, city, levels.warehouse);
		}
		await buyUpgrade(ns, 'Smart Storage', levels.smartStorage);
		await buyUpgrade(ns, 'Smart Factories', levels.smartFactories);
	}

	const currentWilsonLevel = await ns.corporation.getUpgradeLevel_('Wilson Analytics');
	if (!initialImprovement || currentWilsonLevel === 0) {
		const currentAdvertLevel = await ns.corporation.getHireAdVertCount_(divisionName);
		const levels = await bruteforceWilsonAdvertUpgrades(
			{
				wilson: currentWilsonLevel,
				advert: currentAdvertLevel,
			},
			industryData,
			division.awareness,
			division.popularity,
			wilsonAdvertBudget);

		await buyUpgrade(ns, 'Wilson Analytics', levels.wilson);
		await buyAdvert(ns, divisionName, levels.advert);
	}

	if (!initialImprovement || (await ns.corporation.getOffice_(divisionName, CITY_NAMES[0])).size === 3) {
		await improveProductDivisionMainOffice(ns, divisionName, mainCity, mainOfficeBudget, employeeRatio);
		await improveProductDivisionSupportOffices(ns, divisionName, mainCity, supportOfficeBudget, researchAllocation, employeeRatio);
	}
}

async function developNewProduct(ns: NSP, divisionName: string, mainCity: CityName, budget: number, productNamePrefix: string) {
	const division = await ns.corporation.getDivision_(divisionName);
	const products = await Promise.all(division.products.map(productName => ns.corporation.getProduct_(divisionName, mainCity, productName)));
	if (products.some(product => product.developmentProgress < 100)) {
		return;
	}
	const newestProduct = products.at(-1);
	const maxProducts = await maxProductCount(ns, divisionName);
	if (products.length === maxProducts) {
		products.sort((a, b) => a.rating - b.rating);
		const worstProduct = products[0];
		ns.print(`${divisionName}: Discontinuing product ${worstProduct.name}`);
		await ns.corporation.discontinueProduct_(divisionName, worstProduct.name);
	}

	const id = newestProduct ? 1 + parseInt(newestProduct.name.replace(productNamePrefix, ''), 10) : 0;
	const productName = `${productNamePrefix}${String(id).padStart(3, '0')}`;
	ns.print(`${divisionName}: Making product ${productName}`);
	await ns.corporation.makeProduct_(divisionName, mainCity, productName, budget / 2, budget / 2);
}

async function maxProductCount(ns: NSP, divisionName: string) {
	let count = 3;
	if (await ns.corporation.hasResearched_(divisionName, 'uPgrade: Capacity.I')) {
		++count;
	}
	if (await ns.corporation.hasResearched_(divisionName, 'uPgrade: Capacity.II')) {
		++count;
	}
	return count;
}

async function improveMaterialDivision(
	ns: NSP,
	divisionName: string,
	budget: number,
	budgetRatio: MaterialBudgetRatio,
	employeeRatio: Record<CorpEmployeePosition, number>,
	previousDivisionConfig?: { warehouseLevel: number, employees: number }
) {
	const budgetDivisor = budgetRatio.office + budgetRatio.warehouse;
	const warehouseBudget = budget * budgetRatio.warehouse / budgetDivisor;
	const officeBudget = budget * budgetRatio.office / budgetDivisor;

	if (!previousDivisionConfig || (await ns.corporation.getWarehouse_(divisionName, CITY_NAMES[0])).level === previousDivisionConfig.warehouseLevel) {
		await improveWarehouseLevel(ns, divisionName, warehouseBudget);
	}
	if (!previousDivisionConfig || (await ns.corporation.getOffice_(divisionName, CITY_NAMES[0])).size === previousDivisionConfig.employees) {
		await improveMaterialDivisionOffice(ns, divisionName, officeBudget, employeeRatio);
	}
}

async function improveUpgradeLevel(ns: NSP, upgradeName: CorpUpgradeName, budget: number) {
	const currentUpgradeLevel = await ns.corporation.getUpgradeLevel_(upgradeName);
	const targetUpgradeLevel = maxAffordableUpgradeLevel(upgradeName, currentUpgradeLevel, budget);
	await buyUpgrade(ns, upgradeName, targetUpgradeLevel);
}

async function improveWarehouseLevel(ns: NSP, divisionName: string, budget: number) {
	const budgetPerCity = budget / 6;
	const currentWarehouseLevel = (await ns.corporation.getWarehouse_(divisionName, CITY_NAMES[0])).level;
	const targetWarehouseLevel = maxAffordableWarehouseLevel(currentWarehouseLevel, budgetPerCity);
	for (const city of CITY_NAMES) {
		await upgradeWarehouseToLevel(ns, divisionName, city, targetWarehouseLevel);
	}
}

async function improveMaterialDivisionOffice(ns: NSP, divisionName: string, budget: number, employeeRatio: Record<CorpEmployeePosition, number>) {
	const budgetPerCity = budget / 6;
	const office = await ns.corporation.getOffice_(divisionName, CITY_NAMES[0]);
	const maxOfficeSize = maxAffordableOfficeSize(office.size, budgetPerCity);
	for (const city of CITY_NAMES) {
		await upgradeOfficeToSize(ns, divisionName, city, maxOfficeSize);
		await hireEmployeesInCity(ns, divisionName, city, 'Research & Development');
	}

	const researchEmployees = Math.min(maxOfficeSize - 3, Math.floor(maxOfficeSize * 0.2));
	const productionEmployees = maxOfficeSize - researchEmployees;
	const jobs = { 'Research & Development': researchEmployees } as Partial<Record<CorpEmployeePosition, number>>;
	for (const [job, fraction] of Object.entries(employeeRatio)) {
		const n = Math.floor(productionEmployees * fraction);
		jobs[job as CorpEmployeePosition] = n;
	}
	const assignedCount = Object.values(jobs).reduce((a, b) => a + b, 0);
	jobs['Engineer'] = (jobs['Engineer'] ?? 0) + maxOfficeSize - assignedCount;

	for (const city of CITY_NAMES) {
		await assignJobs(ns, divisionName, city, jobs);
	}
}

async function improveProductDivisionMainOffice(ns: NSP, divisionName: string, mainCity: CityName, budget: number, employeeRatio: Record<CorpEmployeePosition, number>) {
	const office = await ns.corporation.getOffice_(divisionName, mainCity);
	const maxOfficeSize = maxAffordableOfficeSize(office.size, budget);
	await upgradeOfficeToSize(ns, divisionName, mainCity, maxOfficeSize);
	await hireEmployeesInCity(ns, divisionName, mainCity, 'Research & Development');

	const jobs = {} as Partial<Record<CorpEmployeePosition, number>>;
	for (const [job, fraction] of Object.entries(employeeRatio)) {
		const n = Math.floor(maxOfficeSize * fraction);
		jobs[job as CorpEmployeePosition] = n;
	}
	if (jobs['Business'] === 0) {
		jobs['Business'] = 1;
	}
	const assignedCount = Object.values(jobs).reduce((a, b) => a + b, 0);
	jobs['Management'] = (jobs['Management'] ?? 0) + maxOfficeSize - assignedCount;

	await assignJobs(ns, divisionName, mainCity, jobs);
}

async function improveProductDivisionSupportOffices(
	ns: NSP,
	divisionName: string,
	mainCity: CityName,
	budget: number,
	researchAllocation: 'all' | 'most' | 'some',
	employeeRatio: Record<CorpEmployeePosition, number>
) {
	const budgetPerCity = budget / 5;
	const cities = CITY_NAMES.filter(city => city !== mainCity);
	for (const city of cities) {
		const office = await ns.corporation.getOffice_(divisionName, city);
		const maxOfficeSize = maxAffordableOfficeSize(office.size, budgetPerCity);
		await upgradeOfficeToSize(ns, divisionName, city, maxOfficeSize);
		await hireEmployeesInCity(ns, divisionName, city, 'Research & Development');

		let jobs: Partial<Record<CorpEmployeePosition, number>>;
		switch (researchAllocation) {
			case 'all':
				jobs = { 'Research & Development': maxOfficeSize };
				break;

			case 'most':
				jobs = {
					'Research & Development': maxOfficeSize - 4,
					'Operations': 1,
					'Engineer': 1,
					'Business': 1,
					'Management': 1,
				};
				break;

			case 'some': {
				const researchEmployees = Math.min(maxOfficeSize - 4, Math.floor(maxOfficeSize * 0.5));
				const productionEmployees = maxOfficeSize - researchEmployees;
				jobs = { 'Research & Development': researchEmployees };
				for (const [job, fraction] of Object.entries(employeeRatio)) {
					const n = Math.floor(productionEmployees * fraction);
					jobs[job as CorpEmployeePosition] = n;
				}
				const assignedCount = Object.values(jobs).reduce((a, b) => a + b, 0);
				jobs['Management'] = (jobs['Management'] ?? 0) + maxOfficeSize - assignedCount;
				break;
			}
		}

		await assignJobs(ns, divisionName, city, jobs);
	}
}

async function waitForRP(ns: NSP, divisionName: string, targetRP: number) {
	const division = await ns.corporation.getDivision_(divisionName);
	if (division.researchPoints >= targetRP) {
		return;
	}

	ns.print(`${divisionName}: Waiting for ${targetRP} RP`);
	while (true) {
		await ns.corporation.nextUpdate_();
		const division = await ns.corporation.getDivision_(divisionName);
		if (division.researchPoints >= targetRP) {
			return;
		}
	}
}

async function waitForState(ns: NSP, state: CorpStateName) {
	let lastState;
	do {
		lastState = await ns.corporation.nextUpdate_();
	} while (lastState !== state);
}

async function improveResearch(ns: NSP, divisionName: string, researchMultipliers: Record<CorpResearchName, number>) {
	for (const [researchName, multiplier] of Object.entries(researchMultipliers)) {
		if (await ns.corporation.hasResearched_(divisionName, researchName)) continue;
		const cost = await ns.corporation.getResearchCost_(divisionName, researchName);
		const avail = (await ns.corporation.getDivision_(divisionName)).researchPoints;
		if (avail > cost * multiplier) {
			ns.print(`${divisionName}: Researching ${researchName}`);
			await ns.corporation.research_(divisionName, researchName);
		}
	}
}

async function updateProductPrices(ns: NSP) {
	const corp = await ns.corporation.getCorporation_();
	for (const divisionName of corp.divisions) {
		const division = await ns.corporation.getDivision_(divisionName);
		for (const city of division.cities) {
			for (const productName of division.products) {
				if (await ns.corporation.hasResearched_(divisionName, 'Market-TA.II')) {
					await ns.corporation.setProductMarketTA2_(divisionName, productName, true);
				} else {
					const product = await ns.corporation.getProduct_(divisionName, city, productName);
					if (product.developmentProgress < 100) continue;

					let nextPrice: string;
					if (
						product.productionAmount === 0 ||
						product.desiredSellAmount === 0 ||
						typeof product.desiredSellPrice === 'number'
					) {
						nextPrice = 'MP*(0+512)';
					} else {
						nextPrice = calculateNextPrice(product.desiredSellPrice, product.stored);
					}

					if (product.desiredSellPrice !== nextPrice || product.desiredSellAmount !== 'MAX') {
						ns.print(`${divisionName}/${city}: Selling ${productName} at ${nextPrice}`);
						await ns.corporation.sellProduct_(divisionName, city, productName, 'MAX', nextPrice, false);
					}
				}
			}
		}
	}
}

function calculateNextPrice(previousPrice: string, stored: number) {
	if (previousPrice === 'MP') {
		previousPrice = 'MP*(0+512)';
	}

	const match = /MP\*\(([\d\.Ee+-]+)\+([\d\.Ee+-]+)/.exec(previousPrice);
	if (!match) {
		return 'MP*(0+512)';
	}

	const lowerBound = parseFloat(match[1]);
	const addition = parseFloat(match[2]);

	if (stored > 0) {
		if (addition < 0.01) {
			return `MP*(${lowerBound * 0.95}+${lowerBound * 0.05})`;
		} else {
			return `MP*(${lowerBound}+${addition * 0.5})`;
		}
	} else {
		if (lowerBound === addition) {
			return `MP*(${lowerBound + addition}+${lowerBound + addition})`;
		} else {
			return `MP*(${lowerBound + addition}+${lowerBound * 0.25 + addition})`;
		}
	}
}
