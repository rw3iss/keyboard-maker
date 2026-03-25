export const ROUTES = {
  home: '/',
  project: '/project/:name',
  config: '/project/:name/config',
  build: '/project/:name/build',
  editor: '/project/:name/editor',
} as const;

export function projectPath(name: string): string {
  return `/project/${encodeURIComponent(name)}`;
}

export function configPath(name: string): string {
  return `/project/${encodeURIComponent(name)}/config`;
}

export function buildPath(name: string): string {
  return `/project/${encodeURIComponent(name)}/build`;
}

export function editorPath(name: string): string {
  return `/project/${encodeURIComponent(name)}/editor`;
}
