type BuildingType = 'HQ' | 'MINE' | 'WOODCUTTER' | 'TAVERN' | 'HOUSE' | 'STORAGE';
type Cost = {
    wood: number,
    iron: number,
    iron_start?: number,
    workers: number,
    worker_start?: number
}

const costMultipier = 1.5;

const buildCost: { [building in BuildingType]: Cost } = {
    HQ: {
        wood: 50,
        iron: 50,
        iron_start: 2 - 1, // Subtract from the start levels to account for the later hotfix.
        workers: 2,
        worker_start: 10 - 1
    },
    WOODCUTTER: {
        wood: 40,
        iron: 0,
        workers: 0.5,
        worker_start: 8
    },
    MINE: {
        wood: 20,
        iron: 10,
        iron_start: 1,
        workers: 0.5,
        worker_start: 8
    },
    STORAGE: {
        wood: 80,
        iron: 20,
        workers: 1,
        worker_start: 3
    },
    TAVERN: {
        wood: 150,
        iron: 100,
        workers: 10,
        worker_start: 3
    },
    HOUSE: {
        wood: 500,
        iron: 400,
        workers: 8,
        worker_start: 3
    }
}


type GameState = {
    buildings: {
        type: BuildingType,
        level: number,
        upgradeCost: Cost
    }[]
};

function getMaxBuildings(gameState: GameState) {
    const hq = gameState.buildings.find(building => building.type === 'HQ');
    return hq.level + 1; // Add one since hq does not count towards building cap
}

function getUpgradeCost(type: BuildingType | 'HQ', level: number) {
    let upgradeCost = buildCost[type];
    if (type === 'HQ') {
        // Decrement the level as the base value for HQ starts at level 1 instead of 0
        level--;
    }

    const multi = Math.pow(costMultipier, level);

    upgradeCost = {
        ...upgradeCost,
        wood: Math.floor(upgradeCost.wood * multi),
        iron: Math.floor(upgradeCost.iron * multi),
        workers: Math.floor(upgradeCost.workers * multi)
    }

    if (upgradeCost.worker_start && level < upgradeCost.worker_start) {
        upgradeCost.workers = 0;
    }
    if (upgradeCost.iron_start && level < upgradeCost.iron_start) {
        upgradeCost.iron = 0;
    }

    // Iron Mines cost different to build
    if (type === 'MINE' && level === 0) {
        upgradeCost.wood = 40;
    }

    return upgradeCost;
}

//      ------ HQ ------
//   |  Wood | Iron | Workers |
// 1 | 50000 |  50  |    0    |
// 2 |  70   |  70  |    0    |
export function displayCosts(buildingType: BuildingType, options?: { minLevel?: number, maxLevel?: number}) {
    if (!options) {
        options = {};
    }
    if (options.minLevel === undefined) {
        options.minLevel = 0;
    }
    if (options.maxLevel === undefined) {
        options.maxLevel = 10;
    }

    // Generate cost levels
    const costs: Cost[] = [];
    for (let level = options.minLevel; level <= options.maxLevel; level++) {
        costs.push(getUpgradeCost(buildingType, level));
    }

    // Get max width of costs in each column
    const levelMaxWidth = options.maxLevel.toString().length;

    const highestCost = costs[costs.length - 1];
    const woodMaxWidth = Math.max(4, highestCost.wood?.toString()?.length || 0);
    const woodHeader = `${' '.repeat(Math.ceil((woodMaxWidth - 4)/2))}Wood${' '.repeat(Math.floor((woodMaxWidth - 4)/2))}`
    const ironMaxWidth = Math.max(4, highestCost.iron?.toString()?.length || 0);
    const ironHeader = `${' '.repeat(Math.ceil((ironMaxWidth - 4)/2))}Iron${' '.repeat(Math.floor((ironMaxWidth - 4)/2))}`
    const workerMaxWidth = Math.max(7, highestCost.workers?.toString()?.length || 0);
    const workerHeader = `${' '.repeat(Math.ceil((workerMaxWidth - 7)/2))}Workers${' '.repeat(Math.floor((workerMaxWidth - 7)/2))}`

    // Combine max widths with known gaps
    const headerWidth = levelMaxWidth + 3 + woodMaxWidth + 3 + ironMaxWidth + 3 + workerMaxWidth + 2;
    const headerDashes = '-'.repeat((headerWidth - buildingType.length - 2) / 2);

    // Display in a neat table
    console.log(`${headerDashes} ${buildingType} ${headerDashes}`);
    console.log(`${' '.repeat(levelMaxWidth)} | ${woodHeader} | ${ironHeader} | ${workerHeader} |`);
    for (let level = options.minLevel; level <= options.maxLevel; level++) {
        const levelCost = costs[level];

        process.stdout.write(`${' '.repeat(levelMaxWidth - level.toString().length)}${level} | `);
        process.stdout.write(`${' '.repeat(woodMaxWidth - levelCost.wood.toString().length)}${levelCost.wood} | `);
        process.stdout.write(`${' '.repeat(ironMaxWidth - levelCost.iron.toString().length)}${levelCost.iron} | `);
        process.stdout.write(`${' '.repeat(workerMaxWidth - levelCost.workers.toString().length)}${levelCost.workers} | `);
        console.log();
    }
}