import { Level } from "../logger/levels.ts";
import {
  yellow,
  gray,
  red,
  bold,
  blue,
} from "../deps.ts";

/**
 * A type for defining a function which takes in a string and outputs the string
 * which has had color formatting (bold, red, italics, etc.) applied to it
 */
export type ColorRule = (msg: string) => string;

/**
 * A map of coloring rules per log level.  Custom log levels may also register
 * a new color rule, and existing levels may be updated with new rules too.
 */
export const colorRules: Map<Level, ColorRule> = new Map<Level, ColorRule>();
colorRules.set(Level.DEBUG, (msg: string) => gray(msg));
colorRules.set(Level.INFO, (msg: string) => blue(msg));
colorRules.set(Level.WARNING, (msg: string) => yellow(msg));
colorRules.set(Level.ERROR, (msg: string) => red(msg));
colorRules.set(Level.CRITICAL, (msg: string) => bold(red(msg)));
