import type { Searcher } from "../types";
import { encyclopedic } from "./encyclopedic";
import { libraries } from "./libraries";
import { museums } from "./museums";
import { photography } from "./photography";
import { space } from "./space";

/** Search function for every source id in ../catalog.ts. */
export const SEARCHERS: Record<string, Searcher> = {
  ...encyclopedic,
  ...space,
  ...museums,
  ...libraries,
  ...photography,
};
