/**
 * Segmentation is not stored as a generic table. It is derived from
 * Company → Industry → Customer Type → Geography → Service Needs → Account Potential.
 */

export interface Industry {
  id: string;
  name: string;
  description: string;
  active: boolean;
}

export interface CustomerType {
  id: string;
  name: string;
  description: string;
  active: boolean;
}

export interface Region {
  id: string;
  name: string;
  country: string;
  industrialCluster: string;
  active: boolean;
}

export type AccountPotential =
  | "Strategic"
  | "Growth"
  | "Development"
  | "Transactional";
