const ELLIPSIS = '...';

const truncateMiddle = (value: string, maxLength: number) => {
  if (value.length <= maxLength) {
    return value;
  }

  if (maxLength <= 3) {
    return value.substring(0, maxLength);
  }

  const suffixLength = Math.max(1, Math.floor((maxLength - 3) / 2));
  const prefixLength = Math.max(1, maxLength - suffixLength - 3);

  return `${value.substring(0, prefixLength)}${ELLIPSIS}${value.substring(value.length - suffixLength)}`;
};

export const formatProcessName = (name: string, maxLength = 20) => {
  if (!name) {
    return '';
  }

  if (name.length <= maxLength) {
    return name;
  }

  const lastBackslash = name.lastIndexOf('\\');
  const lastSlash = name.lastIndexOf('/');
  const lastSeparator = Math.max(lastBackslash, lastSlash);

  if (lastSeparator !== -1) {
    const suffix = name.substring(lastSeparator);
    if (suffix.length + 3 >= maxLength) {
      const allowedSuffix = Math.max(0, maxLength - 3);
      return `${ELLIPSIS}${suffix.substring(Math.max(0, suffix.length - allowedSuffix))}`;
    }

    const prefixLength = maxLength - suffix.length - 3;
    return `${name.substring(0, prefixLength)}${ELLIPSIS}${suffix}`;
  }

  return truncateMiddle(name, maxLength);
};

export const getRelativeTimeString = (timestamp: number) => {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSeconds = Math.floor(diffMs / 1000);

  if (diffSeconds < 5) return 'just now';
  if (diffSeconds < 60) return `${diffSeconds}s ago`;

  const diffMinutes = Math.floor(diffSeconds / 60);
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  return `${diffHours}h ago`;
};

export const formatTime = (timestamp: number) => {
  return new Date(timestamp).toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

export const getProcessTypeIcon = (type: string, processName?: string) => {
  const lowerType = type.toLowerCase();
  const lowerName = processName?.toLowerCase() || '';

  switch (lowerType) {
    case 'graphics':
    case 'g':
    case 'gfx':
      if (
        lowerName.includes('game') ||
        lowerName.includes('unreal') ||
        lowerName.includes('unity') ||
        lowerName.includes('steam') ||
        lowerName.includes('origin') ||
        lowerName.includes('epic') ||
        lowerName.includes('minecraft') ||
        lowerName.includes('wow') ||
        lowerName.includes('csgo') ||
        lowerName.includes('dota') ||
        lowerName.includes('valorant') ||
        lowerName.includes('lol')
      ) {
        return '[GAME]';
      }
      if (
        lowerName.includes('blender') ||
        lowerName.includes('maya') ||
        lowerName.includes('3dsmax') ||
        lowerName.includes('cinema4d') ||
        lowerName.includes('houdini')
      ) {
        return '[GPU]';
      }
      if (
        lowerName.includes('premiere') ||
        lowerName.includes('aftereffects') ||
        lowerName.includes('davinci') ||
        lowerName.includes('ffmpeg') ||
        lowerName.includes('handbrake') ||
        lowerName.includes('obs')
      ) {
        return '[EDIT]';
      }
      if (
        lowerName.includes('photoshop') ||
        lowerName.includes('illustrator') ||
        lowerName.includes('gimp') ||
        lowerName.includes('krita') ||
        lowerName.includes('designer')
      ) {
        return '[ART]';
      }
      return '[SYS]';

    case 'compute':
    case 'c':
    case 'cuda':
      if (
        lowerName.includes('python') ||
        lowerName.includes('jupyter') ||
        lowerName.includes('conda') ||
        lowerName.includes('tensorflow') ||
        lowerName.includes('pytorch') ||
        lowerName.includes('keras') ||
        lowerName.includes('nvidia-ml') ||
        lowerName.includes('triton')
      ) {
        return '[AI]';
      }
      if (lowerName.includes('blender') || lowerName.includes('cycles') || lowerName.includes('optix')) {
        return '[GPU]';
      }
      if (
        lowerName.includes('mining') ||
        lowerName.includes('miner') ||
        lowerName.includes('eth') ||
        lowerName.includes('bitcoin') ||
        lowerName.includes('crypto')
      ) {
        return '[MINE]';
      }
      if (
        lowerName.includes('folding') ||
        lowerName.includes('boinc') ||
        lowerName.includes('seti')
      ) {
        return '[SCI]';
      }
      if (
        lowerName.includes('password') ||
        lowerName.includes('hashcat') ||
        lowerName.includes('john')
      ) {
        return '[LAB]';
      }
      return '[SYS]';

    case 'mixed':
    case 'multi':
      return '[SYNC]';

    case 'copy':
    case 'dma':
      return '[QUEUE]';

    case 'encode':
    case 'decoder':
    case 'nvenc':
    case 'nvdec':
      return '[MEDIA]';

    case 'display':
    case 'overlay':
      return '[IMG]';

    default:
      if (
        lowerName.includes('chrome') ||
        lowerName.includes('firefox') ||
        lowerName.includes('edge') ||
        lowerName.includes('browser') ||
        lowerName.includes('webkit')
      ) {
        return '[WEB]';
      }
      if (
        lowerName.includes('discord') ||
        lowerName.includes('teams') ||
        lowerName.includes('zoom') ||
        lowerName.includes('skype') ||
        lowerName.includes('slack')
      ) {
        return '[CHAT]';
      }
      if (
        lowerName.includes('vlc') ||
        lowerName.includes('media') ||
        lowerName.includes('player') ||
        lowerName.includes('spotify') ||
        lowerName.includes('youtube')
      ) {
        return '[AUDIO]';
      }
      if (
        lowerName.includes('nvidia') ||
        lowerName.includes('radeon') ||
        lowerName.includes('intel') ||
        lowerName.includes('driver') ||
        lowerName.includes('service')
      ) {
        return '[SEC]';
      }
      if (
        lowerName.includes('dwm') ||
        lowerName.includes('compositor') ||
        lowerName.includes('x11') ||
        lowerName.includes('wayland')
      ) {
        return '[WIN]';
      }
      return '[CFG]';
  }
};

export const getProcessStatusClass = (status: string) => {
  switch (status.toLowerCase()) {
    case 'running':
    case 'active':
      return 'gpu-process-running';
    case 'idle':
    case 'waiting':
      return 'gpu-process-idle';
    case 'suspended':
    case 'paused':
      return 'gpu-process-suspended';
    case 'blocked':
    case 'stopped':
      return 'gpu-process-blocked';
    default:
      return 'gpu-process-unknown';
  }
};

export const getGpuUsageClass = (gpuUsage: number) => {
  if (gpuUsage >= 90) return 'gpu-usage-critical';
  if (gpuUsage >= 70) return 'gpu-usage-high';
  if (gpuUsage >= 30) return 'gpu-usage-medium';
  return 'gpu-usage-low';
};

export const getMemoryUsageClass = (memoryUsage: number) => {
  if (memoryUsage >= 4096) return 'memory-usage-critical';
  if (memoryUsage >= 2048) return 'memory-usage-high';
  if (memoryUsage >= 512) return 'memory-usage-medium';
  return 'memory-usage-low';
};

export const getProcessTypeClass = (type: string) => {
  switch (type.toLowerCase()) {
    case 'compute':
    case 'c':
      return 'process-type-compute';
    case 'graphics':
    case 'g':
    case 'gfx':
      return 'process-type-graphics';
    case 'media':
    case 'm':
      return 'process-type-media';
    case 'system':
    case 's':
      return 'process-type-system';
    default:
      return 'process-type-unknown';
  }
};

export const getConnectionStatusClass = (isConnected: boolean) => {
  return isConnected ? 'connection-status-connected' : 'connection-status-disconnected';
};

export const getProcessStatusWithPattern = (status: string) => {
  const baseClass = getProcessStatusClass(status);
  switch (status.toLowerCase()) {
    case 'running':
    case 'active':
      return `${baseClass} process-status-running`;
    case 'idle':
    case 'waiting':
      return `${baseClass} process-status-idle`;
    case 'suspended':
    case 'paused':
      return `${baseClass} process-status-suspended`;
    default:
      return baseClass;
  }
};
