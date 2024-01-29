import { NS } from '@ns';
import { solveType } from './solutions.js';

export async function main(ns: NS) {
	const args = ns.flags([
		['all', false],
		['data', false],
		['n', 1],
		['abortOnFail', true],
	]);

	if (args['all']) {
		for (const type of ns.codingcontract.getContractTypes()) {
			try {
				await testType(ns, type, args['n'] as number, args['data'], args['abortOnFail'] as boolean);
			} catch (e) {
				if (!(e instanceof Error)) throw e;
				ns.tprint(`ERROR ${e.message}`);
			}
		}
	} else {
		const [type] = args['_'] as [string];
		await testType(ns, type, args['n'] as number, args['data'], args['abortOnFail'] as boolean);
	}
}

async function testType(ns: NS, type: string, n: number, data: any, abortOnFail: boolean) {
	ns.tprint(`Testing ${type}`);
	if (data) {
		try {
			data = JSON.parse(data);
		} catch {}
		const answer = await solveType(ns, type, data);
		ns.tprint(`Testing ${type}\ndata=${JSON.stringify(data)}\nanswer=${JSON.stringify(answer)}`);
		ns.exit();
	}

	const successes = [], failures = [];
	for (let i = 0; i < n; ++i) {
		const file = createContract(ns, type);
		const data = ns.codingcontract.getData(file, 'home');
		let result, answer;
		try {
			answer = await solveType(ns, type, data);
			result = ns.codingcontract.attempt(answer, file, 'home');
		} catch (e) {
			if (!(e instanceof Error)) throw e;
			ns.tprint(`ERROR ${e.message}`);
		}
		if (result) {
			successes.push({ data, answer });
		} else {
			failures.push({ file, data, answer });

			if (abortOnFail) {
				break;
			}
		}
	}
	ns.tprint(`Test run finished. Successes: ${successes.length}, failures: ${failures.length}`);
	for (let i = 0; i < failures.length; ++i) {
		const { file, data, answer } = failures[i];
		ns.tprint(`Failure ${i}\nfile=${file}\ndata=${JSON.stringify(data)}\nanswer=${JSON.stringify(answer)}`);
	}
}

function createContract(ns: NS, type: string) {
	const existingFiles = ns.ls('home', '.cct');
	ns.codingcontract.createDummyContract(type);
	const newFiles = ns.ls('home', '.cct');
	const file = newFiles.find(file => !existingFiles.includes(file))!;
	return file;
}