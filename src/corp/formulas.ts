import { CorpEmployeePosition, CorpIndustryName, CorpMaterialName, CorpResearchName, CorpUpgradeName } from '@ns';
import { nsproxy, NSP } from '@/lib/nsproxy';
import { UPGRADE_INFO } from './constants';

export async function main(ns: NSP) {
	ns = nsproxy(ns);
	const industryName = ns.args[0] as CorpIndustryName;
	const space = ns.args[1] as number;

	const industryData = await ns.corporation.getIndustryData_(industryName);
	const factors = [industryData.aiCoreFactor!, industryData.hardwareFactor!, industryData.realEstateFactor!, industryData.robotFactor!];

	const materials = ['AI Cores', 'Hardware', 'Real Estate', 'Robots'] as CorpMaterialName[];
	const sizes = await Promise.all(materials.map(async materialName => {
		const materialData = await ns.corporation.getMaterialData_(materialName);
		return materialData.size;
	}));

	const amounts = calculateOptimalBoostMaterialAmounts(sizes, factors, space);
	for (let i = 0; i < materials.length; ++i) {
		ns.tprint(`${materials[i]}: ${amounts[i]}`);
	}
}

export function calculateProducedUnitsPerSecond(params: {
	employeeProduction: Record<CorpEmployeePosition, number>,
	divisionProductionMultiplier: number,
	smartFactoriesLevel: number,
	divisionResearch: Set<CorpResearchName>,
	isProduct: boolean,
}): number {
	const {
		employeeProduction,
		divisionProductionMultiplier,
		smartFactoriesLevel,
		divisionResearch,
		isProduct,
	} = params;

	const totalEmployeeProduction =
		employeeProduction['Operations'] +
		employeeProduction['Engineer'] +
		employeeProduction['Management'];
	if (totalEmployeeProduction === 0) {
		return 0;
	}
	let officeMultiplier = 0.05 *
		(employeeProduction['Operations'] ** 0.4 + employeeProduction['Engineer'] ** 0.3) *
		(1 + employeeProduction['Management'] / (1.2 * totalEmployeeProduction));
	if (isProduct) {
		officeMultiplier *= 0.5;
	}

	const upgradeMultiplier = 1 + smartFactoriesLevel * 0.03;

	let researchMultiplier = 1;
	if (divisionResearch.has('Drones - Assembly')) {
		researchMultiplier *= 1.2;
	}
	if (divisionResearch.has('Self-Correcting Assemblers')) {
		researchMultiplier *= 1.1
	}
	if (isProduct && divisionResearch.has('uPgrade: Fulcrum')) {
		researchMultiplier *= 1.05;
	}

	return divisionProductionMultiplier * officeMultiplier * upgradeMultiplier * researchMultiplier;
}

function upgradeCostInternal(basePrice: number, multiplier: number, currentLevel: number, upgradeLevel: number) {
	return basePrice * (multiplier ** upgradeLevel - multiplier ** currentLevel) / (multiplier - 1);
}

function maxAffordableUpgradeLevelInternal(basePrice: number, multiplier: number, currentLevel: number, budget: number) {
	return Math.floor(
		Math.log(budget * (multiplier - 1) / basePrice + multiplier ** currentLevel) /
		Math.log(multiplier)
	);
}

export function upgradeCost(upgradeName: CorpUpgradeName, currentLevel: number, upgradeLevel: number) {
	const { basePrice, priceMult } = UPGRADE_INFO[upgradeName];
	return upgradeCostInternal(basePrice, priceMult, currentLevel, upgradeLevel);
}

export function maxAffordableUpgradeLevel(upgradeName: CorpUpgradeName, currentLevel: number, budget: number) {
	const { basePrice, priceMult } = UPGRADE_INFO[upgradeName];
	return maxAffordableUpgradeLevelInternal(basePrice, priceMult, currentLevel, budget);
}

export function upgradeWarehouseCost(currentLevel: number, upgradeLevel: number) {
	return upgradeCostInternal(1e9, 1.07, currentLevel + 1, upgradeLevel + 1);
}

export function maxAffordableWarehouseLevel(currentLevel: number, budget: number) {
	return maxAffordableUpgradeLevelInternal(1e9, 1.07, currentLevel + 1, budget) - 1;
}

export function upgradeOfficeSizeCost(currentSize: number, upgradeSize: number) {
	return upgradeCostInternal(4e9, 1.09, Math.ceil(currentSize / 3), Math.ceil(upgradeSize / 3));
}

export function maxAffordableOfficeSize(currentSize: number, budget: number) {
	return 3 * maxAffordableUpgradeLevelInternal(4e9, 1.09, Math.ceil(currentSize / 3), budget);
}

export function upgradeAdvertCost(currentLevel: number, upgradeLevel: number) {
	return upgradeCostInternal(1e9, 1.06, currentLevel, upgradeLevel);
}

export function maxAffordableAdvertLevel(currentLevel: number, budget: number) {
	return maxAffordableUpgradeLevelInternal(1e9, 1.06, currentLevel, budget);
}

export function calculateWarehouseSize(warehouseLevel: number, smartStorageLevel: number, storageResearch: Set<CorpResearchName>) {
	let size = warehouseLevel * 100 * (1 + UPGRADE_INFO['Smart Storage'].benefit * smartStorageLevel);
	if (storageResearch.has('Drones - Transport')) {
		size *= 1.5;
	}
	return size;
}

export function calculateBoostMaterialProductionMultiplier(amounts: number[], factors: number[]) {
	const multiplier = amounts
		.map((amount, i) => (1 + 0.002 * amount) ** factors[i])
		.reduce((a, b) => a * b, 1);
	return 6 * Math.max(multiplier ** 0.73, 1);
}

export function calculateOptimalBoostMaterialAmounts(sizes: number[], factors: number[], space: number, round: boolean = true): number[] {
	/*
	Maximizes production multiplier from boost materials given a space budget
	Derivation of formula:

	P(m[]) = term of production multiplier based on material quantities
	m[i] = quantity of materials
	w[i] = size (weight) of single materials
	x[i] = m[i] * w[i] = total size of materials
	f[i] = industry factors for each material
	S = sum(x[]) = total space available
	f = sum(f[])
	w = sum(w[])

	P(m[]) = (1 + 0.002 * m1)^f1 * (1 + 0.002 * m2)^f2 * (1 + 0.002 * m3)^f3 * (1 + 0.002 * m4)^f4
	P(x[]) = (1 + 0.002/w1 * x1)^f1 * (1 + 0.002/w2 * x2)^f2 * (1 + 0.002/w3 * x3)^f3 * (1 + 0.002/w4 * x4)^f4

	At maximum for P, dP/dx1 = dP/dx2 = dP/dx3 = dP/dx4

	dP/dx1 = f1 * 0.002/w1 * (1 + 0.002/w1 * x1)^(f1-1) * (1 + 0.002/w2 * x2)^f2 * (1 + 0.002/w3 * x3)^f3 * (1 + 0.002/w4 * x4)^f4

	dP/dx1 = dP/dxN (let other two subscripts be A and B)
	f1 * 0.002/w1 * (1 + 0.002/w1 * x1)^(f1-1) * (1 + 0.002/wN * xN)^fN * (1 + 0.002/wA * xA)^fA * (1 + 0.002/wB * xB)^fB =
	fN * 0.002/wN * (1 + 0.002/wN * xN)^(fN-1) * (1 + 0.002/w1 * x1)^f1 * (1 + 0.002/wA * xA)^fA * (1 + 0.002/wB * xB)^fB

	Simplify + solve for xN >>
	xN = 500*w1*fN/f1 + x1*fN/f1 - 500*wN

	S = x1 + x2 + x3 + x4
	S = m1*w1 + (500*w1*f2/f1 + m1*w1*f2/f1 - 500*w2) + (500*w1*f3/f1 + m1*w1*f3/f1 - 500*w3) + (500*w1*f4/f1 + m1*w1*f4/f1 - 500*w4)

	Simplify + solve for m1 >>
	m1 = (S - 500*(w1*(f-f1)/f1 - (w-w1))) / (w1*f/f1)

	If any amount ends up negative, run calculations again without that term

	https://discord.com/channels/415207508303544321/923445881389338634/1141473782054264935
	https://discord.com/channels/415207508303544321/923445881389338634/1141508444709470288
	*/

	const amounts = [];
	const w = sizes.reduce((a, b) => a + b, 0);
	const f = factors.reduce((a, b) => a + b, 0);
	for (let i = 0; i < sizes.length; ++i) {
		const wi = sizes[i];
		const fi = factors[i];
		const mi = (space - 500 * (wi * (f - fi) / fi - (w - wi))) / (wi * f / fi);
		if (factors[i] <= 0 || mi < 0) {
			return calculateOptimalBoostMaterialAmounts(sizes.toSpliced(i, 1), factors.toSpliced(i, 1), space, round)
				.toSpliced(i, 0, 0);
		} else {
			amounts.push(round ? Math.round(mi) : mi);
		}
	}
	return amounts;
}
