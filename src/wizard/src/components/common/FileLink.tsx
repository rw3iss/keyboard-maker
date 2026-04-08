import { formatBytes } from '../../utils/format';

interface FileLinkProps {
  name: string;
  path: string;
  size?: number;
  onClick?: () => void;
}

export function FileLink({ name, path, size, onClick }: FileLinkProps) {
  return (
    <div class="file-link" onClick={onClick}>
      <a href={path} target="_blank" rel="noopener" class="file-link-name">{name}</a>
      {size !== undefined && (
        <span class="file-link-size">{formatBytes(size)}</span>
      )}
    </div>
  );
}
