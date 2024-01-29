/** @param {NS} ns */
export async function main(ns) {
  const host = ns.args[0];

  // const server = ns.getServer(host);
  const server = {
    minDifficulty: ns.getServerMinSecurityLevel(host),
    moneyMax: ns.getServerMaxMoney(host),
    hackDifficulty: null,
    moneyAvailable: null,
  };

  while (true) {
    server.hackDifficulty = ns.getServerSecurityLevel(host);
    server.moneyAvailable = ns.getServerMoneyAvailable(host);

    if (server.hackDifficulty > server.baseDifficulty) {
      await ns.weaken(host);
    }
    else if (server.moneyAvailable < server.moneyMax * 0.75) {
      await ns.grow(host);
    }
    else {
      await ns.hack(host);
    }
  }
}