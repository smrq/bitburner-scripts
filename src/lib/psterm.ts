import { NS } from '@ns';

declare global {
	interface Document {
		__pstermTerminated?: (pid: number) => void;
		__pstermListeners?: Map<number, (() => void)[]>;
	}
}

export function pstermWait(pid: number) {
	const doc = globalThis['document'];
	if (!doc.__pstermListeners) {
		doc.__pstermListeners = new Map();
	}
	return new Promise<void>(resolve => {
		if (!doc.__pstermListeners!.has(pid)) {
			doc.__pstermListeners!.set(pid, []);
		}
		doc.__pstermListeners!.get(pid)!.push(resolve);
	});
}

export function pstermUpdate(ns: NS) {
	const doc = globalThis['document'];
	if (!doc.__pstermListeners) {
		return;
	}
	for (const pid of doc.__pstermListeners.keys()) {
		if (!ns.isRunning(pid)) {
			doc.__pstermListeners.delete(pid);
		}
	}
}

globalThis['document'].__pstermTerminated = (pid: number) => {
	const doc = globalThis['document'];
	const listeners = doc.__pstermListeners?.get(pid);
	if (!listeners) return;
	for (const listener of listeners) {
		listener();
	}
	doc.__pstermListeners!.delete(pid);
}
