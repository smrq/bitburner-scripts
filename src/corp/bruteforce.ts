import { CorpIndustryData, CorpMaterialConstantData, CorpMaterialName, CorpResearchName } from "@ns";
import { calculateBoostMaterialProductionMultiplier, calculateOptimalBoostMaterialAmounts, calculateWarehouseSize, maxAffordableAdvertLevel, maxAffordableUpgradeLevel, maxAffordableWarehouseLevel, upgradeAdvertCost, upgradeCost, upgradeWarehouseCost } from "./formulas";
import { UPGRADE_INFO } from "./constants";

const YIELD_AFTER_MS = 10;

export async function bruteforceStorageUpgrades(
	currentLevels: {
		warehouse: number,
		smartStorage: number,
		smartFactories: number,
	},
	industryData: CorpIndustryData,
	boostMaterialData: Map<CorpMaterialName, CorpMaterialConstantData>,
	storageResearch: Set<CorpResearchName>, // includes: Drones - Transport
	budget: number,
	boostMaterialPercentage: number,
) {
	const maxWarehouseLevel = maxAffordableWarehouseLevel(currentLevels.warehouse, budget / 6);
	const maxSmartStorageLevel = maxAffordableUpgradeLevel('Smart Storage', currentLevels.smartStorage, budget);

	let bestLevels = null;
	let bestProduction = -Infinity;
	let bestCost = Infinity;

	let t = performance.now();

	for (let warehouseLevel = currentLevels.warehouse; warehouseLevel <= maxWarehouseLevel; ++warehouseLevel) {
		const warehouseCost = upgradeWarehouseCost(currentLevels.warehouse, warehouseLevel) * 6;
		for (let smartStorageLevel = currentLevels.smartStorage; smartStorageLevel <= maxSmartStorageLevel; ++smartStorageLevel) {
			if (performance.now() - t > YIELD_AFTER_MS) {
				await new Promise(resolve => requestAnimationFrame(resolve));
				t = performance.now();
			}

			const smartStorageCost = upgradeCost('Smart Storage', currentLevels.smartStorage, smartStorageLevel);
			const remainingBudget = budget - warehouseCost - smartStorageCost;
			if (remainingBudget < 0) break;

			const space = calculateWarehouseSize(warehouseLevel, smartStorageLevel, storageResearch);

			const smartFactoriesLevel = maxAffordableUpgradeLevel('Smart Factories', currentLevels.smartFactories, remainingBudget);
			const smartFactoriesCost = upgradeCost('Smart Factories', currentLevels.smartFactories, smartFactoriesLevel);
			const smartFactoriesMultiplier = 1 + UPGRADE_INFO['Smart Factories'].benefit * smartFactoriesLevel;
			
			const cost = warehouseCost + smartStorageCost + smartFactoriesCost;

			const factors = [industryData.aiCoreFactor!, industryData.hardwareFactor!, industryData.realEstateFactor!, industryData.robotFactor!];
			const materials = ['AI Cores', 'Hardware', 'Real Estate', 'Robots'] as CorpMaterialName[];
			const sizes = materials.map(materialName => boostMaterialData.get(materialName)!.size);

			const amounts = calculateOptimalBoostMaterialAmounts(sizes, factors, space * boostMaterialPercentage);
			const boostMultiplier = calculateBoostMaterialProductionMultiplier(amounts, factors);

			const production = boostMultiplier * smartFactoriesMultiplier;

			if (((production - bestProduction) || (bestCost - cost)) > 0) {
				bestLevels = {
					warehouse: warehouseLevel,
					smartStorage: smartStorageLevel,
					smartFactories: smartFactoriesLevel,
				};
				bestProduction = production;
				bestCost = cost;
			}
		}
	}

	return bestLevels!;
}

export async function bruteforceWilsonAdvertUpgrades(
	currentLevels: {
		wilson: number,
		advert: number,
	},
	industryData: CorpIndustryData,
	currentAwareness: number,
	currentPopularity: number,
	budget: number,
) {
	const maxWilsonLevel = maxAffordableUpgradeLevel('Wilson Analytics', currentLevels.wilson, budget);

	let bestLevels = null;
	let bestAdvertisingFactor = -Infinity;
	let bestCost = Infinity;

	let t = performance.now();

	for (let wilsonLevel = currentLevels.wilson; wilsonLevel <= maxWilsonLevel; ++wilsonLevel) {
		if (performance.now() - t > YIELD_AFTER_MS) {
			await new Promise(resolve => requestAnimationFrame(resolve));
			t = performance.now();
		}

		const advertisingMultiplier = 1 + UPGRADE_INFO['Wilson Analytics'].benefit * wilsonLevel;

		const wilsonCost = upgradeCost('Wilson Analytics', currentLevels.wilson, wilsonLevel);

		const remainingBudget = budget - wilsonCost;
		const advertLevel = maxAffordableAdvertLevel(currentLevels.advert, remainingBudget);
		const advertCost = upgradeAdvertCost(currentLevels.advert, advertLevel);

		const cost = wilsonCost + advertCost;

		let awareness = currentAwareness;
		let popularity = currentPopularity;
		const popularityRNG = 2; // getRandomInt(1, 3)
		for (let i = currentLevels.advert + 1; i <= advertLevel; ++i) {
			awareness = (awareness + 3*advertisingMultiplier) * (1.005 * advertisingMultiplier);
			popularity = (popularity + advertisingMultiplier) * ((1 + popularityRNG / 200) * advertisingMultiplier);
		}

		const awarenessFactor = (awareness + 1) ** industryData.advertisingFactor!;
		const popularityFactor = (popularity + 1) ** industryData.advertisingFactor!;
		const ratioFactor = awareness === 0 ? 0.01 : Math.max((popularity + 0.001) / awareness, 0.01);
		const advertisingFactor = (awarenessFactor * popularityFactor * ratioFactor) ** 0.85;

		if ((advertisingFactor - bestAdvertisingFactor) || (bestCost - cost) > 0) {
			bestLevels = {
				wilson: wilsonLevel,
				advert: advertLevel,
			};
			bestAdvertisingFactor = advertisingFactor;
			bestCost = cost;
		}
	}

	return bestLevels!;
}
