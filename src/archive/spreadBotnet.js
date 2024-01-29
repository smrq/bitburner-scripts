/** @param {NS} ns */
export async function main(ns) {
  let portHacks = 0;
  if (ns.fileExists('BruteSSH.exe')) ++portHacks;
  if (ns.fileExists('FTPCrack.exe')) ++portHacks;
  if (ns.fileExists('HTTPWorm.exe')) ++portHacks;
  if (ns.fileExists('SQLInject.exe')) ++portHacks;

  scanHost(null, 'home', host => {
    if (ns.hasRootAccess(host)) return true;
    if (ns.getServerNumPortsRequired(host) > portHacks) return false;
    ns.tprint(`Rooting ${host}`);
    ns.run('root.js', 1, host);
    return ns.hasRootAccess(host);
  });

  ns.tprint('Finished.');

  function scanHost(parent, host, cb) {
    const children = ns.scan(host);
    for (let child of children) {
      if (parent === child) continue;
      if (cb(child)) {
        scanHost(host, child, cb);
      }
    }
  }
}
