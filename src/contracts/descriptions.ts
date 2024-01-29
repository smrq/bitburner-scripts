import { NS } from '@ns';

export async function main(ns: NS) {
	const types = ns.args.length ? ns.args as string[] : ns.codingcontract.getContractTypes();
	for (let type of types) {
		const existingFiles = ns.ls('home', '.cct');
		ns.codingcontract.createDummyContract(type);
		const newFiles = ns.ls('home', '.cct');
		const file = newFiles.find(file => !existingFiles.includes(file))!;
		let description = ns.codingcontract.getDescription(file, 'home');
		description = description.replaceAll('&nbsp;', '')
		ns.rm(file);
		ns.tprint(`\n${type}\n${description}\n\n`);
	}
}
