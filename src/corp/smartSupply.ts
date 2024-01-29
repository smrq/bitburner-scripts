import { filterAsync } from '@/lib/async';
import { NSP, nsproxy } from '@/lib/nsproxy';
import { CityName, CorpMaterialName, CorpResearchName, CorporationInfo } from '@ns';
import { calculateProducedUnitsPerSecond } from './formulas';

export async function main(ns: NSP) {
	ns = nsproxy(ns);
	ns.disableLog('ALL');

	if (!ns.corporation.hasCorporation()) {
		ns.print('ERROR not in corporation');
		return false;
	}

	let corp: CorporationInfo;

	while (true) {
		corp = await ns.corporation.getCorporation_();

		if (corp.nextState === 'PURCHASE') {
			ns.print(`Setting buy orders for materials`);
			await purchaseMaterials(ns, corp);
		}

		const state = await ns.corporation.nextUpdate_();

		if (state === 'PURCHASE') {
			ns.print(`Clearing buy orders`);
			await cancelInputMaterialBuyOrders(ns, corp);
		}

		if (state === 'SALE') {
			ns.print(`Clearing sell orders`);
			await cancelInputMaterialSellOrders(ns, corp);
 		}
	}
}

async function purchaseMaterials(ns: NSP, corp: CorporationInfo) {
	for (const divisionName of corp.divisions) {
		const division = await ns.corporation.getDivision_(divisionName);
		const industryData = await ns.corporation.getIndustryData_(division.type);

		for (const city of division.cities) {
			if (!await ns.corporation.hasWarehouse_(divisionName, city)) {
				continue;
			}
			const warehouse = await ns.corporation.getWarehouse_(divisionName, city);

			const producedPerCycle = await calculateProducedUnitsPerCycle(ns, divisionName, city);
			if (producedPerCycle === 0) {
				continue;
			}

			const requiredMaterials = await Promise.all(
				Object.entries(industryData.requiredMaterials).map(async (entry) => {
					const [materialName, amountPerUnit] = entry as [CorpMaterialName, number];
					const materialData = await ns.corporation.getMaterialData_(materialName);
					const material = await ns.corporation.getMaterial_(divisionName, city, materialName);
					return {
						materialName,
						amountPerUnit,
						stored: material.stored,
						size: materialData.size,
					};
				})
			);

			const producedMaterials = industryData.makesMaterials ? await Promise.all(
				industryData.producedMaterials!.map(async materialName => {
					const materialData = await ns.corporation.getMaterialData_(materialName);
					return {
						name: materialName,
						size: materialData.size,
					};
				})
			) : [];
			const producedProducts = industryData.makesProducts ? await Promise.all(
				division.products.map(async productName => {
					const product = await ns.corporation.getProduct_(divisionName, city, productName);
					return {
						name: productName,
						size: product.size,
					};
				})
			) : [];
			const producedItems = [...producedMaterials, ...producedProducts];
			const producedInSpace = calculateProducedUnitsInSpace(ns, requiredMaterials, producedItems, warehouse.size - warehouse.sizeUsed);
			
			const production = Math.min(producedInSpace, producedPerCycle);
			ns.print(`${divisionName}/${city}: Room for ${producedInSpace} products, producing ${producedPerCycle} max`);

			let congested = false;
			if (production === 0) {
				ns.print(`${divisionName}/${city}: WARN no production, check for warehouse congestion`);
				congested = true;
			}

			for (const { materialName, amountPerUnit, stored } of requiredMaterials) {
				const targetAmount = production * amountPerUnit;
				const buyAmount = Math.max(0, targetAmount - stored);
				const sellAmount = Math.max(0, stored - targetAmount);
				ns.print(`${divisionName}/${city}: Stocking ${materialName} (target=${targetAmount}, stored=${stored}, buying=${buyAmount}, selling=${sellAmount})`);
				await ns.corporation.buyMaterial_(divisionName, city, materialName, buyAmount / 10);
				await ns.corporation.sellMaterial_(divisionName, city, materialName, String(sellAmount), congested ? '0' : 'MP');
			}
		}
	}
}

async function calculateProducedUnitsPerCycle(ns: NSP, divisionName: string, city: CityName) {
	const smartFactoriesLevel = await ns.corporation.getUpgradeLevel_('Smart Factories');

	const division = await ns.corporation.getDivision_(divisionName);
	const industryData = await ns.corporation.getIndustryData_(division.type);
	const divisionResearch = new Set<CorpResearchName>(await filterAsync([
		'Drones - Assembly',
		'Self-Correcting Assemblers',
		'uPgrade: Fulcrum',
	], upgradeName => ns.corporation.hasResearched_(divisionName, upgradeName)));

	const office = await ns.corporation.getOffice_(divisionName, city);

	let result = 0;

	if (industryData.makesMaterials && industryData.makesProducts) {
		ns.print(`WARN Hybrid industries not supported, results are undefined`);
	}

	if (industryData.makesMaterials) {
		result += 10 * calculateProducedUnitsPerSecond({
			employeeProduction: office.employeeProductionByJob,
			divisionProductionMultiplier: division.productionMult,
			smartFactoriesLevel,
			divisionResearch,
			isProduct: false,
		});
	}

	if (industryData.makesProducts) {
		for (const productName of division.products) {
			const product = await ns.corporation.getProduct_(divisionName, city, productName);
			if (product.developmentProgress < 100) continue;
			result += 10 * calculateProducedUnitsPerSecond({
				employeeProduction: office.employeeProductionByJob,
				divisionProductionMultiplier: division.productionMult,
				smartFactoriesLevel,
				divisionResearch,
				isProduct: true,
			});
		}
	}

	return result;
}

function calculateProducedUnitsInSpace(
	_ns: NSP,
	required: {
		amountPerUnit: number;
		stored: number;
		size: number;
	}[],
	produced: {
		size: number;
	}[],
	warehouseSpace: number,
) {
	const requiredSpacePerUnit = required.map(r => r.amountPerUnit * r.size).reduce((a, b) => a + b, 0);
	const producedSpacePerUnit = produced.map(p => p.size).reduce((a, b) => a + b, 0);
	const dSpacePerUnit = Math.max(0, producedSpacePerUnit - requiredSpacePerUnit);

	const currentStockSize = required.map(r => r.size * r.stored).reduce((a, b) => a + b, 0);

	let workingSpace = warehouseSpace - currentStockSize;
	let workingSpacePerUnit = dSpacePerUnit;
	let allocatedProducts = 0;
	const unallocatedMaterials = structuredClone(required);

	while (unallocatedMaterials.length > 0 && workingSpace > 0) {
		let produced = Math.min(...unallocatedMaterials.map(material => material.stored / material.amountPerUnit));
		if (workingSpacePerUnit > 0) {
			produced = Math.min(produced, workingSpace / workingSpacePerUnit);
		}

		allocatedProducts += produced;
		workingSpace -= produced * workingSpacePerUnit;

		for (const material of unallocatedMaterials.slice()) {
			material.stored -= produced * material.amountPerUnit;
			if (material.stored <= 0) {
				workingSpacePerUnit += material.amountPerUnit * material.size;
				unallocatedMaterials.splice(unallocatedMaterials.indexOf(material), 1);
			}
		}
	}

	if (workingSpace > 0) {
		allocatedProducts += workingSpace / Math.max(requiredSpacePerUnit, producedSpacePerUnit);
	}

	return allocatedProducts;
}

async function cancelInputMaterialBuyOrders(ns: NSP, corp: CorporationInfo) {
	for (const divisionName of corp.divisions) {
		const division = await ns.corporation.getDivision_(divisionName);
		const industryData = await ns.corporation.getIndustryData_(division.type);
		for (const city of division.cities) {
			if (!await ns.corporation.hasWarehouse_(divisionName, city)) {
				continue;
			}
			for (const materialName of Object.keys(industryData.requiredMaterials)) {
				await ns.corporation.buyMaterial_(divisionName, city, materialName, 0);
			}
		}
	}
}

async function cancelInputMaterialSellOrders(ns: NSP, corp: CorporationInfo) {
	for (const divisionName of corp.divisions) {
		const division = await ns.corporation.getDivision_(divisionName);
		const industryData = await ns.corporation.getIndustryData_(division.type);
		for (const city of division.cities) {
			if (!await ns.corporation.hasWarehouse_(divisionName, city)) {
				continue;
			}
			for (const materialName of Object.keys(industryData.requiredMaterials)) {
				await ns.corporation.sellMaterial_(divisionName, city, materialName, '0', '0');
			}
		}
	}
}
