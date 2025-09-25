export const formatProcessName = (name: string) => {
  if (name.length > 20) {
    return `${name.substring(0, 17)}...`;
  }
  return name;
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
        return '🎮';
      }
      if (
        lowerName.includes('blender') ||
        lowerName.includes('maya') ||
        lowerName.includes('3dsmax') ||
        lowerName.includes('cinema4d') ||
        lowerName.includes('houdini')
      ) {
        return '🧊';
      }
      if (
        lowerName.includes('premiere') ||
        lowerName.includes('aftereffects') ||
        lowerName.includes('davinci') ||
        lowerName.includes('ffmpeg') ||
        lowerName.includes('handbrake') ||
        lowerName.includes('obs')
      ) {
        return '🎞️';
      }
      if (
        lowerName.includes('photoshop') ||
        lowerName.includes('illustrator') ||
        lowerName.includes('gimp') ||
        lowerName.includes('krita') ||
        lowerName.includes('designer')
      ) {
        return '🎨';
      }
      return '🖥️';

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
        return '🧠';
      }
      if (lowerName.includes('blender') || lowerName.includes('cycles') || lowerName.includes('optix')) {
        return '🧊';
      }
      if (
        lowerName.includes('mining') ||
        lowerName.includes('miner') ||
        lowerName.includes('eth') ||
        lowerName.includes('bitcoin') ||
        lowerName.includes('crypto')
      ) {
        return '⛏️';
      }
      if (
        lowerName.includes('folding') ||
        lowerName.includes('boinc') ||
        lowerName.includes('seti')
      ) {
        return '🧬';
      }
      if (
        lowerName.includes('password') ||
        lowerName.includes('hashcat') ||
        lowerName.includes('john')
      ) {
        return '🧨';
      }
      return '🖥️';

    case 'mixed':
    case 'multi':
      return '🔁';

    case 'copy':
    case 'dma':
      return '📥';

    case 'encode':
    case 'decoder':
    case 'nvenc':
    case 'nvdec':
      return '🎬';

    case 'display':
    case 'overlay':
      return '🖼️';

    default:
      if (
        lowerName.includes('chrome') ||
        lowerName.includes('firefox') ||
        lowerName.includes('edge') ||
        lowerName.includes('browser') ||
        lowerName.includes('webkit')
      ) {
        return '🌐';
      }
      if (
        lowerName.includes('discord') ||
        lowerName.includes('teams') ||
        lowerName.includes('zoom') ||
        lowerName.includes('skype') ||
        lowerName.includes('slack')
      ) {
        return '💬';
      }
      if (
        lowerName.includes('vlc') ||
        lowerName.includes('media') ||
        lowerName.includes('player') ||
        lowerName.includes('spotify') ||
        lowerName.includes('youtube')
      ) {
        return '🎧';
      }
      if (
        lowerName.includes('nvidia') ||
        lowerName.includes('radeon') ||
        lowerName.includes('intel') ||
        lowerName.includes('driver') ||
        lowerName.includes('service')
      ) {
        return '🛡️';
      }
      if (
        lowerName.includes('dwm') ||
        lowerName.includes('compositor') ||
        lowerName.includes('x11') ||
        lowerName.includes('wayland')
      ) {
        return '🪟';
      }
      return '⚙️';
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
