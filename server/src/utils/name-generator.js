import { cyrb53 } from './hasher.js';

/**
 * Lightweight and deterministic friendly name generator
 */

const ADJECTIVES = [
  'Amber', 'Amethyst', 'Aqua', 'Arctic', 'Astral', 'Azure', 'Brave', 'Bronze',
  'Celestial', 'Chrome', 'Cobalt', 'Copper', 'Coral', 'Cosmic', 'Crimson', 'Crystal',
  'Cyber', 'Diamond', 'Echo', 'Electric', 'Emerald', 'Fiery', 'Frost', 'Galaxy',
  'Glacier', 'Golden', 'Hyper', 'Indigo', 'Iron', 'Jade', 'Laser', 'Lunar',
  'Magnetic', 'Meteor', 'Mystic', 'Neon', 'Nova', 'Obsidian', 'Ocean', 'Onyx',
  'Optic', 'Orbit', 'Phantom', 'Plasma', 'Polar', 'Prism', 'Quantum', 'Radiant',
  'Ruby', 'Sapphire', 'Shadow', 'Silver', 'Solar', 'Sonic', 'Star', 'Storm',
  'Titanium', 'Vortex', 'Zenith', 'Zephyr'
];

const ANIMALS = [
  'Albatross', 'Antelope', 'Bear', 'Bison', 'Cheetah', 'Cobra', 'Condor', 'Cougar',
  'Crane', 'Dolphin', 'Dragon', 'Eagle', 'Falcon', 'Fox', 'Gazelle', 'Gecko',
  'Gryphon', 'Hawk', 'Jaguar', 'Kangaroo', 'Leopard', 'Lion', 'Lynx', 'Manta',
  'Mustang', 'Octopus', 'Orca', 'Osprey', 'Otter', 'Owl', 'Panther', 'Pegasus',
  'Penguin', 'Phoenix', 'Puma', 'Raven', 'Rhino', 'Salamander', 'Seagull', 'Seal',
  'Shark', 'Stag', 'Swan', 'Tiger', 'Toucan', 'Viper', 'Walrus', 'Wolf'
];

/**
 * Generate a friendly name like "Cosmic Phoenix"
 * If seed is provided, generates the exact same name deterministically
 */
export function generateRandomName(seed = null) {
  if (seed) {
    const hash = typeof seed === 'number' ? seed : cyrb53(String(seed));
    const absHash = Math.abs(hash);
    const adj = ADJECTIVES[absHash % ADJECTIVES.length];
    const animal = ANIMALS[Math.floor(absHash / ADJECTIVES.length) % ANIMALS.length];
    return `${adj} ${animal}`;
  }
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adj} ${animal}`;
}

