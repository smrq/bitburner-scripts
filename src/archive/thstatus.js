import { threset, thupdate } from './thalloc.js';

/**
 * @typedef {object} Host
 * @property {string} hostname
 * @property {number} total
 * @property {number} [reserved]
 * @property {number} allocated
 *
 * @typedef {object} Allocation
 * @property {string} id
 * @property {string} hostname
 * @property {number} pid
 * @property {number} ram
 * @property {number} threads
 *
 * @typedef {object} State
 * @property {Host[]} hosts
 * @property {Allocation[]} allocations
 */


/** @param {NS} ns */
export async function main(ns) {
	const args = ns.flags([
		['v', false],
		['update', false],
		['reset', false],
	]);
	ns.disableLog('ALL');

	if (args['reset']) {
		threset(ns);
	}
	
	if (args['update']) {
		thupdate(ns);
	}

	/** @type {State} */
	const state = eval('document').__thalloc;
	if (!state) {
		ns.tprint('Uninitialized');
		return;
	}

	let output = '\n';
	function print(msg) {
		output += msg + '\n';
	}

	const total = state.hosts.reduce((acc, host) => acc + host.total - (host.reserved ?? 0), 0);
	const allocated = state.allocations.reduce((acc, allocation) => acc + allocation.ramMb*allocation.threads, 0);
	const remaining = total - allocated;

	print(`${state.hosts.length} hosts, ${total/1000}GB RAM total`);
	print(`${state.allocations.length} allocations, ${allocated/1000}GB RAM total, ${remaining/1000}GB remaining`);
	print('-'.repeat(64));
	
	for (const host of state.hosts) {
		const allocations = state.allocations.filter(allocation => allocation.hostname === host.hostname);
		print(`${host.hostname.padEnd(20, ' ')} ${`Allocated ${host.allocated/1000}/${(host.total - (host.reserved ?? 0))/1000}GB${host.reserved != null ? ` (+${(host.reserved ?? 0)/1000}GB)` : ''}`.padEnd(28, ' ')} ${allocations.length} processes`);
		if (args['v']) {
			for (const allocation of allocations) {
				print(`    [${allocation.id}] (${allocation.pid}) ${allocation.threads}x${allocation.ramMb}MB`);
			}
		}
	}
	ns.tprint(output);
}
