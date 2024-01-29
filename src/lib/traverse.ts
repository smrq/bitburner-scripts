import { NS } from '@ns';

export function allHosts(ns: NS) {
	function f(hostname: string): string[] {
		return [hostname, ...ns.scan(hostname).slice(1).flatMap(f)];
	}
	return ['home', ...ns.scan('home').flatMap(f)];
}

export function allRootedHosts(ns: NS) {
	return allHosts(ns).filter(ns.hasRootAccess);
}

export function allPaths(ns: NS) {
	const result: Record<string, string[]> = { 'home': ['home'] };
	function f(hostname: string, path: string[]) {
		result[hostname] = path;
		ns.scan(hostname).slice(1).forEach(hostname => f(hostname, [...path, hostname]));
	}
	ns.scan('home').forEach(hostname => f(hostname, ['home', hostname]));
	return result;
}
