import { v4 as uuidv4 } from 'uuid';
import type { Molecule, Atom, Bond, ElementSymbol } from '../types/chemistry';
import { 
  BOND_ORDER, 
  getBestValenceForBondCount,
  canAcceptMoreBonds
} from './valenceDefinitions';

/**
 * Calculate how many bonds an atom currently has
 */
export function getAtomBondCount(atomId: string, bonds: Bond[]): number {
  const count = bonds.reduce((count, bond) => {
    if (bond.sourceAtomId === atomId || bond.targetAtomId === atomId) {
      const bondOrder = BOND_ORDER[bond.type];
      return count + bondOrder;
    }
    return count;
  }, 0);
  
  return count;
}

/**
 * Calculate how many additional hydrogens an atom needs to satisfy its preferred valence
 */
export function getRequiredHydrogens(atom: Atom, bonds: Bond[]): number {
  const currentBonds = getAtomBondCount(atom.id, bonds);
  const targetValence = getBestValenceForBondCount(atom.element as ElementSymbol, currentBonds);
  
  if (!targetValence) return 0;
  return Math.max(0, targetValence - currentBonds);
}

/**
 * Get all hydrogen atoms connected to a specific atom
 */
export function getConnectedHydrogens(atomId: string, molecule: Molecule): Atom[] {
  const hydrogenIds = new Set<string>();
  
  molecule.bonds.forEach(bond => {
    let connectedAtomId: string | null = null;
    
    if (bond.sourceAtomId === atomId) {
      connectedAtomId = bond.targetAtomId;
    } else if (bond.targetAtomId === atomId) {
      connectedAtomId = bond.sourceAtomId;
    }
    
    if (connectedAtomId) {
      const connectedAtom = molecule.atoms.find(a => a.id === connectedAtomId);
      if (connectedAtom && connectedAtom.element === 'H') {
        hydrogenIds.add(connectedAtomId);
      }
    }
  });
  
  return molecule.atoms.filter(atom => hydrogenIds.has(atom.id));
}

/**
 * Add a specific number of hydrogen atoms to an atom
 */
export function addSpecificHydrogens(atom: Atom, molecule: Molecule, numberOfHydrogens: number): Molecule {
  
  if (numberOfHydrogens <= 0) {
    return molecule;
  }
  
  const newAtoms: Atom[] = [];
  const newBonds: Bond[] = [];
  
  // Position hydrogens around the main atom
  const angleStep = (2 * Math.PI) / Math.max(numberOfHydrogens, 3); // Minimum 3 positions for better spacing
  const hydrogenDistance = 30; // Distance from main atom
  
  for (let i = 0; i < numberOfHydrogens; i++) {
    const angle = i * angleStep;
    const hydrogenPosition = {
      x: atom.position.x + Math.cos(angle) * hydrogenDistance,
      y: atom.position.y + Math.sin(angle) * hydrogenDistance,
    };
    
    const hydrogenAtom: Atom = {
      id: uuidv4(),
      element: 'H',
      position: hydrogenPosition,
    };
    
    const hydrogenBond: Bond = {
      id: uuidv4(),
      sourceAtomId: atom.id,
      targetAtomId: hydrogenAtom.id,
      type: 'single',
    };
    
    newAtoms.push(hydrogenAtom);
    newBonds.push(hydrogenBond);
  }
  
  const result = {
    atoms: [...molecule.atoms, ...newAtoms],
    bonds: [...molecule.bonds, ...newBonds],
  };
  
  return result;
}

/**
 * Add hydrogen atoms to an atom based on its preferred valence
 */
export function addHydrogensToAtom(atom: Atom, molecule: Molecule): Molecule {
  const neededHydrogens = getRequiredHydrogens(atom, molecule.bonds);
  return addSpecificHydrogens(atom, molecule, neededHydrogens);
}

/**
 * Remove excess hydrogen atoms when a new bond is formed
 */
export function updateHydrogensAfterBonding(atomId: string, molecule: Molecule): Molecule {
  const atom = molecule.atoms.find(a => a.id === atomId);
  if (!atom) return molecule;
  
  const connectedHydrogens = getConnectedHydrogens(atomId, molecule);
  const currentBonds = getAtomBondCount(atomId, molecule.bonds);
  const targetValence = getBestValenceForBondCount(atom.element as ElementSymbol, currentBonds);
  
  if (!targetValence) return molecule;
  
  // Calculate how many hydrogens we need to remove
  const excessHydrogens = Math.max(0, currentBonds - targetValence);
  const hydrogensToRemove = Math.min(excessHydrogens, connectedHydrogens.length);
  
  if (hydrogensToRemove <= 0) {
    return molecule;
  }
  
  // Remove the specified number of hydrogen atoms and their bonds
  const hydrogensToRemoveIds = connectedHydrogens.slice(0, hydrogensToRemove).map(h => h.id);
  
  const updatedAtoms = molecule.atoms.filter(atom => !hydrogensToRemoveIds.includes(atom.id));
  const updatedBonds = molecule.bonds.filter(bond => 
    !hydrogensToRemoveIds.includes(bond.sourceAtomId) && 
    !hydrogensToRemoveIds.includes(bond.targetAtomId)
  );
  
  return {
    atoms: updatedAtoms,
    bonds: updatedBonds,
  };
}

/**
 * Update hydrogen atoms for both atoms involved in a new bond
 */
export function updateMoleculeAfterBonding(sourceAtomId: string, targetAtomId: string, molecule: Molecule): Molecule {
  let updatedMolecule = molecule;
  
  // Update hydrogens for both atoms involved in the bond
  updatedMolecule = updateHydrogensAfterBonding(sourceAtomId, updatedMolecule);
  updatedMolecule = updateHydrogensAfterBonding(targetAtomId, updatedMolecule);
  
  return updatedMolecule;
}

/**
 * Check if two atoms can be bonded together
 */
export function canBondAtoms(sourceAtomId: string, targetAtomId: string, molecule: Molecule, bondOrder: number = 1): boolean {
  const sourceAtom = molecule.atoms.find(a => a.id === sourceAtomId);
  const targetAtom = molecule.atoms.find(a => a.id === targetAtomId);
  
  if (!sourceAtom || !targetAtom) return false;
  
  const sourceCurrentBonds = getAtomBondCount(sourceAtomId, molecule.bonds);
  const targetCurrentBonds = getAtomBondCount(targetAtomId, molecule.bonds);
  
  return canAcceptMoreBonds(sourceAtom.element as ElementSymbol, sourceCurrentBonds, bondOrder) &&
         canAcceptMoreBonds(targetAtom.element as ElementSymbol, targetCurrentBonds, bondOrder);
}

/**
 * Update hydrogen atoms after a bond is removed/broken
 */
export function updateHydrogensAfterBondRemoval(atomId: string, molecule: Molecule): Molecule {
  const atom = molecule.atoms.find(a => a.id === atomId);
  if (!atom || atom.element === 'H') return molecule;
  
  // Calculate how many hydrogens this atom needs now
  const neededHydrogens = getRequiredHydrogens(atom, molecule.bonds);
  const currentHydrogens = getConnectedHydrogens(atomId, molecule);
  
  if (neededHydrogens > currentHydrogens.length) {
    // Add more hydrogens to complete valence
    const hydrogensToAdd = neededHydrogens - currentHydrogens.length;
    
    // Find positions for new hydrogens, avoiding existing ones
    const existingPositions = currentHydrogens.map(h => ({
      angle: Math.atan2(h.position.y - atom.position.y, h.position.x - atom.position.x),
      distance: Math.sqrt(
        Math.pow(h.position.x - atom.position.x, 2) + 
        Math.pow(h.position.y - atom.position.y, 2)
      )
    }));
    
    // Also consider positions of other bonded atoms (non-hydrogen)
    const bondedAtoms = molecule.bonds
      .filter(bond => bond.sourceAtomId === atomId || bond.targetAtomId === atomId)
      .map(bond => {
        const otherAtomId = bond.sourceAtomId === atomId ? bond.targetAtomId : bond.sourceAtomId;
        return molecule.atoms.find(a => a.id === otherAtomId);
      })
      .filter(a => a && a.element !== 'H');
    
    const existingAtomAngles = bondedAtoms.map(a => 
      Math.atan2(a!.position.y - atom.position.y, a!.position.x - atom.position.x)
    );
    
    const newAtoms: Atom[] = [];
    const newBonds: Bond[] = [];
    const hydrogenDistance = 30;
    
    for (let i = 0; i < hydrogensToAdd; i++) {
      // Find an angle that doesn't conflict with existing hydrogens or bonded atoms
      let bestAngle = 0;
      let maxDistance = 0;
      
      // Try different angles and pick the one with maximum distance from existing positions
      for (let testAngle = 0; testAngle < Math.PI * 2; testAngle += Math.PI / 6) {
        let minDistance = Math.PI * 2;
        
        // Check distance to existing hydrogens
        for (const pos of existingPositions) {
          const angleDiff = Math.abs(testAngle - pos.angle);
          const normalizedDiff = Math.min(angleDiff, Math.PI * 2 - angleDiff);
          minDistance = Math.min(minDistance, normalizedDiff);
        }
        
        // Check distance to bonded atoms
        for (const existingAngle of existingAtomAngles) {
          const angleDiff = Math.abs(testAngle - existingAngle);
          const normalizedDiff = Math.min(angleDiff, Math.PI * 2 - angleDiff);
          minDistance = Math.min(minDistance, normalizedDiff);
        }
        
        if (minDistance > maxDistance) {
          maxDistance = minDistance;
          bestAngle = testAngle;
        }
      }
      
      const finalAngle = bestAngle;
      
      const hydrogenPosition = {
        x: atom.position.x + Math.cos(finalAngle) * hydrogenDistance,
        y: atom.position.y + Math.sin(finalAngle) * hydrogenDistance,
      };
      
      const hydrogenAtom: Atom = {
        id: uuidv4(),
        element: 'H',
        position: hydrogenPosition,
      };
      
      const hydrogenBond: Bond = {
        id: uuidv4(),
        sourceAtomId: atom.id,
        targetAtomId: hydrogenAtom.id,
        type: 'single',
      };
      
      newAtoms.push(hydrogenAtom);
      newBonds.push(hydrogenBond);
      
      // Add this position to existing ones for next iteration
      existingPositions.push({ angle: finalAngle, distance: hydrogenDistance });
    }
    
    return {
      atoms: [...molecule.atoms, ...newAtoms],
      bonds: [...molecule.bonds, ...newBonds],
    };
  }
  
  return molecule;
}

/**
 * Update hydrogens for both atoms when a bond type changes
 */
export function updateHydrogensAfterBondTypeChange(sourceAtomId: string, targetAtomId: string, molecule: Molecule): Molecule {
  let updatedMolecule = molecule;
  
  // For each atom, recalculate and update hydrogens completely
  for (const atomId of [sourceAtomId, targetAtomId]) {
    const atom = updatedMolecule.atoms.find(a => a.id === atomId);
    if (!atom || atom.element === 'H') continue;
    
    // First, remove ALL existing hydrogen atoms connected to this atom
    const existingHydrogens = getConnectedHydrogens(atomId, updatedMolecule);
    
    const hydrogenIds = existingHydrogens.map(h => h.id);
    
    // Remove hydrogen atoms and their bonds
    updatedMolecule = {
      atoms: updatedMolecule.atoms.filter(a => !hydrogenIds.includes(a.id)),
      bonds: updatedMolecule.bonds.filter(b => 
        !hydrogenIds.includes(b.sourceAtomId) && !hydrogenIds.includes(b.targetAtomId)
      )
    };
    
    // Now add the correct number of hydrogens based on current bonds
    const neededHydrogens = getRequiredHydrogens(atom, updatedMolecule.bonds);
    
    if (neededHydrogens > 0) {
      // Add hydrogens using the existing function
      updatedMolecule = addHydrogensToAtom(atom, updatedMolecule);
    }
  }
  
  return updatedMolecule;
}
