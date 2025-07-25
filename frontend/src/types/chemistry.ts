// Re-export the new graph-based types as the primary types
import type { MoleculeGraph } from '../models/MoleculeGraph';
export type { Atom, Bond, MoleculeGraph, ValidationWarning, MoleculeValidation } from '../models/MoleculeGraph';

export type ElementSymbol = 'C' | 'N' | 'O' | 'P' | 'S' | 'F' | 'Cl' | 'Br' | 'I' | 'H';

export type BondType = 'single' | 'double' | 'triple' | 'wedge' | 'dash';

export interface Point {
  x: number;
  y: number;
}

// Create an alias for backward compatibility
export type Molecule = MoleculeGraph;

export interface DrawingState {
  molecule: Molecule;
  selectedTool: 'atom' | 'select' | 'eraser' | 'pan';
  selectedElement: ElementSymbol;
  canvasOffset: Point;
  scale: number;
}

export interface ToolbarState {
  activeElement: ElementSymbol;
  activeTool: 'atom' | 'select' | 'eraser' | 'pan';
}

// Legacy types for backward compatibility
export interface LegacyAtom {
  id: string;
  element: ElementSymbol;
  position: Point;
  charge?: number;
  hydrogens?: number;
}

export interface LegacyBond {
  id: string;
  atomId1: string;
  atomId2: string;
  type: BondType;
}

export interface LegacyMolecule {
  atoms: LegacyAtom[];
  bonds: LegacyBond[];
}
