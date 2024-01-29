import { traverseRooted } from './lib.js';

/** @param {NS} ns */
export async function main(ns) {
  const [target] = ns.args;

  if (!target) {
    ns.tprint('ERROR usage: manynet.js [target]');
    ns.exit();
  }

  const hackScript = 'hack/hackOnce.js';
  const growScript = 'hack/growOnce.js';
  const weakenScript = 'hack/weakenOnce.js';

  const hostServers = getRootedHosts(ns);
  const targetServer = getTargetInfo(ns, target);

  while (true) {
    const sec = ns.getServerSecurityLevel(target);
    if (sec > targetServer.minSec + 1) {
      const threads = Math.ceil((sec - targetServer.minSec) / 0.05);
      const time = ns.getWeakenTime(target);
      await execThreads(threads, time, weakenScript, target);
      continue;
    }

    const money = ns.getServerMoneyAvailable(target);
    if (money < targetServer.maxMoney) {
      const threads = Math.ceil(ns.growthAnalyze(target, targetServer.maxMoney / money));
      const time = ns.getGrowTime(target);
      await execThreads(threads, time, growScript, target);
      continue;
    }

    {
      const threads = Math.floor(0.25 / ns.hackAnalyze(target));
      const time = ns.getHackTime(target);
      await execThreads(threads, time, hackScript, target);
      continue;
    }
  }

  async function execThreads(threads, time, script, ...args) {
    const ramCost = ns.getScriptRam(script);
    const allocations = [];
    const pids = [];
    const remainingServers = [...hostServers];
    const totalThreads = threads;
    while (threads > 0 && remainingServers.length) {
      const host = remainingServers.shift();
      const maxRam = ns.getServerMaxRam(host);
      const usedRam = ns.getServerUsedRam(host);
      const remainingRam = maxRam - usedRam;
      const threadsAvailable = Math.floor(remainingRam / ramCost);
      if (threadsAvailable === 0) continue;
      const threadsAllocated = Math.min(threads, threadsAvailable);
      allocations.push([host, threadsAllocated]);
      threads -= threadsAllocated;
    }
    if (threads > 0) {
      ns.tprint(`WARN insufficient resources to run ${[script, ...args].join(' ')}. Requested: ${totalThreads}  Allocated: ${totalThreads-threads}`);
    }
    for (let [host, threadsAllocated] of allocations) {
      ns.print(`Running ${[script, ...args].join(' ')} on ${host} with t=${threadsAllocated}`);
      ns.scp(script, host);
      const pid = ns.exec(script, host, threadsAllocated, ...args);
      pids.push(pid);
    }
    await ns.sleep(time);
    while (pids.some(pid => ns.isRunning(pid))) {
      await ns.sleep(100);
    }
  }
}

function getTargetInfo(ns, host) {
  return {
    host,
    maxMoney: ns.getServerMaxMoney(host),
    minSec: ns.getServerMinSecurityLevel(host),
    chance: ns.hackAnalyzeChance(host),
  };
}

function getRootedHosts(ns) {
  const servers = [];
  traverseRooted(ns, host => { servers.push(host); });
  return servers;
}
