import { traverseHosts } from './lib.js';

/** @param {NS} ns */
export async function main(ns) {
  let hacks = [
    ['SQLInject.exe', ns.sqlinject],
    ['HTTPWorm.exe', ns.httpworm],
    ['relaySMTP.exe', ns.relaysmtp],
    ['FTPCrack.exe', ns.ftpcrack],
    ['BruteSSH.exe', ns.brutessh],
  ].filter(([file]) => ns.fileExists(file));
  traverseHosts(ns, host => {
    if (ns.hasRootAccess(host)) return true;
    if (ns.getServerNumPortsRequired(host) > hacks.length) return false;
    if (ns.getServerRequiredHackingLevel(host) > ns.getHackingLevel()) return false;
    for (let [, fn] of hacks) {
      fn(host);
    }
    ns.nuke(host);
  });
}
