import { NS } from '@ns';

declare module '@ns' {
	export interface NS {
		heart: {
			break(): number;
		}
	}
}

declare global {
	interface Document {
		__nsproxyListeners?: Map<number, [(value: unknown) => void, (reason?: any) => void]>;
	}
}

type Promisify<T> = {
	[P in keyof T]: T[P] extends Function ? T[P] :
		Promisify<T[P]>
} & {
	[P in keyof T as T[P] extends Function ? `${string & P}_` : never]:
		T[P] extends (...args: any) => infer R ? (...args: Parameters<T[P]>) => Promise<R> : never
};

export type NSP = Promisify<NS>;

export function nsproxy(ns: NS): NSP {
	function makeProxy<T extends object>(target: T, path: string): Promisify<T> {
		return new Proxy(target, {
			get(target, prop) {
				if (typeof prop === 'symbol') {
					return Reflect.get(target, prop);
				}
				if (prop.endsWith('_')) {
					const origProp = prop.slice(0, -1);
					return async (...args: any[]) => {
						if (!globalThis['document'].__nsproxyListeners) {
							globalThis['document'].__nsproxyListeners = new Map();
						}
						ns.write('tmp/nsproxy.js', `
export async function main(ns) {
	const [resolve, reject] = globalThis['document'].__nsproxyListeners.get(ns.pid);
	try {
		resolve(await ns${path}${origProp}(...ns.args));
	} catch (e) {
		reject(e);
	}
}`, 'w');
						const pid = ns.run('tmp/nsproxy.js', 1, ...args);
						if (pid) {
							const result = await new Promise((resolve, reject) => {
								globalThis['document'].__nsproxyListeners!.set(pid, [resolve, reject]);
							});
							globalThis['document'].__nsproxyListeners.delete(pid);
							return result;
						} else {
							throw new Error(`failed to run subtask for function ns${path}${origProp}`);
						}
					}
				} else {
					const value = Reflect.get(target, prop);
					if (value && typeof value === 'object') {
						return makeProxy(value, `${path}${prop}.`);
					} else {
						return value;
					}
				}
			}
		}) as Promisify<T>;
	}
	return makeProxy<NS>(ns, '.');
}
