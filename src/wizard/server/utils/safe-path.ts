/**
 * Path safety helpers used by route handlers that serve user
 * build files. Centralises path-traversal protection so we don't
 * re-implement it in every handler.
 */
import { join, resolve } from 'path';
import { AppError, ErrorCodes } from '../types/errors.js';

/**
 * Resolve a user-supplied relative path under a known base
 * directory and throw a 403 error if the result escapes.
 *
 * @param baseDir Absolute directory the file must live under.
 * @param relativePath User-supplied path (may contain unsafe segments).
 * @returns The absolute, verified path.
 */
export function safePath(baseDir: string, relativePath: string): string {
  if (!relativePath) {
    throw new AppError(400, ErrorCodes.FILE_NOT_FOUND, 'File path is required');
  }
  // Strip any `..` segments up-front so a naive join can't escape.
  const normalized = relativePath.replace(/\.\./g, '').replace(/^\/+/, '');
  const fullPath = join(baseDir, normalized);

  // Defence-in-depth: resolve both ends and make sure the result
  // still starts with the base directory.
  const resolvedBase = resolve(baseDir);
  const resolvedFull = resolve(fullPath);
  if (!resolvedFull.startsWith(resolvedBase)) {
    throw new AppError(403, ErrorCodes.FILE_NOT_FOUND, 'Access denied');
  }
  return resolvedFull;
}
