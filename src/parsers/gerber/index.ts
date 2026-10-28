// RS-274X / X2 parser: lexer, apertures, aperture macros, regions, polarity, step and repeat.
export type * from "./types";
export type { ApertureTemplate, ApertureHole } from "./aperture";
export type { CoordinateFormat } from "./format";
export type { ApertureMacro } from "./macro";
export { looksLikeGerber, parseGerber, type GerberParseOptions } from "./parser";
export { buildGerberGeometry, type GerberBuildOptions, type GerberGeometry } from "./builder";
export { detectLayerType, layerTypeFromAttributes, layerTypeFromFileName, type LayerKind, type LayerSide, type LayerType } from "./layer";
