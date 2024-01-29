import { NSP, nsproxy } from "./lib/nsproxy";

export async function main(ns: NSP) {
	ns.tprint(ns.singularity.getCrimeStats('Homicide'));
	ns.tprint(ns.singularity.getCrimeStats('Mug'));
}
