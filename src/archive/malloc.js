const NOOP_SCRIPT = 'hack/noop.js';
const RESERVED = {
	home: 24
};

/**
 * @typedef {object} Allocation
 * @property {string} hostname
 * @property {number} pid
 * @property {number} ram
 * @property {number} threads
 */

/**
 * @param {NS} ns
 * @param {number} ram
 * @param {number} [threads=1]
 * @param {any[]} [noopArgs=[]]
 * @returns {Allocation[]}
 */
export function malloc(ns, ram, threads = 1, noopArgs = []) {
	const hosts = getHostInfo(ns);
	hosts.sort((a, b) =>
		(a.hostname === 'home' ? 1 : 0) - (b.hostname === 'home' ? 1 : 0) ||
		(a.avail % ram) - (b.avail % ram) ||
		b.avail - a.avail
	);

	const allocations = [];
	for (const host of hosts) {
		const threadsAvailable = Math.floor(host.avail / ram);
		if (threadsAvailable === 0) {
			continue;
		}
		const allocatedThreads = Math.min(threads, threadsAvailable);
		allocations.push({
			hostname: host.hostname,
			pid: 0,
			ram,
			threads: allocatedThreads,
		});
		threads -= allocatedThreads;
		if (threads === 0) break;
	}

	if (threads > 0) {
		return null;
	}

	try {
		for (const allocation of allocations) {
			ns.scp(NOOP_SCRIPT, allocation.hostname);
			allocation.pid = ns.exec(NOOP_SCRIPT, allocation.hostname, { ramOverride: allocation.ram, threads: allocation.threads }, ...noopArgs);
			if (allocation.pid === 0) {
				throw new Error();
			}
		}
		return allocations;
	} catch {
		for (const allocation of allocations) {
			if (allocation.pid) {
				ns.kill(pid);
			}
		}
		return null;
	}
}

/**
 * @param {NS} ns
 * @param {number} ram
 * @returns {number}
 */
export function mavail(ns, ram) {
	const hosts = getHostInfo(ns);
	const availThreads = hosts.map(host => Math.floor(host.avail / ram)).reduce((a, b) => a + b, 0);
	return availThreads;
}

/**
 * @param {NS} ns
 */
function getHostInfo(ns) {
	const result = [];
	function traverse(hostname, parent) {
		if (ns.hasRootAccess(hostname)) {
			const max = ns.getServerMaxRam(hostname);
			const used = ns.getServerUsedRam(hostname);
			const reserved = RESERVED[hostname] ?? 0;
			const avail = max - used - reserved;
			if (avail > 0) {
				result.push({ hostname, avail });
			}
		}
		const children = ns.scan(hostname);
		for (const child of children) {
			if (child !== parent) {
				traverse(child, hostname);
			}
		}
	}
	traverse('home');
	return result;
}
