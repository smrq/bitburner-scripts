/**
 * @param {NS} ns
 * @param {(host: string) => void} fn 
 **/
export function traverseRooted(ns, fn, includeRoot = false) {
	traverseHosts(ns, (host, path) => {
		if (!ns.hasRootAccess(host)) return false;
		fn(host, path);
	}, includeRoot);
}

/**
 * @param {NS} ns
 * @param {(host: string) => boolean} fn
 **/
export function traverseHosts(ns, fn, includeRoot = false) {
	if (includeRoot) {
		fn('home', []);
	}
	_traverseHosts(fn, 'home', []);
	function _traverseHosts(fn, host, path) {
		const children = ns.scan(host);
		for (let child of children) {
			if (path[0] === child) continue;
			if (fn(child, [host, ...path]) !== false) {
				_traverseHosts(fn, child, [host, ...path]);
			}
		}
	}
}

/**
 * @param {Object[]} arr
 */
export function table(arr) {
	const columns = Object.keys(arr[0]);
	const values = arr.map(row => columns.map(col => String(row[col])));
	const widths = columns.map((col, i) => Math.max(col.length, ...values.map(row => row[i].length)));
	const result = [
		columns.map((col, i) => col.padEnd(widths[i], ' ')).join('|'),
		...values.map(row =>
			columns.map((_, i) => row[i].padEnd(widths[i], ' ')).join('|')
		),
	].join('\n');
	return result;
}

// https://stackoverflow.com/a/2117523
export function uuidv4() {
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, c =>
    (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
  );
}

/** @param {NS} ns */
export async function rpcListen(ns, port, fn) {
	await ns.getPortHandle(port).nextWrite();
	let resPromises = [];
	let rawReq;
	while ((rawReq = ns.readPort(port)) !== 'NULL PORT DATA') {
		const req = JSON.parse(rawReq);
		const resFilename = `rpc/${req.pid}-${req.id}.txt`;
		const promise = fn(req).then(data => {
			ns.write(resFilename, JSON.stringify(data));
		});
		resPromises.push(promise);
	}
	await Promise.all(resPromises);
}

/** @param {NS} ns */
export async function rpcExec(ns, port, data, retryTime = 100) {
	const id = uuidv4();
	const req = { pid: ns.pid, id, data };
	const resFilename = `rpc/${req.pid}-${req.id}.txt`;

	while (!ns.tryWritePort(port, JSON.stringify(req))) {
		await ns.asleep(retryTime);
	}

	while (!ns.fileExists(resFilename)) {
		await ns.asleep(retryTime);
	}

	const res = { id, data: JSON.parse(ns.read(resFilename)) };
	ns.rm(resFilename);
	return res;
}
