// ═══════════════════════════════════════════════════════════════
// Genetic Optimizer
//
// Evolves trading strategies by combining indicators, parameters,
// and risk settings through selection, crossover, and mutation.
//
// From NeuralTrade: adapted GA logic to TypeScript.
// Each genome = set of active indicators + params + TP/SL config.
// Fitness = weighted composite of Sharpe + Calmar + PF + WR.
// Walk-forward: 70% train / 30% test validation.
// ═══════════════════════════════════════════════════════════════

import type { OHLCV, Indicators } from '@/types';
import { computeIndicators } from '@/lib/core/indicators';
import type {
  StrategyGenome,
  IndicatorGene,
  GAConfig,
  GAResult,
} from './types';
import { DEFAULT_GA_CONFIG, INDICATOR_RANGES } from './types';
import { evaluateGenome } from './genome-evaluator';
import { nanoid } from 'nanoid';

// ── Random helpers ───────────────────────────────────────────

function randFloat(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randInt(min: number, max: number): number {
  return Math.floor(randFloat(min, max + 1));
}

function randBool(probability = 0.5): boolean {
  return Math.random() < probability;
}

// ── Genome creation ──────────────────────────────────────────

function randomGene(name: string): IndicatorGene {
  const ranges = INDICATOR_RANGES[name] ?? {};
  const params: Record<string, number> = {};
  for (const [param, [min, max]] of Object.entries(ranges)) {
    params[param] = Number.isInteger(min) && Number.isInteger(max)
      ? randInt(min, max)
      : Math.round(randFloat(min, max) * 100) / 100;
  }
  return { active: randBool(0.4), params }; // 40% chance each indicator is active
}

export function createRandomGenome(): StrategyGenome {
  const indicatorNames = Object.keys(INDICATOR_RANGES);
  const indicators: any = {};
  for (const name of indicatorNames) {
    indicators[name] = randomGene(name);
  }

  // Ensure at least 2 indicators are active
  const activeCount = Object.values(indicators).filter((g: any) => g.active).length;
  if (activeCount < 2) {
    const inactive = indicatorNames.filter(n => !indicators[n].active);
    for (let i = 0; i < Math.min(2 - activeCount, inactive.length); i++) {
      indicators[inactive[i]].active = true;
    }
  }

  return {
    id: nanoid(8),
    indicators,
    tpAtrMultiplier: randFloat(1.5, 5.0),
    slAtrMultiplier: randFloat(0.5, 3.0),
    trailingStopPct: randBool(0.5) ? randFloat(0.5, 3.0) : 0,
    minConfidence: randFloat(0.3, 0.8),
    fitness: 0, winRate: 0, profitFactor: 0,
    sharpe: 0, calmar: 0, totalTrades: 0,
    netProfitPct: 0, maxDrawdownPct: 0,
  };
}

// ── Selection: Tournament ────────────────────────────────────

function tournamentSelect(pop: StrategyGenome[], size: number): StrategyGenome {
  let best: StrategyGenome | null = null;
  for (let i = 0; i < size; i++) {
    const candidate = pop[randInt(0, pop.length - 1)];
    if (!best || candidate.fitness > best.fitness) best = candidate;
  }
  return best!;
}

// ── Crossover: Uniform ───────────────────────────────────────

function crossover(a: StrategyGenome, b: StrategyGenome): StrategyGenome {
  const child = createRandomGenome();
  const names = Object.keys(a.indicators);

  for (const name of names) {
    const parentGene = randBool() ? (a.indicators as any)[name] : (b.indicators as any)[name];
    (child.indicators as any)[name] = { ...parentGene, params: { ...parentGene.params } };
  }

  child.tpAtrMultiplier = randBool() ? a.tpAtrMultiplier : b.tpAtrMultiplier;
  child.slAtrMultiplier = randBool() ? a.slAtrMultiplier : b.slAtrMultiplier;
  child.trailingStopPct = randBool() ? a.trailingStopPct : b.trailingStopPct;
  child.minConfidence = randBool() ? a.minConfidence : b.minConfidence;
  child.id = nanoid(8);

  return child;
}

// ── Mutation ─────────────────────────────────────────────────

function mutate(genome: StrategyGenome, rate: number): StrategyGenome {
  const g = JSON.parse(JSON.stringify(genome)) as StrategyGenome;
  const names = Object.keys(g.indicators);

  for (const name of names) {
    const gene = (g.indicators as any)[name] as IndicatorGene;
    if (randBool(rate)) {
      gene.active = !gene.active;
    }
    if (gene.active) {
      const ranges = INDICATOR_RANGES[name] ?? {};
      for (const [param, [min, max]] of Object.entries(ranges)) {
        if (randBool(rate)) {
          // Gaussian-like perturbation
          const range = max - min;
          const perturbation = (Math.random() - 0.5) * range * 0.3;
          gene.params[param] = Math.max(min, Math.min(max, (gene.params[param] ?? (min + max) / 2) + perturbation));
          if (Number.isInteger(min) && Number.isInteger(max)) {
            gene.params[param] = Math.round(gene.params[param]);
          } else {
            gene.params[param] = Math.round(gene.params[param] * 100) / 100;
          }
        }
      }
    }
  }

  // Mutate risk params
  if (randBool(rate)) g.tpAtrMultiplier = Math.max(1.5, Math.min(5.0, g.tpAtrMultiplier + randFloat(-0.5, 0.5)));
  if (randBool(rate)) g.slAtrMultiplier = Math.max(0.5, Math.min(3.0, g.slAtrMultiplier + randFloat(-0.3, 0.3)));
  if (randBool(rate)) g.trailingStopPct = Math.max(0, Math.min(5.0, g.trailingStopPct + randFloat(-0.5, 0.5)));
  if (randBool(rate)) g.minConfidence = Math.max(0.3, Math.min(0.9, g.minConfidence + randFloat(-0.1, 0.1)));

  // Ensure at least 2 active indicators
  const activeCount = Object.values(g.indicators).filter((gene: any) => gene.active).length;
  if (activeCount < 2) {
    const inactive = names.filter(n => !(g.indicators as any)[n].active);
    for (let i = 0; i < Math.min(2, inactive.length); i++) {
      (g.indicators as any)[inactive[i]].active = true;
    }
  }

  g.id = nanoid(8);
  return g;
}

// ── Fitness calculation ──────────────────────────────────────

function calcFitness(genome: StrategyGenome, weights: GAConfig['fitnessWeights']): number {
  if (genome.totalTrades < 5) return 0;

  const sharpeClamped = Math.max(0, Math.min(genome.sharpe, 5));
  const calmarClamped = Math.max(0, Math.min(genome.calmar, 5));
  const pfClamped = Math.max(0, Math.min(genome.profitFactor, 10));
  const wrNorm = genome.winRate / 100;

  return (
    weights.sharpe * (sharpeClamped / 5) +
    weights.calmar * (calmarClamped / 5) +
    weights.profitFactor * Math.min(pfClamped / 3, 1) +
    weights.winRate * wrNorm
  );
}

// ── Main GA Loop ─────────────────────────────────────────────

/**
 * Run the genetic optimizer on historical candle data.
 *
 * @param candles — OHLCV history (should be 500+ bars)
 * @param config — GA configuration
 * @returns GAResult with best genome and metrics
 */
export function runGeneticOptimizer(
  candles: OHLCV[],
  config: GAConfig = DEFAULT_GA_CONFIG,
): GAResult {
  const start = Date.now();

  // Split data for walk-forward validation
  const splitIdx = Math.floor(candles.length * config.trainSplit);
  const trainCandles = candles.slice(0, splitIdx);
  const testCandles = candles.slice(splitIdx);

  if (trainCandles.length < 100 || testCandles.length < 50) {
    throw new Error(`Insufficient data: train=${trainCandles.length} test=${testCandles.length}`);
  }

  const trainIndicators = computeIndicators(trainCandles);
  const testIndicators = computeIndicators(testCandles);

  // Initialize population
  let population: StrategyGenome[] = [];
  for (let i = 0; i < config.populationSize; i++) {
    population.push(createRandomGenome());
  }

  // Evaluate initial population on TRAIN data
  for (const genome of population) {
    evaluateGenome(genome, trainCandles, trainIndicators, config);
    genome.fitness = calcFitness(genome, config.fitnessWeights);
  }

  let bestFitness = -Infinity;
  let stagnationCount = 0;
  let convergenceGen = 0;
  let totalEvaluations = config.populationSize;

  // Evolution loop
  for (let gen = 0; gen < config.generations; gen++) {
    // Sort by fitness descending
    population.sort((a, b) => b.fitness - a.fitness);

    // Check convergence
    const currentBest = population[0].fitness;
    if (currentBest > bestFitness + 0.001) {
      bestFitness = currentBest;
      stagnationCount = 0;
      convergenceGen = gen;
    } else {
      stagnationCount++;
    }

    // Early stopping if stagnant for 30 generations
    if (stagnationCount >= 30) break;

    // Adaptive mutation: increase when stagnant
    const adaptiveMutation = config.mutationRate * (1 + stagnationCount * 0.05);

    // Build next generation
    const nextGen: StrategyGenome[] = [];

    // Elitism: preserve top N
    for (let i = 0; i < config.eliteCount; i++) {
      nextGen.push(population[i]);
    }

    // Fill rest with offspring
    while (nextGen.length < config.populationSize) {
      const parent1 = tournamentSelect(population, config.tournamentSize);
      const parent2 = tournamentSelect(population, config.tournamentSize);

      let child: StrategyGenome;
      if (randBool(config.crossoverRate)) {
        child = crossover(parent1, parent2);
      } else {
        child = JSON.parse(JSON.stringify(parent1));
        child.id = nanoid(8);
      }

      child = mutate(child, adaptiveMutation);

      // Evaluate on train data
      evaluateGenome(child, trainCandles, trainIndicators, config);
      child.fitness = calcFitness(child, config.fitnessWeights);
      totalEvaluations++;

      nextGen.push(child);
    }

    population = nextGen;
  }

  // Final sort
  population.sort((a, b) => b.fitness - a.fitness);

  // Validate top 5 on TEST data (walk-forward)
  const topGenomes = population.slice(0, 5);
  for (const genome of topGenomes) {
    evaluateGenome(genome, testCandles, testIndicators, config);
    genome.fitness = calcFitness(genome, config.fitnessWeights);
  }

  // Re-sort by test fitness
  topGenomes.sort((a, b) => b.fitness - a.fitness);
  const best = topGenomes[0];

  // Train metrics (re-evaluate best on train)
  const bestOnTrain = JSON.parse(JSON.stringify(best)) as StrategyGenome;
  evaluateGenome(bestOnTrain, trainCandles, trainIndicators, config);

  return {
    bestGenome: best,
    topGenomes,
    generationsRun: Math.min(convergenceGen + 30, config.generations),
    totalEvaluations,
    convergenceGen,
    trainMetrics: { sharpe: bestOnTrain.sharpe, pf: bestOnTrain.profitFactor, wr: bestOnTrain.winRate },
    testMetrics: { sharpe: best.sharpe, pf: best.profitFactor, wr: best.winRate },
    elapsedMs: Date.now() - start,
  };
}
