import { NS } from '@ns';
import { uuidv4 } from './uuid';

export async function rpcListen<TReq, TRes>(ns: NS, port: number, fn: (param: TReq) => Promise<TRes>) {
	await ns.getPortHandle(port).nextWrite();
	let resPromises = [];
	let rawReq;
	while ((rawReq = ns.readPort(port)) !== 'NULL PORT DATA') {
		const req = JSON.parse(rawReq as string);
		const resFilename = `db/rpc/${req.pid}-${req.id}.txt`;
		const promise = fn(req).then(data => {
			ns.write(resFilename, JSON.stringify(data));
		});
		resPromises.push(promise);
	}
	await Promise.all(resPromises);
}

export async function rpcExec<TReq, TRes>(ns: NS, port: number, data: TReq, retryTime = 100) {
	const id = uuidv4();
	const req = { pid: ns.pid, id, data };
	const resFilename = `db/rpc/${req.pid}-${req.id}.txt`;

	while (!ns.tryWritePort(port, JSON.stringify(req))) {
		await ns.asleep(retryTime);
	}

	while (!ns.fileExists(resFilename)) {
		await ns.asleep(retryTime);
	}

	const res = { id, data: JSON.parse(ns.read(resFilename)) as TRes };
	ns.rm(resFilename);
	return res;
}
