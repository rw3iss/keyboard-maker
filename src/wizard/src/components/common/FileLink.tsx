interface FileLinkProps {
  name: string;
  path: string;
  size?: number;
  onClick?: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileLink({ name, path, size, onClick }: FileLinkProps) {
  return (
    <div class="file-link" onClick={onClick}>
      <a href={path} target="_blank" rel="noopener" class="file-link-name" style="color:var(--accent);text-decoration:none">{name}</a>
      {size !== undefined && (
        <span class="file-link-size">{formatSize(size)}</span>
      )}
    </div>
  );
}
