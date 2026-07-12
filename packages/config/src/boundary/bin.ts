/**
 * Executable entry point for the import-boundary analyzer.
 *
 * This module has the side effect of running the analyzer and exiting the
 * process, so it is intentionally NOT re-exported from the package barrel.
 * It is invoked directly by the root `boundary:check` script.
 */
import process from "node:process";
import { runCli } from "./cli.js";

process.exit(runCli());
