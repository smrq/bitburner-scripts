/** @param {NS} ns */
export async function main(ns) {
  const killExisting = ns.args[0] || false;
  const script = 'hello.js';

  let targets = [];
  walkRooted(host => {
    const growth = ns.getServerGrowth(host);
    const maxMoney = ns.getServerMaxMoney(host);
    const chance = ns.hackAnalyzeChance(host);
    const stolenPerThread = ns.hackAnalyze(host) * maxMoney;
    if (stolenPerThread === 0) return;
    
    const idealThreads = Math.floor(ns.growthAnalyze(host, 4/3));
    const maxThreads = Math.floor((maxMoney*0.25) / stolenPerThread);
    const threads = maxThreads;
    const growCount = Math.max(1, Math.ceil(idealThreads / maxThreads));
    const loopTime = ns.getHackTime(host) + growCount * ns.getGrowTime(host) / chance;
    const efficiency = stolenPerThread * (1000/loopTime);

    targets.push({
      host,
      growth,
      chance: Math.floor(chance*100)/100,
      maxMoney,
      stolenPerThread: Math.floor(stolenPerThread),
      idealThreads,
      maxThreads,
      threads,
      growCount,
      loopTime: Math.floor(loopTime) / 1000,
      efficiency,
    });
  });

//  targets.sort((a, b) => b.efficiency - a.efficiency);
  targets.sort((a, b) => a.loopTime - b.loopTime);
  ns.tprint('\n' + table(targets));

  walkRooted(host => {
    if (killExisting) {
      ns.killall(host);
    }
    ns.scp(script, host);
    const ramCost = ns.getScriptRam(script, host);
    const ramAvail = ns.getServerMaxRam(host) - ns.getServerUsedRam(host);
    let threadsLeft = Math.floor(ramAvail / ramCost);
    while (targets.length && threadsLeft) {
      const target = targets[0];
      const threads = Math.min(threadsLeft, target.threads);
      ns.tprint(`Running ${threads} threads against ${target.host} on ${host}`);
      ns.exec(script, host, threads, target.host);
      target.threads -= threads;
      threadsLeft -= threads;
      if (target.threads === 0) {
        targets.shift();
      }
    }
  });

  ns.tprint('Finished.');

  function table(arr) {
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

  function walkRooted(cb) {
    scanHost(null, 'home', host => {
      if (!ns.hasRootAccess(host)) return false;
      cb(host);
      return true;
    })
  }

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